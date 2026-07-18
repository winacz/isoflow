import {
  Coords,
  ConnectorAnchor,
  ConnectorPath,
  View
} from 'src/types';
import { CoordsUtils } from './CoordsUtils';
import { generateId } from './common';
import { connectorPathTileToGlobal, getAnchorTile, getConnectorPath } from './renderer';
import { computeOrthogonalHelpers, withOrthogonalPath } from './pathOptions';

type ModelItemRef = { id: string; icon?: string };

const MAX_RESOLVE_ITERS = 8;
const MAX_SNAP_RADIUS = 5;

export const edgeKey = (a: Coords, b: Coords): string => {
  if (a.x < b.x || (a.x === b.x && a.y <= b.y)) {
    return `${a.x},${a.y}|${b.x},${b.y}`;
  }

  return `${b.x},${b.y}|${a.x},${a.y}`;
};

export const pathEdges = (tiles: Coords[]): Set<string> => {
  const edges = new Set<string>();

  for (let i = 0; i < tiles.length - 1; i += 1) {
    if (CoordsUtils.isEqual(tiles[i], tiles[i + 1])) continue;
    edges.add(edgeKey(tiles[i], tiles[i + 1]));
  }

  return edges;
};

export const getConnectorGlobalPathTiles = (path: ConnectorPath): Coords[] => {
  return path.tiles.map((tile) => {
    return connectorPathTileToGlobal(tile, path.rectangle.from);
  });
};

export const hasEdgeOverlapWithOthers = (
  candidateTiles: Coords[],
  otherPaths: Coords[][]
): boolean => {
  return countEdgeOverlapsWithOthers(candidateTiles, otherPaths) > 0;
};

export const countEdgeOverlapsWithOthers = (
  candidateTiles: Coords[],
  otherPaths: Coords[][]
): number => {
  if (candidateTiles.length < 2 || otherPaths.length === 0) return 0;

  const otherEdges = new Set<string>();
  otherPaths.forEach((tiles) => {
    pathEdges(tiles).forEach((edge) => {
      otherEdges.add(edge);
    });
  });

  let count = 0;
  for (const edge of pathEdges(candidateTiles)) {
    if (otherEdges.has(edge)) count += 1;
  }

  return count;
};

type OverlapRun = {
  /** Inclusive tile index where overlapping edges start. */
  start: number;
  /** Inclusive tile index where overlapping edges end. */
  end: number;
};

/** Consecutive candidate edges that appear in any other path. */
export const findOverlapRuns = (
  candidateTiles: Coords[],
  otherPaths: Coords[][]
): OverlapRun[] => {
  if (candidateTiles.length < 2) return [];

  const otherEdges = new Set<string>();
  otherPaths.forEach((tiles) => {
    pathEdges(tiles).forEach((edge) => {
      otherEdges.add(edge);
    });
  });

  const hit: boolean[] = [];
  for (let i = 0; i < candidateTiles.length - 1; i += 1) {
    hit.push(
      otherEdges.has(edgeKey(candidateTiles[i], candidateTiles[i + 1]))
    );
  }

  const runs: OverlapRun[] = [];
  let runStart = -1;

  for (let i = 0; i < hit.length; i += 1) {
    if (hit[i] && runStart < 0) {
      runStart = i;
    }

    const atEnd = i === hit.length - 1;
    if (runStart >= 0 && (!hit[i] || atEnd)) {
      const lastEdge = hit[i] && atEnd ? i : i - 1;
      if (lastEdge >= runStart) {
        runs.push({ start: runStart, end: lastEdge + 1 });
      }
      runStart = -1;
    }
  }

  return runs;
};

const tileKey = (tile: Coords) => {
  return `${tile.x},${tile.y}`;
};

