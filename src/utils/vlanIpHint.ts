import { getModelItemPorts } from 'src/config';
import type { Connector, ModelItem } from 'src/types';
import {
  isNonVlanAwareDevice,
  isPassiveBridgeDevice,
  normalizeVlanKey,
  vlansMatch
} from 'src/utils/vlanColors';
import { findPatchPanelBridgePeer, isPatchPanelItem } from 'src/utils/patchPanel';

export type VlanIpHint =
  | { kind: 'suggestion'; placeholder: string; networkKey: string }
  | { kind: 'ambiguous' }
  | { kind: 'none' };

const IPV4_CIDR_RE =
  /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/;

const parseIpv4Parts = (
  raw: string
): { octets: number[]; prefix: number } | null => {
  const text = raw.trim();
  if (!text || text.toUpperCase() === 'DHCP') return null;
  const match = text.match(IPV4_CIDR_RE);
  if (!match) return null;
  const octets = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4])
  ];
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return null;
  }
  const prefix = match[5] !== undefined ? Number(match[5]) : 24;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return { octets, prefix };
};

/** Stable network identity for ambiguity checks, e.g. `192.168.10.0/24`. */
export const ipv4NetworkKey = (raw: string): string | null => {
  const parsed = parseIpv4Parts(raw);
  if (!parsed) return null;
  const { octets, prefix } = parsed;
  const mask =
    prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const addr =
    ((octets[0] << 24) >>> 0) +
    ((octets[1] << 16) >>> 0) +
    ((octets[2] << 8) >>> 0) +
    (octets[3] >>> 0);
  const net = (addr & mask) >>> 0;
  const n0 = (net >>> 24) & 255;
  const n1 = (net >>> 16) & 255;
  const n2 = (net >>> 8) & 255;
  const n3 = net & 255;
  return `${n0}.${n1}.${n2}.${n3}/${prefix}`;
};

/**
 * Human suggestion with host bits as `x`, e.g. `192.168.10.x/24`.
 */
export const ipv4SuggestionPlaceholder = (raw: string): string | null => {
  const parsed = parseIpv4Parts(raw);
  if (!parsed) return null;
  const { octets, prefix } = parsed;
  const mask =
    prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const addr =
    ((octets[0] << 24) >>> 0) +
    ((octets[1] << 16) >>> 0) +
    ((octets[2] << 8) >>> 0) +
    (octets[3] >>> 0);
  const net = (addr & mask) >>> 0;
  const n = [
    (net >>> 24) & 255,
    (net >>> 16) & 255,
    (net >>> 8) & 255,
    net & 255
  ];
  const hostBits = 32 - prefix;
  const out = n.map((octet, index) => {
    const bitStart = index * 8;
    const bitEnd = bitStart + 8;
    if (hostBits <= 0) return String(octet);
    // Octet fully in host portion
    if (bitStart >= 32 - hostBits) return 'x';
    // Octet fully in network portion
    if (bitEnd <= 32 - hostBits) return String(octet);
    // Mixed — keep network bits as number is awkward; use x for simplicity
    return 'x';
  });
  // Prefer classic /24 look: 192.168.10.x
  if (prefix >= 24) {
    return `${n[0]}.${n[1]}.${n[2]}.x/${prefix}`;
  }
  if (prefix >= 16) {
    return `${n[0]}.${n[1]}.x.x/${prefix}`;
  }
  if (prefix >= 8) {
    return `${n[0]}.x.x.x/${prefix}`;
  }
  return `${out.join('.')}/${prefix}`;
};

const addVlan = (set: Set<string>, vlan: string | undefined | null) => {
  const key = normalizeVlanKey(vlan) || '1';
  set.add(key === '' ? '1' : key);
};

/** Access VLANs configured on this item's ports. */
const collectLocalAccessVlans = (item: ModelItem): Set<string> => {
  const vlans = new Set<string>();
  const ports = getModelItemPorts(item);
  ports.forEach((port) => {
    const config = item.ports?.[port.id];
    if (config?.type === 'trunk') return;
    addVlan(vlans, config?.vlan);
  });
  if (vlans.size === 0) addVlan(vlans, '1');
  return vlans;
};

/**
 * Resolve peer on the other end of a cable, following patch-panel bridges.
 */
