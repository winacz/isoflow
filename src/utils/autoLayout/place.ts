import { Coords, ViewItem } from 'src/types';
import { SHAPE_2D_LAYOUT_GAP } from 'src/config';
import { isShape2dPlacementFree, snapTile2dToGrid } from '../renderer';
import { countCrossings } from '../routeGeometry';
import { Footprint, LayoutEdge, LayoutGraph, PlaceResult } from './types';

const ceilToStep = (value: number, step: number): number => {
  const s = Math.max(1, step);
  return Math.ceil(value / s) * s;
};

/**
 * Crossings between two adjacent layers for a given ordering, via inversion
 * counting (merge sort) — O(E log E).
 *
 * The legacy `smartPlaceNodes` sorts by barycenter but never measures the
 * result, so it optimises nothing it can verify. Measuring is what lets us
 * keep the best ordering across sweeps.
 */
export const countBilayerCrossings = (
  upper: string[],
  lower: string[],
  adjacency: Map<string, Set<string>>
): number => {
  const lowerIndex = new Map<string, number>();
  lower.forEach((id, index) => {
    lowerIndex.set(id, index);
  });

  // Edge endpoints in upper order, each carrying its lower-layer position.
  const sequence: number[] = [];
  upper.forEach((id) => {
    const neighbours = adjacency.get(id);
    if (!neighbours) return;
    const positions: number[] = [];
    neighbours.forEach((neighbour) => {
      const index = lowerIndex.get(neighbour);
      if (index !== undefined) positions.push(index);
    });
    positions.sort((a, b) => {
      return a - b;
    });
    positions.forEach((position) => {
      sequence.push(position);
    });
  });

  // Count inversions.
  let inversions = 0;
  const sortAndCount = (values: number[]): number[] => {
    if (values.length <= 1) return values;
    const mid = Math.floor(values.length / 2);
    const left = sortAndCount(values.slice(0, mid));
    const right = sortAndCount(values.slice(mid));
    const merged: number[] = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
      if (left[i] <= right[j]) {
        merged.push(left[i]);
        i += 1;
      } else {
        merged.push(right[j]);
        inversions += left.length - i;
        j += 1;
      }
    }
    while (i < left.length) {
      merged.push(left[i]);
      i += 1;
    }
    while (j < right.length) {
      merged.push(right[j]);
      j += 1;
    }
    return merged;
  };

  sortAndCount(sequence);
  return inversions;
};

const totalCrossings = (
  layers: string[][],
  adjacency: Map<string, Set<string>>
): number => {
  let total = 0;
  for (let i = 1; i < layers.length; i += 1) {
    total += countBilayerCrossings(layers[i - 1], layers[i], adjacency);
  }
  return total;
};

/** Median of a node's neighbour positions in the reference layer. */
const medianPosition = (
  nodeId: string,
  referenceIndex: Map<string, number>,
  adjacency: Map<string, Set<string>>,
  fallback: number
): number => {
  const neighbours = adjacency.get(nodeId);
  if (!neighbours || neighbours.size === 0) return fallback;

  const positions: number[] = [];
  neighbours.forEach((neighbour) => {
    const index = referenceIndex.get(neighbour);
    if (index !== undefined) positions.push(index);
  });

  if (positions.length === 0) return fallback;

  positions.sort((a, b) => {
    return a - b;
  });
  const mid = Math.floor(positions.length / 2);
  if (positions.length % 2 === 1) return positions[mid];
  return (positions[mid - 1] + positions[mid]) / 2;
};

/**
 * Port-order tiebreak: x-offset of the port this node uses on `hubId`.
 * Leaves on port 1 sort left of leaves on port 48.
 */
