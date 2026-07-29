import { Connector, Coords, View, ViewItem } from 'src/types';
import {
  CABLE_NEIGHBOR_PENALTY,
  CABLE_TILE_PENALTY,
  NODE_TILE_PENALTY,
  buildStraightFanPath,
  findPath
} from './pathfinder';
import {
  getRoutingStyle,
  type RoutingStyle
} from './pathOptions';
import {
  connectorPathTileToGlobal,
  getAnchorTile,
  getBoundingBox,
  getBoundingBoxSize,
  getConnectorPath,
  normalisePositionFromOrigin,
  sortByPosition
} from './renderer';
import { CoordsUtils } from './CoordsUtils';
import {
  CONNECTOR_SEARCH_OFFSET,
  getModelItemPorts,
  getModelItemSize,
  getShape2dSize,
  isShape2dIcon
} from 'src/config';
import { stripToEndpointAnchors } from './connectorBendWaypoints';

export type ConnectorPathResult = {
  tiles: Coords[];
  rectangle: { from: Coords; to: Coords };
};

const euclid = (a: Coords, b: Coords) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Mark a routed cable on the shared cost map.
 * Endpoints (ports) stay cheap so other cables can still terminate there.
 * Neighbours get a softer buffer so parallel runs keep ~1 tile gap.
 */
export const markPathOnCostMap = (
  costMap: Map<string, number>,
  globalTiles: Coords[],
  penalty = CABLE_TILE_PENALTY,
  neighborPenalty = CABLE_NEIGHBOR_PENALTY
) => {
  globalTiles.forEach((tile, index) => {
    const isEndpoint = index === 0 || index === globalTiles.length - 1;
    if (isEndpoint) return;

    const k = `${Math.round(tile.x)},${Math.round(tile.y)}`;
    costMap.set(k, (costMap.get(k) ?? 0) + penalty);

    // Orthogonal neighbours only — keeps parallel lanes preferred over diagonal squeeze.
    const orthos: Coords[] = [
      { x: tile.x + 1, y: tile.y },
      { x: tile.x - 1, y: tile.y },
      { x: tile.x, y: tile.y + 1 },
      { x: tile.x, y: tile.y - 1 }
    ];
    orthos.forEach((n) => {
      const nk = `${Math.round(n.x)},${Math.round(n.y)}`;
      costMap.set(nk, (costMap.get(nk) ?? 0) + neighborPenalty);
    });
  });
};

/**
 * Seed hard obstacles for device footprints. Port tiles stay clear so cables
 * can still enter RJ45 jacks.
 */
export const seedNodeObstacles = ({
  costMap,
  items,
  modelItems,
  clearTiles
}: {
  costMap: Map<string, number>;
  items: ViewItem[];
  modelItems: { id: string; icon?: string; portCount?: number }[];
  /** Tiles that must remain routable (connector endpoints / ports). */
  clearTiles?: Set<string>;
}) => {
  const modelById = new Map(modelItems.map((item) => [item.id, item]));

  items.forEach((item) => {
    const model = modelById.get(item.id);
    if (!model?.icon || !isShape2dIcon(model.icon)) return;

    const size =
      getModelItemSize(model) ??
      getShape2dSize(model.icon) ?? { width: 1, height: 1 };

    const ports = getModelItemPorts(model);
    const portKeys = new Set(
      ports.map((port) => {
        const wx = Math.round(item.tile.x + port.tile.x);
        const wy = Math.round(item.tile.y + port.tile.y);
        return `${wx},${wy}`;
      })
    );

    for (let x = 0; x < size.width; x += 1) {
      for (let y = 0; y < size.height; y += 1) {
        const gx = Math.round(item.tile.x + x);
        const gy = Math.round(item.tile.y + y);
        const k = `${gx},${gy}`;
        if (portKeys.has(k)) continue;
        if (clearTiles?.has(k)) continue;
        costMap.set(k, Math.max(costMap.get(k) ?? 0, NODE_TILE_PENALTY));
      }
    }
  });
};

const pathRectangle = (anchorPosition: Coords[]) => {
  const searchArea = getBoundingBox(anchorPosition, CONNECTOR_SEARCH_OFFSET);
  const sorted = sortByPosition(searchArea);
  return {
    from: { x: sorted.highX, y: sorted.highY },
    to: { x: sorted.lowX, y: sorted.lowY }
  };
};

/**
 * STRAIGHT style with forced fan-out stubs (never a bare port↔port chord
 * through device bodies).
 */
const buildStraightPathResult = ({
  anchors,
  view,
  modelItems
}: {
  anchors: Connector['anchors'];
  view: View;
  modelItems?: { id: string; icon?: string }[];
}): ConnectorPathResult => {
  const ends = stripToEndpointAnchors(anchors);
  const a = getAnchorTile(ends[0], view, modelItems);
  const b = getAnchorTile(ends[ends.length - 1], view, modelItems);
  const globalTiles = buildStraightFanPath(a, b, true);
  const rectangle = pathRectangle(globalTiles);
  const tiles = globalTiles.map((tile) => {
    return normalisePositionFromOrigin({
      position: tile,
      origin: rectangle.from
    });
  });
  return { tiles, rectangle };
};

