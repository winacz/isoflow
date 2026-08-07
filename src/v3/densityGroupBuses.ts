import type { Coords, ModelItem, ViewItem } from 'src/types';
import { getShape2dPorts, getShape2dSize } from 'src/config';
import { isSwitchLikeIcon } from 'src/utils/shape2dLayout';
import { computeDensityGroups, type DensityGroup } from './densityGroups';

export type DensityGroupBusResult = {
  routes: Record<string, Coords[]>;
  /** Node slot swaps applied before routing (uncross leaf↔port). */
  targets: Record<string, Coords>;
  groupCount: number;
  cableCount: number;
  swappedNodes: number;
};

/** How cables leave the leaf group toward the shared bus / target. */
export type DensityBusExitStyle = 'orthogonal' | 'oneBend';

type LayoutConnector = {
  id: string;
  anchors: {
    id: string;
    ref: { item?: string; tile?: Coords; port?: string };
  }[];
};

type PortSide = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';

type BusCable = {
  connectorId: string;
  leafFirst: boolean;
  leafId: string;
  leafPortWorld: Coords;
  leafPortSide: PortSide;
  switchId: string;
  switchPortWorld: Coords;
  switchPortSide: PortSide;
};

/** Side of the group the trunk sits on — facing the switch. */
export type TrunkSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * Clear runway past the switch chassis before the bus turns parallel to the
 * face — keeps horizontals off the device name / header band.
 */
export const SWITCH_PORT_RUNWAY_TILES = 0;

/** Ports can sit on fractional tiles (e.g. PC y − 2.15); bus lanes must be grid-aligned. */
const snapTile = (tile: Coords): Coords => {
  return { x: Math.round(tile.x), y: Math.round(tile.y) };
};

/**
 * Switch-side path end — at the port itself (no rozbiegówka / chassis offset).
 */
export const switchPortApproach = ({
  portWorld,
  laneIndex = 0,
  runway = SWITCH_PORT_RUNWAY_TILES
}: {
  switchTile: Coords;
  switchSize: { width: number; height: number };
  portWorld: Coords;
  portSide: PortSide;
  laneIndex?: number;
  runway?: number;
}): Coords => {
  void laneIndex;
  void runway;
  return snapTile(portWorld);
};

const cleanTiles = (tiles: Coords[]): Coords[] => {
  const snapped = tiles.map(snapTile);
  return snapped.filter((tile, index) => {
    if (index === 0) return true;
    const prev = snapped[index - 1];
    return prev.x !== tile.x || prev.y !== tile.y;
  });
};

/** Horizontal bus segment already claimed by an earlier group. */
export type OccupiedHorizontal = {
  y: number;
  x0: number;
  x1: number;
};

/** Prefer clear lanes within this |offset|; beyond → shift the leaf group. */
export const BUS_Y_OFFSET_LIMIT = 24;
/** Do not place a new lane on the same Y or the adjacent tile (1-tile pad). */
const OCCUPANCY_Y_GAP = 2;
/**
 * Same-Y buses collide even without X overlap — stacked switches with the same
 * port index share a visual highway; X-only checks missed those.
 */
const OCCUPANCY_IGNORE_X = true;
/** When X is considered, treat ranges within this many tiles as overlapping. */
const OCCUPANCY_X_SLACK = 4;

export const collectOccupiedHorizontals = (
  routes: Record<string, Coords[]>
): OccupiedHorizontal[] => {
  const segs: OccupiedHorizontal[] = [];
  Object.values(routes).forEach((path) => {
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1];
      const b = path[i];
      if (a.y !== b.y) continue;
      if (a.x === b.x) continue;
      segs.push({
        y: a.y,
        x0: Math.min(a.x, b.x),
        x1: Math.max(a.x, b.x)
      });
    }
  });
  return segs;
};

const xRangesOverlap = (
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  slack = 0
): boolean => {
  return a0 - slack <= b1 && b0 - slack <= a1;
};

export const bandConflictsOccupied = ({
  laneYs,
  x0,
  x1,
  occupied,
  gap = OCCUPANCY_Y_GAP
}: {
  laneYs: number[];
  x0: number;
  x1: number;
  occupied: OccupiedHorizontal[];
  gap?: number;
}): boolean => {
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  return occupied.some((seg) => {
    if (
      !OCCUPANCY_IGNORE_X &&
      !xRangesOverlap(lo, hi, seg.x0, seg.x1, OCCUPANCY_X_SLACK)
    ) {
      return false;
    }
    return laneYs.some((y) => {
      return Math.abs(y - seg.y) < gap;
    });
  });
};

/** True when any new horizontal sits on/near an occupied bus Y. */
export const horizontalsConflictOccupied = ({
  next,
  occupied,
  gap = OCCUPANCY_Y_GAP
}: {
  next: OccupiedHorizontal[];
  occupied: OccupiedHorizontal[];
  gap?: number;
}): boolean => {
  if (occupied.length === 0 || next.length === 0) return false;
  return next.some((a) => {
    return occupied.some((b) => {
      if (Math.abs(a.y - b.y) >= gap) return false;
      if (OCCUPANCY_IGNORE_X) return true;
      return xRangesOverlap(a.x0, a.x1, b.x0, b.x1, OCCUPANCY_X_SLACK);
    });
  });
};

export type OccupiedVertical = {
  x: number;
  y0: number;
  y1: number;
};

export const collectOccupiedVerticals = (
  routes: Record<string, Coords[]>
): OccupiedVertical[] => {
  const segs: OccupiedVertical[] = [];
  Object.values(routes).forEach((path) => {
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1];
      const b = path[i];
      if (a.x !== b.x) continue;
      if (a.y === b.y) continue;
      segs.push({
        x: a.x,
        y0: Math.min(a.y, b.y),
        y1: Math.max(a.y, b.y)
      });
    }
  });
  return segs;
};

const longestHorizontalY = (path: Coords[]): number | null => {
  let bestY: number | null = null;
  let bestLen = 0;
  for (let i = 1; i < path.length; i += 1) {
    if (path[i].y !== path[i - 1].y) continue;
    const len = Math.abs(path[i].x - path[i - 1].x);
    if (len > bestLen) {
      bestLen = len;
      bestY = path[i].y;
    }
  }
  return bestY;
};

/** 45° stub / column gap out of the target port when untangling overlaps. */
export const TARGET_DIAG_STUB_TILES = 2;
/** Vertical approaches this close in X count as overlapping (adjacent ports). */
const VERTICAL_X_GAP = 2;

const horizontalsOf = (path: Coords[]): OccupiedHorizontal[] => {
  return collectOccupiedHorizontals({ _: path });
};

const verticalsOf = (path: Coords[]): OccupiedVertical[] => {
  return collectOccupiedVerticals({ _: path });
};

/** Target port = last waypoint (leaf→switch orientation). */
const targetPortOf = (path: Coords[]): Coords => {
  return path[path.length - 1];
};

