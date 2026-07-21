import { Coords, Size, ViewItem } from 'src/types';
import {
  SHAPE_2D_LAYOUT_GAP,
  SHAPE_2D_SWITCH_ID,
  getShape2dSize,
  getShape2dPorts
} from 'src/config';
import { isShape2dPlacementFree } from './renderer';

export type Shape2dLayoutMode = 'vertical' | 'horizontal' | 'grid';

type Footprint = {
  id: string;
  tile: Coords;
  width: number;
  height: number;
};

const getFootprint = (
  viewItem: ViewItem,
  modelItems: { id: string; icon?: string }[],
  modelItemMap?: Map<string, { id: string; icon?: string }>
): Footprint => {
  const modelItem = modelItemMap
    ? modelItemMap.get(viewItem.id)
    : modelItems.find((item) => {
        return item.id === viewItem.id;
      });
  const size = getShape2dSize(modelItem?.icon ?? '') ?? {
    width: 1,
    height: 1
  };

  return {
    id: viewItem.id,
    tile: { ...viewItem.tile },
    width: size.width,
    height: size.height
  };
};

/** Choose cols so the grid is as square as possible. */
export const chooseSquareGridCols = (count: number): number => {
  if (count <= 1) return 1;

  const root = Math.round(Math.sqrt(count));
  let best = Math.max(1, root);
  let bestScore = Number.POSITIVE_INFINITY;

  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const score = Math.abs(cols - rows) * 100 + Math.abs(cols * rows - count);
    if (score < bestScore) {
      bestScore = score;
      best = cols;
    }
  }

  return best;
};

const sortVertical = (items: Footprint[]) => {
  return [...items].sort((a, b) => {
    if (a.tile.y !== b.tile.y) return a.tile.y - b.tile.y;
    return a.tile.x - b.tile.x;
  });
};

const sortHorizontal = (items: Footprint[]) => {
  return [...items].sort((a, b) => {
    if (a.tile.x !== b.tile.x) return a.tile.x - b.tile.x;
    return a.tile.y - b.tile.y;
  });
};

const computePackedTargets = (
  ordered: Footprint[],
  mode: Shape2dLayoutMode,
  origin: Coords,
  gap: number
): Record<string, Coords> => {
  const targets: Record<string, Coords> = {};

  if (mode === 'vertical') {
    let y = origin.y;
    ordered.forEach((item) => {
      targets[item.id] = { x: origin.x, y };
      y += item.height + gap;
    });
    return targets;
  }

  if (mode === 'horizontal') {
    let x = origin.x;
    ordered.forEach((item) => {
      targets[item.id] = { x, y: origin.y };
      x += item.width + gap;
    });
    return targets;
  }

  // grid
  const cols = chooseSquareGridCols(ordered.length);
  const colWidths: number[] = Array.from({ length: cols }, () => 0);
  const rowHeights: number[] = [];

  ordered.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    colWidths[col] = Math.max(colWidths[col], item.width);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, item.height);
  });

  const colXs: number[] = [];
  let xCursor = origin.x;
  colWidths.forEach((width, index) => {
    colXs[index] = xCursor;
    xCursor += width + gap;
  });

  const rowYs: number[] = [];
  let yCursor = origin.y;
  rowHeights.forEach((height, index) => {
    rowYs[index] = yCursor;
    yCursor += height + gap;
  });

  ordered.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    targets[item.id] = { x: colXs[col], y: rowYs[row] };
  });

  return targets;
};

const offsetTargets = (
  targets: Record<string, Coords>,
  dx: number,
  dy: number
): Record<string, Coords> => {
  const next: Record<string, Coords> = {};
  Object.entries(targets).forEach(([id, tile]) => {
    next[id] = { x: tile.x + dx, y: tile.y + dy };
  });
  return next;
};

const placementsFree = ({
  targets,
  footprints,
  items,
  modelItems,
  excludeItemIds
}: {
  targets: Record<string, Coords>;
  footprints: Footprint[];
  items: { id: string; tile: Coords }[];
  modelItems: { id: string; icon?: string }[];
  excludeItemIds: string[];
}): boolean => {
  return footprints.every((footprint) => {
    const origin = targets[footprint.id];
    if (!origin) return false;

    return isShape2dPlacementFree({
      origin,
      size: { width: footprint.width, height: footprint.height } as Size,
      items,
      modelItems,
      excludeItemIds
    });
  });
};

/**
 * Compute new top-left tiles for selected 2D nodes.
 * Anchors at the selection bbox top-left; packs with ≥ gap between footprints.
 */
export const layoutShape2dItems = ({
  selectedItems,
  allItems,
  modelItems,
  mode,
  gap = SHAPE_2D_LAYOUT_GAP
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  mode: Shape2dLayoutMode;
  gap?: number;
}): Record<string, Coords> => {
  if (selectedItems.length === 0) return {};

  const modelItemMap = new Map(modelItems.map(i => [i.id, i]));
  const footprints = selectedItems.map((item) => {
    return getFootprint(item, modelItems, modelItemMap);
  });

  const ordered =
    mode === 'vertical'
      ? sortVertical(footprints)
      : mode === 'horizontal'
        ? sortHorizontal(footprints)
        : sortHorizontal(footprints);

  const origin = {
    x: Math.min(...footprints.map((item) => item.tile.x)),
    y: Math.min(...footprints.map((item) => item.tile.y))
  };

  let targets = computePackedTargets(ordered, mode, origin, gap);
  const excludeItemIds = footprints.map((item) => item.id);

  if (
    placementsFree({
      targets,
      footprints,
      items: allItems,
      modelItems,
      excludeItemIds
    })
  ) {
    return targets;
  }

  // Nudge the whole group until free (or give up after a bounded search).
  const searchLimit = 40;
  for (let step = 1; step <= searchLimit; step += 1) {
    const candidates = [
      offsetTargets(targets, step, 0),
      offsetTargets(targets, 0, step),
      offsetTargets(targets, step, step),
      offsetTargets(targets, -step, 0),
      offsetTargets(targets, 0, -step)
    ];

    const found = candidates.find((candidate) => {
      return placementsFree({
        targets: candidate,
        footprints,
        items: allItems,
        modelItems,
        excludeItemIds
      });
    });

    if (found) {
      return found;
    }
  }

  return targets;
};

type TidyConnector = {
  id: string;
  anchors: {
    ref: { item?: string; port?: string; tile?: Coords };
  }[];
};

type LeafAssignment = {
  leafId: string;
  switchId: string;
  /** World x of the switch port the leaf is cabled to (sort key). */
  portWorldX: number;
  side: 'TOP' | 'BOTTOM';
};

type TidyEdgeEndpoint = {
  itemId: string;
  /** Port offset from the item's top-left, if the cable is port-attached. */
  portLocal: Coords | null;
};

type TidyEdge = {
  a: TidyEdgeEndpoint;
  b: TidyEdgeEndpoint;
};

const orientation = (p: Coords, q: Coords, r: Coords) => {
  const value = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (value === 0) return 0;
  return value > 0 ? 1 : 2;
};

const onSegment = (p: Coords, q: Coords, r: Coords) => {
  return (
    q.x <= Math.max(p.x, r.x) &&
    q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) &&
    q.y >= Math.min(p.y, r.y)
  );
};

/** Straight-segment intersection (RJ45↔RJ45 crossing estimate — no pathfinding). */
const segmentsIntersect = (a1: Coords, a2: Coords, b1: Coords, b2: Coords) => {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;

  return false;
};

const collectTidyEdges = ({
  connectors,
  selectedIds,
  iconById
}: {
  connectors: TidyConnector[];
  selectedIds: Set<string>;
  iconById: Map<string, string | undefined>;
}): TidyEdge[] => {
  const edges: TidyEdge[] = [];

  connectors.forEach((connector) => {
    const endpointAnchors = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (endpointAnchors.length < 2) return;

    const first = endpointAnchors[0];
    const last = endpointAnchors[endpointAnchors.length - 1];
    if (!first.ref.item || !last.ref.item) return;
    if (first.ref.item === last.ref.item) return;
    if (!selectedIds.has(first.ref.item) && !selectedIds.has(last.ref.item)) {
      return;
    }

    const toEndpoint = (anchor: typeof first): TidyEdgeEndpoint => {
      const itemId = anchor.ref.item!;
      const port = getShape2dPorts(iconById.get(itemId) ?? '').find(
        (candidate) => {
          return candidate.id === anchor.ref.port;
        }
      );

      return {
        itemId,
        portLocal: port ? { ...port.tile } : null
      };
    };

    edges.push({ a: toEndpoint(first), b: toEndpoint(last) });
  });

  return edges;
};

/**
 * "Porządkuj": only permute selected nodes among their existing slots
 * (same footprint). Never invents new positions — so repeated clicks cannot
 * stack nodes.
 *
 * 1) Leaves of the same switch: assign slots by X to switch-port order
 *    (uncross the star using only current positions as slots).
 * 2) Same-footprint 2-opt swaps to cut any remaining straight-line crossings.
 */
