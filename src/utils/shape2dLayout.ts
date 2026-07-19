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
  modelItems: { id: string; icon?: string }[]
): Footprint => {
  const modelItem = modelItems.find((item) => {
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

  const footprints = selectedItems.map((item) => {
    return getFootprint(item, modelItems);
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
  anchors: { ref: { item?: string; port?: string } }[];
};

type LeafAssignment = {
  leafId: string;
  switchId: string;
  /** World x of the switch port the leaf is cabled to (sort key). */
  portWorldX: number;
  side: 'TOP' | 'BOTTOM';
};

/**
 * "Porządkuj": keep switches anchored, re-seat their cabled leaf nodes (PCs)
 * in rows above/below the switch, ordered left-to-right to match the switch
 * port order. Cables then run in parallel without crossing.
 * Returns new top-left tiles for moved leaves only.
 */
export const tidyShape2dItems = ({
  selectedItems,
  allItems,
  modelItems,
  connectors,
  gap = SHAPE_2D_LAYOUT_GAP
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  connectors: TidyConnector[];
  gap?: number;
}): Record<string, Coords> => {
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

  // Collect leaf → switch assignments from cables (first cable wins per leaf).
  const assignments = new Map<string, LeafAssignment>();

  connectors.forEach((connector) => {
    const endpointAnchors = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (endpointAnchors.length < 2) return;

    const first = endpointAnchors[0];
    const last = endpointAnchors[endpointAnchors.length - 1];

    const firstIsSwitch = Boolean(first.ref.item && isSwitch(first.ref.item));
    const lastIsSwitch = Boolean(last.ref.item && isSwitch(last.ref.item));

    if (firstIsSwitch === lastIsSwitch) return;

    const switchAnchor = firstIsSwitch ? first : last;
    const leafAnchor = firstIsSwitch ? last : first;

    if (!switchAnchor.ref.item || !leafAnchor.ref.item) return;

    const leafId = leafAnchor.ref.item;
    const switchId = switchAnchor.ref.item;

    // Only re-seat leaves that are selected; the switch anchors the layout.
    if (!selectedIds.has(leafId)) return;
    if (assignments.has(leafId)) return;

    const switchItem = itemById.get(switchId);
    if (!switchItem) return;

    const ports = getShape2dPorts(iconById.get(switchId) ?? '');
    const port = ports.find((candidate) => {
      return candidate.id === switchAnchor.ref.port;
    });
    if (!port || (port.side !== 'TOP' && port.side !== 'BOTTOM')) return;

    assignments.set(leafId, {
      leafId,
      switchId,
      portWorldX: switchItem.tile.x + port.tile.x,
      side: port.side
    });
  });

  if (assignments.size === 0) return {};

  // Group per switch and side.
  const groups = new Map<string, LeafAssignment[]>();
  assignments.forEach((assignment) => {
    const key = `${assignment.switchId}:${assignment.side}`;
    const group = groups.get(key) ?? [];
    group.push(assignment);
    groups.set(key, group);
  });

  const targets: Record<string, Coords> = {};
  const movedIds = [...assignments.keys()];
  // Moved leaves are excluded from collision tests (they are being re-seated).
  const excludeItemIds = [...new Set([...selectedIds, ...movedIds])];

  groups.forEach((group, key) => {
    const [switchId, side] = key.split(':') as [string, 'TOP' | 'BOTTOM'];
    const switchItem = itemById.get(switchId);
    if (!switchItem) return;

    const switchSize = getShape2dSize(iconById.get(switchId) ?? '') ?? {
      width: 1,
      height: 1
    };

    // Order leaves to match the switch port order (left → right).
    const ordered = [...group].sort((a, b) => {
      if (a.portWorldX !== b.portWorldX) return a.portWorldX - b.portWorldX;
      const tileA = itemById.get(a.leafId)?.tile.x ?? 0;
      const tileB = itemById.get(b.leafId)?.tile.x ?? 0;
      return tileA - tileB;
    });

    const footprints = ordered.map((assignment) => {
      const viewItem = itemById.get(assignment.leafId)!;
      return getFootprint(viewItem, modelItems);
    });

    const rowWidth =
      footprints.reduce((sum, footprint) => {
        return sum + footprint.width;
      }, 0) +
      gap * (footprints.length - 1);

    const rowHeight = Math.max(
      ...footprints.map((footprint) => {
        return footprint.height;
      })
    );

    // Center the row on the switch.
    const startX =
      switchItem.tile.x + Math.round((switchSize.width - rowWidth) / 2);

    const baseY =
      side === 'BOTTOM'
        ? switchItem.tile.y + switchSize.height + gap
        : switchItem.tile.y - gap - rowHeight;

    // Nudge the row away from the switch until every slot is free.
    const directionY = side === 'BOTTOM' ? 1 : -1;
    const maxAttempts = 30;

    for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
      const y = baseY + directionY * attempt;
      const candidate: Record<string, Coords> = {};
      let x = startX;

      ordered.forEach((assignment, index) => {
        candidate[assignment.leafId] = { x, y };
        x += footprints[index].width + gap;
      });

      const allFree = ordered.every((assignment, index) => {
        return isShape2dPlacementFree({
          origin: candidate[assignment.leafId],
          size: {
            width: footprints[index].width,
            height: footprints[index].height
          } as Size,
          items: allItems,
          modelItems,
          excludeItemIds
        });
      });

      if (allFree || attempt === maxAttempts) {
        Object.assign(targets, candidate);
        break;
      }
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

/** Straight-segment intersection (used as a crossing estimate for cables). */
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
      return getFootprint(viewItem, modelItems);
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
