import { Size, Coords } from 'src/types';
import {
  buildDiagonalAwareTiles,
  buildOrthogonalTiles,
  getOrthogonalHint,
  getRoutingStyle,
  isOrthogonalPathRequested,
  type RoutingStyle
} from './pathOptions';

/** Soft cap — huge empty A* grids freeze the tab. */
const MAX_ASTAR_CELLS = 24_000;

/**
 * Extra g-cost for a tile already used by another cable.
 * High enough that A* prefers a parallel lane over stacking.
 */
export const CABLE_TILE_PENALTY = 80;

/** Soft buffer on orthogonal neighbours of a claimed cable tile. */
export const CABLE_NEIGHBOR_PENALTY = 10;

/** Hard obstacle cost for tiles under device bodies (ports stay clear). */
export const NODE_TILE_PENALTY = 1000;

/** Extra g-cost when the step changes direction (kills zigzags). */
export const BEND_PENALTY = 15;

/** Orthogonal stub length leaving / entering a port before free routing. */
export const FAN_OUT_LENGTH = 2;

/** Penalty for leaving a port upward (world −Y) during fan-out / early steps. */
const PORT_UP_PENALTY = 20;

export type FindPathArgs = {
  gridSize: Size;
  from: Coords;
  to: Coords;
  /** Legacy flag — forces ORTHOGONAL when true. */
  orthogonal?: boolean;
  /** Override UI routing style for this call. */
  routingStyle?: RoutingStyle;
  /**
   * Extra g-cost per tile. Keys are `${x},${y}` in the same coordinate space
   * as `from` / `to` (local segment space unless callers pass globals).
   */
  costMap?: Map<string, number>;
  /**
   * When true, fan-out and early steps prefer world-DOWN / LEFT / RIGHT.
   * Local grid uses origin−global, so world +Y ⇒ local −Y.
   */
  portExitPenalty?: boolean;
  /** Skip forced fan-out (internal / via segments). */
  skipFanOut?: boolean;
};

type NodeRec = {
  x: number;
  y: number;
  g: number;
  f: number;
  /** Incoming step direction (0,0 at start). */
  dirX: number;
  dirY: number;
};

const keyOf = (x: number, y: number) => `${x},${y}`;
const stateKey = (x: number, y: number, dirX: number, dirY: number) =>
  `${x},${y},${dirX},${dirY}`;

const ORTHO_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0]
];

const DIAG_DIRS: ReadonlyArray<readonly [number, number]> = [
  ...ORTHO_DIRS,
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1]
];

/**
 * Pick an orthogonal exit/entry direction in LOCAL segment space.
 * Prefers world-DOWN (local −Y), then toward the other endpoint on X, then up.
 */
export const pickOrthoFanDir = (
  from: Coords,
  toward: Coords,
  preferPortExit: boolean
): { dx: number; dy: number } => {
  const dx = Math.sign(toward.x - from.x);
  const dy = Math.sign(toward.y - from.y);

  if (preferPortExit) {
    // local −Y = world DOWN (RJ45 usually on the bottom edge)
    if (!(dy > 0 && Math.abs(toward.x - from.x) <= 1)) {
      return { dx: 0, dy: -1 };
    }
    if (dx !== 0) return { dx, dy: 0 };
    if (dy !== 0) return { dx: 0, dy };
    return { dx: 0, dy: -1 };
  }

  if (Math.abs(toward.x - from.x) >= Math.abs(toward.y - from.y)) {
    return { dx: dx || 1, dy: 0 };
  }
  return { dx: 0, dy: dy || -1 };
};

const walkOrtho = (
  start: Coords,
  dir: { dx: number; dy: number },
  length: number,
  bounds?: { width: number; height: number }
): Coords[] => {
  const tiles: Coords[] = [];
  let x = start.x;
  let y = start.y;
  for (let i = 0; i < length; i += 1) {
    x += dir.dx;
    y += dir.dy;
    if (bounds) {
      if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) {
        break;
      }
    }
    tiles.push({ x, y });
  }
  return tiles;
};

/**
 * STRAIGHT with forced fan-out:
 * port → stubOut → stubIn → port (straight between stubs).
 */
export const buildStraightFanPath = (
  from: Coords,
  to: Coords,
  preferPortExit = true
): Coords[] => {
  const a = { x: Math.round(from.x), y: Math.round(from.y) };
  const b = { x: Math.round(to.x), y: Math.round(to.y) };
  if (a.x === b.x && a.y === b.y) return [{ ...a }];

  const outDir = pickOrthoFanDir(a, b, preferPortExit);
  const inDir = pickOrthoFanDir(b, a, preferPortExit);

  const outWalk = walkOrtho(a, outDir, FAN_OUT_LENGTH);
  const inWalk = walkOrtho(b, inDir, FAN_OUT_LENGTH);

  const stubOut = outWalk[outWalk.length - 1] ?? { ...a };
  const stubIn = inWalk[inWalk.length - 1] ?? { ...b };

  const path: Coords[] = [{ ...a }];
  outWalk.forEach((tile) => {
    const prev = path[path.length - 1];
    if (prev.x !== tile.x || prev.y !== tile.y) path.push(tile);
  });
  if (stubOut.x !== stubIn.x || stubOut.y !== stubIn.y) {
    path.push({ ...stubIn });
  }
  // Walk back into the destination port (reverse of inWalk).
  for (let i = inWalk.length - 2; i >= 0; i -= 1) {
    const tile = inWalk[i];
    const prev = path[path.length - 1];
    if (prev.x !== tile.x || prev.y !== tile.y) path.push(tile);
  }
  const last = path[path.length - 1];
  if (last.x !== b.x || last.y !== b.y) path.push({ ...b });

  return path;
};