export const tidyShape2dItems = ({
  selectedItems,
  allItems,
  modelItems,
  connectors
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  connectors: TidyConnector[];
  gap?: number;
}): Record<string, Coords> => {
  if (selectedItems.length < 2) return {};

  const selectedIds = new Set(
    selectedItems.map((item) => {
      return item.id;
    })
  );
  const iconById = new Map(
    modelItems.map((item) => {
      return [item.id, item.icon] as const;
    })
  );

  const sizeOf = (id: string): Size => {
    return (
      getShape2dSize(iconById.get(id) ?? '') ?? { width: 1, height: 1 }
    );
  };

  const isSwitch = (id: string) => {
    return iconById.get(id) === SHAPE_2D_SWITCH_ID;
  };

  const edges = collectTidyEdges({ connectors, selectedIds, iconById });
  if (edges.length === 0) return {};

  // Working tile map — only swap among current slots of selected nodes.
  const tiles = new Map<string, Coords>();
  allItems.forEach((item) => {
    tiles.set(item.id, { ...item.tile });
  });

  // --- Phase 1: uncross switch stars by reassigning existing leaf slots ---
  type LeafLink = {
    leafId: string;
    switchId: string;
    portWorldX: number;
    sizeKey: string;
  };

  const leafLinks: LeafLink[] = [];
  connectors.forEach((connector) => {
    const ends = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (ends.length < 2) return;
    const first = ends[0];
    const last = ends[ends.length - 1];
    if (!first.ref.item || !last.ref.item) return;

    const firstSwitch = isSwitch(first.ref.item);
    const lastSwitch = isSwitch(last.ref.item);
    if (firstSwitch === lastSwitch) return;

    const switchAnchor = firstSwitch ? first : last;
    const leafAnchor = firstSwitch ? last : first;
    const leafId = leafAnchor.ref.item!;
    const switchId = switchAnchor.ref.item!;
    if (!selectedIds.has(leafId)) return;
    if (leafLinks.some((link) => link.leafId === leafId)) return;

    const switchItem = allItems.find((item) => item.id === switchId);
    if (!switchItem) return;
    const ports = getShape2dPorts(iconById.get(switchId) ?? '');
    const port = ports.find((candidate) => {
      return candidate.id === switchAnchor.ref.port;
    });
    if (!port) return;

    const switchTile = tiles.get(switchId) ?? switchItem.tile;
    const size = sizeOf(leafId);
    leafLinks.push({
      leafId,
      switchId,
      portWorldX: switchTile.x + port.tile.x,
      sizeKey: `${size.width}x${size.height}`
    });
  });

  // Group by switch + footprint so we only swap compatible slots.
  const starGroups = new Map<string, LeafLink[]>();
  leafLinks.forEach((link) => {
    const key = `${link.switchId}::${link.sizeKey}`;
    const group = starGroups.get(key) ?? [];
    group.push(link);
    starGroups.set(key, group);
  });

  starGroups.forEach((group) => {
    if (group.length < 2) return;

    // Existing slots (current leaf tiles), ordered left→right.
    const slots = group
      .map((link) => {
        return { ...tiles.get(link.leafId)! };
      })
      .sort((a, b) => {
        if (a.x !== b.x) return a.x - b.x;
        return a.y - b.y;
      });

    // Leaves ordered by the switch port they connect to.
    const orderedLeaves = [...group].sort((a, b) => {
      if (a.portWorldX !== b.portWorldX) return a.portWorldX - b.portWorldX;
      return a.leafId.localeCompare(b.leafId);
    });

    orderedLeaves.forEach((link, index) => {
      tiles.set(link.leafId, { ...slots[index] });
    });
  });

  // --- Phase 2: 2-opt same-size swaps for remaining crossings ---
  if (edges.length > 0 && selectedItems.length >= 2) {
    const pointFor = (endpoint: TidyEdgeEndpoint): Coords | null => {
      const tile = tiles.get(endpoint.itemId);
      if (!tile) return null;

      if (endpoint.portLocal) {
        return {
          x: tile.x + endpoint.portLocal.x,
          y: tile.y + endpoint.portLocal.y
        };
      }

      const size = sizeOf(endpoint.itemId);
      return {
        x: tile.x + size.width / 2,
        y: tile.y + size.height / 2
      };
    };

    const totalWireLength = () => {
      return edges.reduce((sum, edge) => {
        const pa = pointFor(edge.a);
        const pb = pointFor(edge.b);
        if (!pa || !pb) return sum;
        return sum + Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y);
      }, 0);
    };

    const totalCrossings = () => {
      const points = edges
        .map((edge) => {
          const pa = pointFor(edge.a);
          const pb = pointFor(edge.b);
          return pa && pb ? ([pa, pb] as const) : null;
        })
        .filter((entry): entry is readonly [Coords, Coords] => {
          return Boolean(entry);
        });

      let count = 0;
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const [a1, a2] = points[i];
          const [b1, b2] = points[j];
          // Shared endpoint is a join, not a crossing.
          if (
            (a1.x === b1.x && a1.y === b1.y) ||
            (a1.x === b2.x && a1.y === b2.y) ||
            (a2.x === b1.x && a2.y === b1.y) ||
            (a2.x === b2.x && a2.y === b2.y)
          ) {
            continue;
          }
          if (segmentsIntersect(a1, a2, b1, b2)) {
            count += 1;
          }
        }
      }
      return count;
    };

    const cost = () => {
      return totalCrossings() * 10000 + totalWireLength();
    };

    const swapGroups = new Map<string, string[]>();
    selectedItems.forEach((item) => {
      const size = sizeOf(item.id);
      const groupKey = `${size.width}x${size.height}`;
      const group = swapGroups.get(groupKey) ?? [];
      group.push(item.id);
      swapGroups.set(groupKey, group);
    });

    let best = cost();
    let improved = true;
    let guard = 0;

    while (improved && guard < 80) {
      improved = false;
      guard += 1;

      swapGroups.forEach((group) => {
        for (let i = 0; i < group.length; i += 1) {
          for (let j = i + 1; j < group.length; j += 1) {
            const idA = group[i];
            const idB = group[j];
            const tileA = tiles.get(idA)!;
            const tileB = tiles.get(idB)!;

            tiles.set(idA, tileB);
            tiles.set(idB, tileA);

            const candidate = cost();
            if (candidate < best) {
              best = candidate;
              improved = true;
            } else {
              tiles.set(idA, tileA);
              tiles.set(idB, tileB);
            }
          }
        }
      });
    }
  }

  const targets: Record<string, Coords> = {};
  selectedItems.forEach((item) => {
    const next = tiles.get(item.id);
    if (!next) return;
    if (next.x !== item.tile.x || next.y !== item.tile.y) {
      targets[item.id] = { ...next };
    }
  });

  return targets;
};

export type TidyInPlaceVariant =
  | 'bundleTidy'
  | 'wireLength'
  | 'crossings'
  | 'portOrder'
  | 'bundleVertical'
  | 'bundleHorizontal'
  | 'gatherDown'
  | 'gatherUp'
  | 'gatherAuto';

export const TIDY_IN_PLACE_VARIANTS: TidyInPlaceVariant[] = [
  'bundleTidy',
  'wireLength',
  'crossings',
  'portOrder',
  'bundleVertical',
  'bundleHorizontal',
  'gatherDown',
  'gatherUp',
  'gatherAuto'
];

/** Uniform stub length (tiles) before cables gather into a centered bundle. */
export const GATHER_STUB_LENGTH = 5;

/**
 * "Porządkuj w miejscu": positions (slots) of the selected nodes stay fixed;
 * nodes may swap slots (within same-footprint groups) so cables get short,
 * parallel and uncrossed — like a tidy electrical cabinet.
 *
 * Variants:
 * - wireLength: minimize total Manhattan cable length (2-opt hill climb)
 * - crossings:  minimize cable crossings first, then length
 * - portOrder:  order nodes to match their switch-port order, row-major slots
 */