const buildPortOrderKey = (
  edges: LayoutEdge[],
  hubIds: Set<string>
): Map<string, number> => {
  const key = new Map<string, number>();

  edges.forEach((edge) => {
    const aIsHub = hubIds.has(edge.aId);
    const bIsHub = hubIds.has(edge.bId);
    if (aIsHub === bIsHub) return;

    const leafId = aIsHub ? edge.bId : edge.aId;
    const hubPortOffset = aIsHub ? edge.aPortOffset : edge.bPortOffset;
    if (!hubPortOffset) return;

    // Lowest port wins when a leaf has several cables to the same hub.
    const existing = key.get(leafId);
    if (existing === undefined || hubPortOffset.x < existing) {
      key.set(leafId, hubPortOffset.x);
    }
  });

  return key;
};

const assignLayers = (component: string[], graph: LayoutGraph): string[][] => {
  const inComponent = new Set(component);
  const roots = component.filter((id) => {
    return graph.hubs.has(id);
  });

  const seeds =
    roots.length > 0
      ? roots
      : [
          component.reduce((best, id) => {
            return (graph.degree.get(id) ?? 0) > (graph.degree.get(best) ?? 0)
              ? id
              : best;
          }, component[0])
        ];

  const layerOf = new Map<string, number>();
  seeds.forEach((id) => {
    layerOf.set(id, 0);
  });

  let frontier = [...seeds];
  let depth = 0;
  const maxDepth = component.length + 1;

  while (frontier.length > 0 && depth < maxDepth) {
    const next: string[] = [];
    const nextDepth = depth + 1;
    frontier.forEach((id) => {
      graph.adjacency.get(id)?.forEach((neighbour) => {
        if (!inComponent.has(neighbour) || layerOf.has(neighbour)) return;
        layerOf.set(neighbour, nextDepth);
        next.push(neighbour);
      });
    });
    frontier = next;
    depth = nextDepth;
  }

  // Disconnected leftovers go one layer past everything else.
  const orphans = component.filter((id) => {
    return !layerOf.has(id);
  });
  if (orphans.length > 0) {
    orphans.forEach((id) => {
      layerOf.set(id, depth + 1);
    });
  }

  const grouped = new Map<number, string[]>();
  layerOf.forEach((layer, id) => {
    const list = grouped.get(layer) ?? [];
    list.push(id);
    grouped.set(layer, list);
  });

  return Array.from(grouped.keys())
    .sort((a, b) => {
      return a - b;
    })
    .map((layer) => {
      return grouped.get(layer) as string[];
    });
};

/**
 * Down/up median sweeps, keeping the best-measured ordering.
 */
const minimiseCrossings = (
  layers: string[][],
  graph: LayoutGraph,
  portOrder: Map<string, number>
): string[][] => {
  // Seed with port order so the very first sweep starts from a sane layout.
  const seeded = layers.map((layer) => {
    return [...layer].sort((a, b) => {
      const pa = portOrder.get(a);
      const pb = portOrder.get(b);
      if (pa !== undefined && pb !== undefined && pa !== pb) return pa - pb;
      if (pa !== undefined && pb === undefined) return -1;
      if (pa === undefined && pb !== undefined) return 1;
      return 0;
    });
  });

  const current = seeded.map((layer) => {
    return [...layer];
  });
  let best = current.map((layer) => {
    return [...layer];
  });
  let bestScore = totalCrossings(best, graph.adjacency);

  const sweep = (downward: boolean) => {
    const order = downward
      ? [...current.keys()].slice(1)
      : [...current.keys()].slice(0, -1).reverse();

    order.forEach((index) => {
      const referenceLayer = downward ? current[index - 1] : current[index + 1];
      const referenceIndex = new Map<string, number>();
      referenceLayer.forEach((id, i) => {
        referenceIndex.set(id, i);
      });

      const positions = new Map<string, number>();
      current[index].forEach((id, i) => {
        positions.set(
          id,
          medianPosition(id, referenceIndex, graph.adjacency, i)
        );
      });

      current[index] = [...current[index]].sort((a, b) => {
        const diff = (positions.get(a) ?? 0) - (positions.get(b) ?? 0);
        if (diff !== 0) return diff;
        const pa = portOrder.get(a);
        const pb = portOrder.get(b);
        if (pa !== undefined && pb !== undefined) return pa - pb;
        return 0;
      });
    });
  };

  for (let iteration = 0; iteration < 12; iteration += 1) {
    sweep(iteration % 2 === 0);
    const score = totalCrossings(current, graph.adjacency);
    if (score < bestScore) {
      bestScore = score;
      best = current.map((layer) => {
        return [...layer];
      });
    }
    if (bestScore === 0) break;
  }

  return best;
};

