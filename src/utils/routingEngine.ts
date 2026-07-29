import { Connector, Coords, View, ViewItem } from 'src/types';
import {
  CABLE_NEIGHBOR_PENALTY,
  CABLE_TILE_PENALTY,
  NODE_TILE_PENALTY,
  SHARED_EDGE_PENALTY,
  buildStraightFanPath,
  findPath,
  pathEdgeKey
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

/** Shared occupancy for sequential cable packing (tiles + undirected edges). */
export type OccupancyGrid = {
  tiles: Map<string, number>;
  edges: Map<string, number>;
};

/** Extra search pad so A* can detour around occupied corridors. */
export const AUTO_SEARCH_PAD: Coords = { x: 12, y: 12 };

const euclid = (a: Coords, b: Coords) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const createOccupancyGrid = (): OccupancyGrid => ({
  tiles: new Map(),
  edges: new Map()
});

/**
 * Mark a routed cable on the shared occupancy grid.
 * Endpoints (ports) stay cheap so other cables can still terminate there.
 * Neighbours get a soft buffer; edges get a hard shared-edge penalty.
 */
export const markPathOnCostMap = (
  costMap: Map<string, number> | OccupancyGrid,
  globalTiles: Coords[],
  penalty = CABLE_TILE_PENALTY,
  neighborPenalty = CABLE_NEIGHBOR_PENALTY,
  edgePenalty = SHARED_EDGE_PENALTY
) => {
  const tiles = costMap instanceof Map ? costMap : costMap.tiles;
  const edges = costMap instanceof Map ? null : costMap.edges;

  globalTiles.forEach((tile, index) => {
    const isEndpoint = index === 0 || index === globalTiles.length - 1;
    if (!isEndpoint) {
      const k = `${Math.round(tile.x)},${Math.round(tile.y)}`;
      tiles.set(k, (tiles.get(k) ?? 0) + penalty);

      if (neighborPenalty > 0) {
        const orthos: Coords[] = [
          { x: tile.x + 1, y: tile.y },
          { x: tile.x - 1, y: tile.y },
          { x: tile.x, y: tile.y + 1 },
          { x: tile.x, y: tile.y - 1 }
        ];
        orthos.forEach((n) => {
          const nk = `${Math.round(n.x)},${Math.round(n.y)}`;
          tiles.set(nk, (tiles.get(nk) ?? 0) + neighborPenalty);
        });
      }
    }

    if (edges && index > 0) {
      const prev = globalTiles[index - 1];
      const ek = pathEdgeKey(
        { x: Math.round(prev.x), y: Math.round(prev.y) },
        { x: Math.round(tile.x), y: Math.round(tile.y) }
      );
      edges.set(ek, (edges.get(ek) ?? 0) + edgePenalty);
    }
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
  costMap: Map<string, number> | OccupancyGrid;
  items: ViewItem[];
  modelItems: { id: string; icon?: string; portCount?: number }[];
  /** Tiles that must remain routable (connector endpoints / ports). */
  clearTiles?: Set<string>;
}) => {
  const tiles = costMap instanceof Map ? costMap : costMap.tiles;
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
        tiles.set(k, Math.max(tiles.get(k) ?? 0, NODE_TILE_PENALTY));
      }
    }
  });
};

const pathRectangle = (anchorPosition: Coords[], pad: Coords) => {
  const searchArea = getBoundingBox(anchorPosition, pad);
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
  const rectangle = pathRectangle(globalTiles, CONNECTOR_SEARCH_OFFSET);
  const tiles = globalTiles.map((tile) => {
    return normalisePositionFromOrigin({
      position: tile,
      origin: rectangle.from
    });
  });
  return { tiles, rectangle };
};