/**
 * Build a connector path using the active routing style + shared cost map.
 * Path tiles are stored in path-local coordinates (same as getConnectorPath).
 */
export const getConnectorPathWithCostMap = ({
  anchors,
  view,
  modelItems,
  costMap,
  routingStyle,
  portExitPenalty = true
}: {
  anchors: Connector['anchors'];
  view: View;
  modelItems?: { id: string; icon?: string }[];
  costMap?: Map<string, number>;
  routingStyle?: RoutingStyle;
  portExitPenalty?: boolean;
}): ConnectorPathResult => {
  const style = routingStyle ?? getRoutingStyle();

  if (anchors.length < 2) {
    throw new Error(
      `Connector needs at least two anchors (receieved: ${anchors.length})`
    );
  }

  if (style === 'STRAIGHT') {
    return buildStraightPathResult({ anchors, view, modelItems });
  }

  const anchorPosition = anchors.map((anchor) => {
    return getAnchorTile(anchor, view, modelItems);
  });

  const rectangle = pathRectangle(anchorPosition);

  const toPathLocal = (global: Coords): Coords => {
    return normalisePositionFromOrigin({
      position: global,
      origin: rectangle.from
    });
  };

  const tiles = anchorPosition.reduce<Coords[]>((acc, _position, i) => {
    if (i === 0) return acc;

    const fromGlobal = anchorPosition[i - 1];
    const toGlobal = anchorPosition[i];

    const segmentArea = getBoundingBox(
      [fromGlobal, toGlobal],
      CONNECTOR_SEARCH_OFFSET
    );
    const segmentSorted = sortByPosition(segmentArea);
    const segmentOrigin = {
      x: segmentSorted.highX,
      y: segmentSorted.highY
    };
    const segmentSize = getBoundingBoxSize(segmentArea);

    let localCost: Map<string, number> | undefined;
    if (costMap && costMap.size > 0) {
      localCost = new Map();
      const { lowX, lowY, highX, highY } = segmentSorted;
      for (let gx = lowX; gx <= highX; gx += 1) {
        for (let gy = lowY; gy <= highY; gy += 1) {
          const penalty = costMap.get(`${gx},${gy}`);
          if (!penalty) continue;
          const local = normalisePositionFromOrigin({
            position: { x: gx, y: gy },
            origin: segmentOrigin
          });
          localCost.set(
            `${Math.round(local.x)},${Math.round(local.y)}`,
            penalty
          );
        }
      }
    }

    const isFirstSegment = i === 1;
    const isLastSegment = i === anchorPosition.length - 1;
    // Fan-out only on true port endpoints (first/last segment of the cable).
    const useFanOut = isFirstSegment || isLastSegment;

    const segmentPath = findPath({
      from: normalisePositionFromOrigin({
        position: fromGlobal,
        origin: segmentOrigin
      }),
      to: normalisePositionFromOrigin({
        position: toGlobal,
        origin: segmentOrigin
      }),
      gridSize: segmentSize,
      routingStyle: style,
      costMap: localCost,
      portExitPenalty: portExitPenalty && isFirstSegment,
      skipFanOut: !useFanOut && anchorPosition.length > 2
    }).map((tile) => {
      const global = CoordsUtils.subtract(segmentOrigin, tile);
      return toPathLocal(global);
    });

    if (acc.length === 0) {
      return segmentPath;
    }

    return [...acc, ...segmentPath.slice(1)];
  }, []);

  return { tiles, rectangle };
};

/**
 * Recalculate every connector path with a shared cost map so cables run in
 * parallel corridors (high occupancy cost) and avoid device bodies.
 * Sort shortest→longest for better packing.
 */
