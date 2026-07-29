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

/** When true, cables are straight port↔port previews (no A* / mid waypoints). */
let simplePathsEnabled = false;

export const setSimplePathsEnabled = (enabled: boolean) => {
  simplePathsEnabled = enabled;
};

export const isSimplePathsEnabled = () => {
  return simplePathsEnabled;
};

export type RoutingStyle = 'ORTHOGONAL' | 'DIAGONAL' | 'STRAIGHT';

/** Active 2D routing style (synced from uiStateStore). */
let routingStyle: RoutingStyle = 'ORTHOGONAL';

export const setRoutingStyleEnabled = (style: RoutingStyle) => {
  routingStyle = style;
};

export const getRoutingStyle = (): RoutingStyle => {
  return routingStyle;
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
  const a = { x: Math.round(from.x), y: Math.round(from.y) };
  const b = { x: Math.round(to.x), y: Math.round(to.y) };

  if (a.x === b.x && a.y === b.y) {
    return [{ ...a }];
  }

  if (a.x === b.x) {
    const step = a.y <= b.y ? 1 : -1;
    const tiles: Coords[] = [];
    const maxSteps = Math.abs(b.y - a.y) + 2;
    for (let i = 0, y = a.y; i < maxSteps; i += 1, y += step) {
      tiles.push({ x: a.x, y });
      if (y === b.y) break;
    }
    return tiles;
  }

  if (a.y === b.y) {
    const step = a.x <= b.x ? 1 : -1;
    const tiles: Coords[] = [];
    const maxSteps = Math.abs(b.x - a.x) + 2;
    for (let i = 0, x = a.x; i < maxSteps; i += 1, x += step) {
      tiles.push({ x, y: a.y });
      if (x === b.x) break;
    }
    return tiles;
  }

  // Fallback L (should be rare when helpers are applied first)
  const bend = { x: a.x, y: b.y };
  return [
    ...axisAlignedLineTiles(a, bend),
    ...axisAlignedLineTiles(bend, b).slice(1)
  ];
};

/**
 * Ortho L that prefers a sideways run first whenever the target is not on the
 * same column — exit right/left at source Y, then vertical. Only when targets
 * share X do we dive vertically first.
 */