const projectCostMapsToLocal = ({
  occupancy,
  segmentSorted,
  segmentOrigin
}: {
  occupancy?: OccupancyGrid | Map<string, number>;
  segmentSorted: { lowX: number; lowY: number; highX: number; highY: number };
  segmentOrigin: Coords;
}): { localTiles?: Map<string, number>; localEdges?: Map<string, number> } => {
  if (!occupancy) return {};

  const sourceTiles =
    occupancy instanceof Map ? occupancy : occupancy.tiles;
  const sourceEdges =
    occupancy instanceof Map ? undefined : occupancy.edges;

  if (sourceTiles.size === 0 && (!sourceEdges || sourceEdges.size === 0)) {
    return {};
  }

  const localTiles = new Map<string, number>();
  const { lowX, lowY, highX, highY } = segmentSorted;
  for (let gx = lowX; gx <= highX; gx += 1) {
    for (let gy = lowY; gy <= highY; gy += 1) {
      const penalty = sourceTiles.get(`${gx},${gy}`);
      if (!penalty) continue;
      const local = normalisePositionFromOrigin({
        position: { x: gx, y: gy },
        origin: segmentOrigin
      });
      localTiles.set(`${Math.round(local.x)},${Math.round(local.y)}`, penalty);
    }
  }

  let localEdges: Map<string, number> | undefined;
  if (sourceEdges && sourceEdges.size > 0) {
    localEdges = new Map();
    sourceEdges.forEach((penalty, key) => {
      const [aStr, bStr] = key.split('|');
      const [ax, ay] = aStr.split(',').map(Number);
      const [bx, by] = bStr.split(',').map(Number);
      if (
        ax < lowX - 1 ||
        ax > highX + 1 ||
        ay < lowY - 1 ||
        ay > highY + 1 ||
        bx < lowX - 1 ||
        bx > highX + 1 ||
        by < lowY - 1 ||
        by > highY + 1
      ) {
        return;
      }
      const la = normalisePositionFromOrigin({
        position: { x: ax, y: ay },
        origin: segmentOrigin
      });
      const lb = normalisePositionFromOrigin({
        position: { x: bx, y: by },
        origin: segmentOrigin
      });
      localEdges!.set(
        pathEdgeKey(
          { x: Math.round(la.x), y: Math.round(la.y) },
          { x: Math.round(lb.x), y: Math.round(lb.y) }
        ),
        penalty
      );
    });
  }

  return {
    localTiles: localTiles.size > 0 ? localTiles : undefined,
    localEdges: localEdges && localEdges.size > 0 ? localEdges : undefined
  };
};

/**
 * Build a connector path using the active routing style + shared occupancy.
 * Path tiles are stored in path-local coordinates (same as getConnectorPath).
 */
export const getConnectorPathWithCostMap = ({
  anchors,
  view,
  modelItems,
  costMap,
  occupancy,
  routingStyle,
  portExitPenalty = true,
  preferSideFirst = false,
  searchPad = CONNECTOR_SEARCH_OFFSET
}: {
  anchors: Connector['anchors'];
  view: View;
  modelItems?: { id: string; icon?: string }[];
  /** @deprecated Prefer `occupancy` — still accepted as tile-only map. */
  costMap?: Map<string, number>;
  occupancy?: OccupancyGrid;
  routingStyle?: RoutingStyle;
  portExitPenalty?: boolean;
  preferSideFirst?: boolean;
  searchPad?: Coords;
}): ConnectorPathResult => {
  const style = routingStyle ?? getRoutingStyle();
  const grid: OccupancyGrid | Map<string, number> | undefined =
    occupancy ?? costMap;

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

  const rectangle = pathRectangle(anchorPosition, searchPad);

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

    const segmentArea = getBoundingBox([fromGlobal, toGlobal], searchPad);
    const segmentSorted = sortByPosition(segmentArea);
    const segmentOrigin = {
      x: segmentSorted.highX,
      y: segmentSorted.highY
    };
    const segmentSize = getBoundingBoxSize(segmentArea);

    const { localTiles, localEdges } = projectCostMapsToLocal({
      occupancy: grid,
      segmentSorted,
      segmentOrigin
    });

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
      costMap: localTiles,
      edgeCostMap: localEdges,
      portExitPenalty: preferSideFirst
        ? false
        : portExitPenalty && isFirstSegment,
      preferSideFirst,
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
  items,
  preferSideFirst = false,
  searchPad
}: {
  connectors: Connector[];
  view: View;
  modelItems: { id: string; icon?: string; portCount?: number }[];
  routingStyle?: RoutingStyle;
  items?: ViewItem[];
  preferSideFirst?: boolean;
  searchPad?: Coords;
}): Record<string, ConnectorPathResult> => {
  const style = routingStyle ?? getRoutingStyle();
  const occupancy = createOccupancyGrid();
  const results: Record<string, ConnectorPathResult> = {};
  const pad = searchPad ?? (preferSideFirst ? AUTO_SEARCH_PAD : CONNECTOR_SEARCH_OFFSET);

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
    costMap: occupancy,
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
            occupancy,
            routingStyle: style,
            portExitPenalty: !preferSideFirst,
            preferSideFirst,
            searchPad: pad
          });

    results[connector.id] = path;

    const globalTiles = path.tiles.map((tile) => {
      return connectorPathTileToGlobal(tile, path.rectangle.from);
    });
    markPathOnCostMap(occupancy, globalTiles);
  });

  return results;
};