/**
 * Custom A* with cost map, bend penalty, 4/8-way movement, and RJ45 exit bias.
 *
 * Local segment coords: `local = origin − global`, so world DOWN (+Y) is local −Y.
 * State key includes direction so a bend-expensive arrival can lose to a
 * straighter path that reaches the same tile later.
 */
const findPathAStar = ({
  gridSize,
  from,
  to,
  routingStyle,
  costMap,
  portExitPenalty = false
}: {
  gridSize: Size;
  from: Coords;
  to: Coords;
  routingStyle: 'ORTHOGONAL' | 'DIAGONAL';
  costMap?: Map<string, number>;
  portExitPenalty?: boolean;
}): Coords[] | null => {
  const width = Math.max(1, Math.round(gridSize.width));
  const height = Math.max(1, Math.round(gridSize.height));

  if (width * height > MAX_ASTAR_CELLS) {
    return null;
  }

  const clampTile = (c: Coords): Coords => ({
    x: Math.max(0, Math.min(width - 1, Math.round(c.x))),
    y: Math.max(0, Math.min(height - 1, Math.round(c.y)))
  });

  const start = clampTile(from);
  const goal = clampTile(to);

  if (start.x === goal.x && start.y === goal.y) {
    return [{ ...start }];
  }

  const dirs = routingStyle === 'DIAGONAL' ? DIAG_DIRS : ORTHO_DIRS;
  const heuristic = (x: number, y: number) => {
    const dx = Math.abs(x - goal.x);
    const dy = Math.abs(y - goal.y);
    if (routingStyle === 'DIAGONAL') {
      const diag = Math.min(dx, dy);
      // Admissible with bend costs omitted (under-estimate is OK).
      return diag * Math.SQRT2 + (dx + dy - 2 * diag);
    }
    return dx + dy;
  };

  const open: NodeRec[] = [];
  const openIndex = new Map<string, number>();
  const closed = new Set<string>();
  const bestG = new Map<string, number>();
  const parent = new Map<
    string,
    { x: number; y: number; dirX: number; dirY: number }
  >();

  const pushOpen = (node: NodeRec) => {
    const k = stateKey(node.x, node.y, node.dirX, node.dirY);
    const existing = openIndex.get(k);
    if (existing !== undefined) {
      if (node.g >= open[existing].g) return;
      open[existing] = node;
      return;
    }
    openIndex.set(k, open.length);
    open.push(node);
  };

  const popOpen = (): NodeRec | null => {
    if (open.length === 0) return null;
    let bestI = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (open[i].f < open[bestI].f) bestI = i;
    }
    const node = open[bestI];
    const last = open.pop()!;
    openIndex.delete(stateKey(node.x, node.y, node.dirX, node.dirY));
    if (bestI < open.length) {
      open[bestI] = last;
      openIndex.set(stateKey(last.x, last.y, last.dirX, last.dirY), bestI);
    }
    return node;
  };

  const startNode: NodeRec = {
    x: start.x,
    y: start.y,
    g: 0,
    f: heuristic(start.x, start.y),
    dirX: 0,
    dirY: 0
  };
  pushOpen(startNode);
  bestG.set(stateKey(start.x, start.y, 0, 0), 0);

  while (open.length > 0) {
    const cur = popOpen();
    if (!cur) break;

    const ck = stateKey(cur.x, cur.y, cur.dirX, cur.dirY);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (cur.x === goal.x && cur.y === goal.y) {
      const path: Coords[] = [];
      let cx = cur.x;
      let cy = cur.y;
      let cdx = cur.dirX;
      let cdy = cur.dirY;
      let guard = width * height * 4 + 4;
      while (guard > 0) {
        guard -= 1;
        path.push({ x: cx, y: cy });
        if (cx === start.x && cy === start.y) break;
        const p = parent.get(stateKey(cx, cy, cdx, cdy));
        if (!p) break;
        cx = p.x;
        cy = p.y;
        cdx = p.dirX;
        cdy = p.dirY;
      }
      path.reverse();
      if (path.length === 0 || path[0].x !== start.x || path[0].y !== start.y) {
        path.unshift({ ...start });
      }
      const end = path[path.length - 1];
      if (end.x !== goal.x || end.y !== goal.y) {
        path.push({ ...goal });
      }
      return path;
    }

    const fromStart =
      Math.abs(cur.x - start.x) + Math.abs(cur.y - start.y);

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

      const nk = stateKey(nx, ny, dx, dy);
      if (closed.has(nk)) continue;

      const stepCost = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
      let extra = costMap?.get(keyOf(nx, ny)) ?? 0;

      // Bend penalty — prefer long straight runs.
      const hasPrevDir = cur.dirX !== 0 || cur.dirY !== 0;
      if (hasPrevDir && (cur.dirX !== dx || cur.dirY !== dy)) {
        extra += BEND_PENALTY;
      }

      // Port exit bias in local space (world DOWN = local −Y).
      if (portExitPenalty && fromStart <= FAN_OUT_LENGTH + 1) {
        if (dy === 1 && dx === 0) {
          extra += PORT_UP_PENALTY;
        } else if (dy === 1) {
          extra += PORT_UP_PENALTY * 0.6;
        }
      }

      const g = cur.g + stepCost + extra;
      const prevG = bestG.get(nk);
      if (prevG !== undefined && g >= prevG - 1e-9) continue;

      bestG.set(nk, g);
      parent.set(nk, {
        x: cur.x,
        y: cur.y,
        dirX: cur.dirX,
        dirY: cur.dirY
      });
      pushOpen({
        x: nx,
        y: ny,
        g,
        f: g + heuristic(nx, ny),
        dirX: dx,
        dirY: dy
      });
    }
  }

  return null;
};

