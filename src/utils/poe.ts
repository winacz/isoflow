import type { Connector, ModelItem } from 'src/types';
import { getModelItemPorts } from 'src/config';
import {
  expandConnectorIdsThroughPatchPanels,
  isPatchPanelItem
} from 'src/utils/patchPanel';

/**
 * True when `itemId` has at least one cable whose far end (through patch panels)
 * is a device port with template PoE OUT.
 */
export const isConnectedToPoeOutPort = ({
  itemId,
  connectors,
  modelItems
}: {
  itemId: string;
  connectors: Connector[];
  modelItems: ModelItem[];
}): boolean => {
  const itemById = new Map(modelItems.map((item) => [item.id, item]));
  const connectorById = new Map(connectors.map((c) => [c.id, c]));

  for (const connector of connectors) {
    const touches = connector.anchors.some(
      (a) => a.ref.item === itemId && Boolean(a.ref.port)
    );
    if (!touches) continue;

    const groupIds = expandConnectorIdsThroughPatchPanels({
      connectorIds: [connector.id],
      connectors,
      modelItems
    });

    for (const cid of groupIds) {
      const c = connectorById.get(cid);
      if (!c) continue;
      for (const anchor of c.anchors) {
        const peerId = anchor.ref.item;
        const peerPortId = anchor.ref.port;
        if (!peerId || !peerPortId || peerId === itemId) continue;
        const peerItem = itemById.get(peerId);
        if (!peerItem || isPatchPanelItem(peerItem)) continue;
        const peerPort = getModelItemPorts(peerItem).find(
          (p) => p.id === peerPortId
        );
        if (peerPort?.poe === 'OUT') return true;
      }
    }
  }

  return false;
};

/** Powered-by-PoE flag set, but no cable to a PoE OUT jack. */
export const hasPoePowerWarning = ({
  item,
  connectors,
  modelItems
}: {
  item: ModelItem;
  connectors: Connector[];
  modelItems: ModelItem[];
}): boolean => {
  if (!item.poweredByPoe) return false;
  return !isConnectedToPoeOutPort({
    itemId: item.id,
    connectors,
    modelItems
  });
};