/**
 * Place a component's layers into tile coordinates, anchored at `origin`.
 * Returns positions plus the bounding box actually used.
 */
const layoutComponent = ({
  layers,
  origin,
  footprints,
  gridStep,
  vlanOf
}: {
  layers: string[][];
  origin: Coords;
  footprints: Map<string, Footprint>;
  gridStep: Coords;
  /** VLAN a device belongs to, for grouping. */
  vlanOf: Map<string, string>;
}): { positions: Record<string, Coords>; width: number; height: number } => {
  const sx = Math.max(1, gridStep.x);
  const sy = Math.max(1, gridStep.y);

  // Spacing is measured in whole grid cells, never in raw tiles.
  //
  // Rounding "position + width + gap" up to the grid was what silently inflated
  // every gap: a 9-wide device plus a 3-tile gap is 12, which rounds up to 18 —
  // a full empty slot between every pair, no matter how small the gap was set.
  // Instead each device advances the cursor by its footprint rounded up to whole
  // cells, and a gap is then exactly N extra cells.
  // Same VLAN: touching. Different VLAN: exactly one empty cell.
  const cellsSameVlan = 0;
  const cellsVlanBreak = 1;
  // Rows keep two cells because that is the corridor the cable router threads
  // the bundles through; at one cell the crossing count nearly doubles.
  const cellsBetweenRows = 2;

  const positions: Record<string, Coords> = {};
  let cursorY = origin.y;
  let maxRight = origin.x;

  layers.forEach((layer) => {
    let cursorX = origin.x;
    let rowHeight = 0;
    let previousVlan: string | undefined;

    layer.forEach((id, index) => {
      const footprint = footprints.get(id);
      const width = footprint?.width ?? 1;
      const height = footprint?.height ?? 1;
      const vlan = vlanOf.get(id) ?? '';

      if (index > 0) {
        const sameVlan = vlan !== '' && vlan === previousVlan;
        cursorX += (sameVlan ? cellsSameVlan : cellsVlanBreak) * sx;
      }

      positions[id] = { x: cursorX, y: cursorY };
      // Occupy whole cells so the next device stays on the grid without the
      // rounding having to invent extra space.
      cursorX += ceilToStep(width, sx);
      previousVlan = vlan;
      if (height > rowHeight) rowHeight = height;
    });

    if (cursorX > maxRight) maxRight = cursorX;
    cursorY += ceilToStep(rowHeight, sy) + cellsBetweenRows * sy;
  });

  return {
    positions,
    width: maxRight - origin.x,
    height: cursorY - origin.y
  };
};

/**
 * VLAN per device, taken from the switch port it is patched into.
 * A host has no VLAN of its own, so the jack is the source of truth.
 */
export const buildVlanMap = (graph: LayoutGraph): Map<string, string> => {
  const vlanOf = new Map<string, string>();

  graph.edges.forEach((edge) => {
    if (!edge.vlan) return;
    const aIsHub = graph.hubs.has(edge.aId);
    const bIsHub = graph.hubs.has(edge.bId);
    // Only tag the endpoint side; a switch carries many VLANs at once.
    if (aIsHub !== bIsHub) {
      const leafId = aIsHub ? edge.bId : edge.aId;
      if (!vlanOf.has(leafId)) vlanOf.set(leafId, edge.vlan);
    }
  });

  return vlanOf;
};