const resolveCablePeer = ({
  itemId,
  portId,
  connectors,
  modelItems
}: {
  itemId: string;
  portId: string;
  connectors: Connector[];
  modelItems: ModelItem[];
}): { itemId: string; portId: string } | null => {
  const direct = connectors.find((connector) => {
    return connector.anchors.some((anchor) => {
      return anchor.ref.item === itemId && anchor.ref.port === portId;
    });
  });
  if (!direct) return null;

  const other = direct.anchors.find((anchor) => {
    return !(anchor.ref.item === itemId && anchor.ref.port === portId);
  });
  if (!other?.ref.item || !other.ref.port) return null;

  const peerItem = modelItems.find((item) => {
    return item.id === other.ref.item;
  });
  if (!peerItem) return null;

  if (isPassiveBridgeDevice(peerItem.icon) || isPatchPanelItem(peerItem)) {
    const bridged = findPatchPanelBridgePeer({
      panelItemId: peerItem.id,
      portId: other.ref.port,
      connectors
    });
    if (bridged?.itemId && bridged.portId) {
      return { itemId: bridged.itemId, portId: bridged.portId };
    }
  }

  return { itemId: peerItem.id, portId: other.ref.port };
};

/**
 * Effective access VLAN(s) for a node.
 * Prefer peer switch access VLANs when cabled; otherwise local port config.
 */
export const collectEffectiveAccessVlans = ({
  itemId,
  modelItem,
  modelItems,
  connectors
}: {
  itemId: string;
  modelItem: ModelItem;
  modelItems: ModelItem[];
  connectors: Connector[];
}): string[] => {
  const peerVlans = new Set<string>();
  const ports = getModelItemPorts(modelItem);

  ports.forEach((port) => {
    const peer = resolveCablePeer({
      itemId,
      portId: port.id,
      connectors,
      modelItems
    });
    if (!peer) return;
    const peerItem = modelItems.find((item) => {
      return item.id === peer.itemId;
    });
    if (!peerItem || isNonVlanAwareDevice(peerItem.icon)) return;
    const peerConfig = peerItem.ports?.[peer.portId];
    if (peerConfig?.type === 'trunk') return;
    addVlan(peerVlans, peerConfig?.vlan);
  });

  if (peerVlans.size > 0) return Array.from(peerVlans);
  return Array.from(collectLocalAccessVlans(modelItem));
};

/** Gather IPv4 CIDRs already used in a VLAN (SVIs + other hosts). */
const collectIpsInVlan = ({
  vlan,
  excludeItemId,
  modelItems,
  connectors
}: {
  vlan: string;
  excludeItemId: string;
  modelItems: ModelItem[];
  connectors: Connector[];
}): string[] => {
  const ips: string[] = [];

  modelItems.forEach((item) => {
    if (item.id === excludeItemId) return;

    // Switch SVIs
    item.svis?.forEach((svi) => {
      if (!vlansMatch(svi.vlan, vlan)) return;
      const ip = svi.ip?.trim();
      if (ip) ips.push(ip);
    });

    // Other hosts / endpoints in this VLAN
    if (!isNonVlanAwareDevice(item.icon)) return;
    if (item.dhcp) return;
    const hostIp = item.ip?.trim();
    if (!hostIp) return;

    const hostVlans = collectEffectiveAccessVlans({
      itemId: item.id,
      modelItem: item,
      modelItems,
      connectors
    });
    if (hostVlans.some((v) => vlansMatch(v, vlan))) {
      ips.push(hostIp);
    }
  });

  return ips;
};

/**
 * Suggest an IP pattern for a node from SVIs / peers in the same VLAN.
 * Conflicting networks → `ambiguous` ("Nie jasna konfiguracja IP").
 */
export const getVlanIpHint = ({
  itemId,
  modelItem,
  modelItems,
  connectors
}: {
  itemId: string;
  modelItem: ModelItem;
  modelItems: ModelItem[];
  connectors: Connector[];
}): VlanIpHint => {
  if (!isNonVlanAwareDevice(modelItem.icon)) return { kind: 'none' };

  const vlans = collectEffectiveAccessVlans({
    itemId,
    modelItem,
    modelItems,
    connectors
  });

  const networkKeys = new Set<string>();
  const samples: string[] = [];

  vlans.forEach((vlan) => {
    collectIpsInVlan({
      vlan,
      excludeItemId: itemId,
      modelItems,
      connectors
    }).forEach((ip) => {
      const key = ipv4NetworkKey(ip);
      if (!key) return;
      networkKeys.add(key);
      samples.push(ip);
    });
  });

  if (networkKeys.size === 0) return { kind: 'none' };
  if (networkKeys.size > 1) return { kind: 'ambiguous' };

  const sample = samples[0];
  const placeholder = ipv4SuggestionPlaceholder(sample);
  if (!placeholder) return { kind: 'none' };

  return {
    kind: 'suggestion',
    placeholder,
    networkKey: Array.from(networkKeys)[0]
  };
};