export const recalculateAllConnectorPaths = ({
  connectors,
  view,
  modelItems,
  routingStyle,
  items
}: {
  connectors: Connector[];
  view: View;
  modelItems: { id: string; icon?: string; portCount?: number }[];
  routingStyle?: RoutingStyle;
  items?: ViewItem[];
}): Record<string, ConnectorPathResult> => {
  const style = routingStyle ?? getRoutingStyle();
  const globalCostMap = new Map<string, number>();
  const results: Record<string, ConnectorPathResult> = {};

  const ranked = connectors
    .map((connector) => {
      const ends = stripToEndpointAnchors(connector.anchors);
      if (ends.length < 2) return null;
      const a = getAnchorTile(ends[0], view, modelItems);
      const b = getAnchorTile(ends[ends.length - 1], view, modelItems);
      return {
        connector,
        anchors: ends,
        dist: euclid(a, b),
        portA: a,
        portB: b
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => a.dist - b.dist);

  // Keep every endpoint walkable even when it sits on a device footprint.
  const clearTiles = new Set<string>();
  ranked.forEach(({ portA, portB }) => {
    clearTiles.add(`${Math.round(portA.x)},${Math.round(portA.y)}`);
    clearTiles.add(`${Math.round(portB.x)},${Math.round(portB.y)}`);
  });

  seedNodeObstacles({
    costMap: globalCostMap,
    items: items ?? view.items ?? [],
    modelItems,
    clearTiles
  });

  ranked.forEach(({ connector, anchors }) => {
    const path =
      style === 'STRAIGHT'
        ? buildStraightPathResult({
            anchors,
            view,
            modelItems
          })
        : getConnectorPathWithCostMap({
            anchors,
            view,
            modelItems,
            costMap: globalCostMap,
            routingStyle: style,
            portExitPenalty: true
          });

    results[connector.id] = path;

    const globalTiles = path.tiles.map((tile) => {
      return connectorPathTileToGlobal(tile, path.rectangle.from);
    });
    markPathOnCostMap(globalCostMap, globalTiles);
  });

  return results;
};

/**
 * Route a subset of cables (ortho/diag) with a shared cost map so paths do not
 * share tiles. Other cables' existing scene paths are seeded as soft obstacles.
 * Returns global tile polylines suitable for `applyConnectorRoutes`.
 */
export const recalculateConnectorPathsForIds = ({
  connectorIds,
  connectors,
  view,
  modelItems,
  routingStyle,
  items,
  existingPaths
}: {
  connectorIds: string[];
  connectors: Connector[];
  view: View;
  modelItems: { id: string; icon?: string; portCount?: number }[];
  routingStyle?: RoutingStyle;
  items?: ViewItem[];
  /** Scene connector paths for cables that stay put (soft obstacles). */
  existingPaths?: Record<string, { path?: ConnectorPathResult } | undefined>;
}): Record<string, Coords[]> => {
  const style = routingStyle ?? getRoutingStyle();
  const targetIds = new Set(connectorIds);
  const targets = connectors.filter((connector) => {
    return targetIds.has(connector.id);
  });
  if (targets.length === 0) return {};

  const globalCostMap = new Map<string, number>();

  // Seed obstacles from cables we are not re-routing.
  if (existingPaths) {
    connectors.forEach((connector) => {
      if (targetIds.has(connector.id)) return;
      const path = existingPaths[connector.id]?.path;
      if (!path?.tiles?.length) return;
      const globalTiles = path.tiles.map((tile) => {
        return connectorPathTileToGlobal(tile, path.rectangle.from);
      });
      markPathOnCostMap(globalCostMap, globalTiles);
    });
  }

  const clearTiles = new Set<string>();
  targets.forEach((connector) => {
    const ends = stripToEndpointAnchors(connector.anchors);
    if (ends.length < 2) return;
    const a = getAnchorTile(ends[0], view, modelItems);
    const b = getAnchorTile(ends[ends.length - 1], view, modelItems);
    clearTiles.add(`${Math.round(a.x)},${Math.round(a.y)}`);
    clearTiles.add(`${Math.round(b.x)},${Math.round(b.y)}`);
  });

  seedNodeObstacles({
    costMap: globalCostMap,
    items: items ?? view.items ?? [],
    modelItems,
    clearTiles
  });

  const ranked = targets
    .map((connector) => {
      const ends = stripToEndpointAnchors(connector.anchors);
      if (ends.length < 2) return null;
      const a = getAnchorTile(ends[0], view, modelItems);
      const b = getAnchorTile(ends[ends.length - 1], view, modelItems);
      return {
        connector,
        anchors: ends,
        dist: euclid(a, b)
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => a.dist - b.dist);

  const routes: Record<string, Coords[]> = {};

  ranked.forEach(({ connector, anchors }) => {
    const path =
      style === 'STRAIGHT'
        ? buildStraightPathResult({
            anchors,
            view,
            modelItems
          })
        : getConnectorPathWithCostMap({
            anchors,
            view,
            modelItems,
            costMap: globalCostMap,
            routingStyle: style,
            portExitPenalty: true
          });

    const globalTiles = path.tiles.map((tile) => {
      return connectorPathTileToGlobal(tile, path.rectangle.from);
    });
    routes[connector.id] = globalTiles;
    markPathOnCostMap(globalCostMap, globalTiles);
  });

  return routes;
};

/**
 * Convenience: route a single connector with optional shared cost map.
 */
export const routeConnectorPath = ({
  anchors,
  view,
  modelItems,
  costMap,
  routingStyle,
  orthogonal = false
}: {
  anchors: Connector['anchors'];
  view: View;
  modelItems?: { id: string; icon?: string }[];
  costMap?: Map<string, number>;
  routingStyle?: RoutingStyle;
  orthogonal?: boolean;
}): ConnectorPathResult => {
  const style =
    orthogonal || getRoutingStyle() === 'ORTHOGONAL'
      ? routingStyle ?? (orthogonal ? 'ORTHOGONAL' : getRoutingStyle())
      : routingStyle ?? getRoutingStyle();

  if (style === 'STRAIGHT') {
    return buildStraightPathResult({ anchors, view, modelItems });
  }

  if (costMap && costMap.size > 0) {
    return getConnectorPathWithCostMap({
      anchors,
      view,
      modelItems,
      costMap,
      routingStyle: style
    });
  }

  return getConnectorPath({
    anchors,
    view,
    modelItems,
    orthogonal: style === 'ORTHOGONAL' || orthogonal,
    portExitPenalty: true
  });
};