export const tidyInPlaceShape2dItems = ({
  selectedItems,
  allItems,
  modelItems,
  connectors,
  variant
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  connectors: TidyConnector[];
  variant: TidyInPlaceVariant;
}): Record<string, Coords> => {
  if (selectedItems.length < 2) return {};

  const selectedIds = new Set(
    selectedItems.map((item) => {
      return item.id;
    })
  );
  const itemById = new Map(
    allItems.map((item) => {
      return [item.id, item] as const;
    })
  );
  const iconById = new Map(
    modelItems.map((item) => {
      return [item.id, item.icon] as const;
    })
  );

  const sizeOf = (id: string): Size => {
    return (
      getShape2dSize(iconById.get(id) ?? '') ?? { width: 1, height: 1 }
    );
  };

  // Current assignment: item -> tile (only selected are mutable).
  const tiles = new Map<string, Coords>();
  selectedItems.forEach((item) => {
    tiles.set(item.id, { ...item.tile });
  });

  // Edges (cables) touching the selection, with port offsets where known.
  const edges: TidyEdge[] = [];

  connectors.forEach((connector) => {
    const endpointAnchors = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (endpointAnchors.length < 2) return;

    const first = endpointAnchors[0];
    const last = endpointAnchors[endpointAnchors.length - 1];
    if (!first.ref.item || !last.ref.item) return;
    if (first.ref.item === last.ref.item) return;
    if (!selectedIds.has(first.ref.item) && !selectedIds.has(last.ref.item)) {
      return;
    }

    const toEndpoint = (anchor: typeof first): TidyEdgeEndpoint => {
      const itemId = anchor.ref.item!;
      const port = getShape2dPorts(iconById.get(itemId) ?? '').find(
        (candidate) => {
          return candidate.id === anchor.ref.port;
        }
      );

      return {
        itemId,
        portLocal: port ? { ...port.tile } : null
      };
    };

    edges.push({ a: toEndpoint(first), b: toEndpoint(last) });
  });

  if (edges.length === 0) return {};

  const pointFor = (endpoint: TidyEdgeEndpoint): Coords | null => {
    const tile =
      tiles.get(endpoint.itemId) ?? itemById.get(endpoint.itemId)?.tile;
    if (!tile) return null;

    if (endpoint.portLocal) {
      return {
        x: tile.x + endpoint.portLocal.x,
        y: tile.y + endpoint.portLocal.y
      };
    }

    const size = sizeOf(endpoint.itemId);
    return {
      x: tile.x + size.width / 2,
      y: tile.y + size.height / 2
    };
  };

  const totalWireLength = () => {
    return edges.reduce((sum, edge) => {
      const pa = pointFor(edge.a);
      const pb = pointFor(edge.b);
      if (!pa || !pb) return sum;
      return sum + Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y);
    }, 0);
  };

  const totalCrossings = () => {
    const points = edges
      .map((edge) => {
        const pa = pointFor(edge.a);
        const pb = pointFor(edge.b);
        return pa && pb ? ([pa, pb] as const) : null;
      })
      .filter((entry): entry is readonly [Coords, Coords] => {
        return Boolean(entry);
      });

    let count = 0;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        if (
          segmentsIntersect(
            points[i][0],
            points[i][1],
            points[j][0],
            points[j][1]
          )
        ) {
          count += 1;
        }
      }
    }
    return count;
  };

  const cost = () => {
    if (variant === 'crossings') {
      return totalCrossings() * 10000 + totalWireLength();
    }
    return totalWireLength();
  };

  // Swap groups: only same-footprint nodes may exchange slots.
  const groups = new Map<string, string[]>();
  selectedItems.forEach((item) => {
    const size = sizeOf(item.id);
    const groupKey = `${size.width}x${size.height}`;
    const group = groups.get(groupKey) ?? [];
    group.push(item.id);
    groups.set(groupKey, group);
  });

  if (variant === 'portOrder') {
    // Sort key: world x of the switch port the node is cabled to.
    const keyFor = (id: string): number => {
      for (const edge of edges) {
        const self =
          edge.a.itemId === id ? edge.a : edge.b.itemId === id ? edge.b : null;
        if (!self) continue;
        const other = edge.a.itemId === id ? edge.b : edge.a;
        if (iconById.get(other.itemId) !== SHAPE_2D_SWITCH_ID) continue;
        if (!other.portLocal) continue;
        const otherTile =
          tiles.get(other.itemId) ?? itemById.get(other.itemId)?.tile;
        if (!otherTile) continue;
        return otherTile.x + other.portLocal.x;
      }
      return tiles.get(id)?.x ?? 0;
    };

    groups.forEach((group) => {
      if (group.length < 2) return;

      // Row-major slot order (top row first, then left→right).
      const slots = group
        .map((id) => {
          return { ...tiles.get(id)! };
        })
        .sort((a, b) => {
          if (a.y !== b.y) return a.y - b.y;
          return a.x - b.x;
        });

      const orderedNodes = [...group].sort((a, b) => {
        return keyFor(a) - keyFor(b);
      });

      orderedNodes.forEach((id, index) => {
        tiles.set(id, slots[index]);
      });
    });
  } else {
    // 2-opt hill climbing: try pairwise slot swaps until no improvement.
    let best = cost();
    let improved = true;
    let guard = 0;

    while (improved && guard < 60) {
      improved = false;
      guard += 1;

      groups.forEach((group) => {
        for (let i = 0; i < group.length; i += 1) {
          for (let j = i + 1; j < group.length; j += 1) {
            const idA = group[i];
            const idB = group[j];
            const tileA = tiles.get(idA)!;
            const tileB = tiles.get(idB)!;

            tiles.set(idA, tileB);
            tiles.set(idB, tileA);

            const candidate = cost();
            if (candidate < best) {
              best = candidate;
              improved = true;
            } else {
              tiles.set(idA, tileA);
              tiles.set(idB, tileB);
            }
          }
        }
      });
    }
  }

  const targets: Record<string, Coords> = {};
  selectedItems.forEach((item) => {
    const next = tiles.get(item.id)!;
    if (next.x !== item.tile.x || next.y !== item.tile.y) {
      targets[item.id] = next;
    }
  });

  return targets;
};

export type BundleOrientation = 'vertical' | 'horizontal';

/**
 * "Wiązka" routing: nodes stay put; every leaf↔switch cable gets waypoints so
 * cables leave each node, join a shared trunk (each cable in its own adjacent
 * lane) and travel together to the switch — like a cable tray in a rack.
 *
 * - vertical:   cables drop out of each node, then run in a vertical trunk
 *               beside the selection toward the switch.
 * - horizontal: cables drop onto horizontal lanes below the row and run
 *               side-by-side toward the switch, outer lanes passing inner ones.
 *
 * Returns waypoint tiles per connector id, ordered from the connector's FIRST
 * endpoint anchor to its LAST.
 */