const dedupeConsecutive = (tiles: Coords[]): Coords[] => {
  return tiles.filter((tile, index) => {
    if (index === 0) return true;
    const prev = tiles[index - 1];
    return prev.x !== tile.x || prev.y !== tile.y;
  });
};

/**
 * Tile path between two points.
 *
 * - STRAIGHT → fan-out stubs + straight between them (4+ points)
 * - ORTHOGONAL / DIAGONAL → fan-out, then A* between stubs (bend + cost map);
 *   falls back to geometric fills if the grid is too large / A* fails.
 */
export const findPath = ({
  from,
  to,
  orthogonal = false,
  routingStyle: styleOverride,
  costMap,
  portExitPenalty = false,
  skipFanOut = false,
  gridSize
}: FindPathArgs): Coords[] => {
  const fromTile = {
    x: Math.round(from.x),
    y: Math.round(from.y)
  };
  const toTile = {
    x: Math.round(to.x),
    y: Math.round(to.y)
  };

  const forceOrtho = orthogonal || isOrthogonalPathRequested();
  const style: RoutingStyle = forceOrtho
    ? 'ORTHOGONAL'
    : styleOverride ?? getRoutingStyle();

  if (fromTile.x === toTile.x && fromTile.y === toTile.y) {
    return [{ ...fromTile }];
  }

  if (style === 'STRAIGHT') {
    return buildStraightFanPath(fromTile, toTile, true);
  }

  const width = Math.max(1, Math.round(gridSize.width));
  const height = Math.max(1, Math.round(gridSize.height));
  const bounds = { width, height };

  let routeFrom = fromTile;
  let routeTo = toTile;
  let prefix: Coords[] = [];
  let suffix: Coords[] = [];

  if (!skipFanOut) {
    const outDir = pickOrthoFanDir(fromTile, toTile, portExitPenalty || true);
    const inDir = pickOrthoFanDir(toTile, fromTile, portExitPenalty || true);

    const outWalk = walkOrtho(fromTile, outDir, FAN_OUT_LENGTH, bounds);
    const inWalk = walkOrtho(toTile, inDir, FAN_OUT_LENGTH, bounds);

    if (outWalk.length > 0) {
      prefix = [{ ...fromTile }, ...outWalk];
      routeFrom = outWalk[outWalk.length - 1];
    }
    if (inWalk.length > 0) {
      routeTo = inWalk[inWalk.length - 1];
      // suffix walks from stub back to port
      suffix = [...inWalk].reverse();
      // reverse is stub..nearPort; append port
      suffix.push({ ...toTile });
      // drop stub duplicate — middle A* ends on routeTo/stub
      suffix = suffix.slice(1);
    }
  }

  const astar = findPathAStar({
    gridSize,
    from: routeFrom,
    to: routeTo,
    routingStyle: style === 'DIAGONAL' ? 'DIAGONAL' : 'ORTHOGONAL',
    costMap,
    portExitPenalty
  });

  if (astar && astar.length > 0) {
    return dedupeConsecutive([...prefix, ...astar, ...suffix]);
  }

  // Geometric fallback between stubs.
  const mid =
    style === 'ORTHOGONAL' || forceOrtho
      ? buildOrthogonalTiles(routeFrom, routeTo, getOrthogonalHint())
      : buildDiagonalAwareTiles(routeFrom, routeTo);

  return dedupeConsecutive([...prefix, ...mid, ...suffix]);
};