export const sideFirstOrthoTiles = (from: Coords, to: Coords): Coords[] => {
  const a = { x: Math.round(from.x), y: Math.round(from.y) };
  const b = { x: Math.round(to.x), y: Math.round(to.y) };

  if (a.x === b.x || a.y === b.y) {
    return axisAlignedLineTiles(a, b);
  }

  // Always sideways-first when there is any horizontal delta (user: "w prawo").
  const bend = { x: b.x, y: a.y };

  return [
    ...axisAlignedLineTiles(a, bend),
    ...axisAlignedLineTiles(bend, b).slice(1)
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

/**
 * Smooth 2D cable segment: true 45° diagonal while both axes need to move,
 * then a straight stub. Never builds an orthogonal "staircase" zigzag.
 * (Empty-grid A* used to produce sawtooth polylines through tile centres.)
 */
export const buildDiagonalAwareTiles = (from: Coords, to: Coords): Coords[] => {
  const a = { x: Math.round(from.x), y: Math.round(from.y) };
  const b = { x: Math.round(to.x), y: Math.round(to.y) };

  if (a.x === b.x || a.y === b.y) {
    return axisAlignedLineTiles(a, b);
  }

  const path: Coords[] = [{ ...a }];
  let cur = { ...a };
  const guardMax = Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + 4;
  let guard = 0;

  while (guard < guardMax && cur.x !== b.x && cur.y !== b.y) {
    guard += 1;
    cur = {
      x: cur.x + Math.sign(b.x - cur.x),
      y: cur.y + Math.sign(b.y - cur.y)
    };
    path.push({ ...cur });
  }

  while (guard < guardMax && cur.x !== b.x) {
    guard += 1;
    cur = { x: cur.x + Math.sign(b.x - cur.x), y: cur.y };
    path.push({ ...cur });
  }

  while (guard < guardMax && cur.y !== b.y) {
    guard += 1;
    cur = { x: cur.x, y: cur.y + Math.sign(b.y - cur.y) };
    path.push({ ...cur });
  }

  return path;
};

/**
 * Drop micro stair-step waypoints from algorithm output. Keeps major elbows
 * (legs of length ≥ 2). If the list is still noisy, keep only first + last.
 */
/** Prefer ~2–3 mid bends on algorithm paths (ends always kept). */
export const PREFERRED_PATH_BENDS = 3;

export const compactAlgorithmWaypoints = (tiles: Coords[]): Coords[] => {
  if (tiles.length <= 2) {
    return tiles.map((tile) => {
      return { ...tile };
    });
  }

  const rounded = tiles.map((tile) => {
    return { x: Math.round(tile.x), y: Math.round(tile.y) };
  });

  const major: Coords[] = [];
  for (let i = 0; i < rounded.length; i += 1) {
    const prev = i === 0 ? null : rounded[i - 1];
    const cur = rounded[i];
    const next = i === rounded.length - 1 ? null : rounded[i + 1];

    if (!prev || !next) {
      major.push({ ...cur });
      continue;
    }

    const inLen = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
    const outLen = Math.abs(next.x - cur.x) + Math.abs(next.y - cur.y);
    const inDx = Math.sign(cur.x - prev.x);
    const inDy = Math.sign(cur.y - prev.y);
    const outDx = Math.sign(next.x - cur.x);
    const outDy = Math.sign(next.y - cur.y);
    const isBend = inDx !== outDx || inDy !== outDy;

    // Skip 1-tile zig-zag elbows; keep real corridor bends.
    if (isBend && (inLen >= 2 || outLen >= 2)) {
      major.push({ ...cur });
    }
  }

  if (major.length <= 2) {
    return major;
  }

  const mids = major.slice(1, -1);
  if (mids.length <= PREFERRED_PATH_BENDS) {
    return major;
  }

  // Too many elbows — keep ends + evenly spaced preferred mid bends.
  const sampled: Coords[] = [];
  for (let i = 0; i < PREFERRED_PATH_BENDS; i += 1) {
    const idx = Math.round(
      ((i + 1) * (mids.length + 1)) / (PREFERRED_PATH_BENDS + 1) - 1
    );
    const clamped = Math.max(0, Math.min(mids.length - 1, idx));
    const tile = mids[clamped];
    if (
      !sampled.some((candidate) => {
        return candidate.x === tile.x && candidate.y === tile.y;
      })
    ) {
      sampled.push({ ...tile });
    }
  }

  return [major[0], ...sampled, major[major.length - 1]];
};

/**
 * Render-time cleanup: dense stair-step paths → smooth geometric line;
 * normal paths → corners only (SVG draws clean segments between elbows).
 * Non-H/V/45 chords between corners are expanded so the SVG never draws
 * a free-angle line.
 */
export const simplifyTilesForDraw = (tiles: Coords[]): Coords[] => {
  if (tiles.length < 3) {
    if (tiles.length < 2) return tiles;
    const a = tiles[0];
    const b = tiles[1];
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    if (dx === 0 || dy === 0 || dx === dy) return tiles;
    return buildDiagonalAwareTiles(a, b);
  }

  let turns = 0;
  for (let i = 1; i < tiles.length - 1; i += 1) {
    const prev = tiles[i - 1];
    const cur = tiles[i];
    const next = tiles[i + 1];
    const inDx = Math.sign(cur.x - prev.x);
    const inDy = Math.sign(cur.y - prev.y);
    const outDx = Math.sign(next.x - cur.x);
    const outDy = Math.sign(next.y - cur.y);
    if (inDx !== outDx || inDy !== outDy) {
      turns += 1;
    }
  }

  // Dense direction changes ⇒ sawtooth from old staircase fills.
  // Sparse elbows (user waypoints / algorithm L-U) stay intact.
  if (turns > 4 && turns >= (tiles.length - 2) * 0.35) {
    return buildDiagonalAwareTiles(tiles[0], tiles[tiles.length - 1]);
  }

  const corners: Coords[] = [{ ...tiles[0] }];
  for (let i = 1; i < tiles.length - 1; i += 1) {
    const prev = tiles[i - 1];
    const cur = tiles[i];
    const next = tiles[i + 1];
    const inDx = Math.sign(cur.x - prev.x);
    const inDy = Math.sign(cur.y - prev.y);
    const outDx = Math.sign(next.x - cur.x);
    const outDy = Math.sign(next.y - cur.y);
    if (inDx !== outDx || inDy !== outDy) {
      corners.push({ ...cur });
    }
  }
  corners.push({ ...tiles[tiles.length - 1] });

  // Expand any free-angle corner chord into 45°+stub (or H/V).
  let expanded: Coords[] = [];
  for (let i = 1; i < corners.length; i += 1) {
    const from = corners[i - 1];
    const to = corners[i];
    const dx = Math.abs(from.x - to.x);
    const dy = Math.abs(from.y - to.y);
    const segment =
      dx === 0 || dy === 0 || dx === dy
        ? [from, to]
        : buildDiagonalAwareTiles(from, to);
    expanded =
      expanded.length === 0 ? segment : [...expanded, ...segment.slice(1)];
  }

  // Re-corner the expanded polyline for a clean SVG.
  if (expanded.length < 3) return expanded;
  const out: Coords[] = [{ ...expanded[0] }];
  for (let i = 1; i < expanded.length - 1; i += 1) {
    const prev = expanded[i - 1];
    const cur = expanded[i];
    const next = expanded[i + 1];
    const inDx = Math.sign(cur.x - prev.x);
    const inDy = Math.sign(cur.y - prev.y);
    const outDx = Math.sign(next.x - cur.x);
    const outDy = Math.sign(next.y - cur.y);
    if (inDx !== outDx || inDy !== outDy) {
      out.push({ ...cur });
    }
  }
  out.push({ ...expanded[expanded.length - 1] });
  return out;
};