const pathIndexOf = (globalTiles: Coords[], tile: Coords) => {
  const exact = globalTiles.findIndex((pathTile) => {
    return CoordsUtils.isEqual(pathTile, tile);
  });
  if (exact !== -1) return exact;

  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  globalTiles.forEach((pathTile, index) => {
    const dist =
      Math.abs(pathTile.x - tile.x) + Math.abs(pathTile.y - tile.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  return best;
};

/** Keep first/last anchors; sort middle tile WPs along a reference path. */
const orderAnchorsAlongPath = (
  anchors: ConnectorAnchor[],
  path: ConnectorPath,
  view: View,
  modelItems?: ModelItemRef[]
): ConnectorAnchor[] => {
  if (anchors.length <= 2) return anchors;

  const global = getConnectorGlobalPathTiles(path);
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  const middle = anchors.slice(1, -1).sort((a, b) => {
    let ia = Math.floor(global.length / 2);
    let ib = Math.floor(global.length / 2);
    try {
      ia = pathIndexOf(global, getAnchorTile(a, view, modelItems));
    } catch {
      // keep midpoint
    }
    try {
      ib = pathIndexOf(global, getAnchorTile(b, view, modelItems));
    } catch {
      // keep midpoint
    }
    return ia - ib;
  });

  return [first, ...middle, last];
};

const bumpOffsetForRun = (
  tiles: Coords[],
  run: OverlapRun,
  magnitude: number,
  sign: number
): Coords => {
  const dx = Math.abs(tiles[run.end].x - tiles[run.start].x);
  const dy = Math.abs(tiles[run.end].y - tiles[run.start].y);

  if (dx >= dy) {
    return { x: 0, y: sign * magnitude };
  }

  return { x: sign * magnitude, y: 0 };
};

const applyBumpToAnchors = ({
  anchors,
  globalTiles,
  run,
  offset,
  view,
  modelItems
}: {
  anchors: ConnectorAnchor[];
  globalTiles: Coords[];
  run: OverlapRun;
  offset: Coords;
  view: View;
  modelItems?: ModelItemRef[];
}): ConnectorAnchor[] => {
  const runTileKeys = new Set<string>();
  for (let i = run.start; i <= run.end; i += 1) {
    runTileKeys.add(tileKey(globalTiles[i]));
  }

  let movedAny = false;
  const next = anchors.map((anchor) => {
    if (!anchor.ref.tile) return anchor;

    let tile: Coords;
    try {
      tile = getAnchorTile(anchor, view, modelItems);
    } catch {
      return anchor;
    }

    if (!runTileKeys.has(tileKey(tile))) return anchor;

    movedAny = true;
    return {
      ...anchor,
      ref: { tile: CoordsUtils.add(tile, offset) }
    };
  });

  if (movedAny) {
    return next;
  }

  const bumpedStart = CoordsUtils.add(globalTiles[run.start], offset);
  const bumpedEnd = CoordsUtils.add(globalTiles[run.end], offset);
  const newWps: ConnectorAnchor[] = [
    { id: generateId(), ref: { tile: { ...bumpedStart } } }
  ];

  if (!CoordsUtils.isEqual(bumpedStart, bumpedEnd)) {
    newWps.push({ id: generateId(), ref: { tile: { ...bumpedEnd } } });
  }

  if (anchors.length < 2) {
    return [...anchors, ...newWps];
  }

  const tentative = [
    anchors[0],
    ...anchors.slice(1, -1),
    ...newWps,
    anchors[anchors.length - 1]
  ];

  try {
    const path = getConnectorPath({
      anchors: tentative,
      view,
      modelItems
    });
    return orderAnchorsAlongPath(tentative, path, view, modelItems);
  } catch {
    return tentative;
  }
};

const buildPathTiles = (
  anchors: ConnectorAnchor[],
  view: View,
  modelItems?: ModelItemRef[]
): Coords[] | null => {
  try {
    const path = getConnectorPath({ anchors, view, modelItems });
    return getConnectorGlobalPathTiles(path);
  } catch {
    return null;
  }
};

/**
 * If this connector's path shares edges with others, nudge/insert tile WPs
 * on this connector only until clear (best-effort).
 */
export const resolveConnectorAnchorsAgainstOthers = ({
  anchors,
  view,
  modelItems,
  otherPaths
}: {
  anchors: ConnectorAnchor[];
  view: View;
  modelItems?: ModelItemRef[];
  otherPaths: Coords[][];
}): ConnectorAnchor[] => {
  if (otherPaths.length === 0 || anchors.length < 2) {
    return anchors;
  }

  let current = anchors;

  for (let iter = 0; iter < MAX_RESOLVE_ITERS; iter += 1) {
    const tiles = buildPathTiles(current, view, modelItems);
    if (!tiles || !hasEdgeOverlapWithOthers(tiles, otherPaths)) {
      return current;
    }

    const runs = findOverlapRuns(tiles, otherPaths);
    if (runs.length === 0) {
      return current;
    }

    const magnitude = Math.floor(iter / 2) + 1;
    const sign = iter % 2 === 0 ? 1 : -1;
    const run = runs[0];
    const offset = bumpOffsetForRun(tiles, run, magnitude, sign);

    current = applyBumpToAnchors({
      anchors: current,
      globalTiles: tiles,
      run,
      offset,
      view,
      modelItems
    });
  }

  return current;
};

export const anchorsPathOverlapsOthers = ({
  anchors,
  view,
  modelItems,
  otherPaths
}: {
  anchors: ConnectorAnchor[];
  view: View;
  modelItems?: ModelItemRef[];
  otherPaths: Coords[][];
}): boolean => {
  const tiles = buildPathTiles(anchors, view, modelItems);
  if (!tiles) return false;
  return hasEdgeOverlapWithOthers(tiles, otherPaths);
};

const spiralOffsets = (radius: number): Coords[] => {
  const offsets: Coords[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const chebyshev = Math.max(Math.abs(dx), Math.abs(dy));
      if (chebyshev !== radius) continue;
      offsets.push({ x: dx, y: dy });
    }
  }
  return offsets;
};

const offsetTileAnchors = (
  anchors: ConnectorAnchor[],
  anchorIds: Set<string>,
  offset: Coords
): ConnectorAnchor[] => {
  if (CoordsUtils.isEqual(offset, CoordsUtils.zero())) {
    return anchors;
  }

  return anchors.map((anchor) => {
    if (!anchorIds.has(anchor.id) || !anchor.ref.tile) {
      return anchor;
    }

    return {
      ...anchor,
      ref: {
        tile: CoordsUtils.add(anchor.ref.tile, offset)
      }
    };
  });
};

/**
 * Search near the desired anchors so tile WPs don't share edges with others.
 * Returns null if no legal snap within radius (caller should reject the move).
 */
export const snapConnectorAnchorsOffOverlap = ({
  anchors,
  moveAnchorIds,
  view,
  modelItems,
  otherPaths,
  maxRadius = MAX_SNAP_RADIUS
}: {
  anchors: ConnectorAnchor[];
  moveAnchorIds: string[];
  view: View;
  modelItems?: ModelItemRef[];
  otherPaths: Coords[][];
  maxRadius?: number;
}): ConnectorAnchor[] | null => {
  const presentMoveIds = moveAnchorIds.filter((id) => {
    return anchors.some((anchor) => {
      return anchor.id === id && Boolean(anchor.ref.tile);
    });
  });

  const tileWpIds = anchors
    .filter((anchor) => {
      return Boolean(anchor.ref.tile);
    })
    .map((anchor) => {
      return anchor.id;
    });

  const idSet = new Set(
    presentMoveIds.length > 0 ? presentMoveIds : tileWpIds
  );

  if (idSet.size === 0) {
    return anchorsPathOverlapsOthers({
      anchors,
      view,
      modelItems,
      otherPaths
    })
      ? null
      : anchors;
  }

  if (
    !anchorsPathOverlapsOthers({
      anchors,
      view,
      modelItems,
      otherPaths
    })
  ) {
    return anchors;
  }

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (const offset of spiralOffsets(radius)) {
      const candidate = offsetTileAnchors(anchors, idSet, offset);
      if (
        !anchorsPathOverlapsOthers({
          anchors: candidate,
          view,
          modelItems,
          otherPaths
        })
      ) {
        return candidate;
      }
    }
  }

  return null;
};

/** Collect global paths of other connectors from scene paths. */
export const collectOtherConnectorPaths = (
  sceneConnectors: Record<string, { path: ConnectorPath }>,
  excludeConnectorId: string
): Coords[][] => {
  return Object.entries(sceneConnectors)
    .filter(([id]) => {
      return id !== excludeConnectorId;
    })
    .map(([, connector]) => {
      return getConnectorGlobalPathTiles(connector.path);
    })
    .filter((tiles) => {
      return tiles.length >= 2;
    });
};

/** Orthogonal L/U elbows including collinear port↔port (U-bend via hint). */
const orthogonalHelpersForDetour = (
  from: Coords,
  to: Coords,
  hint: Coords
): Coords[] => {
  if (CoordsUtils.isEqual(from, to)) {
    return [];
  }

  if (from.y === to.y) {
    if (hint.y === from.y) {
      return [];
    }
    return [
      { x: from.x, y: hint.y },
      { x: to.x, y: hint.y }
    ];
  }

  if (from.x === to.x) {
    if (hint.x === from.x) {
      return [];
    }
    return [
      { x: hint.x, y: from.y },
      { x: hint.x, y: to.y }
    ];
  }

  return computeOrthogonalHelpers(from, to, hint);
};

const buildOrthogonalPathTiles = (
  anchors: ConnectorAnchor[],
  view: View,
  modelItems?: ModelItemRef[]
): Coords[] | null => {
  try {
    return withOrthogonalPath(() => {
      const path = getConnectorPath({
        anchors,
        view,
        modelItems,
        orthogonal: true
      });
      return getConnectorGlobalPathTiles(path);
    });
  } catch {
    return null;
  }
};

const detourHintCandidates = (
  from: Coords,
  to: Coords,
  removedTile?: Coords,
  laneIndex = 0
): Coords[] => {
  const mid = {
    x: Math.round((from.x + to.x) / 2),
    y: Math.round((from.y + to.y) / 2)
  };
  const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
  const hints: Coords[] = [];
  const seen = new Set<string>();

  const push = (hint: Coords) => {
    const key = `${hint.x},${hint.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    hints.push(hint);
  };

  // Stable per-cable lane so multi-sync from one node fans out
  const laneSign = laneIndex % 2 === 0 ? 1 : -1;
  const laneMag = Math.floor(laneIndex / 2) + 1;
  if (horizontal) {
    push({ x: mid.x, y: mid.y + laneSign * laneMag });
    push({ x: from.x, y: from.y + laneSign * laneMag });
    push({ x: to.x, y: to.y + laneSign * laneMag });
  } else {
    push({ x: mid.x + laneSign * laneMag, y: mid.y });
    push({ x: from.x + laneSign * laneMag, y: from.y });
    push({ x: to.x + laneSign * laneMag, y: to.y });
  }

  if (removedTile) {
    push(removedTile);
  }

  for (let mag = 1; mag <= 12; mag += 1) {
    if (horizontal) {
      const preferredSign =
        removedTile && removedTile.y !== mid.y
          ? removedTile.y > mid.y
            ? 1
            : -1
          : laneSign;
      push({ x: mid.x, y: mid.y + preferredSign * mag });
      push({ x: mid.x, y: mid.y - preferredSign * mag });
      push({ x: from.x, y: from.y + preferredSign * mag });
      push({ x: from.x, y: from.y - preferredSign * mag });
      push({ x: to.x, y: to.y + preferredSign * mag });
      push({ x: to.x, y: to.y - preferredSign * mag });
      if (removedTile) {
        push({ x: removedTile.x, y: removedTile.y + preferredSign * mag });
        push({ x: removedTile.x, y: removedTile.y - preferredSign * mag });
      }
    } else {
      const preferredSign =
        removedTile && removedTile.x !== mid.x
          ? removedTile.x > mid.x
            ? 1
            : -1
          : laneSign;
      push({ x: mid.x + preferredSign * mag, y: mid.y });
      push({ x: mid.x - preferredSign * mag, y: mid.y });
      push({ x: from.x + preferredSign * mag, y: from.y });
      push({ x: from.x - preferredSign * mag, y: from.y });
      push({ x: to.x + preferredSign * mag, y: to.y });
      push({ x: to.x - preferredSign * mag, y: to.y });
      if (removedTile) {
        push({ x: removedTile.x + preferredSign * mag, y: removedTile.y });
        push({ x: removedTile.x - preferredSign * mag, y: removedTile.y });
      }
    }
  }

  return hints;
};

type HelperPattern = Coords[];

/** L/U plus short exit stubs so stacked ports don't share a vertical trunk. */
const helperPatternsForHint = (
  from: Coords,
  to: Coords,
  hint: Coords
): HelperPattern[] => {
  const base = orthogonalHelpersForDetour(from, to, hint);
  const patterns: HelperPattern[] = [base];

  const stubDirs: Coords[] = [
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: -1, y: 0 }
  ];

  stubDirs.forEach((dir) => {
    const exit = { x: from.x + dir.x, y: from.y + dir.y };
    const entry = { x: to.x + dir.x, y: to.y + dir.y };
    const viaExit = orthogonalHelpersForDetour(exit, to, hint);
    patterns.push([exit, ...viaExit]);
    const viaBoth = orthogonalHelpersForDetour(exit, entry, hint);
    patterns.push([exit, ...viaBoth, entry]);
  });

  // Prefer hint depth as an early exit stub along the dominant axis
  if (from.y === to.y || Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)) {
    if (hint.y !== from.y) {
      patterns.push([
        { x: from.x, y: hint.y },
        { x: to.x, y: hint.y }
      ]);
    }
  } else if (hint.x !== from.x) {
    patterns.push([
      { x: hint.x, y: from.y },
      { x: hint.x, y: to.y }
    ]);
  }

  return patterns;
};

/**
 * Clean orthogonal L/U detour when path shares edges with others.
 * Prefers `removedTile` / `laneIndex` so multi-cable sync fans out.
 */
export const resolveOrthogonalDetourAfterWaypointRemoval = ({
  anchors,
  removedTile,
  view,
  modelItems,
  otherPaths,
  laneIndex = 0
}: {
  anchors: ConnectorAnchor[];
  removedTile?: Coords;
  view: View;
  modelItems?: ModelItemRef[];
  otherPaths: Coords[][];
  /** Stable fan-out index when syncing many cables after a node move. */
  laneIndex?: number;
}): ConnectorAnchor[] => {
  if (anchors.length < 2) {
    return anchors;
  }

  const currentTiles = buildOrthogonalPathTiles(anchors, view, modelItems);
  if (!currentTiles) {
    return anchors;
  }

  if (
    otherPaths.length === 0 ||
    !hasEdgeOverlapWithOthers(currentTiles, otherPaths)
  ) {
    return anchors;
  }

  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  let from: Coords;
  let to: Coords;

  try {
    from = getAnchorTile(first, view, modelItems);
    to = getAnchorTile(last, view, modelItems);
  } catch {
    return anchors;
  }

  const reusableIds = anchors
    .slice(1, -1)
    .filter((anchor) => {
      return Boolean(anchor.ref.tile);
    })
    .map((anchor) => {
      return anchor.id;
    });

  const makeCandidate = (helpers: Coords[]): ConnectorAnchor[] => {
    const middle: ConnectorAnchor[] = helpers.map((tile, index) => {
      return {
        id: reusableIds[index] ?? generateId(),
        ref: { tile: { ...tile } }
      };
    });
    return [first, ...middle, last];
  };

  let bestAnchors = anchors;
  let bestOverlap = countEdgeOverlapsWithOthers(currentTiles, otherPaths);

  for (const hint of detourHintCandidates(from, to, removedTile, laneIndex)) {
    for (const helpers of helperPatternsForHint(from, to, hint)) {
      const candidate = makeCandidate(helpers);
      const tiles = buildOrthogonalPathTiles(candidate, view, modelItems);
      if (!tiles) continue;

      const overlap = countEdgeOverlapsWithOthers(tiles, otherPaths);
      if (overlap === 0) {
        return candidate;
      }

      if (overlap < bestOverlap) {
        bestOverlap = overlap;
        bestAnchors = candidate;
      }
    }
  }

  return bestAnchors;
};