/**
 * Rebuild approach so the vertical run sits on `freeX`, joining the port with
 * a true 45° segment: (freeX, port.y ± |dx|) → port.
 */
export const rerouteWithTargetDiagonalToColumn = (
  path: Coords[],
  freeX: number
): Coords[] => {
  if (path.length < 2) return path;
  const port = targetPortOf(path);
  if (freeX === port.x) return path;

  const busY = longestHorizontalY(path) ?? path[path.length - 2].y;
  const towardBus = Math.sign(busY - port.y) || -1;
  const stub = Math.abs(freeX - port.x);
  const diag = {
    x: freeX,
    y: port.y + towardBus * stub
  };

  const body: Coords[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const p = path[i];
    const nxt = path[i + 1];
    if (p.y === busY && nxt.y === busY && nxt.x === port.x) {
      body.push(p);
      break;
    }
    if (p.x === port.x && nxt.x === port.x) {
      break;
    }
    body.push(p);
  }

  if (body.length === 0) {
    return cleanTiles([
      { x: port.x, y: busY },
      { x: freeX, y: busY },
      diag,
      port
    ]);
  }
  const last = body[body.length - 1];
  if (last.y !== busY) {
    body.push({ x: last.x, y: busY });
  }

  return cleanTiles([...body, { x: freeX, y: busY }, diag, port]);
};

/**
 * Shift the long horizontal bus by dy; land on the target via 45° from the port.
 */
export const shiftBusYWithTargetDiagonal = (
  path: Coords[],
  dy: number
): Coords[] => {
  if (dy === 0 || path.length < 2) return path;
  const port = targetPortOf(path);
  const busY = longestHorizontalY(path);
  if (busY === null) return path;
  const newBusY = busY + dy;
  const side = Math.sign(dy) || 1;
  const freeX = port.x + side * Math.max(TARGET_DIAG_STUB_TILES, 1);

  const body: Coords[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const p = path[i];
    const nxt = path[i + 1];
    const py = p.y === busY ? newBusY : p.y;
    const ny = nxt.y === busY ? newBusY : nxt.y;
    if (py === newBusY && ny === newBusY && nxt.x === port.x) {
      body.push({ x: p.x, y: newBusY });
      break;
    }
    if (p.x === port.x && nxt.x === port.x) {
      break;
    }
    body.push({ x: p.x, y: py });
  }
  if (body.length === 0) {
    body.push({ x: port.x + side, y: newBusY });
  } else if (body[body.length - 1].y !== newBusY) {
    const last = body[body.length - 1];
    body.push({ x: last.x, y: newBusY });
  }

  const towardBus = Math.sign(newBusY - port.y) || -1;
  const diag = {
    x: freeX,
    y: port.y + towardBus * Math.abs(freeX - port.x)
  };
  return cleanTiles([...body, { x: freeX, y: newBusY }, diag, port]);
};

/** Shift approach column by dx via 45° from the target port. */
export const shiftApproachXWithTargetDiagonal = (
  path: Coords[],
  dx: number
): Coords[] => {
  if (dx === 0 || path.length < 2) return path;
  return rerouteWithTargetDiagonalToColumn(path, targetPortOf(path).x + dx);
};

const longestVertical = (path: Coords[]): OccupiedVertical | null => {
  let best: OccupiedVertical | null = null;
  let bestLen = 0;
  verticalsOf(path).forEach((seg) => {
    const len = seg.y1 - seg.y0;
    if (len > bestLen) {
      bestLen = len;
      best = seg;
    }
  });
  return best;
};

const pathsConflictXY = (
  a: Coords[],
  b: Coords[]
): {
  axis: 'x' | 'y';
} | null => {
  const ha = horizontalsOf(a);
  const hb = horizontalsOf(b);
  for (const s of ha) {
    for (const t of hb) {
      if (s.y !== t.y) continue;
      if (xRangesOverlap(s.x0, s.x1, t.x0, t.x1, 0)) {
        return { axis: 'y' };
      }
    }
  }
  // Compare main approach columns (longest vertical), not short leaf climbs.
  const sa = longestVertical(a);
  const sb = longestVertical(b);
  if (sa && sb && Math.abs(sa.x - sb.x) < VERTICAL_X_GAP) {
    return { axis: 'x' };
  }
  // Stacked switches, same port index: both still drop on the port column
  // (a successful 45° untangle moves the long vertical off port.x).
  const portA = targetPortOf(a);
  const portB = targetPortOf(b);
  if (
    Math.abs(portA.x - portB.x) < VERTICAL_X_GAP &&
    Math.abs(portA.y - portB.y) >= VERTICAL_X_GAP
  ) {
    const dropOnPort = (path: Coords[], portX: number): boolean => {
      return verticalsOf(path).some((seg) => {
        return (
          Math.abs(seg.x - portX) < VERTICAL_X_GAP && seg.y1 - seg.y0 >= 2
        );
      });
    };
    if (dropOnPort(a, portA.x) && dropOnPort(b, portB.x)) {
      return { axis: 'x' };
    }
  }
  return null;
};

const collectOccupiedApproachXs = (
  routes: Record<string, Coords[]>,
  excludeId?: string
): Set<number> => {
  const xs = new Set<number>();
  Object.entries(routes).forEach(([id, path]) => {
    if (id === excludeId) return;
    const main = longestVertical(path);
    if (main) xs.add(main.x);
  });
  return xs;
};

const collectOccupiedBusYs = (
  routes: Record<string, Coords[]>,
  excludeId?: string
): Set<number> => {
  const ys = new Set<number>();
  Object.entries(routes).forEach(([id, path]) => {
    if (id === excludeId) return;
    horizontalsOf(path).forEach((seg) => {
      ys.add(seg.y);
    });
  });
  return ys;
};

const columnIsFree = (x: number, occupied: Set<number>): boolean => {
  for (const ox of occupied) {
    if (Math.abs(x - ox) < VERTICAL_X_GAP) return false;
  }
  return true;
};

const rowIsFree = (y: number, occupied: Set<number>): boolean => {
  for (const oy of occupied) {
    if (Math.abs(y - oy) < OCCUPANCY_Y_GAP) return false;
  }
  return true;
};

/**
 * Magistrala end pass: shared / near-shared bus Y or drop column → move the
 * *lower* target's cable onto a free X (or free Y) via a 45° exit from its port.
 */
