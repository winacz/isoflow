import { Coords } from 'src/types';

/**
 * Shared grid-path primitives for the 2D cable algorithms.
 *
 * These used to live privately inside shape2dLayout.ts; they are hoisted here
 * so the Auto-Układ engine (src/utils/autoLayout) can reuse the exact same
 * geometry the legacy Smart Layout paths rely on. shape2dLayout re-exports
 * them, so existing call sites keep working unchanged.
 */

/** Drop consecutive duplicate tiles from a walked path. */
export const cleanRouteTiles = (tiles: Coords[]): Coords[] => {
  return tiles.filter((tile, index) => {
    if (index === 0) return true;
    const prev = tiles[index - 1];
    return prev.x !== tile.x || prev.y !== tile.y;
  });
};

/** Order-independent key for the grid edge between two adjacent tiles. */
export const edgeKey = (a: Coords, b: Coords) => {
  if (a.x < b.x || (a.x === b.x && a.y <= b.y)) {
    return `${a.x},${a.y}|${b.x},${b.y}`;
  }
  return `${b.x},${b.y}|${a.x},${a.y}`;
};

export const markPathEdges = (path: Coords[], used: Set<string>) => {
  for (let i = 1; i < path.length; i += 1) {
    used.add(edgeKey(path[i - 1], path[i]));
  }
};

export const pathUsesBusyEdge = (path: Coords[], used: Set<string>) => {
  for (let i = 1; i < path.length; i += 1) {
    if (used.has(edgeKey(path[i - 1], path[i]))) return true;
  }
  return false;
};

/**
 * Bend corners only (drop collinear mids) — used as connector waypoints.
 *
 * This is the contract the renderer depends on: getConnectorPath re-runs A* on
 * an EMPTY grid between consecutive anchors, so a waypoint at every direction
 * change is what makes the drawn path match the planned one.
 */
export const pathBendWaypoints = (path: Coords[]): Coords[] => {
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

/** Orthogonal L/U fill between two tiles (inclusive). */
export const orthoFill = (
  from: Coords,
  to: Coords,
  horizontalFirst: boolean
): Coords[] => {
  const start = { x: Math.round(from.x), y: Math.round(from.y) };
  const end = { x: Math.round(to.x), y: Math.round(to.y) };
  const tiles: Coords[] = [{ ...start }];
  let { x } = start;
  let { y } = start;
  let guard = 0;
  const maxSteps = 800;

  const runX = () => {
    while (guard < maxSteps && x !== end.x) {
      guard += 1;
      x += Math.sign(end.x - x);
      tiles.push({ x, y });
    }
  };
  const runY = () => {
    while (guard < maxSteps && y !== end.y) {
      guard += 1;
      y += Math.sign(end.y - y);
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

const cross = (ox: number, oy: number, ax: number, ay: number) => {
  return ox * ay - oy * ax;
};

/**
 * True when segment a1→a2 crosses b1→b2 transversally.
 *
 * Grid steps are unit-length (axis or diagonal), so the only cases that matter
 * are a proper interior intersection and the diagonal "X": two diagonals over
 * the same cell swapping corners, which never share a tile *or* an edge and is
 * therefore invisible to edgeKey — yet reads as a crossing on screen.
 *
 * Touching at a shared endpoint (cables fanning out of one port) is NOT a
 * crossing.
 */
export const segmentsCross = (
  a1: Coords,
  a2: Coords,
  b1: Coords,
  b2: Coords
): boolean => {
  const sharesEndpoint =
    (a1.x === b1.x && a1.y === b1.y) ||
    (a1.x === b2.x && a1.y === b2.y) ||
    (a2.x === b1.x && a2.y === b1.y) ||
    (a2.x === b2.x && a2.y === b2.y);
  if (sharesEndpoint) return false;

  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;

  const denom = cross(d1x, d1y, d2x, d2y);

  // Parallel (includes collinear overlap — that is an *overlap*, counted
  // separately by countEdgeOverlaps, not a crossing).
  if (denom === 0) return false;

  const t = cross(b1.x - a1.x, b1.y - a1.y, d2x, d2y) / denom;
  const u = cross(b1.x - a1.x, b1.y - a1.y, d1x, d1y) / denom;

  return t > 0 && t < 1 && u > 0 && u < 1;
};

/** First point, every direction change, last point — the drawn polyline. */
export const pathCorners = (path: Coords[]): Coords[] => {
  if (path.length < 3) {
    return path.map((tile) => {
      return { ...tile };
    });
  }
  return [
    { ...path[0] },
    ...pathBendWaypoints(path),
    { ...path[path.length - 1] }
  ];
};

/**
 * Number of transversal crossings between a set of paths.
 *
 * Each path is first reduced to its corner polyline. That reduction is
 * essential, not cosmetic: on a unit grid two dense tile-by-tile paths meet at
 * lattice points, which are segment *endpoints*, so a genuine crossing would
 * score 0. Measuring long corner-to-corner segments counts what is actually
 * drawn on screen.
 *
 * Segments of the same path are never compared, and shared endpoints do not
 * count — so a clean fan out of one switch port scores 0.
 */
export const countCrossings = (paths: Coords[][]): number => {
  const segments: { a: Coords; b: Coords; path: number }[] = [];

  paths.forEach((path, pathIndex) => {
    const corners = pathCorners(path);
    for (let i = 1; i < corners.length; i += 1) {
      segments.push({ a: corners[i - 1], b: corners[i], path: pathIndex });
    }
  });

  let count = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const differentCables = segments[i].path !== segments[j].path;
      if (
        differentCables &&
        segmentsCross(
          segments[i].a,
          segments[i].b,
          segments[j].a,
          segments[j].b
        )
      ) {
        count += 1;
      }
    }
  }

  return count;
};

/**
 * Number of grid edges carrying more than one cable — i.e. cables drawn
 * literally on top of each other. Each extra cable on an edge counts once.
 */
export const countEdgeOverlaps = (paths: Coords[][]): number => {
  const usage = new Map<string, number>();

  paths.forEach((path) => {
    // Same path crossing its own edge twice still only occupies it once.
    const own = new Set<string>();
    for (let i = 1; i < path.length; i += 1) {
      own.add(edgeKey(path[i - 1], path[i]));
    }
    own.forEach((key) => {
      usage.set(key, (usage.get(key) ?? 0) + 1);
    });
  });

  let overlaps = 0;
  usage.forEach((count) => {
    if (count > 1) overlaps += count - 1;
  });

  return overlaps;
};