/** Widest a single row may get before it wraps, in tiles. */
const MAX_ROW_TILES = 110;

/**
 * Split one layer into rows, one per VLAN.
 *
 * Devices on the same VLAN end up side by side, and a VLAN change starts a new
 * row — which both reads as the grouping the user asked for and keeps the block
 * compact. A single 17-device row would stretch ~160 tiles, and every cable
 * would then have to fan the whole width, which is far harder to route than a
 * few short rows stacked over each other.
 *
 * VLAN blocks keep the order in which they first appear and members keep the
 * order the crossing-minimisation pass gave them, so this never undoes the port
 * ordering it is layered on top of.
 */
const splitLayerByVlan = (
  layer: string[],
  vlanOf: Map<string, string>,
  footprints: Map<string, Footprint>
): string[][] => {
  // Group by VLAN first (stable, in first-appearance order) so a VLAN split
  // across the layer still ends up on one row.
  const blockByVlan = new Map<string, string[]>();
  layer.forEach((id) => {
    const vlan = vlanOf.get(id) ?? '';
    const list = blockByVlan.get(vlan) ?? [];
    list.push(id);
    blockByVlan.set(vlan, list);
  });

  const blocks = Array.from(blockByVlan.entries()).map(([vlan, ids]) => {
    return { vlan, ids };
  });

  const rows: string[][] = [];
  blocks.forEach((block) => {
    let row: string[] = [];
    let width = 0;

    block.ids.forEach((id) => {
      const w = footprints.get(id)?.width ?? 1;
      if (row.length > 0 && width + w > MAX_ROW_TILES) {
        rows.push(row);
        row = [];
        width = 0;
      }
      row.push(id);
      width += w;
    });

    if (row.length > 0) rows.push(row);
  });

  return rows;
};

/**
 * Nudge a single node outward until it lands on free space.
 * Returns null when no free spot is found — the caller then keeps the node
 * where it was, so the engine never produces overlapping devices.
 */
const findFreeSpot = ({
  desired,
  footprint,
  items,
  modelItems,
  excludeIds,
  gridStep
}: {
  desired: Coords;
  footprint: Footprint;
  items: { id: string; tile: Coords }[];
  modelItems: { id: string; icon?: string }[];
  excludeIds: string[];
  gridStep: Coords;
}): Coords | null => {
  const size = { width: footprint.width, height: footprint.height };
  const sx = Math.max(1, gridStep.x);
  const sy = Math.max(1, gridStep.y);

  const isFree = (origin: Coords) => {
    return isShape2dPlacementFree({
      origin,
      size,
      items,
      modelItems,
      excludeItemIds: excludeIds
    });
  };

  if (isFree(desired)) return desired;

  // Expanding ring search on the snap grid.
  for (let ring = 1; ring <= 24; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        // Perimeter of the ring only.
        const onPerimeter = Math.abs(dx) === ring || Math.abs(dy) === ring;
        if (onPerimeter) {
          const candidate = {
            x: desired.x + dx * sx,
            y: desired.y + dy * sy
          };
          if (isFree(candidate)) return candidate;
        }
      }
    }
  }

  return null;
};

/**
 * Assign collision-free tiles to every movable node.
 *
 * Components are packed on a shelf (left to right, wrapping downward) so two
 * components can never land on top of each other — replacing the legacy
 * whole-group offset search that gave up after 40 tries and left overlaps.
 */
