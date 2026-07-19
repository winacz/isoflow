import type { ConnectorAnchor, Coords, View } from 'src/types';
import { generateId } from './common';
import { CoordsUtils } from './CoordsUtils';
import { extractPathCorners } from './connectorElbowSnap';
import { getAnchorTile, getConnectorPath, connectorPathTileToGlobal } from './renderer';
import { dedupeTileWaypoints } from './connectorSegments';

export const isLockedTileWaypoint = (anchor: ConnectorAnchor): boolean => {
  return Boolean(anchor.locked && anchor.ref.tile);
};

/**
 * Drop mid tile waypoints whose ids are in `idsToRemove`.
 * Endpoints and locked waypoints are always kept.
 * Returns null when nothing changes.
 */
export const removeMidWaypointsByIds = (
  anchors: ConnectorAnchor[],
  idsToRemove: ReadonlySet<string>
): ConnectorAnchor[] | null => {
  if (idsToRemove.size === 0 || anchors.length <= 2) {
    return null;
  }

  const last = anchors.length - 1;
  const next = anchors.filter((anchor, index) => {
    if (index === 0 || index === last) return true;
    if (!idsToRemove.has(anchor.id)) return true;
    if (isLockedTileWaypoint(anchor)) return true;
    return false;
  });

  if (next.length === anchors.length || next.length < 2) {
    return null;
  }

  return next;
};

/** Keep endpoints + any locked middle tile waypoints (in order). */
export const stripToEndpointAnchors = (
  anchors: ConnectorAnchor[]
): ConnectorAnchor[] => {
  if (anchors.length <= 2) return anchors;
  const start = anchors[0];
  const end = anchors[anchors.length - 1];
  const lockedMids = anchors.slice(1, -1).filter(isLockedTileWaypoint);
  if (lockedMids.length === 0) {
    return [start, end];
  }
  return [start, ...lockedMids, end];
};

const pathIndexOfTile = (tiles: Coords[], tile: Coords): number => {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  tiles.forEach((candidate, index) => {
    const dist =
      Math.abs(candidate.x - tile.x) + Math.abs(candidate.y - tile.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  return best;
};

const globalTilesFromPath = (path: {
  tiles: Coords[];
  rectangle: { from: Coords };
}): Coords[] => {
  return path.tiles.map((tile) => {
    return connectorPathTileToGlobal(tile, path.rectangle.from);
  });
};

/**
 * Turn every path corner into a tile waypoint between the endpoints.
 * Locked middle waypoints are always preserved.
 */
export const materializeBendWaypoints = ({
  anchors,
  path,
  view,
  modelItems
}: {
  anchors: ConnectorAnchor[];
  path: ReturnType<typeof getConnectorPath>;
  view: View;
  modelItems?: { id: string; icon?: string }[];
}): ConnectorAnchor[] => {
  if (anchors.length < 2) return anchors;

  const start = anchors[0];
  const end = anchors[anchors.length - 1];
  let startTile: Coords;
  let endTile: Coords;

  try {
    startTile = getAnchorTile(start, view, modelItems);
    endTile = getAnchorTile(end, view, modelItems);
  } catch {
    return stripToEndpointAnchors(anchors);
  }

  const globalTiles = globalTilesFromPath(path);
  const corners = extractPathCorners(globalTiles).filter((corner) => {
    return (
      !CoordsUtils.isEqual(corner, startTile) &&
      !CoordsUtils.isEqual(corner, endTile)
    );
  });

  const existingMids = anchors.slice(1, -1).filter((anchor) => {
    return Boolean(anchor.ref.tile);
  });
  const lockedMids = existingMids.filter(isLockedTileWaypoint);

  if (corners.length === 0 && lockedMids.length === 0) {
    return stripToEndpointAnchors(anchors);
  }

  const mids: ConnectorAnchor[] = corners.map((corner) => {
    const reuse = existingMids.find((anchor) => {
      return (
        anchor.ref.tile && CoordsUtils.isEqual(anchor.ref.tile, corner)
      );
    });

    if (reuse) {
      return {
        ...reuse,
        locked: reuse.locked ? true : undefined,
        ref: { tile: { ...corner } }
      };
    }

    return {
      id: generateId(),
      ref: { tile: { ...corner } }
    };
  });

  // Keep locked WPs even when they are not automatic bend corners.
  lockedMids.forEach((locked) => {
    const tile = locked.ref.tile!;
    const matchIdx = mids.findIndex((mid) => {
      return (
        mid.id === locked.id ||
        (mid.ref.tile && CoordsUtils.isEqual(mid.ref.tile, tile))
      );
    });
    if (matchIdx >= 0) {
      mids[matchIdx] = {
        ...mids[matchIdx],
        locked: true,
        ref: { tile: { ...tile } }
      };
      return;
    }
    mids.push({
      ...locked,
      locked: true,
      ref: { tile: { ...tile } }
    });
  });

  mids.sort((a, b) => {
    const ta = a.ref.tile!;
    const tb = b.ref.tile!;
    return pathIndexOfTile(globalTiles, ta) - pathIndexOfTile(globalTiles, tb);
  });

  return dedupeTileWaypoints([start, ...mids, end]);
};

/**
 * Insert or lock a tile waypoint at `tile` on the connector path.
 * Returns the updated anchors list (caller persists via updateConnector).
 */
export const lockWaypointAtTile = ({
  anchors,
  tile,
  path,
  view,
  modelItems
}: {
  anchors: ConnectorAnchor[];
  tile: Coords;
  path: { tiles: Coords[]; rectangle: { from: Coords } };
  view: View;
  modelItems?: { id: string; icon?: string }[];
}): ConnectorAnchor[] => {
  const existing = anchors.find((anchor) => {
    return (
      Boolean(anchor.ref.tile) &&
      CoordsUtils.isEqual(anchor.ref.tile as Coords, tile)
    );
  });

  if (existing) {
    return anchors.map((anchor) => {
      if (anchor.id !== existing.id) return anchor;
      return {
        ...anchor,
        locked: true,
        ref: { tile: { ...tile } }
      };
    });
  }

  const newAnchor: ConnectorAnchor = {
    id: generateId(),
    locked: true,
    ref: { tile: { ...tile } }
  };

  const withNew = [...anchors, newAnchor];
  const ordered = withNew
    .map((anchor) => {
      let ordering = 0;
      try {
        const anchorTile = getAnchorTile(anchor, view, modelItems);
        ordering = pathIndexOfTile(
          globalTilesFromPath(path),
          anchorTile
        );
      } catch {
        ordering = 0;
      }
      return { anchor, ordering };
    })
    .sort((a, b) => {
      return a.ordering - b.ordering;
    })
    .map(({ anchor }) => {
      return anchor;
    });

  return dedupeTileWaypoints(ordered);
};

export const unlockWaypointAtTile = ({
  anchors,
  tile
}: {
  anchors: ConnectorAnchor[];
  tile: Coords;
}): ConnectorAnchor[] | null => {
  const existing = anchors.find((anchor) => {
    return (
      isLockedTileWaypoint(anchor) &&
      CoordsUtils.isEqual(anchor.ref.tile as Coords, tile)
    );
  });
  if (!existing) return null;

  return anchors.map((anchor) => {
    if (anchor.id !== existing.id) return anchor;
    const { locked: _locked, ...rest } = anchor;
    return {
      ...rest,
      ref: { tile: { ...(anchor.ref.tile as Coords) } }
    };
  });
};