export const bundleShape2dRoutes = ({
  selectedItems,
  allItems,
  modelItems,
  connectors,
  orientation
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  connectors: TidyConnector[];
  orientation: BundleOrientation;
}): Record<string, Coords[]> => {
  const selectedIds = new Set(
    selectedItems.map((item) => {
      return item.id;
    })
  );
  const itemById = new Map(
    allItems.map((item) => {
      return [item.id, item] as const;
    })
  );
  const iconById = new Map(
    modelItems.map((item) => {
      return [item.id, item.icon] as const;
    })
  );
  const modelItemMap = new Map(modelItems.map(i => [i.id, i]));

  const isSwitch = (id: string) => {
    return iconById.get(id) === SHAPE_2D_SWITCH_ID;
  };

  type BundleCable = {
    connectorId: string;
    /** True when the connector's first endpoint anchor is the leaf. */
    leafFirst: boolean;
    leafId: string;
    leafPortWorld: Coords;
    leafPortSide: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
    switchId: string;
    switchPortWorld: Coords;
    switchPortSide: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
  };

  const cables: BundleCable[] = [];

  connectors.forEach((connector) => {
    const endpointAnchors = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (endpointAnchors.length < 2) return;

    const first = endpointAnchors[0];
    const last = endpointAnchors[endpointAnchors.length - 1];
    if (!first.ref.item || !last.ref.item) return;

    const firstIsSwitch = isSwitch(first.ref.item);
    const lastIsSwitch = isSwitch(last.ref.item);
    if (firstIsSwitch === lastIsSwitch) return;

    const switchAnchor = firstIsSwitch ? first : last;
    const leafAnchor = firstIsSwitch ? last : first;
    const leafId = leafAnchor.ref.item!;
    const switchId = switchAnchor.ref.item!;

    if (!selectedIds.has(leafId)) return;

    const leafItem = itemById.get(leafId);
    const switchItem = itemById.get(switchId);
    if (!leafItem || !switchItem) return;

    const leafPort = getShape2dPorts(iconById.get(leafId) ?? '').find(
      (candidate) => {
        return candidate.id === leafAnchor.ref.port;
      }
    );
    const switchPort = getShape2dPorts(iconById.get(switchId) ?? '').find(
      (candidate) => {
        return candidate.id === switchAnchor.ref.port;
      }
    );
    if (!leafPort || !switchPort) return;

    cables.push({
      connectorId: connector.id,
      leafFirst: !firstIsSwitch,
      leafId,
      leafPortWorld: {
        x: leafItem.tile.x + leafPort.tile.x,
        y: leafItem.tile.y + leafPort.tile.y
      },
      leafPortSide: leafPort.side,
      switchId,
      switchPortWorld: {
        x: switchItem.tile.x + switchPort.tile.x,
        y: switchItem.tile.y + switchPort.tile.y
      },
      switchPortSide: switchPort.side
    });
  });

  if (cables.length === 0) return {};

  // One bundle per switch.
  const groups = new Map<string, BundleCable[]>();
  cables.forEach((cable) => {
    const group = groups.get(cable.switchId) ?? [];
    group.push(cable);
    groups.set(cable.switchId, group);
  });

  const routes: Record<string, Coords[]> = {};

  groups.forEach((group, switchId) => {
    const switchItem = itemById.get(switchId);
    if (!switchItem) return;

    const switchSize = getShape2dSize(iconById.get(switchId) ?? '') ?? {
      width: 1,
      height: 1
    };
    const switchCenter = {
      x: switchItem.tile.x + switchSize.width / 2,
      y: switchItem.tile.y + switchSize.height / 2
    };

    // Bbox of the leaves in this bundle.
    const leafFootprints = group.map((cable) => {
      const viewItem = itemById.get(cable.leafId)!;
      return getFootprint(viewItem, modelItems, modelItemMap);
    });
    const bboxMinX = Math.min(...leafFootprints.map((f) => f.tile.x));
    const bboxMaxX = Math.max(
      ...leafFootprints.map((f) => f.tile.x + f.width - 1)
    );
    const bboxMinY = Math.min(...leafFootprints.map((f) => f.tile.y));
    const bboxMaxY = Math.max(
      ...leafFootprints.map((f) => f.tile.y + f.height - 1)
    );

    const exitPoint = (cable: BundleCable): Coords => {
      switch (cable.leafPortSide) {
        case 'TOP':
          return { x: cable.leafPortWorld.x, y: cable.leafPortWorld.y - 1 };
        case 'LEFT':
          return { x: cable.leafPortWorld.x - 1, y: cable.leafPortWorld.y };
        case 'RIGHT':
          return { x: cable.leafPortWorld.x + 1, y: cable.leafPortWorld.y };
        case 'BOTTOM':
        default:
          return { x: cable.leafPortWorld.x, y: cable.leafPortWorld.y + 1 };
      }
    };

    if (orientation === 'vertical') {
      // Trunk = vertical lanes on the switch-facing side of the selection.
      const trunkRight =
        switchCenter.x >= (bboxMinX + bboxMaxX) / 2;
      const trunkBaseX = trunkRight ? bboxMaxX + 2 : bboxMinX - 2;

      // Lane order: leaves top→bottom.
      const ordered = [...group].sort((a, b) => {
        const ya = itemById.get(a.leafId)?.tile.y ?? 0;
        const yb = itemById.get(b.leafId)?.tile.y ?? 0;
        if (ya !== yb) return ya - yb;
        return a.leafPortWorld.x - b.leafPortWorld.x;
      });

      ordered.forEach((cable, laneIndex) => {
        const laneX = trunkRight
          ? trunkBaseX + laneIndex
          : trunkBaseX - laneIndex;

        const exit = exitPoint(cable);
        // Own horizontal level per lane so exit runs never overlap
        // (matters when several leaves share the same row).
        const runY =
          cable.leafPortSide === 'TOP'
            ? exit.y - laneIndex
            : exit.y + laneIndex;
        const approachY =
          cable.switchPortSide === 'TOP'
            ? cable.switchPortWorld.y - 1 - laneIndex
            : cable.switchPortWorld.y + 1 + laneIndex;

        const tiles: Coords[] = [
          exit,
          { x: exit.x, y: runY },
          { x: laneX, y: runY },
          { x: laneX, y: approachY },
          { x: cable.switchPortWorld.x, y: approachY }
        ];

        routes[cable.connectorId] = cable.leafFirst
          ? tiles
          : [...tiles].reverse();
      });
    } else {
      // Horizontal trunk lanes below (or above) the row of leaves.
      const lanesBelow =
        switchCenter.y >= (bboxMinY + bboxMaxY) / 2 ||
        group.every((cable) => {
          return cable.leafPortSide === 'BOTTOM';
        });
      const trunkBaseY = lanesBelow ? bboxMaxY + 2 : bboxMinY - 2;

      // Lane order: leaves left→right.
      const ordered = [...group].sort((a, b) => {
        const xa = itemById.get(a.leafId)?.tile.x ?? 0;
        const xb = itemById.get(b.leafId)?.tile.x ?? 0;
        if (xa !== xb) return xa - xb;
        return a.leafPortWorld.y - b.leafPortWorld.y;
      });

      ordered.forEach((cable, laneIndex) => {
        const laneY = lanesBelow
          ? trunkBaseY + laneIndex
          : trunkBaseY - laneIndex;

        const exit = exitPoint(cable);
        const approachY =
          cable.switchPortSide === 'TOP'
            ? cable.switchPortWorld.y - 1
            : cable.switchPortWorld.y + 1;

        const tiles: Coords[] = [
          exit,
          { x: exit.x, y: laneY },
          { x: cable.switchPortWorld.x, y: laneY },
          { x: cable.switchPortWorld.x, y: approachY }
        ];

        routes[cable.connectorId] = cable.leafFirst
          ? tiles
          : [...tiles].reverse();
      });
    }
  });

  // Drop consecutive duplicate tiles (degenerate segments).
  Object.entries(routes).forEach(([connectorId, tiles]) => {
    const cleaned = tiles.filter((tile, index) => {
      if (index === 0) return true;
      const prev = tiles[index - 1];
      return prev.x !== tile.x || prev.y !== tile.y;
    });
    routes[connectorId] = cleaned;
  });

  return routes;
};

export type GatherDirection = 'down' | 'up' | 'left' | 'right';

const cleanRouteTiles = (tiles: Coords[]): Coords[] => {
  return tiles.filter((tile, index) => {
    if (index === 0) return true;
    const prev = tiles[index - 1];
    return prev.x !== tile.x || prev.y !== tile.y;
  });
};

const laneOffset = (index: number, count: number) => {
  return index - Math.floor((count - 1) / 2);
};

/**
 * Gather-bundle profiles: identical stubs from every selected leaf, then pack
 * cables into a centered parallel tray and lead them to the switch with a
 * waypoint before the final turn into each port.
 *
 * Does not move nodes — only generates waypoints.
 */