export const placeNodes = ({
  graph,
  gridStep = { x: 1, y: 1 }
}: {
  graph: LayoutGraph;
  gridStep?: Coords;
}): PlaceResult => {
  const targets: Record<string, Coords> = {};
  if (graph.movableIds.length === 0) return { targets };

  const sx = Math.max(1, gridStep.x);
  const sy = Math.max(1, gridStep.y);
  const portOrder = buildPortOrderKey(graph.edges, graph.hubs);
  const vlanOf = buildVlanMap(graph);

  const movableSet = new Set(graph.movableIds);
  const itemById = new Map(
    graph.items.map((item) => {
      return [item.id, item] as const;
    })
  );

  // Anchor the whole layout at the top-left of the current selection so the
  // result stays near where the user is looking.
  let anchorX = Number.POSITIVE_INFINITY;
  let anchorY = Number.POSITIVE_INFINITY;
  graph.movableIds.forEach((id) => {
    const item = itemById.get(id);
    if (!item) return;
    if (item.tile.x < anchorX) anchorX = item.tile.x;
    if (item.tile.y < anchorY) anchorY = item.tile.y;
  });
  if (!Number.isFinite(anchorX)) anchorX = 0;
  if (!Number.isFinite(anchorY)) anchorY = 0;

  const anchor = snapTile2dToGrid({ x: anchorX, y: anchorY }, { x: sx, y: sy });

  // Shelf-pack the components.
  let shelfX = anchor.x;
  let shelfY = anchor.y;
  let shelfHeight = 0;
  const shelfLimit = 240;

  const componentBoxes: {
    positions: Record<string, Coords>;
  }[] = [];

  graph.components.forEach((component) => {
    const layers = minimiseCrossings(
      assignLayers(component, graph),
      graph,
      portOrder
    )
      // Immovable nodes (rack-mounted switches) took part in layering and
      // ordering, but must not be given a new position or reserve space.
      .flatMap((layer) => {
        return splitLayerByVlan(
          layer.filter((id) => {
            return movableSet.has(id);
          }),
          vlanOf,
          graph.footprints
        );
      })
      .filter((layer) => {
        return layer.length > 0;
      });

    if (layers.length === 0) return;

    const laid = layoutComponent({
      layers,
      origin: { x: shelfX, y: shelfY },
      footprints: graph.footprints,
      gridStep: { x: sx, y: sy },
      vlanOf
    });

    componentBoxes.push({ positions: laid.positions });

    shelfX = ceilToStep(shelfX + laid.width + SHAPE_2D_LAYOUT_GAP * 2, sx);
    if (laid.height > shelfHeight) shelfHeight = laid.height;

    if (shelfX - anchor.x > shelfLimit) {
      shelfX = anchor.x;
      shelfY = ceilToStep(shelfY + shelfHeight + SHAPE_2D_LAYOUT_GAP * 2, sy);
      shelfHeight = 0;
    }
  });

  // Resolve against everything that is NOT being moved (racks, fixed devices),
  // plus the nodes already committed in this run.
  const staticItems = graph.items.filter((item) => {
    return !movableSet.has(item.id);
  });
  const committed: { id: string; tile: Coords }[] = [];

  componentBoxes.forEach(({ positions }) => {
    Object.entries(positions).forEach(([id, desired]) => {
      const footprint = graph.footprints.get(id);
      const item = itemById.get(id);
      if (!footprint || !item) return;

      const snapped = snapTile2dToGrid(desired, { x: sx, y: sy });
      const spot = findFreeSpot({
        desired: snapped,
        footprint,
        items: [...staticItems, ...committed],
        modelItems: graph.modelItems,
        excludeIds: [id],
        gridStep: { x: sx, y: sy }
      });

      // No free spot → keep the original tile rather than overlap a neighbour.
      const final = spot ?? item.tile;
      committed.push({ id, tile: final });

      if (final.x !== item.tile.x || final.y !== item.tile.y) {
        targets[id] = final;
      }
    });
  });

  return { targets };
};

/**
 * Straight port↔port polylines for the current positions — a cheap stand-in
 * for routed cables when scoring candidate arrangements. Good enough to rank
 * arrangements, and orders of magnitude faster than running the router.
 */
