import type { Coords, ConnectorAnchor, View } from 'src/types';
import { CoordsUtils } from './CoordsUtils';
import { getAnchorTile, getConnectorPath } from './renderer';
import { getConnectorGlobalPathTiles } from './connectorOverlap';

/** How far (tiles) a neighbor cable may be in X/Y to share a guide. */
export const ELBOW_GUIDE_NEAR_RANGE = 14;

/** Min / max stub length when forcing an aligned elbow. */
const STUB_MIN = 1;
const STUB_MAX = 10;

type StubGuides = {
  /** Y of first vertical stubs on nearby cables. */
  verticalStubYs: number[];
  /** X of first horizontal stubs on nearby cables. */
  horizontalStubXs: number[];
};

const step = (from: Coords, to: Coords): Coords => {
  return {
    x: Math.sign(to.x - from.x),
    y: Math.sign(to.y - from.y)
  };
};

/** Tiles where the path changes direction (elbows). */
export const extractPathCorners = (tiles: Coords[]): Coords[] => {
  if (tiles.length < 3) return [];

  const corners: Coords[] = [];

  for (let i = 1; i < tiles.length - 1; i += 1) {
    const prev = step(tiles[i - 1], tiles[i]);
    const next = step(tiles[i], tiles[i + 1]);
    if (prev.x !== next.x || prev.y !== next.y) {
      corners.push({ ...tiles[i] });
    }
  }

  return corners;
};

const pushUnique = (list: number[], value: number) => {
  if (!list.includes(value)) {
    list.push(value);
  }
};

/**
 * First exit stub of a path: vertical (same X as start → corner Y) or
 * horizontal (same Y as start → corner X).
 */
const firstStubOfPath = (
  tiles: Coords[]
): { kind: 'vertical'; y: number; x: number } | { kind: 'horizontal'; x: number; y: number } | null => {
  if (tiles.length < 2) return null;

  const start = tiles[0];
  const corners = extractPathCorners(tiles);

  if (corners.length > 0) {
    const corner = corners[0];
    if (corner.x === start.x && corner.y !== start.y) {
      return { kind: 'vertical', x: start.x, y: corner.y };
    }
    if (corner.y === start.y && corner.x !== start.x) {
      return { kind: 'horizontal', x: corner.x, y: start.y };
    }
  }

  // No clear corner yet — look at the first axis-aligned run from start
  let i = 1;
  while (i < tiles.length && tiles[i].x === start.x) {
    i += 1;
  }
  if (i > 1 && i < tiles.length) {
    return { kind: 'vertical', x: start.x, y: tiles[i - 1].y };
  }

  i = 1;
  while (i < tiles.length && tiles[i].y === start.y) {
    i += 1;
  }
  if (i > 1 && i < tiles.length) {
    return { kind: 'horizontal', x: tiles[i - 1].x, y: start.y };
  }

  return null;
};

/** Collect first-exit stub guides from neighboring cables. */
export const collectStubGuides = (
  otherPaths: Coords[][],
  near: Coords
): StubGuides => {
  const verticalStubYs: number[] = [];
  const horizontalStubXs: number[] = [];

  otherPaths.forEach((tiles) => {
    if (tiles.length < 2) return;

    // Stub at path start
    const startStub = firstStubOfPath(tiles);
    if (startStub?.kind === 'vertical') {
      if (Math.abs(startStub.x - near.x) <= ELBOW_GUIDE_NEAR_RANGE) {
        pushUnique(verticalStubYs, startStub.y);
      }
    } else if (startStub?.kind === 'horizontal') {
      if (Math.abs(startStub.y - near.y) <= ELBOW_GUIDE_NEAR_RANGE) {
        pushUnique(horizontalStubXs, startStub.x);
      }
    }

    // Stub at path end (cables often leave the other device similarly)
    const reversed = [...tiles].reverse();
    const endStub = firstStubOfPath(reversed);
    if (endStub?.kind === 'vertical') {
      if (Math.abs(endStub.x - near.x) <= ELBOW_GUIDE_NEAR_RANGE) {
        pushUnique(verticalStubYs, endStub.y);
      }
    } else if (endStub?.kind === 'horizontal') {
      if (Math.abs(endStub.y - near.y) <= ELBOW_GUIDE_NEAR_RANGE) {
        pushUnique(horizontalStubXs, endStub.x);
      }
    }
  });

  return { verticalStubYs, horizontalStubXs };
};

const pickGuideOnExit = (
  from: number,
  exitDir: number,
  guides: number[]
): number | null => {
  if (exitDir === 0 || guides.length === 0) return null;

  const candidates = guides.filter((guide) => {
    const delta = guide - from;
    const dist = Math.abs(delta);
    return Math.sign(delta) === exitDir && dist >= STUB_MIN && dist <= STUB_MAX;
  });

  if (candidates.length === 0) return null;

  // Prefer the guide closest to the port (shared short tray), stable sort
  candidates.sort((a, b) => {
    return Math.abs(a - from) - Math.abs(b - from);
  });

  return candidates[0];
};

