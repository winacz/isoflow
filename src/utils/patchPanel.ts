import {
  SHAPE_2D_PATCH_PANEL_ID,
  PATCH_PANEL_DEFAULT_PORTS,
  clampPatchPanelPorts,
  getCabinetSize,
  getModelItemPorts
} from 'src/config';
import type { Connector, Coords, ModelItem, ViewItem } from 'src/types';

export const isPatchPanelItem = (modelItem: {
  icon?: string;
} | null | undefined): boolean => {
  return modelItem?.icon === SHAPE_2D_PATCH_PANEL_ID;
};

/** Patch panels only accept cables when snapped into a cabinet. */
export const isPatchPanelMounted = (
  viewItem: { parentId?: string } | null | undefined
): boolean => {
  return Boolean(viewItem?.parentId);
};

export const getPatchPanelPortCount = (modelItem: {
  portCount?: number;
}): number => {
  return clampPatchPanelPorts(
    modelItem.portCount ?? PATCH_PANEL_DEFAULT_PORTS
  );
};

/** Max cables per jack — patch panel bridges front+back (2). */
export const getPortMaxConnections = (modelItem: {
  icon?: string;
} | null | undefined): number => {
  return isPatchPanelItem(modelItem) ? 2 : 1;
};

export const countShape2dPortConnections = ({
  itemId,
  portId,
  connectors,
  excludeConnectorId,
  excludeAnchorId
}: {
  itemId: string;
  portId: string;
  connectors: Pick<Connector, 'id' | 'anchors'>[];
  excludeConnectorId?: string | null;
  excludeAnchorId?: string | null;
}): number => {
  let count = 0;
  connectors.forEach((connector) => {
    if (excludeConnectorId && connector.id === excludeConnectorId) return;
    connector.anchors.forEach((anchor) => {
      if (excludeAnchorId && anchor.id === excludeAnchorId) return;
      if (anchor.ref.item === itemId && anchor.ref.port === portId) {
        count += 1;
      }
    });
  });
  return count;
};

/**
 * True when the port cannot accept another cable (capacity or unmounted panel).
 */
export const isShape2dPortUnavailable = ({
  itemId,
  portId,
  connectors,
  modelItems,
  viewItems,
  excludeConnectorId,
  excludeAnchorId
}: {
  itemId: string;
  portId: string;
  connectors: Pick<Connector, 'id' | 'anchors'>[];
  modelItems: { id: string; icon?: string }[];
  viewItems?: { id: string; parentId?: string }[];
  excludeConnectorId?: string | null;
  excludeAnchorId?: string | null;
}): boolean => {
  const modelItem = modelItems.find((item) => item.id === itemId);
  if (isPatchPanelItem(modelItem)) {
    const viewItem = viewItems?.find((item) => item.id === itemId);
    if (!isPatchPanelMounted(viewItem)) return true;
  }

  const max = getPortMaxConnections(modelItem);
  return (
    countShape2dPortConnections({
      itemId,
      portId,
      connectors,
      excludeConnectorId,
      excludeAnchorId
    }) >= max
  );
};

/** Remote item ids on cables attached to specific ports of an item. */
export const getPortPeerItemIds = ({
  itemId,
  portIds,
  connectors
}: {
  itemId: string;
  portIds: readonly string[];
  connectors: Pick<Connector, 'anchors'>[];
}): Set<string> => {
  const focused = new Set(portIds);
  const peers = new Set<string>();

  connectors.forEach((connector) => {
    const usesFocused = connector.anchors.some((anchor) => {
      return (
        anchor.ref.item === itemId &&
        Boolean(anchor.ref.port) &&
        focused.has(anchor.ref.port!)
      );
    });
    if (!usesFocused) return;

    connector.anchors.forEach((anchor) => {
      if (!anchor.ref.item || anchor.ref.item === itemId) return;
      peers.add(anchor.ref.item);
    });
  });

  return peers;
};

/**
 * Other device attached to the same patch-panel jack (the bridge peer),
 * excluding the cable currently being evaluated.
 */
export const findPatchPanelBridgePeer = ({
  panelItemId,
  portId,
  connectors,
  excludeConnectorId
}: {
  panelItemId: string;
  portId: string;
  connectors: {
    id?: string;
    anchors: { ref: { item?: string; port?: string } }[];
  }[];
  excludeConnectorId?: string | null;
}): { itemId: string; portId?: string } | null => {
  for (const connector of connectors) {
    if (excludeConnectorId && connector.id === excludeConnectorId) continue;

    const onJack = connector.anchors.some((anchor) => {
      return anchor.ref.item === panelItemId && anchor.ref.port === portId;
    });
    if (!onJack) continue;

    const peer = connector.anchors.find((anchor) => {
      return Boolean(anchor.ref.item) && anchor.ref.item !== panelItemId;
    });
    if (peer?.ref.item) {
      return { itemId: peer.ref.item, portId: peer.ref.port };
    }
  }

  return null;
};