export const resolveOverlapsWithTargetDiagonal = (
  routes: Record<string, Coords[]>
): Record<string, Coords[]> => {
  const next: Record<string, Coords[]> = { ...routes };
  const ids = Object.keys(next);

  const conflictsAny = (id: string, path: Coords[]): boolean => {
    return ids.some((otherId) => {
      if (otherId === id) return false;
      return Boolean(pathsConflictXY(path, next[otherId]));
    });
  };

  /** Prefer the cable whose switch port sits lower on screen (larger tile Y). */
  const pickLowerVictim = (idA: string, idB: string): string => {
    const ya = targetPortOf(next[idA]).y;
    const yb = targetPortOf(next[idB]).y;
    if (ya !== yb) return ya > yb ? idA : idB;
    return next[idA].length <= next[idB].length ? idA : idB;
  };

  for (let iter = 0; iter < 48; iter += 1) {
    let moved = false;
    for (let i = 0; i < ids.length && !moved; i += 1) {
      for (let j = i + 1; j < ids.length && !moved; j += 1) {
        const idA = ids[i];
        const idB = ids[j];
        const conflict = pathsConflictXY(next[idA], next[idB]);
        if (!conflict) continue;

        const victimId = pickLowerVictim(idA, idB);
        const victim = next[victimId];
        const port = targetPortOf(victim);

        if (conflict.axis === 'x') {
          const occupiedXs = collectOccupiedApproachXs(next, victimId);
          for (let d = VERTICAL_X_GAP; d <= 16 && !moved; d += 1) {
            for (const sign of [1, -1] as const) {
              const freeX = port.x + sign * d;
              if (!columnIsFree(freeX, occupiedXs)) continue;
              const trial = rerouteWithTargetDiagonalToColumn(victim, freeX);
              if (!conflictsAny(victimId, trial)) {
                next[victimId] = trial;
                moved = true;
                break;
              }
            }
          }
        } else {
          const occupiedYs = collectOccupiedBusYs(next, victimId);
          const busY = longestHorizontalY(victim);
          if (busY === null) continue;
          for (let d = 1; d <= 16 && !moved; d += 1) {
            for (const sign of [-1, 1] as const) {
              const freeY = busY + sign * d;
              if (!rowIsFree(freeY, occupiedYs)) continue;
              const trial = shiftBusYWithTargetDiagonal(victim, sign * d);
              if (!conflictsAny(victimId, trial)) {
                next[victimId] = trial;
                moved = true;
                break;
              }
            }
          }
        }
      }
    }
    if (!moved) break;
  }

  return next;
};

/**
 * Smallest |offset| clearing the band; prefers upward (negative) when tied.
 * Returns null when nothing within `limit` works.
 */
export const findBusYOffset = ({
  laneYs,
  x0,
  x1,
  occupied,
  limit = BUS_Y_OFFSET_LIMIT
}: {
  laneYs: number[];
  x0: number;
  x1: number;
  occupied: OccupiedHorizontal[];
  limit?: number;
}): number | null => {
  if (occupied.length === 0) return 0;
  for (let d = 0; d <= limit; d += 1) {
    const candidates = d === 0 ? [0] : [-d, d];
    for (const offset of candidates) {
      const shifted = laneYs.map((y) => {
        return y + offset;
      });
      if (
        !bandConflictsOccupied({
          laneYs: shifted,
          x0,
          x1,
          occupied
        })
      ) {
        return offset;
      }
    }
  }
  return null;
};

/** Keep searching upward past the nudge limit (for group-shift fallback). */
export const findUpwardClearOffset = ({
  laneYs,
  x0,
  x1,
  occupied,
  startAfter = BUS_Y_OFFSET_LIMIT,
  maxUp = 80
}: {
  laneYs: number[];
  x0: number;
  x1: number;
  occupied: OccupiedHorizontal[];
  startAfter?: number;
  maxUp?: number;
}): number | null => {
  for (let d = startAfter + 1; d <= maxUp; d += 1) {
    const offset = -d;
    const shifted = laneYs.map((y) => {
      return y + offset;
    });
    if (
      !bandConflictsOccupied({
        laneYs: shifted,
        x0,
        x1,
        occupied
      })
    ) {
      return offset;
    }
  }
  return null;
};

const footprintsOverlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean => {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
};

const itemFootprint = (
  item: ViewItem,
  iconById: Map<string, string | undefined>
): { x: number; y: number; w: number; h: number } => {
  const size = getShape2dSize(iconById.get(item.id) ?? '') ?? {
    width: 1,
    height: 1
  };
  return {
    x: item.tile.x,
    y: item.tile.y,
    w: size.width,
    h: size.height
  };
};

/**
 * Shift leaf members up by at least `dy` (negative) without overlapping
 * non-member footprints. Returns per-id tiles (only moved members).
 */
export const shiftGroupMembersUp = ({
  memberIds,
  dy,
  itemById,
  iconById
}: {
  memberIds: string[];
  dy: number;
  itemById: Map<string, ViewItem>;
  iconById: Map<string, string | undefined>;
}): Record<string, Coords> => {
  if (dy >= 0) return {};
  const memberSet = new Set(memberIds);
  const others = [...itemById.values()].filter((item) => {
    return !memberSet.has(item.id);
  });

  let shift = dy;
  for (let guard = 0; guard < 80; guard += 1) {
    const proposed = memberIds.map((id) => {
      const item = itemById.get(id);
      if (!item) return null;
      return {
        id,
        tile: { x: item.tile.x, y: item.tile.y + shift },
        fp: {
          ...itemFootprint(item, iconById),
          y: item.tile.y + shift
        }
      };
    });
    const valid = proposed.every(Boolean);
    const hits = valid
      ? proposed.some((entry) => {
          if (!entry) return false;
          return others.some((other) => {
            return footprintsOverlap(entry.fp, itemFootprint(other, iconById));
          });
        })
      : true;
    if (!hits) {
      const out: Record<string, Coords> = {};
      proposed.forEach((entry) => {
        if (!entry) return;
        out[entry.id] = entry.tile;
      });
      return out;
    }
    shift -= 1;
  }
  return {};
};

/** End of the port runway (rozbiegówka) along the jack's outward normal. */
export const portRunwayEnd = (
  portWorld: Coords,
  side: PortSide,
  runway = SWITCH_PORT_RUNWAY_TILES
): Coords => {
  const p = snapTile(portWorld);
  switch (side) {
    case 'TOP':
      return { x: p.x, y: p.y - runway };
    case 'LEFT':
      return { x: p.x - runway, y: p.y };
    case 'RIGHT':
      return { x: p.x + runway, y: p.y };
    case 'BOTTOM':
    default:
      return { x: p.x, y: p.y + runway };
  }
};

const portStub = (port: Coords, side: PortSide): Coords => {
  return portRunwayEnd(port, side, 1);
};

/** Keep a lane on the outward side of a TOP switch runway without collapsing the stack. */
const clampBusYToRunways = ({
  runY,
  switchExit,
  switchSide,
  stackIndex
}: {
  runY: number;
  switchExit: Coords;
  switchSide: PortSide;
  stackIndex: number;
}): number => {
  if (switchSide === 'TOP') {
    // Nest downward from the TOP approach — never flatten every lane onto switchExit.y.
    return Math.min(runY, switchExit.y + stackIndex);
  }
  return runY;
};

const itemCenter = (
  item: ViewItem,
  iconById: Map<string, string | undefined>
): Coords => {
  const size = getShape2dSize(iconById.get(item.id) ?? '') ?? {
    width: 1,
    height: 1
  };
  return {
    x: item.tile.x + size.width / 2,
    y: item.tile.y + size.height / 2
  };
};