export const gatherBundleShape2dRoutes = ({
  selectedItems,
  allItems,
  modelItems,
  connectors,
  direction,
  stubLength = GATHER_STUB_LENGTH
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  connectors: TidyConnector[];
  direction: GatherDirection;
  stubLength?: number;
}): Record<string, Coords[]> => {
  const selectedIds = new Set(
    selectedItems.map((item) => {
      return item.id;
    })
  );
  const itemById = new Map(
    allItems.map((item) => {
      return [item.id, item] as const;
    })
  );
  const iconById = new Map(
    modelItems.map((item) => {
      return [item.id, item.icon] as const;
    })
  );

  const isSwitch = (id: string) => {
    return iconById.get(id) === SHAPE_2D_SWITCH_ID;
  };

  type GatherCable = {
    connectorId: string;
    leafFirst: boolean;
    leafId: string;
    leafPortWorld: Coords;
    switchId: string;
    switchPortWorld: Coords;
    switchPortSide: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
  };

  const cables: GatherCable[] = [];

  connectors.forEach((connector) => {
    const endpointAnchors = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (endpointAnchors.length < 2) return;

    const first = endpointAnchors[0];
    const last = endpointAnchors[endpointAnchors.length - 1];
    if (!first.ref.item || !last.ref.item) return;

    const firstIsSwitch = isSwitch(first.ref.item);
    const lastIsSwitch = isSwitch(last.ref.item);
    if (firstIsSwitch === lastIsSwitch) return;

    const switchAnchor = firstIsSwitch ? first : last;
    const leafAnchor = firstIsSwitch ? last : first;
    const leafId = leafAnchor.ref.item!;
    const switchId = switchAnchor.ref.item!;

    if (!selectedIds.has(leafId)) return;

    const leafItem = itemById.get(leafId);
    const switchItem = itemById.get(switchId);
    if (!leafItem || !switchItem) return;

    const leafPort = getShape2dPorts(iconById.get(leafId) ?? '').find(
      (candidate) => {
        return candidate.id === leafAnchor.ref.port;
      }
    );
    const switchPort = getShape2dPorts(iconById.get(switchId) ?? '').find(
      (candidate) => {
        return candidate.id === switchAnchor.ref.port;
      }
    );
    if (!leafPort || !switchPort) return;

    cables.push({
      connectorId: connector.id,
      leafFirst: !firstIsSwitch,
      leafId,
      leafPortWorld: {
        x: leafItem.tile.x + leafPort.tile.x,
        y: leafItem.tile.y + leafPort.tile.y
      },
      switchId,
      switchPortWorld: {
        x: switchItem.tile.x + switchPort.tile.x,
        y: switchItem.tile.y + switchPort.tile.y
      },
      switchPortSide: switchPort.side
    });
  });

  if (cables.length === 0) return {};

  const groups = new Map<string, GatherCable[]>();
  cables.forEach((cable) => {
    const group = groups.get(cable.switchId) ?? [];
    group.push(cable);
    groups.set(cable.switchId, group);
  });

  const stubDelta = (): Coords => {
    switch (direction) {
      case 'up':
        return { x: 0, y: -stubLength };
      case 'left':
        return { x: -stubLength, y: 0 };
      case 'right':
        return { x: stubLength, y: 0 };
      case 'down':
      default:
        return { x: 0, y: stubLength };
    }
  };

  const delta = stubDelta();
  const routes: Record<string, Coords[]> = {};

  groups.forEach((group, switchId) => {
    const switchItem = itemById.get(switchId);
    if (!switchItem) return;

    const switchSize = getShape2dSize(iconById.get(switchId) ?? '') ?? {
      width: 1,
      height: 1
    };

    const isVerticalStub = direction === 'down' || direction === 'up';

    // Order leaves along the axis perpendicular to the stub so lanes stay stable.
    const ordered = [...group].sort((a, b) => {
      if (isVerticalStub) {
        if (a.leafPortWorld.x !== b.leafPortWorld.x) {
          return a.leafPortWorld.x - b.leafPortWorld.x;
        }
        return a.leafPortWorld.y - b.leafPortWorld.y;
      }
      if (a.leafPortWorld.y !== b.leafPortWorld.y) {
        return a.leafPortWorld.y - b.leafPortWorld.y;
      }
      return a.leafPortWorld.x - b.leafPortWorld.x;
    });

    const stubs = ordered.map((cable) => {
      return {
        cable,
        stub: {
          x: cable.leafPortWorld.x + delta.x,
          y: cable.leafPortWorld.y + delta.y
        }
      };
    });

    // Center the packed tray on the mean stub position.
    const centerX = Math.round(
      stubs.reduce((sum, entry) => {
        return sum + entry.stub.x;
      }, 0) / stubs.length
    );
    const centerY = Math.round(
      stubs.reduce((sum, entry) => {
        return sum + entry.stub.y;
      }, 0) / stubs.length
    );

    // Approach clearance just outside the switch footprint / port.
    const approachPad = 2;

    stubs.forEach((entry, index) => {
      const offset = laneOffset(index, stubs.length);
      const { cable, stub } = entry;

      let gather: Coords;
      let beforeTurn: Coords;
      let afterTurn: Coords;

      if (isVerticalStub) {
        // Stub down/up → pack on X, run along Y toward the switch.
        gather = { x: centerX + offset, y: stub.y };

        const approachY =
          cable.switchPortSide === 'TOP'
            ? Math.min(
                cable.switchPortWorld.y - approachPad,
                switchItem.tile.y - approachPad
              )
            : cable.switchPortSide === 'BOTTOM'
              ? Math.max(
                  cable.switchPortWorld.y + approachPad,
                  switchItem.tile.y + switchSize.height - 1 + approachPad
                )
              : direction === 'down'
                ? Math.min(
                    cable.switchPortWorld.y - approachPad,
                    switchItem.tile.y - approachPad
                  )
                : Math.max(
                    cable.switchPortWorld.y + approachPad,
                    switchItem.tile.y + switchSize.height - 1 + approachPad
                  );

        // Keep gather→approach monotonic when switch is beyond the stub line.
        const runY =
          direction === 'down'
            ? Math.max(gather.y, approachY)
            : Math.min(gather.y, approachY);

        beforeTurn = { x: gather.x, y: runY };
        afterTurn = { x: cable.switchPortWorld.x, y: runY };
      } else {
        // Stub left/right → pack on Y, run along X toward the switch.
        gather = { x: stub.x, y: centerY + offset };

        const approachX =
          cable.switchPortSide === 'LEFT'
            ? Math.min(
                cable.switchPortWorld.x - approachPad,
                switchItem.tile.x - approachPad
              )
            : cable.switchPortSide === 'RIGHT'
              ? Math.max(
                  cable.switchPortWorld.x + approachPad,
                  switchItem.tile.x + switchSize.width - 1 + approachPad
                )
              : direction === 'right'
                ? Math.min(
                    cable.switchPortWorld.x - approachPad,
                    switchItem.tile.x - approachPad
                  )
                : Math.max(
                    cable.switchPortWorld.x + approachPad,
                    switchItem.tile.x + switchSize.width - 1 + approachPad
                  );

        const runX =
          direction === 'right'
            ? Math.max(gather.x, approachX)
            : Math.min(gather.x, approachX);

        beforeTurn = { x: runX, y: gather.y };
        afterTurn = { x: runX, y: cable.switchPortWorld.y };
      }

      const tiles = cleanRouteTiles([stub, gather, beforeTurn, afterTurn]);

      routes[cable.connectorId] = cable.leafFirst
        ? tiles
        : [...tiles].reverse();
    });
  });

  return routes;
};

/** Pick gather stub direction from leaf→switch geometry. */
export const pickGatherDirection = ({
  selectedItems,
  allItems,
  modelItems,
  connectors
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  connectors: TidyConnector[];
}): GatherDirection => {
  const selectedIds = new Set(
    selectedItems.map((item) => {
      return item.id;
    })
  );
  const iconById = new Map(
    modelItems.map((item) => {
      return [item.id, item.icon] as const;
    })
  );
  const itemById = new Map(
    allItems.map((item) => {
      return [item.id, item] as const;
    })
  );

  let leafSumX = 0;
  let leafSumY = 0;
  let leafCount = 0;
  let switchSumX = 0;
  let switchSumY = 0;
  let switchCount = 0;

  connectors.forEach((connector) => {
    const endpoints = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (endpoints.length < 2) return;

    const a = endpoints[0].ref.item!;
    const b = endpoints[endpoints.length - 1].ref.item!;
    const aSwitch = iconById.get(a) === SHAPE_2D_SWITCH_ID;
    const bSwitch = iconById.get(b) === SHAPE_2D_SWITCH_ID;
    if (aSwitch === bSwitch) return;

    const leafId = aSwitch ? b : a;
    const switchId = aSwitch ? a : b;
    if (!selectedIds.has(leafId)) return;

    const leaf = itemById.get(leafId);
    const sw = itemById.get(switchId);
    if (!leaf || !sw) return;

    const leafSize = getShape2dSize(iconById.get(leafId) ?? '') ?? {
      width: 1,
      height: 1
    };
    const switchSize = getShape2dSize(iconById.get(switchId) ?? '') ?? {
      width: 1,
      height: 1
    };

    leafSumX += leaf.tile.x + leafSize.width / 2;
    leafSumY += leaf.tile.y + leafSize.height / 2;
    leafCount += 1;
    switchSumX += sw.tile.x + switchSize.width / 2;
    switchSumY += sw.tile.y + switchSize.height / 2;
    switchCount += 1;
  });

  if (leafCount === 0 || switchCount === 0) return 'down';

  const dx = switchSumX / switchCount - leafSumX / leafCount;
  const dy = switchSumY / switchCount - leafSumY / leafCount;

  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0 ? 'down' : 'up';
  }

  return dx >= 0 ? 'right' : 'left';
};

const edgeKey = (a: Coords, b: Coords) => {
  if (a.x < b.x || (a.x === b.x && a.y <= b.y)) {
    return `${a.x},${a.y}|${b.x},${b.y}`;
  }
  return `${b.x},${b.y}|${a.x},${a.y}`;
};

const markPathEdges = (path: Coords[], used: Set<string>) => {
  for (let i = 1; i < path.length; i += 1) {
    used.add(edgeKey(path[i - 1], path[i]));
  }
};

const pathUsesBusyEdge = (path: Coords[], used: Set<string>) => {
  for (let i = 1; i < path.length; i += 1) {
    if (used.has(edgeKey(path[i - 1], path[i]))) return true;
  }
  return false;
};

/** Orthogonal L/U fill between two tiles (inclusive). */
const orthoFill = (from: Coords, to: Coords, horizontalFirst: boolean) => {
  const tiles: Coords[] = [{ ...from }];
  let x = from.x;
  let y = from.y;

  const runX = () => {
    while (x !== to.x) {
      x += Math.sign(to.x - x);
      tiles.push({ x, y });
    }
  };
  const runY = () => {
    while (y !== to.y) {
      y += Math.sign(to.y - y);
      tiles.push({ x, y });
    }
  };

  if (horizontalFirst) {
    runX();
    runY();
  } else {
    runY();
    runX();
  }

  return tiles;
};