const inferExitDirY = (from: Coords, to: Coords, pathTiles: Coords[]): number => {
  if (pathTiles.length >= 2) {
    const dy = pathTiles[1].y - from.y;
    if (dy !== 0) return Math.sign(dy);
  }
  const dy = to.y - from.y;
  if (dy !== 0) return Math.sign(dy);
  // Default downward (typical bottom-port exit on the plan)
  return 1;
};

const inferExitDirX = (from: Coords, to: Coords, pathTiles: Coords[]): number => {
  if (pathTiles.length >= 2) {
    const dx = pathTiles[1].x - from.x;
    if (dx !== 0) return Math.sign(dx);
  }
  const dx = to.x - from.x;
  return dx !== 0 ? Math.sign(dx) : 0;
};

/**
 * Force a first elbow onto a neighbor stub guide — even when A* wants to
 * leave the port diagonally (no natural vertical stub).
 */
export const pickSnappedElbowVia = ({
  from,
  to,
  pathTiles,
  otherPaths
}: {
  from: Coords;
  to: Coords;
  pathTiles: Coords[];
  otherPaths: Coords[][];
}): Coords | null => {
  if (pathTiles.length < 2 || otherPaths.length === 0) return null;

  const guides = collectStubGuides(otherPaths, from);
  const exitY = inferExitDirY(from, to, pathTiles);
  const exitX = inferExitDirX(from, to, pathTiles);

  // Prefer vertical stub alignment when neighbors expose vertical stubs,
  // or when the cable mostly travels downward/upward.
  const preferVertical =
    guides.verticalStubYs.length > 0 &&
    (Math.abs(to.y - from.y) >= Math.abs(to.x - from.x) ||
      exitY !== 0 ||
      guides.horizontalStubXs.length === 0);

  if (preferVertical) {
    const snapY = pickGuideOnExit(from.y, exitY, guides.verticalStubYs);
    if (snapY !== null && snapY !== to.y) {
      return { x: from.x, y: snapY };
    }
  }

  if (guides.horizontalStubXs.length > 0 && exitX !== 0) {
    const snapX = pickGuideOnExit(from.x, exitX, guides.horizontalStubXs);
    if (snapX !== null && snapX !== to.x) {
      return { x: snapX, y: from.y };
    }
  }

  // Fallback: still try vertical guides even if destination is mostly sideways
  if (!preferVertical && guides.verticalStubYs.length > 0) {
    const snapY = pickGuideOnExit(from.y, exitY, guides.verticalStubYs);
    if (snapY !== null && snapY !== to.y) {
      return { x: from.x, y: snapY };
    }
  }

  return null;
};

/**
 * For plain port↔port cables (2 anchors), rebuild the path through a snapped
 * elbow so nearby bends share the same Y/X guide.
 */
export const snapConnectorPathToElbowGuides = ({
  anchors,
  path,
  view,
  modelItems,
  otherPaths,
  orthogonal = false
}: {
  anchors: ConnectorAnchor[];
  path: ReturnType<typeof getConnectorPath>;
  view: View;
  modelItems?: { id: string; icon?: string }[];
  otherPaths: Coords[][];
  orthogonal?: boolean;
}): ReturnType<typeof getConnectorPath> => {
  if (anchors.length !== 2 || otherPaths.length === 0) {
    return path;
  }

  const from = getAnchorTile(anchors[0], view, modelItems);
  const to = getAnchorTile(anchors[1], view, modelItems);
  const globalTiles = getConnectorGlobalPathTiles(path);

  const viaFromStart = pickSnappedElbowVia({
    from,
    to,
    pathTiles: globalTiles,
    otherPaths
  });

  const reversed = [...globalTiles].reverse();
  const viaFromEnd = pickSnappedElbowVia({
    from: to,
    to: from,
    pathTiles: reversed,
    otherPaths
  });

  if (!viaFromStart && !viaFromEnd) {
    return path;
  }

  const midAnchors: ConnectorAnchor[] = [];
  if (viaFromStart && !CoordsUtils.isEqual(viaFromStart, from)) {
    midAnchors.push({
      id: '__elbow_snap_start__',
      ref: { tile: viaFromStart }
    });
  }
  if (
    viaFromEnd &&
    !CoordsUtils.isEqual(viaFromEnd, to) &&
    !(viaFromStart && CoordsUtils.isEqual(viaFromStart, viaFromEnd))
  ) {
    midAnchors.push({
      id: '__elbow_snap_end__',
      ref: { tile: viaFromEnd }
    });
  }

  if (midAnchors.length === 0) {
    return path;
  }

  try {
    return getConnectorPath({
      anchors: [anchors[0], ...midAnchors, anchors[1]],
      view,
      modelItems,
      orthogonal
    });
  } catch {
    return path;
  }
};
