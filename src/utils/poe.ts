import type { Connector, ModelItem } from 'src/types';
import { getModelItemPorts } from 'src/config';
import {
  expandConnectorIdsThroughPatchPanels,
  isPatchPanelItem
} from 'src/utils/patchPanel';
import { isSwitchLikeIcon } from 'src/utils/shape2dLayout';
import { resolveCablePeer } from 'src/utils/vlanIpHint';

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

/** True when any endpoint port is cabled to a switch-like peer. */
export const isConnectedToSwitchPeer = ({
  item,
  connectors,
  modelItems
}: {
  item: ModelItem;
  connectors: Connector[];
  modelItems: ModelItem[];
}): boolean => {
  const ports = getModelItemPorts(item);
  for (const port of ports) {
    const peer = resolveCablePeer({
      itemId: item.id,
      portId: port.id,
      connectors,
      modelItems
    });
    if (!peer) continue;
    const peerItem = modelItems.find((candidate) => candidate.id === peer.itemId);
    if (peerItem && isSwitchLikeIcon(peerItem.icon)) return true;
  }
  return false;
};

/**
 * Powered-by-PoE flag set, but peer is not a switch / not a PoE OUT jack.
 */
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
  if (
    !isConnectedToSwitchPeer({
      item,
      connectors,
      modelItems
    })
  ) {
    return true;
  }
  return !isConnectedToPoeOutPort({
    itemId: item.id,
    connectors,
    modelItems
  });
};

const itemLabel = (item: ModelItem): string => {
  return item.name?.trim() || 'Urządzenie';
};

const countPoeOutPorts = (item: ModelItem): number => {
  return getModelItemPorts(item).filter((port) => port.poe === 'OUT').length;
};

/** First switch-like peer for an endpoint (through patch panels). */
const findSwitchPeer = ({
  item,
  connectors,
  modelItems
}: {
  item: ModelItem;
  connectors: Connector[];
  modelItems: ModelItem[];
}): {
  switchItem: ModelItem;
  /** Switch-side port id. */
  portId: string;
  /** Host-side port that reaches the switch. */
  hostPortId: string;
} | null => {
  const ports = getModelItemPorts(item);
  for (const port of ports) {
    const peer = resolveCablePeer({
      itemId: item.id,
      portId: port.id,
      connectors,
      modelItems
    });
    if (!peer) continue;
    const peerItem = modelItems.find((candidate) => candidate.id === peer.itemId);
    if (!peerItem || !isSwitchLikeIcon(peerItem.icon)) continue;
    return {
      switchItem: peerItem,
      portId: peer.portId,
      hostPortId: port.id
    };
  }
  return null;
};

/** First host port that has any cable peer (for “no switch” warnings). */
const findFirstConnectedHostPortId = ({
  item,
  connectors,
  modelItems
}: {
  item: ModelItem;
  connectors: Connector[];
  modelItems: ModelItem[];
}): string | null => {
  for (const port of getModelItemPorts(item)) {
    if (
      resolveCablePeer({
        itemId: item.id,
        portId: port.id,
        connectors,
        modelItems
      })
    ) {
      return port.id;
    }
  }
  return null;
};

export type PoeWarningPart =
  | { type: 'text'; text: string }
  | {
      type: 'item';
      itemId: string;
      label: string;
      /** When set, jump focuses this port on the device. */
      portId?: string;
    };

export type PoePlanWarning = {
  id: string;
  /** Plain-text fallback (tooltips, a11y). */
  message: string;
  /** Rich parts — device names are `item` links. */
  parts: PoeWarningPart[];
};

const partsToMessage = (parts: PoeWarningPart[]): string => {
  return parts.map((part) => (part.type === 'text' ? part.text : part.label)).join('');
};

const warning = (
  id: string,
  parts: PoeWarningPart[]
): PoePlanWarning => ({
  id,
  parts,
  message: partsToMessage(parts)
});

/**
 * Plan-wide PoE diagnostics — one warning per affected endpoint node.
 * Counter = number of nodes with a PoE problem.
 */
export const collectPoePlanWarnings = ({
  modelItems,
  connectors,
  planItemIds
}: {
  modelItems: ModelItem[];
  connectors: Connector[];
  /** View item ids on the active plan (filters the scan). */
  planItemIds: Set<string> | string[];
}): PoePlanWarning[] => {
  const onPlan = new Set(
    Array.isArray(planItemIds) ? planItemIds : Array.from(planItemIds)
  );
  const items = modelItems.filter((item) => onPlan.has(item.id));
  const warnings: PoePlanWarning[] = [];

  const poeClients = items.filter((item) => Boolean(item.poweredByPoe));

  poeClients.forEach((item) => {
    const name = itemLabel(item);
    const peer = findSwitchPeer({
      item,
      connectors,
      modelItems
    });

    if (!peer) {
      const hostPortId = findFirstConnectedHostPortId({
        item,
        connectors,
        modelItems
      });
      const hostLink: PoeWarningPart = {
        type: 'item',
        itemId: item.id,
        label: name,
        ...(hostPortId ? { portId: hostPortId } : null)
      };
      warnings.push(
        warning(`host-${item.id}`, [
          hostLink,
          {
            type: 'text',
            text: hostPortId
              ? ': oznaczone PoE, ale po drugiej stronie nie ma switcha'
              : ': oznaczone PoE, brak połączenia kablem'
          }
        ])
      );
      return;
    }

    if (
      isConnectedToPoeOutPort({
        itemId: item.id,
        connectors,
        modelItems
      })
    ) {
      return;
    }

    const hostLink: PoeWarningPart = {
      type: 'item',
      itemId: item.id,
      label: name,
      portId: peer.hostPortId
    };
    const swName = itemLabel(peer.switchItem);
    const switchLink: PoeWarningPart = {
      type: 'item',
      itemId: peer.switchItem.id,
      label: swName,
      portId: peer.portId
    };
    const outCount = countPoeOutPorts(peer.switchItem);

    if (outCount === 0) {
      warnings.push(
        warning(`host-no-poe-sw-${item.id}`, [
          hostLink,
          { type: 'text', text: ': potrzebuje PoE, a ' },
          switchLink,
          { type: 'text', text: ' nie ma portu PoE Out' }
        ])
      );
      return;
    }

    const portCfg = peer.switchItem.ports?.[peer.portId];
    const portName =
      portCfg?.name?.trim() ||
      portCfg?.label?.trim() ||
      peer.portId;
    warnings.push(
      warning(`host-port-${item.id}`, [
        hostLink,
        { type: 'text', text: `: PoE, port ${portName} na ` },
        switchLink,
        { type: 'text', text: ' nie jest PoE Out' }
      ])
    );
  });

  return warnings;
};