const straightCablePaths = (
  graph: LayoutGraph,
  tileOf: Map<string, Coords>
): Coords[][] => {
  const paths: Coords[][] = [];

  graph.edges.forEach((edge) => {
    const aTile = tileOf.get(edge.aId);
    const bTile = tileOf.get(edge.bId);
    if (!aTile || !bTile) return;

    const aFp = graph.footprints.get(edge.aId);
    const bFp = graph.footprints.get(edge.bId);

    const a = edge.aPortOffset
      ? { x: aTile.x + edge.aPortOffset.x, y: aTile.y + edge.aPortOffset.y }
      : {
          x: aTile.x + (aFp?.width ?? 1) / 2,
          y: aTile.y + (aFp?.height ?? 1) / 2
        };
    const b = edge.bPortOffset
      ? { x: bTile.x + edge.bPortOffset.x, y: bTile.y + edge.bPortOffset.y }
      : {
          x: bTile.x + (bFp?.width ?? 1) / 2,
          y: bTile.y + (bFp?.height ?? 1) / 2
        };

    paths.push([a, b]);
  });

  return paths;
};

/**
 * For each leaf, the hub it hangs off and where on that hub it plugs in.
 * Leaves with several uplinks take the lowest port — that is the one that
 * decides where the cable leaves the chassis.
 */
const buildHubAssignment = (
  graph: LayoutGraph
): Map<string, { hubId: string; portX: number; portY: number }> => {
  const assignment = new Map<
    string,
    { hubId: string; portX: number; portY: number }
  >();

  graph.edges.forEach((edge) => {
    const aIsHub = graph.hubs.has(edge.aId);
    const bIsHub = graph.hubs.has(edge.bId);
    if (aIsHub === bIsHub) return;

    const leafId = aIsHub ? edge.bId : edge.aId;
    const hubId = aIsHub ? edge.aId : edge.bId;
    const hubPort = aIsHub ? edge.aPortOffset : edge.bPortOffset;
    if (!hubPort) return;

    const existing = assignment.get(leafId);
    if (
      !existing ||
      hubPort.x < existing.portX ||
      (hubPort.x === existing.portX && hubPort.y < existing.portY)
    ) {
      assignment.set(leafId, {
        hubId,
        portX: hubPort.x,
        portY: hubPort.y
      });
    }
  });

  return assignment;
};

/**
 * Deal every leaf of one hub onto its group's slots in port order.
 *
 * For hub-and-spoke wiring — a row of devices fanning into one switch, which
 * is most of a network plan — the crossing count is exactly the number of
 * inversions between the devices' spatial order and their port order. So the
 * optimum is not something to search for: sort the slots along whichever axis
 * the group actually spreads, sort the leaves by port, and pair them up.
 *
 * That is O(n log n) and exact, where the pairwise-swap search is O(n²) per
 * pass and only ever sees a straight-line approximation of the cables.
 */
const assignByPortOrder = ({
  graph,
  tileOf
}: {
  graph: LayoutGraph;
  tileOf: Map<string, Coords>;
}) => {
  const assignment = buildHubAssignment(graph);
  const movable = new Set(graph.movableIds);

  // Bucket leaves by (hub, footprint size): only same-size devices may trade
  // slots, or the layout this mode is meant to preserve would break.
  const buckets = new Map<string, string[]>();
  assignment.forEach((info, leafId) => {
    if (!movable.has(leafId)) return;
    const footprint = graph.footprints.get(leafId);
    if (!footprint) return;

    const bucketKey = `${info.hubId}|${footprint.width}x${footprint.height}`;
    const list = buckets.get(bucketKey) ?? [];
    list.push(leafId);
    buckets.set(bucketKey, list);
  });

  buckets.forEach((leafIds) => {
    if (leafIds.length < 2) return;

    const slots = leafIds.map((id) => {
      return { ...(tileOf.get(id) as Coords) };
    });

    // Which way does this group actually run? A row sorts by x, a column by y.
    const xs = slots.map((slot) => {
      return slot.x;
    });
    const ys = slots.map((slot) => {
      return slot.y;
    });
    const spreadX = Math.max(...xs) - Math.min(...xs);
    const spreadY = Math.max(...ys) - Math.min(...ys);
    const horizontal = spreadX >= spreadY;

    slots.sort((a, b) => {
      return horizontal ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x;
    });

    const ordered = [...leafIds].sort((a, b) => {
      const pa = assignment.get(a) as { portX: number; portY: number };
      const pb = assignment.get(b) as { portX: number; portY: number };
      return pa.portX - pb.portX || pa.portY - pb.portY;
    });

    ordered.forEach((leafId, index) => {
      tileOf.set(leafId, slots[index]);
    });
  });
};