/**
 * All connector ids that share a patch-panel jack with `connectorId`
 * (the cable itself + its bridge sibling on the same port).
 */
export const getPatchPanelBridgeConnectorIds = ({
  connectorId,
  connectors,
  modelItems
}: {
  connectorId: string;
  connectors: {
    id: string;
    anchors: { ref: { item?: string; port?: string } }[];
  }[];
  modelItems: { id: string; icon?: string }[];
}): Set<string> => {
  const ids = new Set<string>([connectorId]);
  const connector = connectors.find((candidate) => {
    return candidate.id === connectorId;
  });
  if (!connector) return ids;

  const modelById = new Map(
    modelItems.map((item) => [item.id, item] as const)
  );

  connector.anchors.forEach((anchor) => {
    if (!anchor.ref.item || !anchor.ref.port) return;
    const model = modelById.get(anchor.ref.item);
    if (!isPatchPanelItem(model)) return;

    const panelId = anchor.ref.item;
    const portId = anchor.ref.port;
    connectors.forEach((candidate) => {
      const onJack = candidate.anchors.some((a) => {
        return a.ref.item === panelId && a.ref.port === portId;
      });
      if (onJack) ids.add(candidate.id);
    });
  });

  return ids;
};

/** Expand a set of connector ids with their patch-panel bridge siblings. */
export const expandConnectorIdsThroughPatchPanels = ({
  connectorIds,
  connectors,
  modelItems
}: {
  connectorIds: Iterable<string>;
  connectors: {
    id: string;
    anchors: { ref: { item?: string; port?: string } }[];
  }[];
  modelItems: { id: string; icon?: string }[];
}): Set<string> => {
  const expanded = new Set<string>();
  for (const id of connectorIds) {
    getPatchPanelBridgeConnectorIds({
      connectorId: id,
      connectors,
      modelItems
    }).forEach((sib) => {
      expanded.add(sib);
    });
  }
  return expanded;
};

/**
 * If a connector links a mounted patch panel to a node outside that cabinet,
 * return the cabinet AABB so the in-cabinet run can be faded/dashed.
 */
export const getPatchPanelCabinetFadeRect = ({
  endpointItemIds,
  viewItems,
  modelItems
}: {
  endpointItemIds: string[];
  viewItems: ViewItem[];
  modelItems: ModelItem[];
}): { minX: number; minY: number; maxX: number; maxY: number } | null => {
  if (endpointItemIds.length < 2) return null;

  const viewById = new Map(viewItems.map((item) => [item.id, item]));
  const modelById = new Map(modelItems.map((item) => [item.id, item]));

  let panelView: ViewItem | null = null;
  let panelCabinetId: string | null = null;

  for (const id of endpointItemIds) {
    const model = modelById.get(id);
    const view = viewById.get(id);
    if (!isPatchPanelItem(model) || !view?.parentId) continue;
    panelView = view;
    panelCabinetId = view.parentId;
    break;
  }

  if (!panelView || !panelCabinetId) return null;

  const otherOutside = endpointItemIds.some((id) => {
    if (id === panelView!.id) return false;
    const other = viewById.get(id);
    return other?.parentId !== panelCabinetId;
  });

  if (!otherOutside) return null;

  const cabinetView = viewById.get(panelCabinetId);
  const cabinetModel = modelById.get(panelCabinetId);
  if (!cabinetView || !cabinetModel) return null;

  const size = getCabinetSize(cabinetModel.rackUnits);
  return {
    minX: cabinetView.tile.x,
    minY: cabinetView.tile.y,
    maxX: cabinetView.tile.x + size.width,
    maxY: cabinetView.tile.y + size.height
  };
};

export const isPointInFadeRect = (
  point: Coords,
  rect: { minX: number; minY: number; maxX: number; maxY: number },
  epsilon = 1e-6
): boolean => {
  return (
    point.x >= rect.minX - epsilon &&
    point.x <= rect.maxX + epsilon &&
    point.y >= rect.minY - epsilon &&
    point.y <= rect.maxY + epsilon
  );
};

/** Valid port ids after a port-count change (orphan cables can be pruned). */
export const getValidPatchPanelPortIds = (portCount: number): Set<string> => {
  return new Set(
    getModelItemPorts({
      icon: SHAPE_2D_PATCH_PANEL_ID,
      portCount
    }).map((port) => port.id)
  );
};