/** Bend corners only (drop collinear mids) — used as connector waypoints. */
const pathBendWaypoints = (path: Coords[]): Coords[] => {
  if (path.length < 3) return [];

  const bends: Coords[] = [];
  for (let i = 1; i < path.length - 1; i += 1) {
    const prev = path[i - 1];
    const cur = path[i];
    const next = path[i + 1];
    const inDx = Math.sign(cur.x - prev.x);
    const inDy = Math.sign(cur.y - prev.y);
    const outDx = Math.sign(next.x - cur.x);
    const outDy = Math.sign(next.y - cur.y);
    if (inDx !== outDx || inDy !== outDy) {
      bends.push({ ...cur });
    }
  }
  return bends;
};

/** Polyline through connector anchors (ports resolved via item tiles when possible). */
const connectorAnchorPolyline = (
  connector: TidyConnector,
  itemById: Map<string, ViewItem>,
  iconById: Map<string, string | undefined>
): Coords[] => {
  const points: Coords[] = [];
  connector.anchors.forEach((anchor) => {
    if (anchor.ref.tile) {
      points.push({ ...anchor.ref.tile });
      return;
    }
    if (!anchor.ref.item) return;
    const item = itemById.get(anchor.ref.item);
    if (!item) return;
    if (anchor.ref.port) {
      const port = getShape2dPorts(iconById.get(anchor.ref.item) ?? '').find(
        (candidate) => {
          return candidate.id === anchor.ref.port;
        }
      );
      if (port) {
        points.push({
          x: item.tile.x + port.tile.x,
          y: item.tile.y + port.tile.y
        });
        return;
      }
    }
    points.push({ ...item.tile });
  });
  return cleanRouteTiles(points);
};

/**
 * Perpendicular distance from point P to the infinite diagonal line through
 * origin with direction (sx, sy) where |sx|=|sy|=1.
 */
const perpDistToDiagonal = (
  origin: Coords,
  sx: number,
  sy: number,
  point: Coords
) => {
  // Line: (origin) + t*(sx,sy). Distance = |cross| / sqrt(2)
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return Math.abs(dx * sy - dy * sx) / Math.SQRT2;
};

/**
 * "Mój algorytm": from the hub (switch / other side), leave on a diagonal
 * toward the selected leaves, connect nearest-to-diagonal leaf first, then
 * the next, etc. Paths share no grid edges (no overlapping lines).
 *
 * Returns mid waypoints per connector, ordered from the connector's FIRST
 * endpoint anchor to its LAST.
 */
export const diagonalFanShape2dRoutes = ({
  selectedItems,
  allItems,
  modelItems,
  connectors
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  connectors: TidyConnector[];
}): Record<string, Coords[]> => {
  const selectedIds = new Set(
    selectedItems.map((item) => {
      return item.id;
    })
  );
  const itemById = new Map(
    allItems.map((item) => {
      return [item.id, item] as const;
    })
  );
  const iconById = new Map(
    modelItems.map((item) => {
      return [item.id, item.icon] as const;
    })
  );

  const isSwitch = (id: string) => {
    return iconById.get(id) === SHAPE_2D_SWITCH_ID;
  };

  type FanCable = {
    connectorId: string;
    /** True when connector's first endpoint is the leaf. */
    leafFirst: boolean;
    leafId: string;
    hubId: string;
    leafPort: Coords;
    hubPort: Coords;
  };

  const cables: FanCable[] = [];

  connectors.forEach((connector) => {
    const ends = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (ends.length < 2) return;

    const first = ends[0];
    const last = ends[ends.length - 1];
    if (!first.ref.item || !last.ref.item) return;
    if (first.ref.item === last.ref.item) return;

    const a = first.ref.item;
    const b = last.ref.item;
    const aSel = selectedIds.has(a);
    const bSel = selectedIds.has(b);

    // Need exactly one selected leaf (or prefer switch as hub).
    let hubId: string;
    let leafId: string;
    let hubAnchor = first;
    let leafAnchor = last;
    let leafFirst = false;

    if (isSwitch(a) !== isSwitch(b)) {
      if (isSwitch(a)) {
        hubId = a;
        leafId = b;
        hubAnchor = first;
        leafAnchor = last;
        leafFirst = false;
      } else {
        hubId = b;
        leafId = a;
        hubAnchor = last;
        leafAnchor = first;
        leafFirst = true;
      }
      if (!selectedIds.has(leafId)) return;
    } else if (aSel !== bSel) {
      // Non-switch hub: the non-selected side.
      if (aSel) {
        leafId = a;
        hubId = b;
        leafAnchor = first;
        hubAnchor = last;
        leafFirst = true;
      } else {
        leafId = b;
        hubId = a;
        leafAnchor = last;
        hubAnchor = first;
        leafFirst = false;
      }
    } else {
      return;
    }

    const leafItem = itemById.get(leafId);
    const hubItem = itemById.get(hubId);
    if (!leafItem || !hubItem) return;

    const leafPortDef = getShape2dPorts(iconById.get(leafId) ?? '').find(
      (candidate) => {
        return candidate.id === leafAnchor.ref.port;
      }
    );
    const hubPortDef = getShape2dPorts(iconById.get(hubId) ?? '').find(
      (candidate) => {
        return candidate.id === hubAnchor.ref.port;
      }
    );

    const leafPort = leafPortDef
      ? {
          x: leafItem.tile.x + leafPortDef.tile.x,
          y: leafItem.tile.y + leafPortDef.tile.y
        }
      : {
          x: leafItem.tile.x,
          y: leafItem.tile.y
        };

    const hubPort = hubPortDef
      ? {
          x: hubItem.tile.x + hubPortDef.tile.x,
          y: hubItem.tile.y + hubPortDef.tile.y
        }
      : {
          x: hubItem.tile.x,
          y: hubItem.tile.y
        };

    cables.push({
      connectorId: connector.id,
      leafFirst,
      leafId,
      hubId,
      leafPort,
      hubPort
    });
  });

  if (cables.length === 0) return {};

  const groups = new Map<string, FanCable[]>();
  cables.forEach((cable) => {
    const list = groups.get(cable.hubId) ?? [];
    list.push(cable);
    groups.set(cable.hubId, list);
  });

  const routes: Record<string, Coords[]> = {};
  const usedEdges = new Set<string>();

  // Respect waypoints already on the diagram (other cables / prior runs).
  const rerouteIds = new Set(
    cables.map((cable) => {
      return cable.connectorId;
    })
  );
  connectors.forEach((connector) => {
    if (rerouteIds.has(connector.id)) return;
    const poly = connectorAnchorPolyline(connector, itemById, iconById);
    markPathEdges(poly, usedEdges);
  });

  groups.forEach((group, hubId) => {
    const hubItem = itemById.get(hubId);
    if (!hubItem) return;

    const hubSize = getShape2dSize(iconById.get(hubId) ?? '') ?? {
      width: 1,
      height: 1
    };
    const hubCenter = {
      x: hubItem.tile.x + hubSize.width / 2,
      y: hubItem.tile.y + hubSize.height / 2
    };

    let leafCx = 0;
    let leafCy = 0;
    group.forEach((cable) => {
      leafCx += cable.leafPort.x;
      leafCy += cable.leafPort.y;
    });
    leafCx /= group.length;
    leafCy /= group.length;

    // Diagonal toward the leaf cluster ("na skos").
    let sx = Math.sign(leafCx - hubCenter.x);
    let sy = Math.sign(leafCy - hubCenter.y);
    if (sx === 0) sx = leafCx >= hubCenter.x ? 1 : -1;
    if (sy === 0) sy = leafCy >= hubCenter.y ? 1 : -1;

    // Connect closest-to-hub first, then farther leaves.
    // Lane stacking puts later (farther) cables BELOW closer ones.
    const remaining = [...group];
    const ordered: FanCable[] = [];

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestScore = Number.POSITIVE_INFINITY;

      remaining.forEach((cable, index) => {
        const manh =
          Math.abs(cable.leafPort.x - cable.hubPort.x) +
          Math.abs(cable.leafPort.y - cable.hubPort.y);
        const perp = perpDistToDiagonal(cable.hubPort, sx, sy, cable.leafPort);
        // Prefer nearer ports first; break ties by diagonal proximity.
        const score = manh * 1000 + perp;
        if (score < bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });

      ordered.push(remaining[bestIndex]);
      remaining.splice(bestIndex, 1);
    }

    // Stack bus rows toward the hub, so the diagonal lands on the lane row
    // BEFORE the leaf port; the final stub then runs away from the hub into
    // the port (no overshoot / "leci wyżej i wraca").
    const laneDirY = Math.sign(hubCenter.y - leafCy) || 1;

    /**
     * Route hub→leaf with the long horizontal "magistrala" on the leaf-side
     * lane row (leaf.y + laneDirY * k). Lane 0 stays on the port row → straight
     * horizontal into the node. Higher lanes ride a parallel row and reach the
     * port with a short vertical stub → cables never stack near the nodes.
     */
    const buildLaneRoute = (cable: FanCable, k: number): Coords[] => {
      const start = { ...cable.hubPort };
      const end = { ...cable.leafPort };
      const laneY = end.y + laneDirY * k;

      const path: Coords[] = [{ ...start }];
      let cur = { ...start };

      // Diagonal toward (leaf column, lane row).
      let guard = 0;
      while (guard < 800 && cur.x !== end.x && cur.y !== laneY) {
        guard += 1;
        cur = {
          x: cur.x + Math.sign(end.x - cur.x),
          y: cur.y + Math.sign(laneY - cur.y)
        };
        path.push({ ...cur });
      }
      // Straighten onto the lane row.
      while (cur.y !== laneY) {
        cur = { x: cur.x, y: cur.y + Math.sign(laneY - cur.y) };
        path.push({ ...cur });
      }
      // Horizontal magistrala along the lane row to the leaf column.
      while (cur.x !== end.x) {
        cur = { x: cur.x + Math.sign(end.x - cur.x), y: cur.y };
        path.push({ ...cur });
      }
      // Short stub into the leaf port (none for lane 0).
      while (cur.y !== end.y) {
        cur = { x: cur.x, y: cur.y + Math.sign(end.y - cur.y) };
        path.push({ ...cur });
      }

      return cleanRouteTiles(path);
    };

    ordered.forEach((cable, orderIndex) => {
      // Nearest-to-hub keeps lane 0 (straight to port); farther cables stack.
      let path = buildLaneRoute(cable, orderIndex);

      // Deterministic lanes rarely collide, but bump the offset if they do.
      if (pathUsesBusyEdge(path, usedEdges)) {
        for (let extra = 1; extra <= group.length + 2; extra += 1) {
          const candidate = buildLaneRoute(cable, orderIndex + extra);
          if (!pathUsesBusyEdge(candidate, usedEdges)) {
            path = candidate;
            break;
          }
        }
      }

      markPathEdges(path, usedEdges);

      const bends = pathBendWaypoints(path);
      routes[cable.connectorId] = cable.leafFirst
        ? [...bends].reverse()
        : bends;
    });
  });

  return routes;
};

