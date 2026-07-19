import type { Coords, ConnectorAnchor } from 'src/types';
import { getAnchorTile } from './renderer';

export const WAYPOINT_GUIDE_SNAP_DISTANCE = 1;

export type WaypointGuide = {
  axis: 'x' | 'y';
  /** Constant coordinate on that axis. */
  value: number;
  /** How many tile waypoints currently sit on this guide. */
  count: number;
};

export type TileWaypointRef = {
  anchorId: string;
  connectorId: string;
  tile: Coords;
};

/** All tile waypoints across connectors (port anchors ignored). */
export const collectTileWaypoints = (
  connectors: { id: string; anchors: ConnectorAnchor[] }[],
  view: Parameters<typeof getAnchorTile>[1],
  modelItems?: Parameters<typeof getAnchorTile>[2]
): TileWaypointRef[] => {
  const result: TileWaypointRef[] = [];

  connectors.forEach((connector) => {
    connector.anchors.forEach((anchor) => {
      if (!anchor.ref.tile) return;
      const tile = getAnchorTile(anchor, view, modelItems);
      result.push({
        anchorId: anchor.id,
        connectorId: connector.id,
        tile: { ...tile }
      });
    });
  });

  return result;
};

const countByAxis = (
  waypoints: TileWaypointRef[],
  axis: 'x' | 'y',
  excludeAnchorIds?: ReadonlySet<string>
) => {
  const counts = new Map<number, number>();

  waypoints.forEach((wp) => {
    if (excludeAnchorIds?.has(wp.anchorId)) return;
    const value = axis === 'x' ? wp.tile.x : wp.tile.y;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return counts;
};

/**
 * Guides where more than one waypoint shares the same X or Y.
 * Optionally ignore dragged anchors so the guide stays from the others,
 * then merge counts with live positions of excluded WPs for display.
 */
export const buildWaypointGuides = (
  waypoints: TileWaypointRef[],
  options?: {
    /** Anchors currently being dragged — still count at `liveTiles` if provided. */
    excludeAnchorIds?: ReadonlySet<string>;
    liveTiles?: Record<string, Coords>;
  }
): WaypointGuide[] => {
  const live = options?.liveTiles ?? {};
  const exclude = options?.excludeAnchorIds;

  const effective: TileWaypointRef[] = waypoints.map((wp) => {
    if (exclude?.has(wp.anchorId) && live[wp.anchorId]) {
      return { ...wp, tile: { ...live[wp.anchorId] } };
    }
    return wp;
  });

  const guides: WaypointGuide[] = [];

  (['x', 'y'] as const).forEach((axis) => {
    const counts = new Map<number, number>();
    effective.forEach((wp) => {
      const value = axis === 'x' ? wp.tile.x : wp.tile.y;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });

    counts.forEach((count, value) => {
      if (count > 1) {
        guides.push({ axis, value, count });
      }
    });
  });

  return guides;
};

/**
 * Snap targets: any X/Y that already has ≥1 *other* waypoint (so you can
 * form a pair), prefer axes that already have a visible guide (count ≥ 1
 * among non-dragged).
 */
export const snapTileToWaypointGuides = (
  tile: Coords,
  waypoints: TileWaypointRef[],
  excludeAnchorIds: ReadonlySet<string>,
  maxDist = WAYPOINT_GUIDE_SNAP_DISTANCE
): Coords => {
  const others = waypoints.filter((wp) => {
    return !excludeAnchorIds.has(wp.anchorId);
  });

  if (others.length === 0) return tile;

  const xCounts = countByAxis(others, 'x');
  const yCounts = countByAxis(others, 'y');

  let bestX = tile.x;
  let bestY = tile.y;
  let bestXScore = Infinity;
  let bestYScore = Infinity;

  xCounts.forEach((count, value) => {
    const dist = Math.abs(value - tile.x);
    if (dist > maxDist) return;
    // Prefer denser guides, then closer
    const score = dist - Math.min(0.4, (count - 1) * 0.15);
    if (score < bestXScore) {
      bestXScore = score;
      bestX = value;
    }
  });

  yCounts.forEach((count, value) => {
    const dist = Math.abs(value - tile.y);
    if (dist > maxDist) return;
    const score = dist - Math.min(0.4, (count - 1) * 0.15);
    if (score < bestYScore) {
      bestYScore = score;
      bestY = value;
    }
  });

  return { x: bestX, y: bestY };
};

/** Bounding box padded for drawing guide lines through the scene. */
export const getWaypointGuideSpan = (
  waypoints: TileWaypointRef[],
  pad = 24
): { minX: number; maxX: number; minY: number; maxY: number } => {
  if (waypoints.length === 0) {
    return { minX: -pad, maxX: pad, minY: -pad, maxY: pad };
  }

  const xs = waypoints.map((wp) => wp.tile.x);
  const ys = waypoints.map((wp) => wp.tile.y);

  return {
    minX: Math.min(...xs) - pad,
    maxX: Math.max(...xs) + pad,
    minY: Math.min(...ys) - pad,
    maxY: Math.max(...ys) + pad
  };
};
