import { Coords, ViewItem } from 'src/types';
import { getShape2dPorts } from 'src/config';
import { countCrossings, countEdgeOverlaps } from '../routeGeometry';
import { buildDiagonalAwareTiles } from '../pathOptions';
import { bundleShape2dRoutes } from '../shape2dLayout';
import { buildLayoutGraph } from './graph';
import { placeNodes, placeBySwapping, applyTargets } from './place';
import { routeCables } from './router';
import {
  AutoLayoutOptions,
  AutoLayoutResult,
  LayoutConnector,
  ModelItemRef
} from './types';

export * from './types';
export { buildLayoutGraph } from './graph';
export { placeNodes, placeBySwapping, countBilayerCrossings } from './place';
export { routeCables } from './router';

/**
 * Densify a connector's anchor polyline into unit tiles, mirroring what the
 * renderer draws (getConnectorPath runs a diagonal A* between anchors).
 * Used only for before/after metrics.
 */
const connectorTiles = ({
  connector,
  itemById,
  iconById
}: {
  connector: LayoutConnector;
  itemById: Map<string, ViewItem>;
  iconById: Map<string, string | undefined>;
}): Coords[] => {
  const points: Coords[] = [];

  connector.anchors.forEach((anchor) => {
    if (anchor.ref.tile) {
      points.push({
        x: Math.round(anchor.ref.tile.x),
        y: Math.round(anchor.ref.tile.y)
      });
      return;
    }
    if (!anchor.ref.item) return;

    const item = itemById.get(anchor.ref.item);
    if (!item) return;

    if (anchor.ref.port) {
      const port = getShape2dPorts(iconById.get(anchor.ref.item) ?? '').find(
        (candidate) => {
          return candidate.id === anchor.ref.port;
        }
      );
      if (port) {
        points.push({
          x: Math.round(item.tile.x + port.tile.x),
          y: Math.round(item.tile.y + port.tile.y)
        });
        return;
      }
    }
    points.push({ x: Math.round(item.tile.x), y: Math.round(item.tile.y) });
  });

  if (points.length < 2) return points;

  let tiles: Coords[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const segment = buildDiagonalAwareTiles(points[i - 1], points[i]);
    tiles = tiles.length === 0 ? segment : [...tiles, ...segment.slice(1)];
  }
  return tiles;
};

/**
 * Auto-Układ entry point.
 *
 * Places nodes (optional) and re-routes every in-scope cable, reporting how
 * many crossings and overlaps the run removed.
 */
export const runAutoLayout = ({
  scopeItems,
  allItems,
  modelItems,
  connectors,
  options
}: {
  scopeItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: ModelItemRef[];
  connectors: LayoutConnector[];
  options: AutoLayoutOptions;
}): AutoLayoutResult => {
  const { style, placement, gridStep = { x: 1, y: 1 } } = options;

  const graph = buildLayoutGraph({
    scopeItems,
    allItems,
    modelItems,
    connectors
  });

  const iconById = new Map(
    modelItems.map((item) => {
      return [item.id, item.icon] as const;
    })
  );
  const beforeItemById = new Map(
    allItems.map((item) => {
      return [item.id, item] as const;
    })
  );

  const scopedConnectorIds = new Set(
    graph.edges.map((edge) => {
      return edge.connectorId;
    })
  );
  const scopedConnectors = connectors.filter((connector) => {
    return scopedConnectorIds.has(connector.id);
  });

  const beforePaths = scopedConnectors.map((connector) => {
    return connectorTiles({ connector, itemById: beforeItemById, iconById });
  });

  let targets: Record<string, Coords> = {};
  if (placement === 'full') {
    targets = placeNodes({ graph, gridStep }).targets;
  } else if (placement === 'swap') {
    targets = placeBySwapping({ graph }).targets;
  }
  const placedItems = applyTargets(allItems, targets);

  let routes: Record<string, Coords[]> = {};
  let afterPaths: Coords[][] = [];
  let unrouted = 0;

  if (style === 'STRAIGHT') {
    // Endpoints only — the reducer drops mid waypoints for empty routes.
    scopedConnectorIds.forEach((connectorId) => {
      routes[connectorId] = [];
    });
  } else if (style === 'BUS') {
    // Reuse the existing bundle router: it already builds per-cable trunk
    // lanes with correct port-side handling.
    const scopeAfterPlace = placedItems.filter((item) => {
      return scopeItems.some((scoped) => {
        return scoped.id === item.id;
      });
    });
    routes = bundleShape2dRoutes({
      selectedItems: scopeAfterPlace,
      allItems: placedItems,
      modelItems,
      connectors: scopedConnectors,
      orientation: 'vertical'
    });
  } else {
    const routed = routeCables({ graph, items: placedItems, style });
    routes = routed.routes;
    afterPaths = routed.paths;
    unrouted = routed.unrouted;
  }

  if (afterPaths.length === 0) {
    // BUS / STRAIGHT: rebuild paths from the produced waypoints for metrics.
    const afterItemById = new Map(
      placedItems.map((item) => {
        return [item.id, item] as const;
      })
    );
    afterPaths = scopedConnectors.map((connector) => {
      const mid = routes[connector.id] ?? [];
      const endpoints = connector.anchors.filter((anchor) => {
        return Boolean(anchor.ref.item);
      });
      const synthetic: LayoutConnector = {
        id: connector.id,
        anchors: [
          endpoints[0],
          ...mid.map((tile, index) => {
            return { id: `m${index}`, ref: { tile } };
          }),
          endpoints[endpoints.length - 1]
        ].filter(Boolean)
      };
      return connectorTiles({
        connector: synthetic,
        itemById: afterItemById,
        iconById
      });
    });
  }

  return {
    targets,
    routes,
    metrics: {
      crossingsBefore: countCrossings(beforePaths),
      crossingsAfter: countCrossings(afterPaths),
      overlapsBefore: countEdgeOverlaps(beforePaths),
      overlapsAfter: countEdgeOverlaps(afterPaths),
      cables: scopedConnectors.length,
      movedNodes: Object.keys(targets).length,
      unrouted
    }
  };
};