export interface GraphAnalysis {
  adjacency: Map<string, Set<string>>;
  edges: Map<string, [string, string]>;
  degree: Map<string, number>;
  hubs: Set<string>;
  rectMembership: Map<string, string | null>;
  rectGroups: Map<string, string[]>;
  freeNodes: string[];
}

/**
 * Analyzes the layout graph to determine adjacency, node degrees, hubs, and rectangle memberships.
 */
export const analyzeGraph = ({ selectedItems, allItems, modelItems, connectors, rectangles }: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  connectors: TidyConnector[];
  rectangles: { id: string; from: Coords; to: Coords }[];
}): GraphAnalysis => {
  const adjacency = new Map<string, Set<string>>();
  const edgesMap = new Map<string, [string, string]>();
  const degree = new Map<string, number>();
  const hubs = new Set<string>();
  const rectMembership = new Map<string, string | null>();
  const rectGroups = new Map<string, string[]>();
  const freeNodes: string[] = [];

  const selectedSet = new Set(selectedItems.map((i) => i.id));

  selectedItems.forEach((i) => {
    adjacency.set(i.id, new Set());
    degree.set(i.id, 0);
  });

  connectors.forEach((conn) => {
    const validAnchors = conn.anchors.filter((a) => a.ref.item);
    if (validAnchors.length >= 2) {
      const aId = validAnchors[0].ref.item!;
      const bId = validAnchors[1].ref.item!;

      edgesMap.set(conn.id, [aId, bId]);

      if (selectedSet.has(aId)) {
        adjacency.get(aId)?.add(bId);
        degree.set(aId, (degree.get(aId) || 0) + 1);
      }
      if (selectedSet.has(bId)) {
        adjacency.get(bId)?.add(aId);
        degree.set(bId, (degree.get(bId) || 0) + 1);
      }
    }
  });

  const degrees = Array.from(degree.values()).sort((a, b) => a - b);
  const median = degrees[Math.floor(degrees.length / 2)] || 0;

  selectedItems.forEach((item) => {
    const model = modelItems.find((m) => m.id === item.id);
    const isHub = model?.icon === SHAPE_2D_SWITCH_ID || (degree.get(item.id) || 0) > median + 1;
    if (isHub) hubs.add(item.id);
  });

  selectedItems.forEach((item) => {
    let memberOf: string | null = null;
    const footprint = getFootprint(item, modelItems);
    const cx = footprint.tile.x + footprint.width / 2;
    const cy = footprint.tile.y + footprint.height / 2;

    for (const rect of rectangles) {
      const minX = Math.min(rect.from.x, rect.to.x);
      const maxX = Math.max(rect.from.x, rect.to.x);
      const minY = Math.min(rect.from.y, rect.to.y);
      const maxY = Math.max(rect.from.y, rect.to.y);

      if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
        memberOf = rect.id;
        break;
      }
    }

    rectMembership.set(item.id, memberOf);

    if (memberOf) {
      const group = rectGroups.get(memberOf) || [];
      group.push(item.id);
      rectGroups.set(memberOf, group);
    } else {
      freeNodes.push(item.id);
    }
  });

  return { adjacency, edges: edgesMap, degree, hubs, rectMembership, rectGroups, freeNodes };
};

/**
 * Places nodes smartly, breaking them into layers and ordering them to minimize crossings.
 */