/**
 * Prefer a side trunk when the target is diagonal — dropping through the
 * cluster (bottom trunk) forces upper-row cables across lower-row exits.
 */
export const pickTrunkSideToward = ({
  groupCenter,
  targetCenter
}: {
  groupCenter: Coords;
  targetCenter: Coords;
}): TrunkSide => {
  const dx = targetCenter.x - groupCenter.x;
  const dy = targetCenter.y - groupCenter.y;
  // Soft bias to the side: side wins unless the target is clearly more
  // vertical (≈2×) than horizontal.
  if (Math.abs(dx) * 2 >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
};

/** Slot sort so leaf placement matches horizontal-bus lanes (no exit crosses). */
export const compareSlotsTowardExit = (
  a: Coords,
  b: Coords,
  trunkSide: TrunkSide
): number => {
  if (trunkSide === 'right') {
    // Top row first (bus under top stubs); within a row, exit-near (right) first
    // so the lead cable turns onto the upper lane without crossing neighbours.
    if (a.y !== b.y) return a.y - b.y;
    return b.x - a.x;
  }
  if (trunkSide === 'left') {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  }
  if (trunkSide === 'bottom') {
    // Nearest the bottom trunk first, left→right.
    if (a.y !== b.y) return b.y - a.y;
    return a.x - b.x;
  }
  // top trunk
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
};

/** Approximate leaf jack position (bottom-centre) for length estimates. */
const slotExitPoint = (
  slot: Coords,
  size: { width: number; height: number }
): Coords => {
  return {
    x: slot.x + size.width / 2,
    y: slot.y + size.height - 1
  };
};

const manhattan = (a: Coords, b: Coords): number => {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
};

const collectCables = ({
  connectors,
  memberSet,
  itemById,
  iconById
}: {
  connectors: LayoutConnector[];
  memberSet: Set<string>;
  itemById: Map<string, ViewItem>;
  iconById: Map<string, string | undefined>;
}): BusCable[] => {
  const cables: BusCable[] = [];

  connectors.forEach((connector) => {
    const endpointAnchors = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (endpointAnchors.length < 2) return;

    const first = endpointAnchors[0];
    const last = endpointAnchors[endpointAnchors.length - 1];
    if (!first.ref.item || !last.ref.item) return;

    const firstIsSwitch = isSwitchLikeIcon(iconById.get(first.ref.item));
    const lastIsSwitch = isSwitchLikeIcon(iconById.get(last.ref.item));

    let switchAnchor = first;
    let leafAnchor = last;
    let leafFirst = false;

    if (firstIsSwitch !== lastIsSwitch) {
      switchAnchor = firstIsSwitch ? first : last;
      leafAnchor = firstIsSwitch ? last : first;
      leafFirst = !firstIsSwitch;
    } else {
      const aIn = memberSet.has(first.ref.item);
      const bIn = memberSet.has(last.ref.item);
      if (aIn === bIn) {
        if (!aIn) return;
        switchAnchor = last;
        leafAnchor = first;
        leafFirst = true;
      } else if (aIn) {
        leafAnchor = first;
        switchAnchor = last;
        leafFirst = true;
      } else {
        leafAnchor = last;
        switchAnchor = first;
        leafFirst = false;
      }
    }

    const leafId = leafAnchor.ref.item!;
    const switchId = switchAnchor.ref.item!;
    if (!memberSet.has(leafId)) return;

    const leafItem = itemById.get(leafId);
    const switchItem = itemById.get(switchId);
    if (!leafItem || !switchItem) return;

    const leafPort = getShape2dPorts(iconById.get(leafId) ?? '').find((p) => {
      return p.id === leafAnchor.ref.port;
    });
    const switchPort = getShape2dPorts(iconById.get(switchId) ?? '').find(
      (p) => {
        return p.id === switchAnchor.ref.port;
      }
    );
    if (!leafPort || !switchPort) return;

    cables.push({
      connectorId: connector.id,
      leafFirst,
      leafId,
      leafPortWorld: snapTile({
        x: leafItem.tile.x + leafPort.tile.x,
        y: leafItem.tile.y + leafPort.tile.y
      }),
      leafPortSide: leafPort.side,
      switchId,
      switchPortWorld: snapTile({
        x: switchItem.tile.x + switchPort.tile.x,
        y: switchItem.tile.y + switchPort.tile.y
      }),
      switchPortSide: switchPort.side
    });
  });

  return cables;
};

type LeafPortLink = {
  leafId: string;
  sizeKey: string;
  portKey: number;
  portWorld: Coords;
};

/**
 * Swap same-footprint leaves so wires need fewer crossings: place the
 * shortest cable first (closest port), then each next leaf in a slot above
 * the ones already placed ("nadbudowa"), breaking ties toward the exit.
 */
export const untangleGroupTowardExit = ({
  groupItems,
  allItems,
  modelItems,
  connectors,
  trunkSide
}: {
  groupItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: ModelItem[];
  connectors: LayoutConnector[];
  trunkSide: TrunkSide;
}): Record<string, Coords> => {
  if (groupItems.length < 2) return {};

  const memberSet = new Set(
    groupItems.map((item) => {
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

  const sizeOf = (id: string) => {
    return (
      getShape2dSize(iconById.get(id) ?? '') ?? { width: 1, height: 1 }
    );
  };

  const tiles = new Map<string, Coords>();
  groupItems.forEach((item) => {
    tiles.set(item.id, { ...item.tile });
  });

  const links: LeafPortLink[] = [];
  connectors.forEach((connector) => {
    const ends = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (ends.length < 2) return;
    const first = ends[0];
    const last = ends[ends.length - 1];
    if (!first.ref.item || !last.ref.item) return;

    const firstSwitch = isSwitchLikeIcon(iconById.get(first.ref.item));
    const lastSwitch = isSwitchLikeIcon(iconById.get(last.ref.item));
    if (firstSwitch === lastSwitch) return;

    const switchAnchor = firstSwitch ? first : last;
    const leafAnchor = firstSwitch ? last : first;
    const leafId = leafAnchor.ref.item!;
    const switchId = switchAnchor.ref.item!;
    if (!memberSet.has(leafId)) return;
    if (links.some((link) => link.leafId === leafId)) return;

    const switchItem = itemById.get(switchId);
    if (!switchItem) return;
    const port = getShape2dPorts(iconById.get(switchId) ?? '').find((p) => {
      return p.id === switchAnchor.ref.port;
    });
    if (!port) return;

    const size = sizeOf(leafId);
    const portWorld = snapTile({
      x: switchItem.tile.x + port.tile.x,
      y: switchItem.tile.y + port.tile.y
    });
    // Primary key: along the switch face (usually X for bottom ports).
    const portKey =
      port.side === 'LEFT' || port.side === 'RIGHT'
        ? portWorld.y
        : portWorld.x;

    links.push({
      leafId,
      sizeKey: `${size.width}x${size.height}`,
      portKey,
      portWorld
    });
  });

  const bySize = new Map<string, LeafPortLink[]>();
  links.forEach((link) => {
    const list = bySize.get(link.sizeKey) ?? [];
    list.push(link);
    bySize.set(link.sizeKey, list);
  });

  bySize.forEach((group) => {
    if (group.length < 2) return;

    const size = sizeOf(group[0].leafId);
    const freeSlots = group.map((link) => {
      return { ...tiles.get(link.leafId)! };
    });

    // Shortest potential cable first (best slot → port over all free slots).
    const remaining = [...group].sort((a, b) => {
      const minLen = (link: LeafPortLink) => {
        return Math.min(
          ...freeSlots.map((slot) => {
            return manhattan(slotExitPoint(slot, size), link.portWorld);
          })
        );
      };
      const d = minLen(a) - minLen(b);
      if (d !== 0) return d;
      if (a.portKey !== b.portKey) return a.portKey - b.portKey;
      return a.leafId.localeCompare(b.leafId);
    });

    const placedSlots: Coords[] = [];

    remaining.forEach((link) => {
      let bestIdx = 0;
      let bestScore = Number.POSITIVE_INFINITY;
      let bestSlot: Coords = freeSlots[0];

      freeSlots.forEach((slot, index) => {
        let score = manhattan(slotExitPoint(slot, size), link.portWorld);

        if (placedSlots.length > 0) {
          const topPlacedY = Math.min(
            ...placedSlots.map((placed) => {
              return placed.y;
            })
          );
          const bottomPlacedY = Math.max(
            ...placedSlots.map((placed) => {
              return placed.y;
            })
          );
          // "Nadbudowa": prefer a free slot above what is already placed.
          if (slot.y < topPlacedY) score -= 10_000;
          else if (slot.y > bottomPlacedY) score += 5_000;
        }

        const betterLength = score < bestScore - 1e-6;
        const tieBreak =
          Math.abs(score - bestScore) <= 1e-6 &&
          compareSlotsTowardExit(slot, bestSlot, trunkSide) < 0;

        if (betterLength || tieBreak) {
          bestScore = score;
          bestIdx = index;
          bestSlot = slot;
        }
      });

      const chosen = freeSlots[bestIdx];
      tiles.set(link.leafId, { ...chosen });
      placedSlots.push(chosen);
      freeSlots.splice(bestIdx, 1);
    });
  });

  const targets: Record<string, Coords> = {};
  groupItems.forEach((item) => {
    const next = tiles.get(item.id)!;
    if (next.x !== item.tile.x || next.y !== item.tile.y) {
      targets[item.id] = next;
    }
  });
  return targets;
};

const dominantSwitchForGroup = ({
  cables,
  itemById,
  iconById,
  group
}: {
  cables: BusCable[];
  itemById: Map<string, ViewItem>;
  iconById: Map<string, string | undefined>;
  group: DensityGroup;
}): { switchId: string; trunkSide: TrunkSide } | null => {
  if (cables.length === 0) return null;

  const counts = new Map<string, number>();
  cables.forEach((cable) => {
    counts.set(cable.switchId, (counts.get(cable.switchId) ?? 0) + 1);
  });
  let bestId = cables[0].switchId;
  let bestCount = 0;
  counts.forEach((count, id) => {
    if (count > bestCount) {
      bestCount = count;
      bestId = id;
    }
  });

  const switchItem = itemById.get(bestId);
  if (!switchItem) return null;

  const groupCenter = {
    x: group.bounds.x + group.bounds.w / 2,
    y: group.bounds.y + group.bounds.h / 2
  };
  const trunkSide = pickTrunkSideToward({
    groupCenter,
    targetCenter: itemCenter(switchItem, iconById)
  });
  return { switchId: bestId, trunkSide };
};

/**
 * Bundle exits the group on parallel horizontal lanes (one cable per Y — no
 * co-linear overlap). Upper stubs set the top of the band; lower leaves climb
 * into their lane, then drop at the port column.
 *
 * Stack: nearest switch port along bus travel is the BASE; farther ports stack
 * away from the switch. Travel right→switch ⇒ leftmost nearest; left→switch ⇒
 * rightmost nearest. Switch below ⇒ base at bottom of band; switch above ⇒
 * base at top of band (so the rise/drop never crosses longer horizontals).
 *
 * When `occupiedHorizontals` is set, the band is nudged (prefer up) so it does
 * not share Y with earlier groups in the same X span. Pass `busYOffset` to
 * force a known shift (e.g. after moving the leaf group).
 */
const routeBundleToSwitch = ({
  cables,
  group,
  switchItem,
  iconById,
  itemById,
  trunkSide,
  occupiedHorizontals = [],
  busYOffset: forcedOffset,
  exitStyle = 'orthogonal'
}: {
  cables: BusCable[];
  group: DensityGroup;
  switchItem: ViewItem;
  iconById: Map<string, string | undefined>;
  itemById: Map<string, ViewItem>;
  trunkSide: TrunkSide;
  occupiedHorizontals?: OccupiedHorizontal[];
  busYOffset?: number;
  exitStyle?: DensityBusExitStyle;
}): {
  routes: Record<string, Coords[]>;
  busYOffset: number | null;
  naturalLaneYs: number[];
  spanX0: number;
  spanX1: number;
} => {
  const empty = {
    routes: {} as Record<string, Coords[]>,
    busYOffset: 0 as number | null,
    naturalLaneYs: [] as number[],
    spanX0: 0,
    spanX1: 0
  };
  if (cables.length === 0) return empty;

  const groupCenter = {
    x: group.bounds.x + group.bounds.w / 2,
    y: group.bounds.y + group.bounds.h / 2
  };
  const targetCenter = itemCenter(switchItem, iconById);
  // Live member bbox (group.bounds may be stale after a vertical shift).
  const memberFps = group.memberIds
    .map((id) => {
      const item = itemById.get(id);
      return item ? itemFootprint(item, iconById) : null;
    })
    .filter((fp): fp is { x: number; y: number; w: number; h: number } => {
      return Boolean(fp);
    });
  const bbox =
    memberFps.length > 0
      ? {
          x: Math.min(...memberFps.map((fp) => fp.x)),
          y: Math.min(...memberFps.map((fp) => fp.y)),
          w:
            Math.max(...memberFps.map((fp) => fp.x + fp.w)) -
            Math.min(...memberFps.map((fp) => fp.x)),
          h:
            Math.max(...memberFps.map((fp) => fp.y + fp.h)) -
            Math.min(...memberFps.map((fp) => fp.y))
        }
      : group.bounds;

  if (trunkSide === 'right' || trunkSide === 'left') {
    const trunkRight = trunkSide === 'right';
    const towardY = Math.sign(targetCenter.y - groupCenter.y);

    const exits = cables.map((cable) => {
      const switchSize = getShape2dSize(iconById.get(switchItem.id) ?? '') ?? {
        width: 1,
        height: 1
      };
      return {
        cable,
        leafExit: portRunwayEnd(cable.leafPortWorld, cable.leafPortSide),
        switchExit: switchPortApproach({
          switchTile: switchItem.tile,
          switchSize,
          portWorld: cable.switchPortWorld,
          portSide: cable.switchPortSide,
          laneIndex: 0
        })
      };
    });

    const minLeafExitY = Math.min(
      ...exits.map(({ leafExit }) => {
        return leafExit.y;
      })
    );
    const bottomRunways = exits
      .filter(({ cable }) => {
        return cable.switchPortSide === 'BOTTOM';
      })
      .map(({ switchExit }) => {
        return switchExit.y;
      });
    const topRunways = exits
      .filter(({ cable }) => {
        return cable.switchPortSide === 'TOP';
      })
      .map(({ switchExit }) => {
        return switchExit.y;
      });

    const ordered = [...exits].sort((a, b) => {
      if (a.cable.switchPortWorld.x !== b.cable.switchPortWorld.x) {
        return a.cable.switchPortWorld.x - b.cable.switchPortWorld.x;
      }
      const ya = itemById.get(a.cable.leafId)?.tile.y ?? 0;
      const yb = itemById.get(b.cable.leafId)?.tile.y ?? 0;
      if (ya !== yb) return ya - yb;
      const xa = itemById.get(a.cable.leafId)?.tile.x ?? 0;
      const xb = itemById.get(b.cable.leafId)?.tile.x ?? 0;
      return trunkRight ? xb - xa : xa - xb;
    });

    const nearestIsLeftmost = trunkRight;
    const switchBelow = towardY >= 0;
    const laneCount = ordered.length;

    let busY: number;
    if (switchBelow) {
      busY = minLeafExitY + 1;
      if (bottomRunways.length > 0) {
        busY = Math.max(busY, Math.min(...bottomRunways));
      }
    } else {
      busY = minLeafExitY - laneCount;
      if (bottomRunways.length > 0) {
        busY = Math.min(busY, Math.min(...bottomRunways));
      }
      if (topRunways.length > 0) {
        busY = Math.min(busY, Math.min(...topRunways));
      }
      if (busY + laneCount - 1 >= minLeafExitY) {
        busY = minLeafExitY - laneCount;
      }
    }

    const naturalLaneYs = ordered.map(({ cable, switchExit }, laneIndex) => {
      const fromNearest = nearestIsLeftmost
        ? laneIndex
        : laneCount - 1 - laneIndex;
      const stackIndex = switchBelow
        ? laneCount - 1 - fromNearest
        : fromNearest;
      return clampBusYToRunways({
        runY: busY + stackIndex,
        switchExit,
        switchSide: cable.switchPortSide,
        stackIndex
      });
    });

    const xs = [
      ...ordered.map((e) => e.leafExit.x),
      ...ordered.map((e) => e.switchExit.x)
    ];
    const spanX0 = Math.min(...xs);
    const spanX1 = Math.max(...xs);

    const buildSideRoutes = (offset: number): Record<string, Coords[]> => {
      const built: Record<string, Coords[]> = {};
      const usedClimbXs = new Set<number>();

      ordered.forEach(({ cable, leafExit, switchExit }, laneIndex) => {
        const fromNearest = nearestIsLeftmost
          ? laneIndex
          : laneCount - 1 - laneIndex;
        const stackIndex = switchBelow
          ? laneCount - 1 - fromNearest
          : fromNearest;
        const runY =
          clampBusYToRunways({
            runY: busY + stackIndex,
            switchExit,
            switchSide: cable.switchPortSide,
            stackIndex
          }) + offset;

        if (exitStyle === 'oneBend') {
          const oneBend = buildOneBendTiles({
            leafExit,
            switchExit,
            runY,
            groupBbox: bbox,
            trunkRight
          });
          built[cable.connectorId] = cleanTiles(oneBend);
          return;
        }

        const tiles: Coords[] = [leafExit];

        if (leafExit.y !== runY) {
          let columnX = leafExit.x;
          if (leafExit.y > runY) {
            while (usedClimbXs.has(columnX)) {
              columnX += trunkRight ? 1 : -1;
            }
            usedClimbXs.add(columnX);
          }

          if (columnX !== leafExit.x) {
            const jogY = leafExit.y + 1 + fromNearest;
            tiles.push({ x: leafExit.x, y: jogY });
            tiles.push({ x: columnX, y: jogY });
            tiles.push({ x: columnX, y: runY });
          } else {
            tiles.push({ x: leafExit.x, y: runY });
          }
        }

        tiles.push({ x: switchExit.x, y: runY });
        tiles.push(switchExit);

        // Always leaf→switch so the Magistala overlap pass can trust path[end]=port.
        built[cable.connectorId] = cleanTiles(tiles);
      });
      return built;
    };

    const offsetIsClear = (offset: number): boolean => {
      if (
        bandConflictsOccupied({
          laneYs: naturalLaneYs.map((y) => y + offset),
          x0: spanX0,
          x1: spanX1,
          occupied: occupiedHorizontals
        })
      ) {
        return false;
      }
      return !horizontalsConflictOccupied({
        next: collectOccupiedHorizontals(buildSideRoutes(offset)),
        occupied: occupiedHorizontals
      });
    };

    let offset: number | null =
      forcedOffset !== undefined ? forcedOffset : null;
    if (offset === null) {
      for (let d = 0; d <= BUS_Y_OFFSET_LIMIT; d += 1) {
        const candidates = d === 0 ? [0] : [-d, d];
        for (const candidate of candidates) {
          if (offsetIsClear(candidate)) {
            offset = candidate;
            break;
          }
        }
        if (offset !== null) break;
      }
    } else if (
      occupiedHorizontals.length > 0 &&
      !offsetIsClear(offset)
    ) {
      // Forced offset still collides (e.g. after a group shift) — search again.
      offset = null;
      for (let d = 0; d <= BUS_Y_OFFSET_LIMIT; d += 1) {
        const candidates = d === 0 ? [0] : [-d, d];
        for (const candidate of candidates) {
          if (offsetIsClear(candidate)) {
            offset = candidate;
            break;
          }
        }
        if (offset !== null) break;
      }
    }

    if (offset === null) {
      return {
        routes: {},
        busYOffset: null,
        naturalLaneYs,
        spanX0,
        spanX1
      };
    }

    return {
      routes: buildSideRoutes(offset),
      busYOffset: offset,
      naturalLaneYs,
      spanX0,
      spanX1
    };
  }

  const trunkBelow = trunkSide === 'bottom';
  const towardX = Math.sign(targetCenter.x - groupCenter.x);
  const laneCount = cables.length;

  const leafExits = cables.map((cable) => {
    return portRunwayEnd(cable.leafPortWorld, cable.leafPortSide);
  });
  const minLeafExitY = Math.min(...leafExits.map((p) => p.y));
  const maxLeafExitY = Math.max(...leafExits.map((p) => p.y));

  const trunkBaseY = trunkBelow
    ? Math.max(bbox.y + bbox.h + 1, maxLeafExitY + 1)
    : Math.min(bbox.y - 2, minLeafExitY - laneCount);

  const ordered = [...cables].sort((a, b) => {
    const xa = itemById.get(a.leafId)?.tile.x ?? 0;
    const xb = itemById.get(b.leafId)?.tile.x ?? 0;
    if (xa !== xb) {
      if (towardX > 0) return xb - xa;
      if (towardX < 0) return xa - xb;
      return xa - xb;
    }
    const ya = itemById.get(a.leafId)?.tile.y ?? 0;
    const yb = itemById.get(b.leafId)?.tile.y ?? 0;
    return trunkBelow ? yb - ya : ya - yb;
  });

  const naturalLaneYs = ordered.map((_, laneIndex) => {
    return trunkBelow ? trunkBaseY + laneIndex : trunkBaseY - laneIndex;
  });

  const switchExits = ordered.map((cable) => {
    const switchSize = getShape2dSize(iconById.get(switchItem.id) ?? '') ?? {
      width: 1,
      height: 1
    };
    return switchPortApproach({
      switchTile: switchItem.tile,
      switchSize,
      portWorld: cable.switchPortWorld,
      portSide: cable.switchPortSide,
      laneIndex: 0
    });
  });
  const xs = [
    ...ordered.map((c) => portRunwayEnd(c.leafPortWorld, c.leafPortSide).x),
    ...switchExits.map((p) => p.x)
  ];
  const spanX0 = Math.min(...xs);
  const spanX1 = Math.max(...xs);

  const buildTopBottomRoutes = (offset: number): Record<string, Coords[]> => {
    const built: Record<string, Coords[]> = {};
    const usedColumns = new Set<number>();

    ordered.forEach((cable, laneIndex) => {
      const leafExit = portRunwayEnd(cable.leafPortWorld, cable.leafPortSide);
      const switchExit = switchExits[laneIndex];

      const laneY =
        (trunkBelow ? trunkBaseY + laneIndex : trunkBaseY - laneIndex) +
        offset;

      const needsSideDetour =
        trunkBelow &&
        leafExit.y < bbox.y + bbox.h - 1 &&
        Math.abs(leafExit.x - (towardX >= 0 ? bbox.x + bbox.w : bbox.x)) >
          bbox.w / 3;
      const sideX =
        towardX >= 0
          ? bbox.x + bbox.w + 1 + laneIndex
          : bbox.x - 2 - laneIndex;

      let columnX = needsSideDetour ? sideX : leafExit.x;
      while (usedColumns.has(columnX)) {
        columnX += towardX >= 0 ? 1 : -1;
      }
      usedColumns.add(columnX);

      if (exitStyle === 'oneBend') {
        const oneBend = buildOneBendTiles({
          leafExit,
          switchExit,
          runY: laneY,
          groupBbox: bbox,
          trunkRight: towardX >= 0
        });
        built[cable.connectorId] = cleanTiles(oneBend);
        return;
      }

      const tiles: Coords[] = [leafExit];
      if (columnX !== leafExit.x) {
        const jogY = leafExit.y + 1 + laneIndex;
        tiles.push({ x: leafExit.x, y: jogY });
        tiles.push({ x: columnX, y: jogY });
        tiles.push({ x: columnX, y: laneY });
      } else if (leafExit.y !== laneY) {
        tiles.push({ x: leafExit.x, y: laneY });
      }
      tiles.push({ x: switchExit.x, y: laneY });
      tiles.push(switchExit);

      built[cable.connectorId] = cleanTiles(tiles);
    });
    return built;
  };

  const offsetIsClearTopBottom = (offset: number): boolean => {
    if (
      bandConflictsOccupied({
        laneYs: naturalLaneYs.map((y) => y + offset),
        x0: spanX0,
        x1: spanX1,
        occupied: occupiedHorizontals
      })
    ) {
      return false;
    }
    return !horizontalsConflictOccupied({
      next: collectOccupiedHorizontals(buildTopBottomRoutes(offset)),
      occupied: occupiedHorizontals
    });
  };

  let offset: number | null =
    forcedOffset !== undefined ? forcedOffset : null;
  if (offset === null) {
    for (let d = 0; d <= BUS_Y_OFFSET_LIMIT; d += 1) {
      const candidates = d === 0 ? [0] : [-d, d];
      for (const candidate of candidates) {
        if (offsetIsClearTopBottom(candidate)) {
          offset = candidate;
          break;
        }
      }
      if (offset !== null) break;
    }
  } else if (
    occupiedHorizontals.length > 0 &&
    !offsetIsClearTopBottom(offset)
  ) {
    offset = null;
    for (let d = 0; d <= BUS_Y_OFFSET_LIMIT; d += 1) {
      const candidates = d === 0 ? [0] : [-d, d];
      for (const candidate of candidates) {
        if (offsetIsClearTopBottom(candidate)) {
          offset = candidate;
          break;
        }
      }
      if (offset !== null) break;
    }
  }

  if (offset === null) {
    return {
      routes: {},
      busYOffset: null,
      naturalLaneYs,
      spanX0,
      spanX1
    };
  }

  return {
    routes: buildTopBottomRoutes(offset),
    busYOffset: offset,
    naturalLaneYs,
    spanX0,
    spanX1
  };
};

/** Horizontal stub past the group before the oneBend diagonal to the switch. */
export const ONE_BEND_BUS_OFFSET_TILES = 3;

/**
 * Diagonalny: ortho onto the bus, short horizontal offset past the group,
 * then a single (possibly non-45°) diagonal into the switch port.
 */
const buildOneBendTiles = ({
  leafExit,
  switchExit,
  runY,
  groupBbox,
  trunkRight
}: {
  leafExit: Coords;
  switchExit: Coords;
  runY: number;
  groupBbox: { x: number; y: number; w: number; h: number };
  trunkRight: boolean;
}): Coords[] => {
  const tiles: Coords[] = [leafExit];
  const onBus = { x: leafExit.x, y: runY };
  if (leafExit.x !== onBus.x || leafExit.y !== onBus.y) {
    tiles.push(onBus);
  }

  const toward =
    Math.sign(switchExit.x - leafExit.x) || (trunkRight ? 1 : -1);
  const groupEdgeX =
    toward > 0 ? groupBbox.x + groupBbox.w : groupBbox.x - 1;
  let offsetX = groupEdgeX + toward * ONE_BEND_BUS_OFFSET_TILES;
  if (toward > 0) {
    offsetX = Math.min(offsetX, switchExit.x);
    offsetX = Math.max(offsetX, leafExit.x + 1);
  } else {
    offsetX = Math.max(offsetX, switchExit.x);
    offsetX = Math.min(offsetX, leafExit.x - 1);
  }

  const offsetPt = { x: offsetX, y: runY };
  const last = tiles[tiles.length - 1];
  if (last.x !== offsetPt.x || last.y !== offsetPt.y) {
    tiles.push(offsetPt);
  }
  if (offsetPt.x !== switchExit.x || offsetPt.y !== switchExit.y) {
    tiles.push(switchExit);
  }
  return tiles;
};

/**
 * For each density group: swap leaves so earlier switch ports sit on
 * top / exit-near slots (matches horizontal-bus lanes), then route.
 */
export const routeDensityGroupBuses = ({
  items,
  modelItems,
  connectors,
  exitStyle = 'orthogonal'
}: {
  items: ViewItem[];
  modelItems: ModelItem[];
  connectors: LayoutConnector[];
  exitStyle?: DensityBusExitStyle;
}): DensityGroupBusResult => {
  const groups = computeDensityGroups({ items, modelItems });
  const targets: Record<string, Coords> = {};

  const itemById0 = new Map(
    items.map((item) => {
      return [item.id, item] as const;
    })
  );
  const iconById = new Map(
    modelItems.map((item) => {
      return [item.id, item.icon] as const;
    })
  );

  // --- Phase 1: shortest-first leaf placement (stack each next above).
  groups.forEach((group) => {
    if (group.memberIds.length < 2) return;
    const memberSet = new Set(group.memberIds);
    const selectedItems = items.filter((item) => {
      return memberSet.has(item.id);
    });

    const previewCables = collectCables({
      connectors,
      memberSet,
      itemById: itemById0,
      iconById
    });
    const dominant = dominantSwitchForGroup({
      cables: previewCables,
      itemById: itemById0,
      iconById,
      group
    });
    if (!dominant) return;

    const swaps = untangleGroupTowardExit({
      groupItems: selectedItems,
      allItems: items,
      modelItems,
      connectors,
      trunkSide: dominant.trunkSide
    });
    Object.assign(targets, swaps);
  });

  const placedItems = items.map((item) => {
    const tile = targets[item.id];
    return tile ? { ...item, tile } : item;
  });

  // --- Phase 2: route buses on the untangled placement (top groups first).
  const routes: Record<string, Coords[]> = {};
  const occupiedHorizontals: OccupiedHorizontal[] = [];
  let workingItems = placedItems.map((item) => {
    return { ...item, tile: { ...item.tile } };
  });
  const itemById = new Map(
    workingItems.map((item) => {
      return [item.id, item] as const;
    })
  );

  const sortedGroups = [...groups].sort((a, b) => {
    if (a.bounds.y !== b.bounds.y) return a.bounds.y - b.bounds.y;
    return a.bounds.x - b.bounds.x;
  });

  sortedGroups.forEach((group) => {
    if (group.memberIds.length === 0) return;
    const memberSet = new Set(group.memberIds);

    const groupConnectors = connectors.filter((connector) => {
      return connector.anchors.some((anchor) => {
        return Boolean(anchor.ref.item && memberSet.has(anchor.ref.item));
      });
    });
    if (groupConnectors.length === 0) return;

    let cables = collectCables({
      connectors: groupConnectors,
      memberSet,
      itemById,
      iconById
    });
    if (cables.length === 0) return;

      const bySwitch = new Map<string, BusCable[]>();
    cables.forEach((cable) => {
      const list = bySwitch.get(cable.switchId) ?? [];
      list.push(cable);
      bySwitch.set(cable.switchId, list);
    });

    // Upper switches first so lower targets dodge already-claimed bus Ys
    // (same port index on stacked chassis → same relative Y otherwise).
    const switchBundles = [...bySwitch.entries()].sort((a, b) => {
      const ya = itemById.get(a[0])?.tile.y ?? 0;
      const yb = itemById.get(b[0])?.tile.y ?? 0;
      if (ya !== yb) return ya - yb;
      return (itemById.get(a[0])?.tile.x ?? 0) - (itemById.get(b[0])?.tile.x ?? 0);
    });

    switchBundles.forEach(([switchId, switchCables]) => {
      const switchItem = itemById.get(switchId);
      if (!switchItem) return;

      // Exclude the switch from leaf shifts even if it is somehow in the group.
      const leafMemberIds = group.memberIds.filter((id) => {
        return id !== switchId;
      });

      const groupCenter = {
        x: group.bounds.x + group.bounds.w / 2,
        y: group.bounds.y + group.bounds.h / 2
      };
      const trunkSide = pickTrunkSideToward({
        groupCenter,
        targetCenter: itemCenter(switchItem, iconById)
      });

      let bundle = routeBundleToSwitch({
        cables: switchCables,
        group,
        switchItem,
        iconById,
        itemById,
        trunkSide,
        occupiedHorizontals,
        exitStyle
      });

      // Prefer a large upward bus offset before moving the leaf group.
      if (bundle.busYOffset === null) {
        const clearUp = findUpwardClearOffset({
          laneYs: bundle.naturalLaneYs,
          x0: bundle.spanX0,
          x1: bundle.spanX1,
          occupied: occupiedHorizontals
        });
        if (clearUp !== null) {
          const nudged = routeBundleToSwitch({
            cables: switchCables,
            group,
            switchItem,
            iconById,
            itemById,
            trunkSide,
            occupiedHorizontals,
            busYOffset: clearUp,
            exitStyle
          });
          const nudgedHits =
            Object.keys(nudged.routes).length > 0 &&
            horizontalsConflictOccupied({
              next: collectOccupiedHorizontals(nudged.routes),
              occupied: occupiedHorizontals
            });
          if (Object.keys(nudged.routes).length > 0 && !nudgedHits) {
            bundle = nudged;
          }
        }

        if (bundle.busYOffset === null && clearUp !== null && leafMemberIds.length > 0) {
          const shifts = shiftGroupMembersUp({
            memberIds: leafMemberIds,
            dy: clearUp,
            itemById,
            iconById
          });
          Object.entries(shifts).forEach(([id, tile]) => {
            targets[id] = tile;
            const prev = itemById.get(id);
            if (!prev) return;
            const next = { ...prev, tile };
            itemById.set(id, next);
            workingItems = workingItems.map((item) => {
              return item.id === id ? next : item;
            });
          });

          cables = collectCables({
            connectors: groupConnectors,
            memberSet,
            itemById,
            iconById
          });
          const refreshed = cables.filter((cable) => {
            return cable.switchId === switchId;
          });
          if (refreshed.length > 0) {
            bundle = routeBundleToSwitch({
              cables: refreshed,
              group,
              switchItem,
              iconById,
              itemById,
              trunkSide,
              occupiedHorizontals,
              exitStyle
            });
          }
        }
      }

      if (Object.keys(bundle.routes).length === 0) return;

      Object.assign(routes, bundle.routes);
      occupiedHorizontals.push(
        ...collectOccupiedHorizontals(bundle.routes)
      );
    });
  });

  // Magistrala: clear remaining X/Y overlaps via short diagonal out of target ports.
  // Diagonalny (oneBend) already uses free-angle diagonals — leave as built.
  const resolved =
    exitStyle === 'orthogonal'
      ? resolveOverlapsWithTargetDiagonal(routes)
      : routes;

  return {
    routes: resolved,
    targets,
    groupCount: groups.length,
    cableCount: Object.keys(resolved).length,
    swappedNodes: Object.keys(targets).length
  };
};
