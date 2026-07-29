/**
 * Compatibility stub — full occupancy A* engine removed with restore to 75f221e.
 * Kept so leftover imports / stale webpack watches do not break the build.
 */
import { Connector, Coords, View, ViewItem } from 'src/types';
import { getConnectorPath } from './renderer';
import { connectorPathTileToGlobal } from './renderer';

export type ConnectorPathResult = {
  tiles: Coords[];
  rectangle: { from: Coords; to: Coords };
};

export type OccupancyGrid = {
  tiles: Map<string, number>;
  edges: Map<string, number>;
};

export const AUTO_SEARCH_PAD: Coords = { x: 1, y: 1 };

export const createOccupancyGrid = (): OccupancyGrid => ({
  tiles: new Map(),
  edges: new Map()
});

export const markPathOnCostMap = (
  _costMap: Map<string, number> | OccupancyGrid,
  _globalTiles: Coords[]
) => {
  // no-op
};

export const seedNodeObstacles = (_args: {
  costMap: Map<string, number> | OccupancyGrid;
  items: ViewItem[];
  modelItems: { id: string; icon?: string; portCount?: number }[];
  clearTiles?: Set<string>;
}) => {
  // no-op
};

export const getConnectorPathWithCostMap = ({
  anchors,
  view,
  modelItems
}: {
  anchors: Connector['anchors'];
  view: View;
  modelItems?: { id: string; icon?: string }[];
  costMap?: Map<string, number>;
  occupancy?: OccupancyGrid;
  routingStyle?: string;
  portExitPenalty?: boolean;
  preferSideFirst?: boolean;
  searchPad?: Coords;
}): ConnectorPathResult => {
  return getConnectorPath({
    anchors,
    view,
    modelItems
  });
};

export const recalculateAllConnectorPaths = ({
  connectors,
  view,
  modelItems
}: {
  connectors: Connector[];
  view: View;
  modelItems: { id: string; icon?: string; portCount?: number }[];
  routingStyle?: string;
  items?: ViewItem[];
  preferSideFirst?: boolean;
  searchPad?: Coords;
}): Record<string, ConnectorPathResult> => {
  const results: Record<string, ConnectorPathResult> = {};
  connectors.forEach((connector) => {
    try {
      results[connector.id] = getConnectorPath({
        anchors: connector.anchors,
        view,
        modelItems
      });
    } catch {
      // skip invalid connectors
    }
  });
  return results;
};

export const recalculateConnectorPathsForIds = ({
  connectorIds,
  connectors,
  view,
  modelItems
}: {
  connectorIds: string[];
  connectors: Connector[];
  view: View;
  modelItems: { id: string; icon?: string; portCount?: number }[];
  routingStyle?: string;
  items?: ViewItem[];
  existingPaths?: Record<string, { path?: ConnectorPathResult } | undefined>;
  preferSideFirst?: boolean;
  searchPad?: Coords;
}): Record<string, Coords[]> => {
  const target = new Set(connectorIds);
  const routes: Record<string, Coords[]> = {};
  connectors.forEach((connector) => {
    if (!target.has(connector.id)) return;
    try {
      const path = getConnectorPath({
        anchors: connector.anchors,
        view,
        modelItems
      });
      routes[connector.id] = path.tiles.map((tile) => {
        return connectorPathTileToGlobal(tile, path.rectangle.from);
      });
    } catch {
      // skip
    }
  });
  return routes;
};

export const routeConnectorPath = ({
  anchors,
  view,
  modelItems,
  orthogonal = false
}: {
  anchors: Connector['anchors'];
  view: View;
  modelItems?: { id: string; icon?: string }[];
  costMap?: Map<string, number>;
  occupancy?: OccupancyGrid;
  routingStyle?: string;
  orthogonal?: boolean;
  preferSideFirst?: boolean;
  searchPad?: Coords;
}): ConnectorPathResult => {
  return getConnectorPath({
    anchors,
    view,
    modelItems,
    orthogonal
  });
};