export const smartPlaceNodes = ({ graph, selectedItems, allItems, modelItems }: {
  graph: GraphAnalysis;
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
}): Record<string, Coords> => {
  const result: Record<string, Coords> = {};
  const selectedMap = new Map(selectedItems.map((i) => [i.id, i]));
  
  const allGroups: { rectId: string | null; nodes: string[] }[] = Array.from(graph.rectGroups.keys()).map(id => ({ rectId: id, nodes: graph.rectGroups.get(id)! }));
  if (graph.freeNodes.length > 0) {
    allGroups.push({ rectId: null, nodes: graph.freeNodes });
  }

  const footprintCache = new Map<string, Footprint>();
  selectedItems.forEach(i => footprintCache.set(i.id, getFootprint(i, modelItems)));

  for (const group of allGroups) {
    if (group.nodes.length === 0) continue;

    let hubId = group.nodes.find(n => graph.hubs.has(n));
    if (!hubId) {
      hubId = group.nodes.reduce((a, b) => (graph.degree.get(a) || 0) > (graph.degree.get(b) || 0) ? a : b, group.nodes[0]);
    }

    let layers: string[][] = [[hubId]];
    const visited = new Set<string>([hubId]);
    let currentQueue = [hubId];
    
    while (currentQueue.length > 0) {
      const nextQueue: string[] = [];
      for (const nodeId of currentQueue) {
        const neighbors = graph.adjacency.get(nodeId) || new Set();
        for (const neighbor of neighbors) {
          if (group.nodes.includes(neighbor) && !visited.has(neighbor)) {
            visited.add(neighbor);
            nextQueue.push(neighbor);
          }
        }
      }
      if (nextQueue.length > 0) {
        layers.push(nextQueue);
      }
      currentQueue = nextQueue;
    }
    
    const unvisited = group.nodes.filter(n => !visited.has(n));
    if (unvisited.length > 0) {
      layers.push(unvisited);
    }

    // Split long layers to prevent very wide flat rows
    const newLayers: string[][] = [];
    for (const l of layers) {
      for (let i = 0; i < l.length; i += 6) {
        newLayers.push(l.slice(i, i + 6));
      }
    }
    layers = newLayers;

    for (let pass = 0; pass < 3; pass++) {
      for (let l = 1; l < layers.length; l++) {
        const prevLayer = layers[l - 1];
        layers[l].sort((a, b) => {
          const avgA = getAvgPos(a, prevLayer, graph.adjacency);
          const avgB = getAvgPos(b, prevLayer, graph.adjacency);
          return avgA - avgB;
        });
      }
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    group.nodes.forEach(id => {
      const i = selectedMap.get(id);
      if (i) {
        minX = Math.min(minX, i.tile.x);
        maxX = Math.max(maxX, i.tile.x);
        minY = Math.min(minY, i.tile.y);
        maxY = Math.max(maxY, i.tile.y);
      }
    });
    
    // Anchor to the root hub to prevent vertical drifting on multiple clicks
    const rootId = layers[0][0];
    const rootItem = selectedMap.get(rootId);
    let cx = rootItem ? rootItem.tile.x : 0;
    let cy = rootItem ? rootItem.tile.y : 0;
    if (!rootItem && group.nodes.length > 0) {
      cx = Math.round((minX + maxX) / 2);
      cy = Math.round((minY + maxY) / 2);
    }

    let gap = SHAPE_2D_LAYOUT_GAP;
    if (group.rectId !== null) {
      const maxNodesInLayer = Math.max(...layers.map(l => l.length));
      const estWidth = maxNodesInLayer * (2 + gap);
      const estHeight = layers.length * (2 + gap);
      const rectWidth = maxX - minX;
      const rectHeight = maxY - minY;
      if (rectWidth > 0 && rectHeight > 0 && (estWidth > rectWidth || estHeight > rectHeight)) {
        gap = 1;
      }
    }

    const groupResult: Record<string, Coords> = {};
    let currentY = cy;

    for (const layer of layers) {
      let rowWidth = 0;
      layer.forEach(nodeId => {
        const fp = footprintCache.get(nodeId);
        rowWidth += (fp ? fp.width : 2) + gap;
      });
      rowWidth -= gap;
      
      let currentX = cx - Math.floor(rowWidth / 2);
      let maxH = 0;
      
      for (const nodeId of layer) {
        groupResult[nodeId] = { x: currentX, y: currentY };
        const fp = footprintCache.get(nodeId);
        const w = fp ? fp.width : 2;
        const h = fp ? fp.height : 2;
        currentX += w + gap;
        if (h > maxH) maxH = h;
      }
      currentY += maxH + gap;
    }

    const rootPos = groupResult[rootId];
    if (rootPos) {
      const dx = cx - rootPos.x;
      const dy = cy - rootPos.y;
      for (const id in groupResult) {
        groupResult[id].x += dx;
        groupResult[id].y += dy;
      }
    }

    const footprints = Object.entries(groupResult).map(([id, pos]) => {
      const orig = footprintCache.get(id)!;
      return { id, tile: pos, width: orig.width, height: orig.height };
    });

    let offsetX = 0, offsetY = 0;
    const excludeIds = group.nodes;

    for (let step = 0; step < 40; step++) {
      if (step > 0) {
        const n = Math.ceil(Math.sqrt(step));
        offsetX = (step % 2 === 0 ? n : -n) * 2;
        offsetY = (step % 3 === 0 ? n : -n) * 2;
      }
      
      const testFootprints = footprints.map(f => ({ ...f, tile: { x: f.tile.x + offsetX, y: f.tile.y + offsetY } }));
      const targs: Record<string, Coords> = {};
      testFootprints.forEach(f => targs[f.id] = f.tile);
      const isFree = placementsFree({ targets: targs, footprints: testFootprints, items: allItems, modelItems, excludeItemIds: excludeIds });
      
      if (isFree) {
        break;
      }
    }

    for (const [id, pos] of Object.entries(groupResult)) {
      const finalX = pos.x + offsetX;
      const finalY = pos.y + offsetY;
      const origItem = selectedMap.get(id);
      if (origItem && (origItem.tile.x !== finalX || origItem.tile.y !== finalY)) {
        result[id] = { x: finalX, y: finalY };
      }
    }
  }

  return result;
};

function getAvgPos(nodeId: string, prevLayer: string[], adjacency: Map<string, Set<string>>) {
  const neighbors = adjacency.get(nodeId);
  if (!neighbors) return 0;
  let sum = 0, count = 0;
  for (let i = 0; i < prevLayer.length; i++) {
    if (neighbors.has(prevLayer[i])) {
      sum += i;
      count++;
    }
  }
  return count === 0 ? 0 : sum / count;
}

/**
 * Routes cables using orthogonal channels around node footprints.
 */
export const channelRoute = ({ selectedItems, allItems, modelItems, connectors }: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  connectors: TidyConnector[];
}): Record<string, Coords[]> => {
  const routes: Record<string, Coords[]> = {};
  
  const obstacleSet = new Set<string>();
  const portSet = new Set<string>();

  allItems.forEach(item => {
    const fp = getFootprint(item, modelItems);
    for (let x = 0; x < fp.width; x++) {
      for (let y = 0; y < fp.height; y++) {
        obstacleSet.add(`${fp.tile.x + x},${fp.tile.y + y}`);
      }
    }
    
    const model = modelItems.find(m => m.id === item.id);
    if (model && model.icon) {
      const ports = getShape2dPorts(model.icon);
      ports.forEach(p => {
        const px = fp.tile.x + p.tile.x;
        const py = fp.tile.y + p.tile.y;
        portSet.add(`${px},${py}`);
      });
    }
  });

  portSet.forEach(p => obstacleSet.delete(p));
  const isObstacle = (x: number, y: number) => obstacleSet.has(`${x},${y}`);

  const selectedIds = new Set(selectedItems.map(i => i.id));
  const validConns = connectors.filter(c => {
    const refs = c.anchors.map(a => a.ref.item).filter(Boolean) as string[];
    if (refs.length < 2) return false;
    return selectedIds.has(refs[0]) || selectedIds.has(refs[1]);
  });

  const getPortCoords = (itemId: string, portId?: string): Coords | null => {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return null;
    const model = modelItems.find(m => m.id === item.id);
    if (!model || !model.icon) {
      const fp = getFootprint(item, modelItems);
      return { x: fp.tile.x + Math.floor(fp.width/2), y: fp.tile.y + Math.floor(fp.height/2) };
    }
    const ports = getShape2dPorts(model.icon);
    let p = ports.find(p => p.id === portId);
    if (!p && ports.length > 0) p = ports[0];
    const fp = getFootprint(item, modelItems);
    if (p) {
      return { x: fp.tile.x + p.tile.x, y: fp.tile.y + p.tile.y };
    }
    return { x: fp.tile.x + Math.floor(fp.width/2), y: fp.tile.y + Math.floor(fp.height/2) };
  };

  type CableTask = { c: TidyConnector; p0: Coords; p1: Coords; hubId: string };
  const iconById = new Map(modelItems.map(m => [m.id, m.icon]));
  const isSwitch = (id: string) => iconById.get(id) === SHAPE_2D_SWITCH_ID;

  const connData: CableTask[] = validConns.map(c => {
    const a0 = c.anchors[0].ref;
    const a1 = c.anchors[1].ref;
    const p0 = getPortCoords(a0.item!, a0.port);
    const p1 = getPortCoords(a1.item!, a1.port);
    if (!p0 || !p1) return null;
    let hubId = a0.item!;
    if (isSwitch(a1.item!) && !isSwitch(a0.item!)) hubId = a1.item!;
    return { c, p0, p1, hubId };
  }).filter(Boolean) as CableTask[];

  const groups = new Map<string, CableTask[]>();
  connData.forEach(task => {
    const arr = groups.get(task.hubId) || [];
    arr.push(task);
    groups.set(task.hubId, arr);
  });

  const usedEdges = new Set<string>();

  const checkPathCollision = (path: Coords[]) => {
    for (const p of path) {
      if (isObstacle(p.x, p.y)) return true;
    }
    return false;
  };

  const buildLaneRoute = (start: Coords, end: Coords, laneIndex: number, maxLanes: number): Coords[] => {
    // Determine vertical direction from start to end
    const dirY = end.y >= start.y ? 1 : -1;
    // Lane Y is assigned sequentially away from the destination node port 
    const laneY = end.y + (dirY * (laneIndex + 1));
    
    const path: Coords[] = [{...start}];
    let cur = {...start};
    
    // Go vertical to lane
    let guard = 0;
    while (cur.y !== laneY && guard < 800) {
       cur.y += Math.sign(laneY - cur.y);
       path.push({...cur});
       guard++;
    }
    
    // Go horizontal to destination column
    while (cur.x !== end.x && guard < 800) {
       cur.x += Math.sign(end.x - cur.x);
       path.push({...cur});
       guard++;
    }
    
    // Go vertical to destination port
    while (cur.y !== end.y && guard < 800) {
       cur.y += Math.sign(end.y - cur.y);
       path.push({...cur});
       guard++;
    }

    return cleanRouteTiles(path);
  };

  groups.forEach((tasks, hubId) => {
    // Sort tasks by Manhattan distance to minimize crossings
    tasks.sort((a, b) => {
      const distA = Math.abs(a.p0.x - a.p1.x) + Math.abs(a.p0.y - a.p1.y);
      const distB = Math.abs(b.p0.x - b.p1.x) + Math.abs(b.p0.y - b.p1.y);
      return distA - distB;
    });

    tasks.forEach((task, index) => {
      let bestPath = buildLaneRoute(task.p0, task.p1, index, tasks.length);
      
      // If collision or busy edge, bump the lane further out
      if (checkPathCollision(bestPath) || pathUsesBusyEdge(bestPath, usedEdges)) {
        for (let extra = 1; extra <= tasks.length + 20; extra++) {
           const cand = buildLaneRoute(task.p0, task.p1, index + extra, tasks.length);
           if (!checkPathCollision(cand) && !pathUsesBusyEdge(cand, usedEdges)) {
             bestPath = cand;
             break;
           }
        }
      }

      markPathEdges(bestPath, usedEdges);
      routes[task.c.id] = pathBendWaypoints(bestPath);
    });
  });

  return routes;
};
