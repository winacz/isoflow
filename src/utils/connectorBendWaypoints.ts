import type { ConnectorAnchor, Coords, View } from 'src/types';
import { generateId } from './common';
import { CoordsUtils } from './CoordsUtils';
import { extractPathCorners } from './connectorElbowSnap';
import { getConnectorGlobalPathTiles } from './connectorOverlap';
import { getAnchorTile, getConnectorPath } from './renderer';
import { dedupeTileWaypoints } from './connectorSegments';

/** Keep only the first and last anchors (drop middle tile waypoints). */
export const stripToEndpointAnchors = (
  anchors: ConnectorAnchor[]
): ConnectorAnchor[] => {
  if (anchors.length <= 2) return anchors;
  return [anchors[0], anchors[anchors.length - 1]];
};

/**
 * Turn every path corner into a tile waypoint between the endpoints.
 * Path is left as-is for rendering; returned anchors drive WP handles.
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

  const globalTiles = getConnectorGlobalPathTiles(path);
  const corners = extractPathCorners(globalTiles).filter((corner) => {
    return (
      !CoordsUtils.isEqual(corner, startTile) &&
      !CoordsUtils.isEqual(corner, endTile)
    );
  });

  if (corners.length === 0) {
    return stripToEndpointAnchors(anchors);
  }

  // Reuse existing tile WP ids when they already sit on the same corner
  const existingMids = anchors.slice(1, -1).filter((anchor) => {
    return Boolean(anchor.ref.tile);
  });

  const mids: ConnectorAnchor[] = corners.map((corner) => {
    const reuse = existingMids.find((anchor) => {
      return (
        anchor.ref.tile && CoordsUtils.isEqual(anchor.ref.tile, corner)
      );
    });

    if (reuse) {
      return {
        ...reuse,
        ref: { tile: { ...corner } }
      };
    }

    return {
      id: generateId(),
      ref: { tile: { ...corner } }
    };
  });

  return dedupeTileWaypoints([start, ...mids, end]);
};
