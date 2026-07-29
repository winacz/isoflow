import { Coords, Size, ViewItem } from 'src/types';
import {
  SHAPE_2D_LAYOUT_GAP,
  SHAPE_2D_SWITCH_ID,
  SHAPE_2D_PC_ID,
  SHAPE_2D_CAMERA_ID,
  SHAPE_2D_CAMERA_V2_ID,
  SHAPE_2D_PRINTER_ID,
  SHAPE_2D_VOIP_ID,
  SHAPE_2D_SMARTPHONE_ID,
  SHAPE_2D_IOT_ID,
  SHAPE_2D_AP_ID,
  SHAPE_2D_NAS_ID,
  SHAPE_2D_TABLET_ID,
  SHAPE_2D_CABINET_ID,
  SHAPE_2D_BLANKING_ID,
  SHAPE_2D_PATCH_PANEL_ID,
  getShape2dSize,
  getShape2dPorts
} from 'src/config';
import { isShape2dPlacementFree, snapTile2dToGrid, isTileInShape2dBounds } from './renderer';
import { axisAlignedLineTiles, buildDiagonalAwareTiles } from './pathOptions';
import { isDeviceTemplateId } from './deviceTemplateRegistry';

/** Next grid-aligned coordinate at or above `value`. */
const ceilToStep = (value: number, step: number): number => {
  const s = Math.max(1, step);
  return Math.ceil(value / s) * s;
};

/**
 * Advance past an occupied span + gap, snapping UP to the grid.
 * Rounding (Math.round) would swallow small gaps when snapStep > gap
 * (e.g. rack step 9 + SHAPE_2D_LAYOUT_GAP 3 → identical to tight).
 */
const advancePackedCoord = (
  from: number,
  size: number,
  gap: number,
  step: number
): number => {
  return ceilToStep(from + size + gap, step);
};

/** Builtin switch or device template chassis (not hosts / cabinets / fillers). */
export const isSwitchLikeIcon = (icon: string | undefined | null): boolean => {
  if (!icon) return false;
  if (icon === SHAPE_2D_SWITCH_ID) return true;
  if (
    icon === SHAPE_2D_PC_ID ||
    icon === SHAPE_2D_CAMERA_ID ||
    icon === SHAPE_2D_CAMERA_V2_ID ||
    icon === SHAPE_2D_PRINTER_ID ||
    icon === SHAPE_2D_VOIP_ID ||
    icon === SHAPE_2D_SMARTPHONE_ID ||
    icon === SHAPE_2D_IOT_ID ||
    icon === SHAPE_2D_AP_ID ||
    icon === SHAPE_2D_NAS_ID ||
    icon === SHAPE_2D_TABLET_ID ||
    icon === SHAPE_2D_CABINET_ID ||
    icon === SHAPE_2D_BLANKING_ID ||
    icon === SHAPE_2D_PATCH_PANEL_ID
  ) {
    return false;
  }
  return isDeviceTemplateId(icon);
};

export type Shape2dLayoutMode = 'vertical' | 'horizontal' | 'grid';

/** Repeated-click packing for horizontal / vertical layout. */
export type Shape2dPackVariant = 'tight' | 'spaced' | 'wrap5';

export const SHAPE_2D_PACK_VARIANTS: Shape2dPackVariant[] = [
  'tight',
  'spaced',
  'wrap5'
];

/** Grid only has tight / spaced (wrap is N/A). */
export const SHAPE_2D_GRID_PACK_VARIANTS: Shape2dPackVariant[] = [
  'tight',
  'spaced'
];

export const SHAPE_2D_PACK_LABELS: Record<Shape2dPackVariant, string> = {
  tight: 'przy sobie',
  spaced: 'z odstępem',
  wrap5: 'max 5 / rząd'
};

export const shape2dPackLabel = (
  pack: Shape2dPackVariant,
  mode: 'horizontal' | 'vertical' | 'grid'
) => {
  if (pack !== 'wrap5') return SHAPE_2D_PACK_LABELS[pack];
  if (mode === 'grid') return SHAPE_2D_PACK_LABELS.spaced;
  return mode === 'vertical' ? 'max 5 / kolumna' : 'max 5 / rząd';
};