/**
 * Route a subset of cables with a shared occupancy grid so paths do not
 * share tiles/edges. Other cables' existing scene paths are seeded as obstacles.
 * Returns global tile polylines suitable for `applyConnectorRoutes`.
 */
export const recalculateConnectorPathsForIds = ({
  connectorIds,
  connectors,
  view,
  modelItems,
  routingStyle,
  items,
  existingPaths,
  preferSideFirst = false,
  searchPad
}: {
  connectorIds: string[];
  connectors: Connector[];
  view: View;
  modelItems: { id: string; icon?: string; portCount?: number }[];
  routingStyle?: RoutingStyle;
  items?: ViewItem[];
  /** Scene connector paths for cables that stay put (soft obstacles). */
  existingPaths?: Record<string, { path?: ConnectorPathResult } | undefined>;
  preferSideFirst?: boolean;
  searchPad?: Coords;
}): Record<string, Coords[]> => {
  const style = routingStyle ?? getRoutingStyle();
  const targetIds = new Set(connectorIds);
  const targets = connectors.filter((connector) => {
    return targetIds.has(connector.id);
  });
  if (targets.length === 0) return {};

  const occupancy = createOccupancyGrid();
  const pad = searchPad ?? (preferSideFirst ? AUTO_SEARCH_PAD : CONNECTOR_SEARCH_OFFSET);

  // Seed obstacles from cables we are not re-routing.
  if (existingPaths) {
    connectors.forEach((connector) => {
      if (targetIds.has(connector.id)) return;
      const path = existingPaths[connector.id]?.path;
      if (!path?.tiles?.length) return;
      const globalTiles = path.tiles.map((tile) => {
        return connectorPathTileToGlobal(tile, path.rectangle.from);
      });
      markPathOnCostMap(occupancy, globalTiles);
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
    costMap: occupancy,
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
            occupancy,
            routingStyle: style,
            portExitPenalty: !preferSideFirst,
            preferSideFirst,
            searchPad: pad
          });

    const globalTiles = path.tiles.map((tile) => {
      return connectorPathTileToGlobal(tile, path.rectangle.from);
    });
    routes[connector.id] = globalTiles;
    markPathOnCostMap(occupancy, globalTiles);
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
  occupancy,
  routingStyle,
  orthogonal = false,
  preferSideFirst = false,
  searchPad
}: {
  anchors: Connector['anchors'];
  view: View;
  modelItems?: { id: string; icon?: string }[];
  costMap?: Map<string, number>;
  occupancy?: OccupancyGrid;
  routingStyle?: RoutingStyle;
  orthogonal?: boolean;
  preferSideFirst?: boolean;
  searchPad?: Coords;
}): ConnectorPathResult => {
  const style =
    orthogonal || getRoutingStyle() === 'ORTHOGONAL'
      ? routingStyle ?? (orthogonal ? 'ORTHOGONAL' : getRoutingStyle())
      : routingStyle ?? getRoutingStyle();

  if (style === 'STRAIGHT') {
    return buildStraightPathResult({ anchors, view, modelItems });
  }

  if ((occupancy && (occupancy.tiles.size > 0 || occupancy.edges.size > 0)) ||
      (costMap && costMap.size > 0)) {
    return getConnectorPathWithCostMap({
      anchors,
      view,
      modelItems,
      costMap,
      occupancy,
      routingStyle: style,
      preferSideFirst,
      searchPad
    });
  }

  return getConnectorPath({
    anchors,
    view,
    modelItems,
    orthogonal: style === 'ORTHOGONAL' || orthogonal,
    portExitPenalty: !preferSideFirst
  });
};
