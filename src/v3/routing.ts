import type { Coords, ModelItem, ViewItem } from 'src/types';
import {
  getModelItemSize,
  getShape2dPorts,
  getShape2dSize,
  type Shape2dPortSide
} from 'src/config';
import type { Footprint } from 'src/utils/autoLayout/types';
import { routeOneCable } from 'src/utils/autoLayout/router';
import { getConnectorGlobalTiles } from 'src/utils/connectorJumps';

/**
 * v3 routing entry point: the glue between a drawn cable and the shared A*.
 *
 * Everything here is v3 policy — `walkableNodes` in particular. The classic
 * 2D plan keeps device bodies as hard walls; v3 lets a cable slip underneath
 * one when the alternative is no route at all.
 */

export type PortEnd = {
  itemId: string;
  portId: string;
};

/** A cable already on the plan, with its path resolved by the scene. */
export type RoutedConnector = {
  id: string;
} & Parameters<typeof getConnectorGlobalTiles>[0];

export const buildFootprints = (
  items: ViewItem[],
  modelItems: ModelItem[]
): Map<string, Footprint> => {
  const modelById = new Map(
    modelItems.map((item) => {
      return [item.id, item] as const;
    })
  );
  const footprints = new Map<string, Footprint>();

  items.forEach((item) => {
    const model = modelById.get(item.id);
    if (!model?.icon) return;

    const size = getModelItemSize(model) ?? getShape2dSize(model.icon) ?? null;
    if (!size) return;

    footprints.set(item.id, {
      id: item.id,
      tile: item.tile,
      width: size.width,
      height: size.height
    });
  });

  return footprints;
};

/** Outward normal of a port face — the direction a cable must leave along. */
export const sideNormal = (
  side: Shape2dPortSide | undefined
): Coords | null => {
  switch (side) {
    case 'TOP':
      return { x: 0, y: -1 };
    case 'BOTTOM':
      return { x: 0, y: 1 };
    case 'LEFT':
      return { x: -1, y: 0 };
    case 'RIGHT':
      return { x: 1, y: 0 };
    default:
      return null;
  }
};

const portDef = (icon: string | undefined, portId: string) => {
  if (!icon) return undefined;
  return getShape2dPorts(icon).find((port) => {
    return port.id === portId;
  });
};

/** World tile of a port, and the face it points out of. */
export const resolvePortEnd = ({
  end,
  items,
  modelItems
}: {
  end: PortEnd;
  items: ViewItem[];
  modelItems: ModelItem[];
}): { tile: Coords; normal: Coords | null } | null => {
  const viewItem = items.find((item) => {
    return item.id === end.itemId;
  });
  const modelItem = modelItems.find((item) => {
    return item.id === end.itemId;
  });
  if (!viewItem || !modelItem) return null;

  const port = portDef(modelItem.icon, end.portId);
  if (!port) return null;

  return {
    tile: {
      x: Math.round(viewItem.tile.x + port.tile.x),
      y: Math.round(viewItem.tile.y + port.tile.y)
    },
    normal: sideNormal(port.side)
  };
};

/**
 * Route a freshly drawn cable and return the waypoints to materialize.
 *
 * Returns `null` when either endpoint cannot be resolved — the caller should
 * then discard the connector rather than persist a cable to nowhere.
 */
export const routeNewConnection = ({
  from,
  to,
  items,
  modelItems,
  existingConnectors,
  excludeConnectorId
}: {
  from: PortEnd;
  to: PortEnd;
  items: ViewItem[];
  modelItems: ModelItem[];
  /** Scene connectors (with resolved paths) — obstacles, never modified. */
  existingConnectors: RoutedConnector[];
  excludeConnectorId?: string;
}): { waypoints: Coords[]; routed: boolean } | null => {
  const start = resolvePortEnd({ end: from, items, modelItems });
  const finish = resolvePortEnd({ end: to, items, modelItems });
  if (!start || !finish) return null;

  const existingPaths: Coords[][] = [];
  existingConnectors.forEach((connector) => {
    if (connector.id === excludeConnectorId) return;
    try {
      const tiles = getConnectorGlobalTiles(connector);
      if (tiles.length > 1) existingPaths.push(tiles);
    } catch {
      // A connector with an unresolvable path is simply not an obstacle.
    }
  });

  const result = routeOneCable({
    items,
    modelItems: modelItems.map((item) => {
      return { id: item.id, icon: item.icon };
    }),
    footprints: buildFootprints(items, modelItems),
    from: start.tile,
    to: finish.tile,
    exitDir: start.normal,
    entryDir: finish.normal
      ? { x: -finish.normal.x, y: -finish.normal.y }
      : null,
    style: 'ORTHOGONAL',
    // §4: v3 lets cables pass under devices at a steep cost.
    walkableNodes: true,
    existingPaths
  });

  return { waypoints: result.waypoints, routed: result.routed };
};