/** Max items per row (horizontal) or column (vertical) when wrapping. */
export const SHAPE_2D_PACK_WRAP_LIMIT = 5;

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
  gap: number,
  pack: Shape2dPackVariant = 'spaced',
  snapStep: { x: number; y: number } = { x: 1, y: 1 }
): Record<string, Coords> => {
  const targets: Record<string, Coords> = {};
  const start = snapTile2dToGrid(origin, snapStep);
  const wrapLimit =
    pack === 'wrap5' && (mode === 'horizontal' || mode === 'vertical')
      ? SHAPE_2D_PACK_WRAP_LIMIT
      : Number.POSITIVE_INFINITY;

  if (mode === 'vertical') {
    let x = start.x;
    let y = start.y;
    let col = 0;
    let colMaxW = 0;

    ordered.forEach((item) => {
      if (col >= wrapLimit) {
        x = advancePackedCoord(x, colMaxW, gap, snapStep.x);
        y = start.y;
        col = 0;
        colMaxW = 0;
      }

      const tile = snapTile2dToGrid({ x, y }, snapStep);
      targets[item.id] = tile;
      colMaxW = Math.max(colMaxW, item.width);
      y = advancePackedCoord(tile.y, item.height, gap, snapStep.y);
      col += 1;
    });
    return targets;
  }

  if (mode === 'horizontal') {
    let x = start.x;
    let y = start.y;
    let col = 0;
    let rowMaxH = 0;

    ordered.forEach((item) => {
      if (col >= wrapLimit) {
        y = advancePackedCoord(y, rowMaxH, gap, snapStep.y);
        x = start.x;
        col = 0;
        rowMaxH = 0;
      }

      const tile = snapTile2dToGrid({ x, y }, snapStep);
      targets[item.id] = tile;
      rowMaxH = Math.max(rowMaxH, item.height);
      x = advancePackedCoord(tile.x, item.width, gap, snapStep.x);
      col += 1;
    });
    return targets;
  }

  // grid — square-ish, always snapped; pack controls gap (tight / spaced)
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
  let xCursor = start.x;
  colWidths.forEach((width) => {
    colXs.push(snapTile2dToGrid({ x: xCursor, y: start.y }, snapStep).x);
    xCursor = advancePackedCoord(colXs[colXs.length - 1], width, gap, snapStep.x);
  });

  const rowYs: number[] = [];
  let yCursor = start.y;
  rowHeights.forEach((height) => {
    rowYs.push(snapTile2dToGrid({ x: start.x, y: yCursor }, snapStep).y);
    yCursor = advancePackedCoord(
      rowYs[rowYs.length - 1],
      height,
      gap,
      snapStep.y
    );
  });

  ordered.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    targets[item.id] = snapTile2dToGrid(
      { x: colXs[col], y: rowYs[row] },
      snapStep
    );
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
 * Anchors at the selection bbox top-left; packs with gap / wrap variants.
 * All positions are snapped to `snapStep` (active grid).
 */
export const layoutShape2dItems = ({
  selectedItems,
  allItems,
  modelItems,
  mode,
  pack = 'spaced',
  gap,
  snapStep = { x: 1, y: 1 }
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  mode: Shape2dLayoutMode;
  pack?: Shape2dPackVariant;
  gap?: number;
  snapStep?: { x: number; y: number };
}): Record<string, Coords> => {
  if (selectedItems.length === 0) return {};

  // On coarse grids (rack), ensure "spaced" is at least one snap cell —
  // a raw gap of 3 would otherwise round away under step 9.
  const spacedGap = Math.max(
    SHAPE_2D_LAYOUT_GAP,
    Math.max(1, snapStep.x),
    Math.max(1, snapStep.y)
  );
  const effectiveGap = gap ?? (pack === 'tight' ? 0 : spacedGap);
  // wrap5 on grid is meaningless — treat as spaced gap + no wrap
  const effectivePack: Shape2dPackVariant =
    mode === 'grid' && pack === 'wrap5' ? 'spaced' : pack;

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

  const origin = snapTile2dToGrid(
    {
      x: Math.min(...footprints.map((item) => item.tile.x)),
      y: Math.min(...footprints.map((item) => item.tile.y))
    },
    snapStep
  );

  let targets = computePackedTargets(
    ordered,
    mode,
    origin,
    effectiveGap,
    effectivePack,
    snapStep
  );
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
  const stepX = Math.max(1, snapStep.x);
  const stepY = Math.max(1, snapStep.y);
  for (let step = 1; step <= searchLimit; step += 1) {
    const dx = step * stepX;
    const dy = step * stepY;
    const candidates = [
      offsetTargets(targets, dx, 0),
      offsetTargets(targets, 0, dy),
      offsetTargets(targets, dx, dy),
      offsetTargets(targets, -dx, 0),
      offsetTargets(targets, 0, -dy)
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
 * stack nodes / flip a horizontal row into a column.
 *
 * 1) Leaves of the same switch: assign existing slots along the row/column
 *    dominant axis to switch-port order (uncross the star).
 * 2) Same-footprint search (exhaustive for tiny groups, else 2-opt) minimizing
 *    straight-line crossings first, then Manhattan wire length.
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
    return isSwitchLikeIcon(iconById.get(id));
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
    portWorldY: number;
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
      portWorldY: switchTile.y + port.tile.y,
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

  /**
   * Soft penalty: tiles of the straight/45° link that sit inside a foreign
   * node body. Used only for slot search — drawing still goes through nodes.
   */
  const THROUGH_NODE_TILE_PENALTY = 3;

  const totalThroughNodeTiles = () => {
    let count = 0;

    edges.forEach((edge) => {
      const pa = pointFor(edge.a);
      const pb = pointFor(edge.b);
      if (!pa || !pb) return;

      const from = { x: Math.round(pa.x), y: Math.round(pa.y) };
      const to = { x: Math.round(pb.x), y: Math.round(pb.y) };
      const pathTiles =
        from.x === to.x || from.y === to.y
          ? axisAlignedLineTiles(from, to)
          : buildDiagonalAwareTiles(from, to);

      const exclude = new Set([edge.a.itemId, edge.b.itemId]);

      pathTiles.forEach((tile) => {
        allItems.forEach((item) => {
          if (exclude.has(item.id)) return;
          const origin = tiles.get(item.id) ?? item.tile;
          if (isTileInShape2dBounds(tile, origin, sizeOf(item.id))) {
            count += 1;
          }
        });
      });
    });

    return count;
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

  /**
   * Prefer zero crossings, then avoid running through other node bodies,
   * then shortest straight links. Drawing is unchanged — this is slot search only.
   */
  const cost = () => {
    return (
      totalCrossings() * 10000 +
      totalThroughNodeTiles() * THROUGH_NODE_TILE_PENALTY +
      totalWireLength()
    );
  };

  starGroups.forEach((group) => {
    if (group.length < 2) return;

    // Existing slots (current leaf tiles) — keep the same set of positions.
    const slots = group.map((link) => {
      return { ...tiles.get(link.leafId)! };
    });
    const xs = slots.map((slot) => slot.x);
    const ys = slots.map((slot) => slot.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    // Horizontal row → order by X; vertical column → by Y (never reshape).
    const vertical = spanY > spanX;

    const sortedSlots = [...slots].sort((a, b) => {
      if (vertical) {
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
      }
      if (a.x !== b.x) return a.x - b.x;
      return a.y - b.y;
    });

    // Leaves ordered by the switch port they connect to (same axis).
    const orderedLeaves = [...group].sort((a, b) => {
      if (vertical) {
        if (a.portWorldY !== b.portWorldY) return a.portWorldY - b.portWorldY;
        if (a.portWorldX !== b.portWorldX) return a.portWorldX - b.portWorldX;
        return a.leafId.localeCompare(b.leafId);
      }
      if (a.portWorldX !== b.portWorldX) return a.portWorldX - b.portWorldX;
      if (a.portWorldY !== b.portWorldY) return a.portWorldY - b.portWorldY;
      return a.leafId.localeCompare(b.leafId);
    });

    orderedLeaves.forEach((link, index) => {
      tiles.set(link.leafId, { ...sortedSlots[index] });
    });

    // Tiny stars: try every leaf↔slot assignment, keep best cost.
    if (group.length <= 7) {
      const leafIds = orderedLeaves.map((link) => link.leafId);
      const slotCopies = sortedSlots.map((slot) => ({ ...slot }));
      let bestCost = cost();
      let bestAssign = leafIds.map((id) => ({
        id,
        tile: { ...tiles.get(id)! }
      }));

      const permute = (start: number) => {
        if (start >= leafIds.length) {
          leafIds.forEach((id, index) => {
            tiles.set(id, { ...slotCopies[index] });
          });
          const candidate = cost();
          if (candidate < bestCost) {
            bestCost = candidate;
            bestAssign = leafIds.map((id) => ({
              id,
              tile: { ...tiles.get(id)! }
            }));
          }
          return;
        }
        for (let i = start; i < leafIds.length; i += 1) {
          const tmp = leafIds[start];
          leafIds[start] = leafIds[i];
          leafIds[i] = tmp;
          permute(start + 1);
          leafIds[i] = leafIds[start];
          leafIds[start] = tmp;
        }
      };

      permute(0);
      bestAssign.forEach(({ id, tile }) => {
        tiles.set(id, tile);
      });
    }
  });

  // --- Phase 2: 2-opt same-size swaps for remaining crossings / length ---
  if (edges.length > 0 && selectedItems.length >= 2) {
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

    while (improved && guard < 120) {
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
        if (!isSwitchLikeIcon(iconById.get(other.itemId))) continue;
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
 * "Porządkuj ścieżki" routing:
 * - Nodes above the switch: start with the NEAREST port on the bottom lane;
 *   later cables drop to that corridor and run parallel above it.
 * - Nodes below the switch: start with the furthest port (mirrored).
 * - DIAGONAL: drop → parallel horizontal run → 45° into the switch port.
 * - ORTHOGONAL: drop → L/U along the lane into the port.
 *
 * Waypoints are ordered from the connector's FIRST endpoint to its LAST.
 */
export const parallelOffsetShape2dRoutes = ({
  selectedItems,
  allItems,
  modelItems,
  connectors,
  mode
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  connectors: TidyConnector[];
  mode: 'ORTHOGONAL' | 'DIAGONAL';
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
  const modelItemMap = new Map(modelItems.map((item) => [item.id, item]));

  const isSwitch = (id: string) => {
    return isSwitchLikeIcon(iconById.get(id));
  };

  type LaneCable = {
    connectorId: string;
    leafFirst: boolean;
    leafId: string;
    leafPortWorld: Coords;
    leafPortSide: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
    switchId: string;
    switchPortWorld: Coords;
    switchPortSide: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
  };

  const cables: LaneCable[] = [];

  connectors.forEach((connector) => {
    const ends = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (ends.length < 2) return;

    const first = ends[0];
    const last = ends[ends.length - 1];
    if (!first.ref.item || !last.ref.item) return;

    const firstIsSwitch = isSwitch(first.ref.item);
    const lastIsSwitch = isSwitch(last.ref.item);

    let switchAnchor = first;
    let leafAnchor = last;
    let leafFirst = false;

    if (firstIsSwitch !== lastIsSwitch) {
      switchAnchor = firstIsSwitch ? first : last;
      leafAnchor = firstIsSwitch ? last : first;
      leafFirst = !firstIsSwitch;
    } else {
      const aSel = selectedIds.has(first.ref.item);
      const bSel = selectedIds.has(last.ref.item);
      if (aSel && bSel) {
        switchAnchor = first;
        leafAnchor = last;
        leafFirst = false;
      } else if (aSel !== bSel) {
        if (aSel) {
          leafAnchor = first;
          switchAnchor = last;
          leafFirst = true;
        } else {
          leafAnchor = last;
          switchAnchor = first;
          leafFirst = false;
        }
      } else {
        return;
      }
    }

    const leafId = leafAnchor.ref.item!;
    const switchId = switchAnchor.ref.item!;
    if (!selectedIds.has(leafId) && !selectedIds.has(switchId)) return;

    const leafItem = itemById.get(leafId);
    const switchItem = itemById.get(switchId);
    if (!leafItem || !switchItem) return;

    const leafPort = getShape2dPorts(iconById.get(leafId) ?? '').find(
      (candidate) => candidate.id === leafAnchor.ref.port
    );
    const switchPort = getShape2dPorts(iconById.get(switchId) ?? '').find(
      (candidate) => candidate.id === switchAnchor.ref.port
    );
    if (!leafPort || !switchPort) return;

    cables.push({
      connectorId: connector.id,
      leafFirst,
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

  const groups = new Map<string, LaneCable[]>();
  cables.forEach((cable) => {
    const group = groups.get(cable.switchId) ?? [];
    group.push(cable);
    groups.set(cable.switchId, group);
  });

  const approachPoint = (cable: LaneCable, lane: number): Coords => {
    switch (cable.switchPortSide) {
      case 'TOP':
        return {
          x: cable.switchPortWorld.x,
          y: cable.switchPortWorld.y - 1 - lane
        };
      case 'LEFT':
        return {
          x: cable.switchPortWorld.x - 1 - lane,
          y: cable.switchPortWorld.y
        };
      case 'RIGHT':
        return {
          x: cable.switchPortWorld.x + 1 + lane,
          y: cable.switchPortWorld.y
        };
      case 'BOTTOM':
      default:
        return {
          x: cable.switchPortWorld.x,
          y: cable.switchPortWorld.y + 1 + lane
        };
    }
  };

  const clean = (tiles: Coords[]): Coords[] => {
    return tiles.filter((tile, index) => {
      if (index === 0) return true;
      const prev = tiles[index - 1];
      return prev.x !== tile.x || prev.y !== tile.y;
    });
  };

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

    const leafFootprints = group.map((cable) => {
      return getFootprint(itemById.get(cable.leafId)!, modelItems, modelItemMap);
    });
    const bboxMinX = Math.min(...leafFootprints.map((f) => f.tile.x));
    const bboxMaxX = Math.max(
      ...leafFootprints.map((f) => f.tile.x + f.width - 1)
    );
    const bboxMinY = Math.min(...leafFootprints.map((f) => f.tile.y));
    const bboxMaxY = Math.max(
      ...leafFootprints.map((f) => f.tile.y + f.height - 1)
    );
    const leafCx = (bboxMinX + bboxMaxX) / 2;
    const leafCy = (bboxMinY + bboxMaxY) / 2;

    // Prefer horizontal trunk when leaves sit in a row (or exit top/bottom).
    const horizontalTrunk =
      Math.abs(switchCenter.x - leafCx) >= Math.abs(switchCenter.y - leafCy) ||
      group.every((cable) => {
        return (
          cable.leafPortSide === 'BOTTOM' || cable.leafPortSide === 'TOP'
        );
      });

    // Nodes above the switch → start with the NEAREST port (bottom lane).
    // Nodes below → start with the furthest port (top lane).
    const nodesAboveSwitch = switchCenter.y > leafCy;
    const ordered = [...group].sort((a, b) => {
      const da = Math.hypot(
        a.switchPortWorld.x - leafCx,
        a.switchPortWorld.y - leafCy
      );
      const db = Math.hypot(
        b.switchPortWorld.x - leafCx,
        b.switchPortWorld.y - leafCy
      );
      if (nodesAboveSwitch) {
        if (da !== db) return da - db;
        if (a.switchPortWorld.x !== b.switchPortWorld.x) {
          return a.switchPortWorld.x - b.switchPortWorld.x;
        }
        return a.switchPortWorld.y - b.switchPortWorld.y;
      }
      if (db !== da) return db - da;
      if (leafCx <= switchCenter.x) {
        if (b.switchPortWorld.x !== a.switchPortWorld.x) {
          return b.switchPortWorld.x - a.switchPortWorld.x;
        }
      } else if (a.switchPortWorld.x !== b.switchPortWorld.x) {
        return a.switchPortWorld.x - b.switchPortWorld.x;
      }
      return b.switchPortWorld.y - a.switchPortWorld.y;
    });

    if (horizontalTrunk) {
      const trunkAbove = switchCenter.y < leafCy;
      const laneStride = mode === 'DIAGONAL' ? 2 : 1;
      const laneCount = ordered.length;

      // Index 0 (first in order) sits on the outer edge of the trunk:
      // below leaves → bottom-most lane; above leaves → top-most lane.
      const laneYAt = (laneIndex: number) => {
        if (trunkAbove) {
          const topY = bboxMinY - 2 - (laneCount - 1) * laneStride;
          return topY + laneIndex * laneStride;
        }
        const bottomY = bboxMaxY + 2 + (laneCount - 1) * laneStride;
        return bottomY - laneIndex * laneStride;
      };

      const exitTowardTrunk = (cable: LaneCable): Coords => {
        const fp = getFootprint(
          itemById.get(cable.leafId)!,
          modelItems,
          modelItemMap
        );
        if (trunkAbove) {
          return { x: cable.leafPortWorld.x, y: fp.tile.y - 1 };
        }
        return { x: cable.leafPortWorld.x, y: fp.tile.y + fp.height };
      };

      const clearanceJogX = (cable: LaneCable, exit: Coords, laneY: number) => {
        const myFp = getFootprint(
          itemById.get(cable.leafId)!,
          modelItems,
          modelItemMap
        );
        const y0 = Math.min(exit.y, laneY);
        const y1 = Math.max(exit.y, laneY);
        const dirX = Math.sign(switchCenter.x - leafCx) || 1;

        let jogX = exit.x;
        let needsJog = false;

        leafFootprints.forEach((fp) => {
          if (fp.id === myFp.id) return;
          const fpTop = fp.tile.y;
          const fpBottom = fp.tile.y + fp.height - 1;
          const fpLeft = fp.tile.x;
          const fpRight = fp.tile.x + fp.width - 1;
          const between =
            fpBottom >= y0 &&
            fpTop <= y1 &&
            ((trunkAbove && fpBottom < myFp.tile.y) ||
              (!trunkAbove && fpTop > myFp.tile.y + myFp.height - 1));
          const columnOverlap =
            exit.x >= fpLeft - 1 && exit.x <= fpRight + 1;
          if (!between || !columnOverlap) return;

          needsJog = true;
          if (dirX > 0) {
            jogX = Math.max(jogX, fpRight + 2);
          } else {
            jogX = Math.min(jogX, fpLeft - 2);
          }
        });

        if (!needsJog) return exit.x;
        if (jogX === exit.x) {
          jogX = exit.x + dirX * 2;
        }
        return jogX;
      };

      ordered.forEach((cable, laneIndex) => {
        const laneY = laneYAt(laneIndex);
        const exit = exitTowardTrunk(cable);
        const approach = approachPoint(cable, 0);
        const targetX = cable.switchPortWorld.x;
        const dropX = clearanceJogX(cable, exit, laneY);
        const dirX = Math.sign(targetX - dropX) || Math.sign(switchCenter.x - leafCx) || 1;

        let tiles: Coords[];

        if (mode === 'DIAGONAL') {
          // 1) drop to lane (with side jog if needed)
          // 2) run parallel along the lane
          // 3) 45° diagonal into the switch port
          const dy = approach.y - laneY;
          const diag = Math.max(0, Math.abs(dy));
          const dirY = Math.sign(dy) || (trunkAbove ? -1 : 1);

          const dropCol = dropX;
          let runEndX = targetX - dirX * diag;
          if (dirX > 0) {
            runEndX = Math.max(runEndX, dropCol, bboxMaxX + 2);
            if (runEndX > targetX) runEndX = Math.max(dropCol, targetX);
          } else {
            runEndX = Math.min(runEndX, dropCol, bboxMinX - 2);
            if (runEndX < targetX) runEndX = Math.min(dropCol, targetX);
          }

          const body: Coords[] = [exit];
          if (dropCol !== exit.x) {
            body.push({ x: dropCol, y: exit.y });
          }
          body.push({ x: dropCol, y: laneY });

          if (diag >= 2 && runEndX !== targetX) {
            body.push({ x: runEndX, y: laneY });
            body.push({ x: targetX, y: approach.y });
          } else {
            body.push({ x: targetX, y: laneY });
            if (approach.y !== laneY) {
              body.push({ ...approach });
            }
          }

          tiles = body;
        } else if (dropX === exit.x) {
          tiles = [
            exit,
            { x: exit.x, y: laneY },
            { x: targetX, y: laneY },
            approach
          ];
        } else {
          tiles = [
            exit,
            { x: dropX, y: exit.y },
            { x: dropX, y: laneY },
            { x: targetX, y: laneY },
            approach
          ];
        }

        routes[cable.connectorId] = cable.leafFirst
          ? clean(tiles)
          : clean([...tiles].reverse());
      });
      return;
    }

    // Vertical trunk: on the switch side of the leaves; exit toward that side.
    const trunkRight = switchCenter.x >= leafCx;
    const trunkBaseX = trunkRight ? bboxMaxX + 2 : bboxMinX - 2;
    const laneXAt = (laneIndex: number) => {
      return trunkRight ? trunkBaseX + laneIndex : trunkBaseX - laneIndex;
    };

    const exitTowardTrunkX = (cable: LaneCable): Coords => {
      const fp = getFootprint(
        itemById.get(cable.leafId)!,
        modelItems,
        modelItemMap
      );
      if (trunkRight) {
        return { x: fp.tile.x + fp.width, y: cable.leafPortWorld.y };
      }
      return { x: fp.tile.x - 1, y: cable.leafPortWorld.y };
    };

    let sharedDiagV = 4;
    if (mode === 'DIAGONAL') {
      const avails = ordered.map((cable, laneIndex) => {
        const laneX = laneXAt(laneIndex);
        const exit = exitTowardTrunkX(cable);
        return Math.max(0, Math.abs(laneX - exit.x));
      });
      const positive = avails.filter((value) => value > 0);
      if (positive.length > 0) {
        sharedDiagV = Math.max(2, Math.min(8, Math.min(...positive)));
      }
    }

    ordered.forEach((cable, laneIndex) => {
      const laneX = laneXAt(laneIndex);
      const exit = exitTowardTrunkX(cable);
      // Stack “below” the primary: each lane drops one tile further down.
      const runY = exit.y + laneIndex;
      const approach = approachPoint(cable, 0);
      const targetY = cable.switchPortWorld.y;

      let tiles: Coords[];
      if (mode === 'DIAGONAL') {
        const avail = Math.max(0, Math.abs(laneX - exit.x));
        const d = Math.min(sharedDiagV, avail);
        const dirX = Math.sign(laneX - exit.x) || (trunkRight ? 1 : -1);
        const dirY = Math.sign(targetY - runY) || 1;

        if (d < 1) {
          tiles = [
            exit,
            { x: exit.x, y: runY },
            { x: laneX, y: runY },
            { x: laneX, y: targetY },
            approach
          ];
        } else {
          // Stub toward trunk, then parallel diagonal down/up.
          const stubX = laneX - dirX * d;
          let diagY = runY + dirY * d;
          if (
            (dirY > 0 && diagY > targetY) ||
            (dirY < 0 && diagY < targetY)
          ) {
            diagY = targetY;
          }
          tiles = [
            exit,
            { x: exit.x, y: runY },
            { x: stubX, y: runY },
            { x: laneX, y: diagY },
            { x: laneX, y: targetY },
            approach
          ];
        }
      } else {
        tiles = [
          exit,
          { x: exit.x, y: runY },
          { x: laneX, y: runY },
          { x: laneX, y: targetY },
          approach
        ];
      }

      routes[cable.connectorId] = cable.leafFirst
        ? clean(tiles)
        : clean([...tiles].reverse());
    });
  });

  return routes;
};

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
    return isSwitchLikeIcon(iconById.get(id));
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

    let switchAnchor = first;
    let leafAnchor = last;
    let leafFirst = false;

    if (firstIsSwitch !== lastIsSwitch) {
      switchAnchor = firstIsSwitch ? first : last;
      leafAnchor = firstIsSwitch ? last : first;
      leafFirst = !firstIsSwitch;
    } else {
      // Switch↔switch trunk (or host↔host): include when either/both ends selected.
      const aSel = selectedIds.has(first.ref.item);
      const bSel = selectedIds.has(last.ref.item);
      if (aSel && bSel) {
        switchAnchor = first;
        leafAnchor = last;
        leafFirst = false;
      } else if (aSel !== bSel) {
        if (aSel) {
          leafAnchor = first;
          switchAnchor = last;
          leafFirst = true;
        } else {
          leafAnchor = last;
          switchAnchor = first;
          leafFirst = false;
        }
      } else {
        return;
      }
    }

    const leafId = leafAnchor.ref.item!;
    const switchId = switchAnchor.ref.item!;

    if (!selectedIds.has(leafId) && !selectedIds.has(switchId)) return;

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
      leafFirst,
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
    return isSwitchLikeIcon(iconById.get(id));
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

    let switchAnchor = first;
    let leafAnchor = last;
    let leafFirst = false;

    if (firstIsSwitch !== lastIsSwitch) {
      switchAnchor = firstIsSwitch ? first : last;
      leafAnchor = firstIsSwitch ? last : first;
      leafFirst = !firstIsSwitch;
    } else {
      const aSel = selectedIds.has(first.ref.item);
      const bSel = selectedIds.has(last.ref.item);
      if (aSel && bSel) {
        switchAnchor = first;
        leafAnchor = last;
        leafFirst = false;
      } else if (aSel !== bSel) {
        if (aSel) {
          leafAnchor = first;
          switchAnchor = last;
          leafFirst = true;
        } else {
          leafAnchor = last;
          switchAnchor = first;
          leafFirst = false;
        }
      } else {
        return;
      }
    }

    const leafId = leafAnchor.ref.item!;
    const switchId = switchAnchor.ref.item!;

    if (!selectedIds.has(leafId) && !selectedIds.has(switchId)) return;

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
      leafFirst,
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
    const aSwitch = isSwitchLikeIcon(iconById.get(a));
    const bSwitch = isSwitchLikeIcon(iconById.get(b));
    if (aSwitch === bSwitch) return;

    const leafId = aSwitch ? b : a;
    const switchId = aSwitch ? a : b;
    if (!selectedIds.has(leafId) && !selectedIds.has(switchId)) return;

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
  const a = { x: Math.round(from.x), y: Math.round(from.y) };
  const b = { x: Math.round(to.x), y: Math.round(to.y) };
  const tiles: Coords[] = [{ ...a }];
  let x = a.x;
  let y = a.y;
  const maxSteps = Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + 4;
  let guard = 0;

  const runX = () => {
    while (guard < maxSteps && x !== b.x) {
      guard += 1;
      x += Math.sign(b.x - x);
      tiles.push({ x, y });
    }
  };
  const runY = () => {
    while (guard < maxSteps && y !== b.y) {
      guard += 1;
      y += Math.sign(b.y - y);
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
    return isSwitchLikeIcon(iconById.get(id));
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
    if (!aSel && !bSel) return;

    // Need a hub (fan origin) and a leaf (target). Prefer real switch as hub.
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
      // Access / trunk to host: either end selected is enough (allows
      // re-routing when dragging the switch alone).
    } else if (aSel && bSel) {
      // Switch↔switch trunk (or host↔host): both selected — include the cable.
      // Stable hub = first endpoint so multi-select Test/Smart routes it.
      hubId = a;
      leafId = b;
      hubAnchor = first;
      leafAnchor = last;
      leafFirst = false;
    } else if (aSel !== bSel) {
      // Exactly one end selected — selected side is the leaf.
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
    // Old zigzag cables can have hundreds of tile WPs — only reserve
    // their major corridor (endpoints + a few bends), not every step.
    if (poly.length <= 8) {
      markPathEdges(poly, usedEdges);
      return;
    }
    const bends = pathBendWaypoints(poly);
    const slim =
      bends.length <= 4
        ? [poly[0], ...bends, poly[poly.length - 1]]
        : [poly[0], bends[0], bends[bends.length - 1], poly[poly.length - 1]];
    markPathEdges(slim, usedEdges);
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
      const maxSteps = 2000;

      // Diagonal toward (leaf column, lane row).
      let guard = 0;
      while (guard < maxSteps && cur.x !== end.x && cur.y !== laneY) {
        guard += 1;
        cur = {
          x: cur.x + Math.sign(end.x - cur.x),
          y: cur.y + Math.sign(laneY - cur.y)
        };
        path.push({ ...cur });
      }
      // Straighten onto the lane row.
      while (guard < maxSteps && cur.y !== laneY) {
        guard += 1;
        cur = { x: cur.x, y: cur.y + Math.sign(laneY - cur.y) };
        path.push({ ...cur });
      }
      // Horizontal magistrala along the lane row to the leaf column.
      while (guard < maxSteps && cur.x !== end.x) {
        guard += 1;
        cur = { x: cur.x + Math.sign(end.x - cur.x), y: cur.y };
        path.push({ ...cur });
      }
      // Short stub into the leaf port (none for lane 0).
      while (guard < maxSteps && cur.y !== end.y) {
        guard += 1;
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
    const isHub =
      isSwitchLikeIcon(model?.icon) ||
      (degree.get(item.id) || 0) > median + 1;
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
 * Positions snap to `gridStep` (same module as drop/place snap, e.g. RACK 1U).
 */
export const smartPlaceNodes = ({
  graph,
  selectedItems,
  allItems,
  modelItems,
  gridStep = { x: 1, y: 1 }
}: {
  graph: GraphAnalysis;
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  /** Active floor snap step (RACK → 9×9). Defaults to 1×1. */
  gridStep?: { x: number; y: number };
}): Record<string, Coords> => {
  const result: Record<string, Coords> = {};
  const selectedMap = new Map(selectedItems.map((i) => [i.id, i]));
  const sx = Math.max(1, gridStep.x);
  const sy = Math.max(1, gridStep.y);

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
    
    // Anchor to the root hub (grid-aligned) to prevent drifting on re-runs
    const rootId = layers[0][0];
    const rootItem = selectedMap.get(rootId);
    let cx = 0;
    let cy = 0;
    if (rootItem) {
      const snappedRoot = snapTile2dToGrid(rootItem.tile, { x: sx, y: sy });
      cx = snappedRoot.x;
      cy = snappedRoot.y;
    } else if (group.nodes.length > 0) {
      const mid = snapTile2dToGrid(
        { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
        { x: sx, y: sy }
      );
      cx = mid.x;
      cy = mid.y;
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
      // Place relative to x=0 with grid-quantized strides, then center on cx.
      const relX: number[] = [];
      let x = 0;
      let maxH = 0;
      layer.forEach((nodeId, index) => {
        relX.push(x);
        const fp = footprintCache.get(nodeId);
        const w = fp ? fp.width : 2;
        const h = fp ? fp.height : 2;
        if (h > maxH) maxH = h;
        if (index < layer.length - 1) {
          x = ceilToStep(x + w + gap, sx);
        }
      });

      const lastId = layer[layer.length - 1];
      const lastW = footprintCache.get(lastId)?.width ?? 2;
      const contentW =
        layer.length === 0 ? 0 : (relX[relX.length - 1] ?? 0) + lastW;
      const startX = snapTile2dToGrid(
        { x: cx - contentW / 2, y: currentY },
        { x: sx, y: sy }
      ).x;

      layer.forEach((nodeId, index) => {
        groupResult[nodeId] = {
          x: startX + (relX[index] ?? 0),
          y: currentY
        };
      });
      currentY = ceilToStep(currentY + maxH + gap, sy);
    }

    const rootPos = groupResult[rootId];
    if (rootPos) {
      const dx = cx - rootPos.x;
      const dy = cy - rootPos.y;
      for (const id in groupResult) {
        const snapped = snapTile2dToGrid(
          { x: groupResult[id].x + dx, y: groupResult[id].y + dy },
          { x: sx, y: sy }
        );
        groupResult[id] = snapped;
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
        offsetX = (step % 2 === 0 ? n : -n) * 2 * sx;
        offsetY = (step % 3 === 0 ? n : -n) * 2 * sy;
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
      const final = snapTile2dToGrid(
        { x: pos.x + offsetX, y: pos.y + offsetY },
        { x: sx, y: sy }
      );
      const origItem = selectedMap.get(id);
      if (
        origItem &&
        (origItem.tile.x !== final.x || origItem.tile.y !== final.y)
      ) {
        result[id] = final;
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
    const ends = c.anchors.filter(a => Boolean(a.ref.item));
    if (ends.length < 2) return false;
    const a = ends[0].ref.item!;
    const b = ends[ends.length - 1].ref.item!;
    return selectedIds.has(a) || selectedIds.has(b);
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
  const isSwitch = (id: string) => isSwitchLikeIcon(iconById.get(id));

  const connData: CableTask[] = validConns.map(c => {
    const ends = c.anchors.filter(a => Boolean(a.ref.item));
    const a0 = ends[0].ref;
    const a1 = ends[ends.length - 1].ref;
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
    const from = { x: Math.round(start.x), y: Math.round(start.y) };
    const to = { x: Math.round(end.x), y: Math.round(end.y) };
    const dirY = to.y >= from.y ? 1 : -1;
    const laneY = to.y + dirY * (laneIndex + 1);

    const path: Coords[] = [{ ...from }];
    let cur = { ...from };
    const maxSteps =
      Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + Math.abs(laneY - from.y) + 8;
    let guard = 0;

    while (guard < maxSteps && cur.y !== laneY) {
      guard += 1;
      cur = { x: cur.x, y: cur.y + Math.sign(laneY - cur.y) };
      path.push({ ...cur });
    }

    while (guard < maxSteps && cur.x !== to.x) {
      guard += 1;
      cur = { x: cur.x + Math.sign(to.x - cur.x), y: cur.y };
      path.push({ ...cur });
    }

    while (guard < maxSteps && cur.y !== to.y) {
      guard += 1;
      cur = { x: cur.x, y: cur.y + Math.sign(to.y - cur.y) };
      path.push({ ...cur });
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

/** Stub past node outline before the shared elbow (must be ≥2 for compact). */
export const SL3_STUB_LENGTH = 2;
/** Clearance between leaf cluster / shared bus and the hub. */
const SL3_APPROACH_GAP = 3;

type Sp3Cable = {
  connectorId: string;
  leafFirst: boolean;
  leafId: string;
  hubId: string;
  leafPort: Coords;
  hubPort: Coords;
  leafPortSide: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
  hubPortSide: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
};

type Sl3Compass = 'NW' | 'NE' | 'SW' | 'SE' | 'N' | 'S' | 'W' | 'E';

type Sl3ExitAxis = 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';

/**
 * Routing plan from leaf cluster toward the hub ("Cel").
 * Example: hub NW → exit LEFT → NW diagonal → enter ports from BOTTOM.
 */
type Sl3Plan = {
  dir: Sl3Compass;
  exitAxis: Sl3ExitAxis;
  /** Shared first bend is a vertical bus (same X) or horizontal (same Y). */
  firstBend: 'X' | 'Y';
  diagSx: -1 | 0 | 1;
  diagSy: -1 | 0 | 1;
  /**
   * Geometric face to approach the hub from so the last stub can dive
   * straight into ports (TOP / BOTTOM / LEFT / RIGHT).
   */
  approachFace: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
};

type Sl3Cable = Sp3Cable;

const portSideOf = (
  icon: string | undefined,
  portId: string | undefined
): 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' => {
  const port = getShape2dPorts(icon ?? '').find((candidate) => {
    return candidate.id === portId;
  });
  return port?.side ?? 'BOTTOM';
};

const outsidePort = (
  port: Coords,
  side: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT',
  distance: number
): Coords => {
  switch (side) {
    case 'TOP':
      return { x: port.x, y: port.y - distance };
    case 'LEFT':
      return { x: port.x - distance, y: port.y };
    case 'RIGHT':
      return { x: port.x + distance, y: port.y };
    case 'BOTTOM':
    default:
      return { x: port.x, y: port.y + distance };
  }
};

/** Where is the hub relative to the leaf cluster midpoint? */
const resolveSl3Plan = (
  hubCenter: Coords,
  leafMid: Coords,
  deadZone = 2
): Sl3Plan => {
  const dx = hubCenter.x - leafMid.x;
  const dy = hubCenter.y - leafMid.y;
  const east = dx > deadZone;
  const west = dx < -deadZone;
  const south = dy > deadZone;
  const north = dy < -deadZone;

  // Hub NW of leaves: exit left, NW run, approach hub from below.
  if (west && north) {
    return {
      dir: 'NW',
      exitAxis: 'LEFT',
      firstBend: 'X',
      diagSx: -1,
      diagSy: -1,
      approachFace: 'BOTTOM'
    };
  }
  if (east && north) {
    return {
      dir: 'NE',
      exitAxis: 'RIGHT',
      firstBend: 'X',
      diagSx: 1,
      diagSy: -1,
      approachFace: 'BOTTOM'
    };
  }
  if (west && south) {
    return {
      dir: 'SW',
      exitAxis: 'LEFT',
      firstBend: 'X',
      diagSx: -1,
      diagSy: 1,
      approachFace: 'TOP'
    };
  }
  if (east && south) {
    return {
      dir: 'SE',
      exitAxis: 'RIGHT',
      firstBend: 'X',
      diagSx: 1,
      diagSy: 1,
      approachFace: 'TOP'
    };
  }
  if (north) {
    return {
      dir: 'N',
      exitAxis: 'UP',
      firstBend: 'Y',
      diagSx: 0,
      diagSy: -1,
      approachFace: 'BOTTOM'
    };
  }
  if (south) {
    return {
      dir: 'S',
      exitAxis: 'DOWN',
      firstBend: 'Y',
      diagSx: 0,
      diagSy: 1,
      approachFace: 'TOP'
    };
  }
  if (west) {
    return {
      dir: 'W',
      exitAxis: 'LEFT',
      firstBend: 'X',
      diagSx: -1,
      diagSy: 0,
      approachFace: 'RIGHT'
    };
  }
  return {
    dir: 'E',
    exitAxis: 'RIGHT',
    firstBend: 'X',
    diagSx: 1,
    diagSy: 0,
    approachFace: 'LEFT'
  };
};

const collectSl3Cables = ({
  selectedItems,
  allItems,
  modelItems,
  connectors
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  connectors: TidyConnector[];
}): Sl3Cable[] => {
  const selectedIds = new Set(selectedItems.map((item) => item.id));
  const itemById = new Map(allItems.map((item) => [item.id, item] as const));
  const iconById = new Map(
    modelItems.map((item) => [item.id, item.icon] as const)
  );
  const isSwitch = (id: string) => isSwitchLikeIcon(iconById.get(id));
  const cables: Sp3Cable[] = [];

  connectors.forEach((connector) => {
    const ends = connector.anchors.filter((anchor) => Boolean(anchor.ref.item));
    if (ends.length < 2) return;

    const first = ends[0];
    const last = ends[ends.length - 1];
    if (!first.ref.item || !last.ref.item) return;
    if (first.ref.item === last.ref.item) return;

    const a = first.ref.item;
    const b = last.ref.item;
    const aSel = selectedIds.has(a);
    const bSel = selectedIds.has(b);
    if (!aSel && !bSel) return;

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
    } else if (aSel && bSel) {
      hubId = a;
      leafId = b;
      hubAnchor = first;
      leafAnchor = last;
      leafFirst = false;
    } else if (aSel !== bSel) {
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
      (candidate) => candidate.id === leafAnchor.ref.port
    );
    const hubPortDef = getShape2dPorts(iconById.get(hubId) ?? '').find(
      (candidate) => candidate.id === hubAnchor.ref.port
    );

    const leafPort = leafPortDef
      ? {
          x: leafItem.tile.x + leafPortDef.tile.x,
          y: leafItem.tile.y + leafPortDef.tile.y
        }
      : { x: leafItem.tile.x, y: leafItem.tile.y };
    const hubPort = hubPortDef
      ? {
          x: hubItem.tile.x + hubPortDef.tile.x,
          y: hubItem.tile.y + hubPortDef.tile.y
        }
      : { x: hubItem.tile.x, y: hubItem.tile.y };

    cables.push({
      connectorId: connector.id,
      leafFirst,
      leafId,
      hubId,
      leafPort,
      hubPort,
      leafPortSide:
        leafPortDef?.side ??
        portSideOf(iconById.get(leafId), leafAnchor.ref.port),
      hubPortSide:
        hubPortDef?.side ?? portSideOf(iconById.get(hubId), hubAnchor.ref.port)
    });
  });

  return cables;
};

const countSl3PortCrossings = (cables: Sp3Cable[]): number => {
  let crosses = 0;
  for (let i = 0; i < cables.length; i += 1) {
    for (let j = i + 1; j < cables.length; j += 1) {
      if (
        segmentsIntersect(
          cables[i].leafPort,
          cables[i].hubPort,
          cables[j].leafPort,
          cables[j].hubPort
        )
      ) {
        crosses += 1;
      }
    }
  }
  return crosses;
};

/** Sort so parallel shared-bend routes do not cross into ports. */
const sortSl3CablesForPlan = (
  cables: Sp3Cable[],
  plan: Sl3Plan
): Sp3Cable[] => {
  return [...cables].sort((a, b) => {
    if (plan.approachFace === 'TOP' || plan.approachFace === 'BOTTOM') {
      if (a.hubPort.x !== b.hubPort.x) return a.hubPort.x - b.hubPort.x;
      if (a.hubPort.y !== b.hubPort.y) return a.hubPort.y - b.hubPort.y;
    } else {
      if (a.hubPort.y !== b.hubPort.y) return a.hubPort.y - b.hubPort.y;
      if (a.hubPort.x !== b.hubPort.x) return a.hubPort.x - b.hubPort.x;
    }
    if (plan.firstBend === 'X') {
      if (a.leafPort.y !== b.leafPort.y) return a.leafPort.y - b.leafPort.y;
      return a.leafPort.x - b.leafPort.x;
    }
    if (a.leafPort.x !== b.leafPort.x) return a.leafPort.x - b.leafPort.x;
    return a.leafPort.y - b.leafPort.y;
  });
};

/**
 * Smart Layout 3 — place leaves opposite the hub so plan-based routes
 * (shared bends, no overlap) stay planar. Hub stays fixed.
 */
export const smartPlaceNodesSl3 = ({
  selectedItems,
  allItems,
  modelItems,
  connectors,
  gridStep = { x: 1, y: 1 }
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  connectors: TidyConnector[];
  gridStep?: { x: number; y: number };
}): Record<string, Coords> => {
  if (selectedItems.length < 2) return {};

  const sx = Math.max(1, gridStep.x);
  const sy = Math.max(1, gridStep.y);
  const selectedMap = new Map(selectedItems.map((item) => [item.id, item]));
  const iconById = new Map(
    modelItems.map((item) => [item.id, item.icon] as const)
  );
  const result: Record<string, Coords> = {};

  const cables = collectSl3Cables({
    selectedItems,
    allItems,
    modelItems,
    connectors
  });
  if (cables.length === 0) return {};

  const byHub = new Map<string, Sp3Cable[]>();
  cables.forEach((cable) => {
    const list = byHub.get(cable.hubId) ?? [];
    list.push(cable);
    byHub.set(cable.hubId, list);
  });

  const placedLeaves = new Set<string>();

  byHub.forEach((group, hubId) => {
    const hubItem =
      selectedMap.get(hubId) ?? allItems.find((i) => i.id === hubId);
    if (!hubItem) return;

    const unique: Sp3Cable[] = [];
    const seenLeaf = new Set<string>();
    group.forEach((cable) => {
      if (!selectedMap.has(cable.leafId)) return;
      if (seenLeaf.has(cable.leafId)) return;
      seenLeaf.add(cable.leafId);
      unique.push(cable);
    });
    if (unique.length === 0) return;

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
    unique.forEach((cable) => {
      const leaf = selectedMap.get(cable.leafId)!;
      const fp = getFootprint(leaf, modelItems);
      leafCx += fp.tile.x + fp.width / 2;
      leafCy += fp.tile.y + fp.height / 2;
    });
    leafCx /= unique.length;
    leafCy /= unique.length;

    const plan = resolveSl3Plan(hubCenter, { x: leafCx, y: leafCy });
    const ordered = sortSl3CablesForPlan(unique, plan);

    const footprints = ordered.map((cable) => {
      return getFootprint(selectedMap.get(cable.leafId)!, modelItems);
    });

    const corridor =
      SL3_STUB_LENGTH + SL3_APPROACH_GAP + Math.max(2, ordered.length);
    const gap = SHAPE_2D_LAYOUT_GAP;
    const stackAlongY =
      plan.exitAxis === 'LEFT' || plan.exitAxis === 'RIGHT';
    const maxW = Math.max(...footprints.map((fp) => fp.width));
    const maxH = Math.max(...footprints.map((fp) => fp.height));
    const stackSpan = stackAlongY
      ? footprints.reduce(
          (sum, fp, i) => sum + fp.height + (i > 0 ? gap : 0),
          0
        )
      : footprints.reduce(
          (sum, fp, i) => sum + fp.width + (i > 0 ? gap : 0),
          0
        );

    // Place leaves opposite Cel so exit runs toward the hub.
    let originX = hubCenter.x - (stackAlongY ? maxW / 2 : stackSpan / 2);
    let originY = hubCenter.y - (stackAlongY ? stackSpan / 2 : maxH / 2);

    if (plan.dir === 'NW' || plan.dir === 'SW' || plan.dir === 'W') {
      // Hub west of leaves → leaves sit to the east of hub.
      originX = hubItem.tile.x + hubSize.width + corridor;
    } else if (plan.dir === 'NE' || plan.dir === 'SE' || plan.dir === 'E') {
      originX = hubItem.tile.x - corridor - maxW;
    }
    if (plan.dir === 'NW' || plan.dir === 'NE' || plan.dir === 'N') {
      // Hub north of leaves → leaves sit south of hub.
      originY = hubItem.tile.y + hubSize.height + corridor;
    } else if (plan.dir === 'SW' || plan.dir === 'SE' || plan.dir === 'S') {
      originY = hubItem.tile.y - corridor - (stackAlongY ? stackSpan : maxH);
    }

    originX = snapTile2dToGrid({ x: originX, y: originY }, { x: sx, y: sy }).x;
    originY = snapTile2dToGrid({ x: originX, y: originY }, { x: sx, y: sy }).y;

    const tryOffsets = [0, -4, 4, -8, 8, -12, 12];
    let bestTargets: Record<string, Coords> | null = null;
    let bestCross = Number.POSITIVE_INFINITY;

    for (const off of tryOffsets) {
      const targets: Record<string, Coords> = {};
      if (stackAlongY) {
        let y = originY + off * sy;
        ordered.forEach((cable, index) => {
          const fp = footprints[index];
          const tile = snapTile2dToGrid({ x: originX, y }, { x: sx, y: sy });
          targets[cable.leafId] = tile;
          y = ceilToStep(tile.y + fp.height + gap, sy);
        });
      } else {
        let x = originX + off * sx;
        ordered.forEach((cable, index) => {
          const fp = footprints[index];
          const tile = snapTile2dToGrid({ x, y: originY }, { x: sx, y: sy });
          targets[cable.leafId] = tile;
          x = ceilToStep(tile.x + fp.width + gap, sx);
        });
      }

      const projected: Sp3Cable[] = ordered.map((cable) => {
        const leafTile = targets[cable.leafId];
        const leafItem = selectedMap.get(cable.leafId)!;
        const dx = leafTile.x - leafItem.tile.x;
        const dy = leafTile.y - leafItem.tile.y;
        return {
          ...cable,
          leafPort: {
            x: cable.leafPort.x + dx,
            y: cable.leafPort.y + dy
          }
        };
      });
      const crosses = countSl3PortCrossings(projected);
      if (crosses < bestCross) {
        bestCross = crosses;
        bestTargets = targets;
        if (crosses === 0) break;
      }
    }

    if (bestTargets) {
      Object.entries(bestTargets).forEach(([id, tile]) => {
        if (placedLeaves.has(id)) return;
        placedLeaves.add(id);
        result[id] = tile;
      });
    }

    if (selectedMap.has(hubId) && !result[hubId]) {
      result[hubId] = { ...hubItem.tile };
    }
  });

  return result;
};

/**
 * Sparse mid-waypoints for one SL3 cable:
 * exit → shared bend → compass run → shared front → orthogonal into port.
 */
const buildSl3CableRoute = ({
  cable,
  plan,
  laneIndex,
  leafFp,
  sharedBus,
  sharedFront
}: {
  cable: Sp3Cable;
  plan: Sl3Plan;
  laneIndex: number;
  leafFp: Footprint;
  sharedBus: number;
  sharedFront: number;
}): Coords[] => {
  let exit: Coords;
  if (plan.exitAxis === 'LEFT') {
    exit = {
      x: Math.min(leafFp.tile.x, cable.leafPort.x) - SL3_STUB_LENGTH,
      y: cable.leafPort.y
    };
  } else if (plan.exitAxis === 'RIGHT') {
    exit = {
      x:
        Math.max(leafFp.tile.x + leafFp.width - 1, cable.leafPort.x) +
        SL3_STUB_LENGTH,
      y: cable.leafPort.y
    };
  } else if (plan.exitAxis === 'UP') {
    exit = {
      x: cable.leafPort.x,
      y: Math.min(leafFp.tile.y, cable.leafPort.y) - SL3_STUB_LENGTH
    };
  } else {
    exit = {
      x: cable.leafPort.x,
      y:
        Math.max(leafFp.tile.y + leafFp.height - 1, cable.leafPort.y) +
        SL3_STUB_LENGTH
    };
  }

  // Parallel lanes on the bus — never stack on the same tiles.
  if (plan.firstBend === 'X') {
    exit = { x: exit.x, y: exit.y + laneIndex };
  } else {
    exit = { x: exit.x + laneIndex, y: exit.y };
  }

  const bend1 =
    plan.firstBend === 'X'
      ? { x: sharedBus, y: exit.y }
      : { x: exit.x, y: sharedBus };

  // Final stub matches the real port side so entry is orthogonal into the jack.
  const entrySide = cable.hubPortSide;
  const approach = outsidePort(cable.hubPort, entrySide, SL3_STUB_LENGTH);
  const frontIsY = entrySide === 'TOP' || entrySide === 'BOTTOM';

  let frontCoord = sharedFront;
  if (entrySide === 'TOP') {
    frontCoord = Math.min(sharedFront, cable.hubPort.y - SL3_STUB_LENGTH);
  } else if (entrySide === 'BOTTOM') {
    frontCoord = Math.max(sharedFront, cable.hubPort.y + SL3_STUB_LENGTH);
  } else if (entrySide === 'LEFT') {
    frontCoord = Math.min(sharedFront, cable.hubPort.x - SL3_STUB_LENGTH);
  } else {
    frontCoord = Math.max(sharedFront, cable.hubPort.x + SL3_STUB_LENGTH);
  }

  let diagCorner: Coords;
  let onFront: Coords;

  if (frontIsY) {
    const targetY = frontCoord;
    const dxNeeded = approach.x - bend1.x;
    const dyNeeded = targetY - bend1.y;
    const diag =
      plan.diagSx !== 0 && plan.diagSy !== 0
        ? Math.max(
            2,
            Math.min(Math.abs(dxNeeded) || 2, Math.abs(dyNeeded) || 2)
          )
        : Math.max(2, Math.abs(dyNeeded) || Math.abs(dxNeeded) || 2);

    if (plan.diagSx !== 0 && plan.diagSy !== 0) {
      // True 45° toward Cel, then snap onto the shared front (aligned elbows).
      diagCorner = {
        x: bend1.x + plan.diagSx * (diag + laneIndex),
        y: targetY
      };
    } else if (plan.diagSy !== 0) {
      diagCorner = { x: bend1.x + laneIndex, y: targetY };
    } else {
      diagCorner = {
        x: bend1.x + (plan.diagSx || 1) * (diag + laneIndex),
        y: targetY
      };
    }
    onFront = { x: approach.x, y: targetY };
  } else {
    const targetX = frontCoord;
    const dxNeeded = targetX - bend1.x;
    const dyNeeded = approach.y - bend1.y;
    const diag =
      plan.diagSx !== 0 && plan.diagSy !== 0
        ? Math.max(
            2,
            Math.min(Math.abs(dxNeeded) || 2, Math.abs(dyNeeded) || 2)
          )
        : Math.max(2, Math.abs(dxNeeded) || Math.abs(dyNeeded) || 2);

    if (plan.diagSx !== 0 && plan.diagSy !== 0) {
      diagCorner = {
        x: targetX,
        y: bend1.y + plan.diagSy * (diag + laneIndex)
      };
    } else if (plan.diagSx !== 0) {
      diagCorner = { x: targetX, y: bend1.y + laneIndex };
    } else {
      diagCorner = {
        x: targetX,
        y: bend1.y + (plan.diagSy || 1) * (diag + laneIndex)
      };
    }
    onFront = { x: targetX, y: approach.y };
  }

  return cleanRouteTiles([exit, bend1, diagCorner, onFront, approach]);
};

/**
 * Smart Layout 3 routes — Cel location drives exit, diagonal and port entry.
 * Cables share bend lines, stay on parallel lanes, enter ports orthogonally.
 */
export const sharedBendShape2dRoutes = ({
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
  const itemById = new Map(allItems.map((item) => [item.id, item] as const));
  const iconById = new Map(
    modelItems.map((item) => [item.id, item.icon] as const)
  );

  const cables = collectSl3Cables({
    selectedItems,
    allItems,
    modelItems,
    connectors
  });
  if (cables.length === 0) return {};

  const groups = new Map<string, Sp3Cable[]>();
  cables.forEach((cable) => {
    const list = groups.get(cable.hubId) ?? [];
    list.push(cable);
    groups.set(cable.hubId, list);
  });

  const routes: Record<string, Coords[]> = {};
  const usedPoints = new Set<string>();

  const occupy = (tiles: Coords[]) => {
    tiles.forEach((tile) => {
      usedPoints.add(`${tile.x},${tile.y}`);
    });
  };

  const pathHitsUsed = (tiles: Coords[]) => {
    return tiles.some((tile, index) => {
      if (index === 0 || index === tiles.length - 1) return false;
      return usedPoints.has(`${tile.x},${tile.y}`);
    });
  };

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

    const leafFootprints = group.map((cable) => {
      const leaf = itemById.get(cable.leafId);
      return leaf
        ? getFootprint(leaf, modelItems)
        : {
            id: cable.leafId,
            tile: { x: cable.leafPort.x, y: cable.leafPort.y },
            width: 1,
            height: 1
          };
    });

    const bboxMinX = Math.min(...leafFootprints.map((f) => f.tile.x));
    const bboxMaxX = Math.max(
      ...leafFootprints.map((f) => f.tile.x + f.width - 1)
    );
    const bboxMinY = Math.min(...leafFootprints.map((f) => f.tile.y));
    const bboxMaxY = Math.max(
      ...leafFootprints.map((f) => f.tile.y + f.height - 1)
    );
    const leafMid = {
      x: (bboxMinX + bboxMaxX) / 2,
      y: (bboxMinY + bboxMaxY) / 2
    };

    const plan = resolveSl3Plan(hubCenter, leafMid);
    const ordered = sortSl3CablesForPlan(group, plan);

    let sharedBus: number;
    if (plan.firstBend === 'X') {
      sharedBus =
        plan.exitAxis === 'LEFT'
          ? bboxMinX - SL3_STUB_LENGTH
          : bboxMaxX + SL3_STUB_LENGTH;
    } else {
      sharedBus =
        plan.exitAxis === 'UP'
          ? bboxMinY - SL3_STUB_LENGTH
          : bboxMaxY + SL3_STUB_LENGTH;
    }

    // Shared approach fronts per hub face — elbows align, then dive into ports.
    const frontBottom =
      Math.max(
        hubItem.tile.y + hubSize.height - 1,
        ...ordered.map((c) => c.hubPort.y)
      ) + SL3_STUB_LENGTH;
    const frontTop =
      Math.min(hubItem.tile.y, ...ordered.map((c) => c.hubPort.y)) -
      SL3_STUB_LENGTH;
    const frontLeft =
      Math.min(hubItem.tile.x, ...ordered.map((c) => c.hubPort.x)) -
      SL3_STUB_LENGTH;
    const frontRight =
      Math.max(
        hubItem.tile.x + hubSize.width - 1,
        ...ordered.map((c) => c.hubPort.x)
      ) + SL3_STUB_LENGTH;

    const frontForSide = (
      side: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT'
    ): number => {
      if (side === 'BOTTOM') {
        let y = frontBottom;
        // Stay north of the leaf cluster when Cel is above the leaves.
        if (plan.diagSy < 0) y = Math.min(y, bboxMinY - SL3_APPROACH_GAP);
        return y;
      }
      if (side === 'TOP') {
        let y = frontTop;
        if (plan.diagSy > 0) y = Math.max(y, bboxMaxY + SL3_APPROACH_GAP);
        return y;
      }
      if (side === 'LEFT') {
        let x = frontLeft;
        if (plan.diagSx < 0) x = Math.min(x, bboxMinX - SL3_APPROACH_GAP);
        return x;
      }
      let x = frontRight;
      if (plan.diagSx > 0) x = Math.max(x, bboxMaxX + SL3_APPROACH_GAP);
      return x;
    };

    // Default geometric front from Cel plan (used when port side matches).
    let sharedFront = frontForSide(plan.approachFace);

    ordered.forEach((cable, orderIndex) => {
      const leafFp =
        leafFootprints.find((f) => f.id === cable.leafId) ?? leafFootprints[0];

      // Enter from the port's own side so the last stub is orthogonal into it.
      // Prefer plan.approachFace when the port faces that way; otherwise port side.
      const entryFace =
        cable.hubPortSide === plan.approachFace
          ? plan.approachFace
          : cable.hubPortSide;
      sharedFront = frontForSide(entryFace);

      let mid = buildSl3CableRoute({
        cable,
        plan,
        laneIndex: orderIndex,
        leafFp,
        sharedBus,
        sharedFront
      });

      if (pathHitsUsed(mid)) {
        for (let extra = 1; extra <= ordered.length + 3; extra += 1) {
          const candidate = buildSl3CableRoute({
            cable,
            plan,
            laneIndex: orderIndex + extra,
            leafFp,
            sharedBus,
            sharedFront
          });
          if (!pathHitsUsed(candidate)) {
            mid = candidate;
            break;
          }
        }
      }

      occupy(mid);
      routes[cable.connectorId] = cable.leafFirst ? mid : [...mid].reverse();
    });
  });

  return routes;
};

/** SL4 stub before horizontal bus / final dive into port. */
export const SL4_STUB_LENGTH = 2;
/** Parallel lane spacing — keep cables close but not stacked. */
const SL4_LANE_GAP = 1;

type Sl4Cable = Sp3Cable;

/** Collinear segments whose interiors overlap (nakładanie na tej samej linii). */
const segmentsCollinearOverlap = (
  a1: Coords,
  a2: Coords,
  b1: Coords,
  b2: Coords
): boolean => {
  if (orientation(a1, a2, b1) !== 0 || orientation(a1, a2, b2) !== 0) {
    return false;
  }
  const dx = Math.abs(a2.x - a1.x);
  const dy = Math.abs(a2.y - a1.y);
  if (dx >= dy) {
    const aMin = Math.min(a1.x, a2.x);
    const aMax = Math.max(a1.x, a2.x);
    const bMin = Math.min(b1.x, b2.x);
    const bMax = Math.max(b1.x, b2.x);
    return Math.min(aMax, bMax) - Math.max(aMin, bMin) > 0.5;
  }
  const aMin = Math.min(a1.y, a2.y);
  const aMax = Math.max(a1.y, a2.y);
  const bMin = Math.min(b1.y, b2.y);
  const bMax = Math.max(b1.y, b2.y);
  return Math.min(aMax, bMax) - Math.max(aMin, bMin) > 0.5;
};

/**
 * Step 1 of SL4: score straight RJ45→RJ45 links only (no pathfinding).
 * Prefer zero overlaps, then zero crossings.
 */
const scoreSl4StraightLinks = (
  cables: { leafPort: Coords; hubPort: Coords; leafId: string; hubId: string }[]
): { overlaps: number; crossings: number; score: number } => {
  let overlaps = 0;
  let crossings = 0;

  for (let i = 0; i < cables.length; i += 1) {
    for (let j = i + 1; j < cables.length; j += 1) {
      const a1 = cables[i].leafPort;
      const a2 = cables[i].hubPort;
      const b1 = cables[j].leafPort;
      const b2 = cables[j].hubPort;

      const shareEndpoint =
        (a1.x === b1.x && a1.y === b1.y) ||
        (a1.x === b2.x && a1.y === b2.y) ||
        (a2.x === b1.x && a2.y === b1.y) ||
        (a2.x === b2.x && a2.y === b2.y) ||
        cables[i].leafId === cables[j].leafId ||
        cables[i].hubId === cables[j].hubId;

      if (segmentsCollinearOverlap(a1, a2, b1, b2)) {
        overlaps += 1;
        continue;
      }
      if (shareEndpoint) continue;
      if (segmentsIntersect(a1, a2, b1, b2)) {
        crossings += 1;
      }
    }
  }

  return {
    overlaps,
    crossings,
    score: overlaps * 100000 + crossings * 1000
  };
};

type Sl4Dir = 'SE' | 'SW' | 'NE' | 'NW' | 'E' | 'W' | 'S' | 'N';

/** Where is the hub (Cel) relative to the leaf cluster? */
const resolveSl4Dir = (hubCenter: Coords, leafMid: Coords): Sl4Dir => {
  const dx = hubCenter.x - leafMid.x;
  const dy = hubCenter.y - leafMid.y;
  const dead = 2;
  const east = dx > dead;
  const west = dx < -dead;
  const south = dy > dead;
  const north = dy < -dead;
  if (east && south) return 'SE';
  if (west && south) return 'SW';
  if (east && north) return 'NE';
  if (west && north) return 'NW';
  if (east) return 'E';
  if (west) return 'W';
  if (south) return 'S';
  return 'N';
};

/**
 * Smart Layout 4 — rearrange leaves using only straight port↔port scores
 * (overlaps first, then crossings). Hub stays put; same-size slots are
 * reassigned, then a light pack opposite Cel.
 */
export const smartPlaceNodesSl4 = ({
  selectedItems,
  allItems,
  modelItems,
  connectors,
  gridStep = { x: 1, y: 1 }
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  connectors: TidyConnector[];
  gridStep?: { x: number; y: number };
}): Record<string, Coords> => {
  if (selectedItems.length < 2) return {};

  const sx = Math.max(1, gridStep.x);
  const sy = Math.max(1, gridStep.y);
  const selectedMap = new Map(selectedItems.map((item) => [item.id, item]));
  const iconById = new Map(
    modelItems.map((item) => [item.id, item.icon] as const)
  );
  const result: Record<string, Coords> = {};

  const cables = collectSl3Cables({
    selectedItems,
    allItems,
    modelItems,
    connectors
  }) as Sl4Cable[];
  if (cables.length === 0) return {};

  const byHub = new Map<string, Sl4Cable[]>();
  cables.forEach((cable) => {
    const list = byHub.get(cable.hubId) ?? [];
    list.push(cable);
    byHub.set(cable.hubId, list);
  });

  const placedLeaves = new Set<string>();

  byHub.forEach((group, hubId) => {
    const hubItem =
      selectedMap.get(hubId) ?? allItems.find((i) => i.id === hubId);
    if (!hubItem) return;

    const unique: Sl4Cable[] = [];
    const seenLeaf = new Set<string>();
    group.forEach((cable) => {
      if (!selectedMap.has(cable.leafId)) return;
      if (seenLeaf.has(cable.leafId)) return;
      seenLeaf.add(cable.leafId);
      unique.push(cable);
    });
    if (unique.length === 0) return;

    const hubSize = getShape2dSize(iconById.get(hubId) ?? '') ?? {
      width: 1,
      height: 1
    };
    const hubCenter = {
      x: hubItem.tile.x + hubSize.width / 2,
      y: hubItem.tile.y + hubSize.height / 2
    };

    // --- Step 2a: permute existing same-size slots by straight-link score ---
    const sizeKey = (id: string) => {
      const s = getShape2dSize(iconById.get(id) ?? '') ?? { width: 1, height: 1 };
      return `${s.width}x${s.height}`;
    };

    const slotGroups = new Map<string, { leafId: string; slot: Coords; cable: Sl4Cable }[]>();
    unique.forEach((cable) => {
      const key = sizeKey(cable.leafId);
      const leaf = selectedMap.get(cable.leafId)!;
      const list = slotGroups.get(key) ?? [];
      list.push({ leafId: cable.leafId, slot: { ...leaf.tile }, cable });
      slotGroups.set(key, list);
    });

    const tileByLeaf = new Map<string, Coords>();
    unique.forEach((cable) => {
      tileByLeaf.set(cable.leafId, { ...selectedMap.get(cable.leafId)!.tile });
    });

    const projectCables = (): Sl4Cable[] => {
      return unique.map((cable) => {
        const tile = tileByLeaf.get(cable.leafId)!;
        const old = selectedMap.get(cable.leafId)!.tile;
        return {
          ...cable,
          leafPort: {
            x: cable.leafPort.x + (tile.x - old.x),
            y: cable.leafPort.y + (tile.y - old.y)
          }
        };
      });
    };

    slotGroups.forEach((members) => {
      if (members.length < 2) return;

      // Order slots spatially; assign leaves by hub-port order as a strong start.
      const slots = members
        .map((m) => m.slot)
        .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
      const byPort = [...members].sort((a, b) => {
        if (a.cable.hubPort.x !== b.cable.hubPort.x) {
          return a.cable.hubPort.x - b.cable.hubPort.x;
        }
        return a.cable.hubPort.y - b.cable.hubPort.y;
      });

      byPort.forEach((m, index) => {
        tileByLeaf.set(m.leafId, { ...slots[index] });
      });

      // 2-opt swaps to cut remaining overlaps/crossings (straight links only).
      let best = scoreSl4StraightLinks(projectCables()).score;
      let improved = true;
      let guard = 0;
      const ids = byPort.map((m) => m.leafId);
      while (improved && guard < 60) {
        improved = false;
        guard += 1;
        for (let i = 0; i < ids.length; i += 1) {
          for (let j = i + 1; j < ids.length; j += 1) {
            const a = ids[i];
            const b = ids[j];
            const ta = tileByLeaf.get(a)!;
            const tb = tileByLeaf.get(b)!;
            tileByLeaf.set(a, tb);
            tileByLeaf.set(b, ta);
            const next = scoreSl4StraightLinks(projectCables()).score;
            if (next < best) {
              best = next;
              improved = true;
            } else {
              tileByLeaf.set(a, ta);
              tileByLeaf.set(b, tb);
            }
          }
        }
      }
    });

    // --- Step 2b: pack opposite Cel so horizontal→diagonal→down has room ---
    const projected = projectCables();
    let leafCx = 0;
    let leafCy = 0;
    projected.forEach((cable) => {
      leafCx += cable.leafPort.x;
      leafCy += cable.leafPort.y;
    });
    leafCx /= projected.length;
    leafCy /= projected.length;
    const dir = resolveSl4Dir(hubCenter, { x: leafCx, y: leafCy });

    const ordered = [...projected].sort((a, b) => {
      if (a.hubPort.x !== b.hubPort.x) return a.hubPort.x - b.hubPort.x;
      return a.hubPort.y - b.hubPort.y;
    });

    const footprints = ordered.map((cable) => {
      const tile = tileByLeaf.get(cable.leafId)!;
      const fp = getFootprint(selectedMap.get(cable.leafId)!, modelItems);
      return { ...fp, tile: { ...tile } };
    });

    const gap = SHAPE_2D_LAYOUT_GAP;
    const corridor = SL4_STUB_LENGTH + 4 + ordered.length;
    const maxW = Math.max(...footprints.map((f) => f.width));
    const stackH = footprints.reduce(
      (sum, fp, i) => sum + fp.height + (i > 0 ? gap : 0),
      0
    );

    // Nodes left-top of Cel (hub SE): stack west of hub, exit will go right.
    let originX = hubItem.tile.x - corridor - maxW;
    let originY = hubItem.tile.y - Math.floor(stackH / 2);
    if (dir === 'SE' || dir === 'E' || dir === 'NE') {
      originX = hubItem.tile.x - corridor - maxW;
    } else if (dir === 'SW' || dir === 'W' || dir === 'NW') {
      originX = hubItem.tile.x + hubSize.width + corridor;
    }
    if (dir === 'SE' || dir === 'SW' || dir === 'S') {
      originY = hubItem.tile.y - corridor - stackH;
    } else if (dir === 'NE' || dir === 'NW' || dir === 'N') {
      originY = hubItem.tile.y + hubSize.height + corridor;
    }

    // For "nodes left-top of target" hub is SE of leaves → leaves NW of hub.
    if (dir === 'SE') {
      originX = hubItem.tile.x - corridor - maxW;
      originY = hubItem.tile.y - corridor - stackH;
    }

    // Snapshot after slot permute (before pack).
    const afterPermute: Record<string, Coords> = {};
    ordered.forEach((cable) => {
      afterPermute[cable.leafId] = { ...tileByLeaf.get(cable.leafId)! };
    });
    const permuteScore = scoreSl4StraightLinks(projectCables()).score;

    originX = snapTile2dToGrid({ x: originX, y: originY }, { x: sx, y: sy }).x;
    originY = snapTile2dToGrid({ x: originX, y: originY }, { x: sx, y: sy }).y;

    let y = originY;
    const packed: Record<string, Coords> = {};
    ordered.forEach((cable, index) => {
      const fp = footprints[index];
      const tile = snapTile2dToGrid({ x: originX, y }, { x: sx, y: sy });
      packed[cable.leafId] = tile;
      y = ceilToStep(tile.y + fp.height + gap, sy);
    });

    ordered.forEach((cable) => {
      tileByLeaf.set(cable.leafId, packed[cable.leafId]);
    });
    const packedScore = scoreSl4StraightLinks(projectCables()).score;
    const chosen = packedScore <= permuteScore ? packed : afterPermute;

    Object.entries(chosen).forEach(([id, tile]) => {
      if (placedLeaves.has(id)) return;
      placedLeaves.add(id);
      result[id] = tile;
    });

    if (selectedMap.has(hubId) && !result[hubId]) {
      result[hubId] = { ...hubItem.tile };
    }
  });

  return result;
};

/**
 * Build SL4 mid-waypoints for nodes left-top of Cel (hub SE):
 * right (or down+right) → horizontal to shared turn → diagonal → down into port.
 * Mirrored for other compass directions. Lanes stay tight (SL4_LANE_GAP).
 */
const buildSl4CableRoute = ({
  cable,
  dir,
  laneIndex,
  leafFp,
  turnCoord,
  closestY
}: {
  cable: Sl4Cable;
  dir: Sl4Dir;
  laneIndex: number;
  leafFp: Footprint;
  /** Shared turn column (X) or row (Y) where horizontals become diagonals. */
  turnCoord: number;
  /** Y (or X) of the leaf closest to Cel — reference for the shared horizontal. */
  closestY: number;
}): Coords[] => {
  const approachAbove = {
    x: cable.hubPort.x,
    y: cable.hubPort.y - SL4_STUB_LENGTH
  };
  const approachBelow = {
    x: cable.hubPort.x,
    y: cable.hubPort.y + SL4_STUB_LENGTH
  };
  const approachLeft = {
    x: cable.hubPort.x - SL4_STUB_LENGTH,
    y: cable.hubPort.y
  };
  const approachRight = {
    x: cable.hubPort.x + SL4_STUB_LENGTH,
    y: cable.hubPort.y
  };

  // Prefer diving into the port along its face; fall back to geometric approach.
  let approach: Coords;
  if (cable.hubPortSide === 'TOP') approach = approachAbove;
  else if (cable.hubPortSide === 'BOTTOM') approach = approachBelow;
  else if (cable.hubPortSide === 'LEFT') approach = approachLeft;
  else if (cable.hubPortSide === 'RIGHT') approach = approachRight;
  else if (dir === 'SE' || dir === 'SW' || dir === 'S') approach = approachAbove;
  else if (dir === 'NE' || dir === 'NW' || dir === 'N') approach = approachBelow;
  else if (dir === 'E') approach = approachLeft;
  else approach = approachRight;

  const lane = laneIndex * SL4_LANE_GAP;

  // --- Nodes left-top of Cel (hub to the SE): exit right, horizontal, diagonal, down ---
  if (dir === 'SE' || dir === 'E') {
    // If lanes would stack, drop slightly from RJ45 then go right.
    const exitStub =
      lane === 0
        ? {
            x:
              Math.max(leafFp.tile.x + leafFp.width - 1, cable.leafPort.x) +
              SL4_STUB_LENGTH,
            y: cable.leafPort.y
          }
        : {
            x:
              Math.max(leafFp.tile.x + leafFp.width - 1, cable.leafPort.x) +
              SL4_STUB_LENGTH,
            y: cable.leafPort.y + lane
          };
    const downFirst =
      lane > 0
        ? { x: cable.leafPort.x, y: cable.leafPort.y + lane }
        : null;

    const onBus = { x: turnCoord, y: exitStub.y };
    // Diagonal toward port column / approach, then vertical into port.
    const diagEnd = {
      x: approach.x,
      y: onBus.y + Math.max(Math.abs(approach.x - onBus.x), 1)
    };
    // Snap diagonal end onto/above approach so final leg is straight down (or up).
    const beforeDive =
      approach.y >= onBus.y
        ? { x: approach.x, y: Math.min(diagEnd.y, approach.y) }
        : { x: approach.x, y: Math.max(onBus.y - Math.abs(approach.x - onBus.x), approach.y) };

    const mid = downFirst
      ? cleanRouteTiles([downFirst, exitStub, onBus, beforeDive, approach])
      : cleanRouteTiles([exitStub, onBus, beforeDive, approach]);
    return mid;
  }

  if (dir === 'SW' || dir === 'W') {
    const exitStub = {
      x: Math.min(leafFp.tile.x, cable.leafPort.x) - SL4_STUB_LENGTH,
      y: cable.leafPort.y + lane
    };
    const downFirst =
      lane > 0 ? { x: cable.leafPort.x, y: cable.leafPort.y + lane } : null;
    const onBus = { x: turnCoord, y: exitStub.y };
    const beforeDive = {
      x: approach.x,
      y:
        approach.y >= onBus.y
          ? Math.min(onBus.y + Math.abs(onBus.x - approach.x), approach.y)
          : Math.max(onBus.y - Math.abs(onBus.x - approach.x), approach.y)
    };
    return downFirst
      ? cleanRouteTiles([downFirst, exitStub, onBus, beforeDive, approach])
      : cleanRouteTiles([exitStub, onBus, beforeDive, approach]);
  }

  if (dir === 'NE' || dir === 'N') {
    // Exit right/left toward Cel, horizontal, diagonal, down/up into port.
    const exitRight = dir === 'NE';
    const exitStub = {
      x: exitRight
        ? Math.max(leafFp.tile.x + leafFp.width - 1, cable.leafPort.x) +
          SL4_STUB_LENGTH
        : cable.leafPort.x + lane,
      y: exitRight
        ? cable.leafPort.y + lane
        : Math.min(leafFp.tile.y, cable.leafPort.y) - SL4_STUB_LENGTH
    };
    if (dir === 'N') {
      const onBus = { x: exitStub.x, y: turnCoord };
      const beforeDive = { x: approach.x, y: turnCoord };
      return cleanRouteTiles([exitStub, onBus, beforeDive, approach]);
    }
    const onBus = { x: turnCoord, y: exitStub.y };
    const beforeDive = {
      x: approach.x,
      y: Math.max(onBus.y - Math.abs(approach.x - onBus.x), approach.y)
    };
    return cleanRouteTiles([exitStub, onBus, beforeDive, approach]);
  }

  // NW / S fallback — keep cables close with shared turn.
  const exitStub = {
    x: Math.min(leafFp.tile.x, cable.leafPort.x) - SL4_STUB_LENGTH,
    y: cable.leafPort.y + lane
  };
  const onBus = { x: turnCoord, y: exitStub.y };
  const beforeDive = {
    x: approach.x,
    y: Math.max(onBus.y - Math.abs(approach.x - onBus.x), approach.y)
  };
  void closestY;
  return cleanRouteTiles([exitStub, onBus, beforeDive, approach]);
};

/**
 * Smart Layout 4 routes — tight diagonal bundle into ports.
 * Prefers diagonal approach; horizontals share a turn line set by the
 * leaf nearest Cel (e.g. NW leaves: right → horizontal → diagonal → down).
 */
export const diagonalBundleShape2dRoutes = ({
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
  const itemById = new Map(allItems.map((item) => [item.id, item] as const));

  const cables = collectSl3Cables({
    selectedItems,
    allItems,
    modelItems,
    connectors
  }) as Sl4Cable[];
  if (cables.length === 0) return {};

  const groups = new Map<string, Sl4Cable[]>();
  cables.forEach((cable) => {
    const list = groups.get(cable.hubId) ?? [];
    list.push(cable);
    groups.set(cable.hubId, list);
  });

  const routes: Record<string, Coords[]> = {};
  const used = new Set<string>();
  const occupy = (tiles: Coords[]) => {
    tiles.forEach((t) => used.add(`${t.x},${t.y}`));
  };
  const hits = (tiles: Coords[]) =>
    tiles.some((t, i) => {
      if (i === 0 || i === tiles.length - 1) return false;
      return used.has(`${t.x},${t.y}`);
    });

  groups.forEach((group, hubId) => {
    const hubItem = itemById.get(hubId);
    if (!hubItem) return;

    const leafFootprints = group.map((cable) => {
      const leaf = itemById.get(cable.leafId);
      return leaf
        ? getFootprint(leaf, modelItems)
        : {
            id: cable.leafId,
            tile: { x: cable.leafPort.x, y: cable.leafPort.y },
            width: 1,
            height: 1
          };
    });

    const bboxMinX = Math.min(...leafFootprints.map((f) => f.tile.x));
    const bboxMaxX = Math.max(
      ...leafFootprints.map((f) => f.tile.x + f.width - 1)
    );
    const bboxMinY = Math.min(...leafFootprints.map((f) => f.tile.y));
    const bboxMaxY = Math.max(
      ...leafFootprints.map((f) => f.tile.y + f.height - 1)
    );
    const leafMid = {
      x: (bboxMinX + bboxMaxX) / 2,
      y: (bboxMinY + bboxMaxY) / 2
    };

    const hubSize = getShape2dSize(
      (modelItems.find((m) => m.id === hubId) || {}).icon ?? ''
    ) ?? { width: 1, height: 1 };
    const hubCenter = {
      x: hubItem.tile.x + hubSize.width / 2,
      y: hubItem.tile.y + hubSize.height / 2
    };
    const dir = resolveSl4Dir(hubCenter, leafMid);

    // Leaf nearest Cel — its horizontal decides the shared turn line.
    let closest = group[0];
    let closestDist = Number.POSITIVE_INFINITY;
    group.forEach((cable) => {
      const d =
        Math.abs(cable.leafPort.x - cable.hubPort.x) +
        Math.abs(cable.leafPort.y - cable.hubPort.y);
      if (d < closestDist) {
        closestDist = d;
        closest = cable;
      }
    });

    // Order for tight parallel lanes (by Y then hub port X).
    const ordered = [...group].sort((a, b) => {
      if (a.leafPort.y !== b.leafPort.y) return a.leafPort.y - b.leafPort.y;
      if (a.hubPort.x !== b.hubPort.x) return a.hubPort.x - b.hubPort.x;
      return a.leafPort.x - b.leafPort.x;
    });

    // Shared turn: horizontal until closest leaf can diagonal then dive to port.
    const closestApproachY =
      closest.hubPortSide === 'BOTTOM'
        ? closest.hubPort.y + SL4_STUB_LENGTH
        : closest.hubPort.y - SL4_STUB_LENGTH;
    const closestExitY = closest.leafPort.y;
    const dy = Math.abs(closestApproachY - closestExitY);
    // 45° diagonal needs |dx| ≈ dy before the vertical dive.
    let turnCoord: number;
    if (dir === 'SE' || dir === 'E' || dir === 'NE') {
      const ideal = closest.hubPort.x - Math.max(dy, 2);
      turnCoord = Math.max(bboxMaxX + SL4_STUB_LENGTH, ideal);
    } else if (dir === 'SW' || dir === 'W' || dir === 'NW') {
      const ideal = closest.hubPort.x + Math.max(dy, 2);
      turnCoord = Math.min(bboxMinX - SL4_STUB_LENGTH, ideal);
    } else if (dir === 'S') {
      turnCoord = Math.max(bboxMaxY + SL4_STUB_LENGTH, closest.hubPort.y - Math.max(dy, 2));
    } else {
      turnCoord = Math.min(bboxMinY - SL4_STUB_LENGTH, closest.hubPort.y + Math.max(dy, 2));
    }

    ordered.forEach((cable, orderIndex) => {
      const leafFp =
        leafFootprints.find((f) => f.id === cable.leafId) ?? leafFootprints[0];

      let mid = buildSl4CableRoute({
        cable,
        dir,
        laneIndex: orderIndex,
        leafFp,
        turnCoord,
        closestY: closestExitY
      });

      if (hits(mid)) {
        for (let extra = 1; extra <= ordered.length + 4; extra += 1) {
          const candidate = buildSl4CableRoute({
            cable,
            dir,
            laneIndex: orderIndex + extra,
            leafFp,
            turnCoord,
            closestY: closestExitY
          });
          if (!hits(candidate)) {
            mid = candidate;
            break;
          }
        }
      }

      occupy(mid);
      routes[cable.connectorId] = cable.leafFirst ? mid : [...mid].reverse();
    });
  });

  return routes;
};

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE SORT
// Phase 1: greedy leaf-swap to minimize straight-line crossings.
// Phase 2: bundle routing — short stub → shared trunk axis → individual
//           dive into hub port. Lines run close together (wiązka) and only
//           fan out at the switch.
// ─────────────────────────────────────────────────────────────────────────────

const CS_STUB = 3; // tiles extruded from leaf port before joining trunk
const CS_GAP  = 1; // spacing between parallel lanes in the trunk

/** Count straight-segment crossings for a set of cables (port-to-port). */
const countStraightCrossingsCS = (cables: Sp3Cable[]): number => {
  let n = 0;
  for (let i = 0; i < cables.length; i++) {
    for (let j = i + 1; j < cables.length; j++) {
      const ai = cables[i];
      const aj = cables[j];
      // Shared endpoint — never a real crossing.
      if (
        ai.leafId === aj.leafId ||
        ai.hubId  === aj.hubId  ||
        (ai.leafPort.x === aj.leafPort.x && ai.leafPort.y === aj.leafPort.y) ||
        (ai.hubPort.x  === aj.hubPort.x  && ai.hubPort.y  === aj.hubPort.y)
      ) continue;
      if (segmentsIntersect(ai.leafPort, ai.hubPort, aj.leafPort, aj.hubPort)) n++;
    }
  }
  return n;
};

/**
 * Claude Sort Phase 1 — greedy pairwise swap of same-footprint leaf nodes
 * to minimise straight-line cable crossings. Hub stays fixed.
 * Returns a map of itemId → new tile for nodes that moved.
 */
export const claudeSortSwapLeaves = ({
  selectedItems,
  allItems,
  modelItems,
  connectors,
  gridStep = { x: 1, y: 1 }
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  connectors: TidyConnector[];
  gridStep?: { x: number; y: number };
}): Record<string, Coords> => {
  if (selectedItems.length < 2) return {};

  const cables = collectSl3Cables({ selectedItems, allItems, modelItems, connectors });
  if (cables.length === 0) return {};

  const groups = new Map<string, Sp3Cable[]>();
  cables.forEach((c) => {
    const arr = groups.get(c.hubId) ?? [];
    arr.push(c);
    groups.set(c.hubId, arr);
  });

  const sizeOf = new Map<string, { w: number; h: number }>();
  selectedItems.forEach((item) => {
    const model = modelItems.find((m) => m.id === item.id);
    const sz = getShape2dSize(model?.icon ?? '') ?? { width: 1, height: 1 };
    sizeOf.set(item.id, { w: sz.width, h: sz.height });
  });

  const itemById = new Map(allItems.map((i) => [i.id, i]));
  const positionOverrides = new Map<string, Coords>();

  groups.forEach((group) => {
    const leaves = group.map((c) => c.leafId);
    if (leaves.length < 2) return;

    const tileOf = new Map<string, Coords>();
    leaves.forEach((id) => {
      const item = itemById.get(id);
      if (item) tileOf.set(id, { ...item.tile });
    });

    const rebuildCables = (tm: Map<string, Coords>): Sp3Cable[] =>
      group.map((c) => {
        const lt = tm.get(c.leafId) ?? c.leafPort;
        const orig = itemById.get(c.leafId)?.tile;
        const offX = orig ? c.leafPort.x - orig.x : 0;
        const offY = orig ? c.leafPort.y - orig.y : 0;
        return { ...c, leafPort: { x: lt.x + offX, y: lt.y + offY } };
      });

    let bestScore = countStraightCrossingsCS(rebuildCables(tileOf));
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < leaves.length; i++) {
        for (let j = i + 1; j < leaves.length; j++) {
          const idA = leaves[i];
          const idB = leaves[j];
          const szA = sizeOf.get(idA);
          const szB = sizeOf.get(idB);
          if (!szA || !szB || szA.w !== szB.w || szA.h !== szB.h) continue;

          const tA = tileOf.get(idA)!;
          const tB = tileOf.get(idB)!;
          tileOf.set(idA, tB);
          tileOf.set(idB, tA);
          const score = countStraightCrossingsCS(rebuildCables(tileOf));
          if (score < bestScore) {
            bestScore = score;
            improved = true;
          } else {
            tileOf.set(idA, tA);
            tileOf.set(idB, tB);
          }
        }
      }
    }

    const sx = Math.max(1, gridStep.x);
    const sy = Math.max(1, gridStep.y);
    leaves.forEach((id) => {
      const orig = itemById.get(id)?.tile;
      const next = tileOf.get(id);
      if (!next || !orig || (next.x === orig.x && next.y === orig.y)) return;
      positionOverrides.set(id, {
        x: Math.round(next.x / sx) * sx,
        y: Math.round(next.y / sy) * sy
      });
    });
  });

  const result: Record<string, Coords> = {};
  positionOverrides.forEach((tile, id) => { result[id] = tile; });
  return result;
};

/**
 * Claude Sort Phase 2 — bundle routing.
 *
 * Each cable: leaf-port → short orthogonal stub → shared trunk axis
 * (wiązka) → individual dive into hub port.
 * Cables run parallel in the trunk (CS_GAP apart), ordered by hub-port
 * coordinate so the final fan-out into ports stays crossing-free.
 */
export const claudeSortBundleRoutes = ({
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
  const cables = collectSl3Cables({ selectedItems, allItems, modelItems, connectors });
  const routes: Record<string, Coords[]> = {};
  if (cables.length === 0) return routes;

  const groups = new Map<string, Sp3Cable[]>();
  cables.forEach((c) => {
    const arr = groups.get(c.hubId) ?? [];
    arr.push(c);
    groups.set(c.hubId, arr);
  });

  groups.forEach((group) => {
    if (group.length === 0) return;

    // Centroid of leaf ports
    const cx = group.reduce((s, c) => s + c.leafPort.x, 0) / group.length;
    const cy = group.reduce((s, c) => s + c.leafPort.y, 0) / group.length;

    // Representative hub port (use average for groups that share a switch)
    const hx = group.reduce((s, c) => s + c.hubPort.x, 0) / group.length;
    const hy = group.reduce((s, c) => s + c.hubPort.y, 0) / group.length;

    const dx = hx - cx;
    const dy = hy - cy;
    const horizontal = Math.abs(dx) >= Math.abs(dy);

    // Trunk position: midpoint between cluster and hub
    let trunkCoord: number;
    if (horizontal) {
      trunkCoord = Math.round(cx + dx * 0.5);
    } else {
      trunkCoord = Math.round(cy + dy * 0.5);
    }

    // Order cables by hub-port to avoid crossing in the final dive
    const ordered = [...group].sort((a, b) =>
      horizontal ? a.hubPort.y - b.hubPort.y : a.hubPort.x - b.hubPort.x
    );

    const count = ordered.length;

    ordered.forEach((cable, laneIdx) => {
      const laneOff = (laneIdx - Math.floor((count - 1) / 2)) * CS_GAP;

      // Stub: exit leaf port orthogonally toward hub
      let stubPt: Coords;
      if (horizontal) {
        const stubDir = dx >= 0 ? 1 : -1;
        stubPt = { x: cable.leafPort.x + stubDir * CS_STUB, y: cable.leafPort.y + laneOff };
      } else {
        const stubDir = dy >= 0 ? 1 : -1;
        stubPt = { x: cable.leafPort.x + laneOff, y: cable.leafPort.y + stubDir * CS_STUB };
      }

      // On-trunk waypoint
      const trunkPt: Coords = horizontal
        ? { x: trunkCoord, y: stubPt.y }
        : { x: stubPt.x, y: trunkCoord };

      // Elbow before hub-port dive
      const beforeDive: Coords = horizontal
        ? { x: trunkCoord, y: cable.hubPort.y }
        : { x: cable.hubPort.x, y: trunkCoord };

      const route = cleanRouteTiles([
        cable.leafPort,
        stubPt,
        trunkPt,
        beforeDive,
        cable.hubPort
      ]);

      routes[cable.connectorId] = cable.leafFirst ? route : [...route].reverse();
    });
  });

  return routes;
};

