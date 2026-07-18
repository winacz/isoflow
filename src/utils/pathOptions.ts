import type { Coords } from 'src/types';

/** Nested count so concurrent/re-entrant path builds stay orthogonal. */
let orthogonalPathDepth = 0;
let orthogonalHint: Coords | null = null;

export const withOrthogonalPath = <T>(fn: () => T, hint?: Coords | null): T => {
  orthogonalPathDepth += 1;
  const previousHint = orthogonalHint;
  if (hint) {
    orthogonalHint = hint;
  }

  try {
    return fn();
  } finally {
    orthogonalPathDepth -= 1;
    orthogonalHint = previousHint;
  }
};

export const isOrthogonalPathRequested = () => {
  return orthogonalPathDepth > 0;
};

export const getOrthogonalHint = () => {
  return orthogonalHint;
};

/** Lock a tile to horizontal or vertical movement from `origin`. */
export const axisLockTile = (tile: Coords, origin: Coords): Coords => {
  const dx = Math.abs(tile.x - origin.x);
  const dy = Math.abs(tile.y - origin.y);

  if (dx >= dy) {
    return { x: tile.x, y: origin.y };
  }

  return { x: origin.x, y: tile.y };
};

const manhattan = (a: Coords, b: Coords) => {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
};

/**
 * Up to two bend points for a clean orthogonal link (L or U), never a staircase.
 */
export const computeOrthogonalHelpers = (
  from: Coords,
  to: Coords,
  hint: Coords
): Coords[] => {
  if (from.x === to.x || from.y === to.y) {
    return [];
  }

  const cornerA = { x: from.x, y: to.y };
  const cornerB = { x: to.x, y: from.y };

  // Hint sits on an L corner → single elbow
  if (manhattan(hint, cornerA) <= 1) {
    return [cornerA];
  }
  if (manhattan(hint, cornerB) <= 1) {
    return [cornerB];
  }

  const dx = Math.abs(from.x - to.x);
  const dy = Math.abs(from.y - to.y);

  // Prefer a U (two elbows) along the longer span, depth from hint
  if (dx >= dy) {
    const y = hint.y;
    if (y === from.y && y === to.y) {
      return [cornerA];
    }
    return [
      { x: from.x, y },
      { x: to.x, y }
    ];
  }

  const x = hint.x;
  if (x === from.x && x === to.x) {
    return [cornerB];
  }
  return [
    { x, y: from.y },
    { x, y: to.y }
  ];
};

/** Axis-aligned tile strip from `from` to `to` (inclusive). */
export const axisAlignedLineTiles = (from: Coords, to: Coords): Coords[] => {
  if (from.x === to.x && from.y === to.y) {
    return [{ ...from }];
  }

  if (from.x === to.x) {
    const step = from.y <= to.y ? 1 : -1;
    const tiles: Coords[] = [];
    for (let y = from.y; y !== to.y + step; y += step) {
      tiles.push({ x: from.x, y });
    }
    return tiles;
  }

  if (from.y === to.y) {
    const step = from.x <= to.x ? 1 : -1;
    const tiles: Coords[] = [];
    for (let x = from.x; x !== to.x + step; x += step) {
      tiles.push({ x, y: from.y });
    }
    return tiles;
  }

  // Fallback L (should be rare when helpers are applied first)
  const bend = { x: from.x, y: to.y };
  return [
    ...axisAlignedLineTiles(from, bend),
    ...axisAlignedLineTiles(bend, to).slice(1)
  ];
};

/** Full orthogonal tile path using at most two elbows (L or U). */
export const buildOrthogonalTiles = (
  from: Coords,
  to: Coords,
  hint?: Coords | null
): Coords[] => {
  if (from.x === to.x || from.y === to.y) {
    return axisAlignedLineTiles(from, to);
  }

  const helpers = hint
    ? computeOrthogonalHelpers(from, to, hint)
    : [{ x: from.x, y: to.y }];

  const points = [from, ...helpers, to];
  let tiles: Coords[] = [];

  for (let i = 1; i < points.length; i += 1) {
    const segment = axisAlignedLineTiles(points[i - 1], points[i]);
    tiles = tiles.length === 0 ? segment : [...tiles, ...segment.slice(1)];
  }

  return tiles;
};