/**
 * Reduce crossings WITHOUT moving anything: devices only swap places with one
 * another, so every occupied tile stays occupied and the drawing keeps its
 * overall shape.
 *
 * Only devices with identical footprints are considered interchangeable —
 * swapping a 1U switch with a workstation would break the layout it is
 * supposed to preserve.
 */
export const placeBySwapping = ({
  graph
}: {
  graph: LayoutGraph;
}): PlaceResult => {
  const targets: Record<string, Coords> = {};
  if (graph.movableIds.length < 2) return { targets };

  const itemById = new Map(
    graph.items.map((item) => {
      return [item.id, item] as const;
    })
  );

  // Interchangeable groups: same footprint size.
  const groups = new Map<string, string[]>();
  graph.movableIds.forEach((id) => {
    const footprint = graph.footprints.get(id);
    if (!footprint) return;
    const sizeKey = `${footprint.width}x${footprint.height}`;
    const list = groups.get(sizeKey) ?? [];
    list.push(id);
    groups.set(sizeKey, list);
  });

  // Current assignment: node -> tile.
  const tileOf = new Map<string, Coords>();
  graph.items.forEach((item) => {
    tileOf.set(item.id, { ...item.tile });
  });

  // Solve the hub-and-spoke part outright first. The pairwise search below only
  // sees straight port-to-port lines, which for a row of devices above a switch
  // do not cross even when the routed cables clearly do — so on its own it
  // leaves exactly the tangles this mode is supposed to remove.
  assignByPortOrder({ graph, tileOf });

  let best = countCrossings(straightCablePaths(graph, tileOf));

  /** Try one swap; keep it only if it removes crossings. */
  const trySwap = (a: string, b: string): boolean => {
    const aTile = tileOf.get(a);
    const bTile = tileOf.get(b);
    if (!aTile || !bTile) return false;

    tileOf.set(a, bTile);
    tileOf.set(b, aTile);

    const score = countCrossings(straightCablePaths(graph, tileOf));
    if (score < best) {
      best = score;
      return true;
    }

    tileOf.set(a, aTile);
    tileOf.set(b, bTile);
    return false;
  };

  // Refinement only: mops up whatever the port-order pass could not express
  // (leaves with no hub, hub↔hub links, mixed footprints).
  const maxPasses = 12;
  for (let pass = 0; pass < maxPasses && best > 0; pass += 1) {
    let improvedThisPass = false;

    groups.forEach((ids) => {
      if (ids.length < 2) return;

      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          if (trySwap(ids[i], ids[j])) improvedThisPass = true;
        }
      }
    });

    if (!improvedThisPass || best === 0) break;
  }

  graph.movableIds.forEach((id) => {
    const original = itemById.get(id)?.tile;
    const final = tileOf.get(id);
    if (!original || !final) return;
    if (original.x !== final.x || original.y !== final.y) {
      targets[id] = final;
    }
  });

  return { targets };
};

/** Apply pending targets to a copy of the view items (for routing). */
export const applyTargets = (
  items: ViewItem[],
  targets: Record<string, Coords>
): ViewItem[] => {
  return items.map((item) => {
    const target = targets[item.id];
    return target ? { ...item, tile: target } : item;
  });
};
