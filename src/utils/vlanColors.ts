import { SHAPE_2D_PC_ID } from 'src/config';

/**
 * Visual for VLAN 1 / non-VLAN devices (PC) on ports only.
 * Never used to tint cables — VLAN 1 has lowest priority and must not color links.
 */
export const VLAN_1_COLOR = '#94a3b8';

/** Rainbow stops for trunk ports / trunk↔trunk cables. */
export const TRUNK_RAINBOW_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#a855f7'
] as const;

export const TRUNK_RAINBOW_CSS = `linear-gradient(90deg, ${TRUNK_RAINBOW_COLORS.join(', ')})`;

/** Outline for invalid trunk links (trunk↔access / trunk↔host). */
export const TRUNK_MISMATCH_COLOR = '#ef4444';

const VLAN_PALETTE = [
  '#4c8bf5',
  '#3ecf8e',
  '#f0a04b',
  '#a78bfa',
  '#ef4444',
  '#14b8a6',
  '#ec4899',
  '#84cc16',
  '#06b6d4',
  '#f97316',
  '#8b5cf6',
  '#22c55e',
  '#eab308',
  '#3b82f6',
  '#d946ef',
  '#64748b'
];

const hashString = (value: string) => {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

export const normalizeVlanKey = (vlan: string | undefined | null) => {
  return vlan?.trim().toLowerCase() ?? '';
};

const normalizeHexColor = (color: string | undefined | null) => {
  const value = color?.trim();
  if (!value) return null;
  return value;
};

export const isVlan1 = (vlan: string | undefined | null) => {
  const key = normalizeVlanKey(vlan);
  return !key || key === '1' || key === 'vlan1' || key === 'vlan 1';
};

export const vlansMatch = (
  a: string | undefined | null,
  b: string | undefined | null
) => {
  const keyA = normalizeVlanKey(a);
  const keyB = normalizeVlanKey(b);
  return Boolean(keyA) && keyA === keyB;
};

/** Hosts / endpoints that do not understand VLANs (e.g. PC). */
export const isNonVlanAwareDevice = (icon?: string | null) => {
  return icon === SHAPE_2D_PC_ID;
};

type PortVlanFields = {
  vlan?: string;
  vlanColor?: string;
  type?: 'access' | 'trunk';
  name?: string;
  label?: string;
};

type ModelItemVlanFields = {
  id?: string;
  name?: string;
  icon?: string;
  ports?: Record<string, PortVlanFields>;
};

/**
 * Manual color already assigned to any port in this VLAN (scene-wide).
 * VLAN 1 / empty never has a shared brand color.
 */
export const findSharedVlanColor = (
  vlan: string | undefined | null,
  modelItems: ModelItemVlanFields[]
): string | null => {
  if (isVlan1(vlan)) return null;

  const key = normalizeVlanKey(vlan);
  if (!key) return null;

  for (let i = 0; i < modelItems.length; i += 1) {
    const item = modelItems[i];
    if (!item?.ports || isNonVlanAwareDevice(item.icon)) continue;

    const ports = Object.values(item.ports);
    for (let j = 0; j < ports.length; j += 1) {
      const port = ports[j];
      if (!vlansMatch(port?.vlan, key)) continue;
      const custom = normalizeHexColor(port?.vlanColor);
      if (custom) return custom;
    }
  }

  return null;
};

/**
 * Auto color for a VLAN id. Returns null for empty / VLAN 1
 * (VLAN 1 must not tint cables or invent a brand color).
 */
export const getVlanColor = (vlan: string | undefined | null): string | null => {
  const key = normalizeVlanKey(vlan);
  if (!key || isVlan1(key)) return null;

  return VLAN_PALETTE[hashString(key) % VLAN_PALETTE.length];
};

/** Port jack color. PC / VLAN 1 → gray. Trunk → first rainbow stop (use CSS gradient for full rainbow). */
export const getPortStatusColor = (
  vlan: string | undefined | null,
  _fallbackIndex = 0,
  options?: {
    isPc?: boolean;
    customColor?: string | null;
    modelItems?: ModelItemVlanFields[];
    portType?: 'access' | 'trunk';
  }
): string => {
  if (options?.isPc) {
    return VLAN_1_COLOR;
  }

  if (options?.portType === 'trunk') {
    return TRUNK_RAINBOW_COLORS[0];
  }

  const custom =
    normalizeHexColor(options?.customColor) ??
    (options?.modelItems
      ? findSharedVlanColor(vlan, options.modelItems)
      : null);
  if (custom) {
    return custom;
  }

  return getVlanColor(vlan) ?? VLAN_1_COLOR;
};

/**
 * Cable tint from VLAN-aware **access** ports only.
 * - Hosts don't understand VLANs — never use them for cable tint.
 * - VLAN 1 never tints the cable (lowest priority).
 * - Prefer first non–VLAN-1 access color (manual `vlanColor` or auto hash).
 * - Trunk↔trunk uses rainbow (see `linkMode`).
 */
export const getConnectorVlanColor = ({
  anchors,
  modelItems
}: {
  anchors: { ref: { item?: string; port?: string } }[];
  modelItems: ModelItemVlanFields[];
}): string | null => {
  return getConnectorRelationSummary({ anchors, modelItems }).vlanColor;
};

export type ConnectorEndpointSummary = {
  itemId: string;
  itemName: string;
  portId: string;
  portLabel: string;
  vlan: string;
  vlanColor: string | null;
  type: 'access' | 'trunk';
  isNonVlanAware: boolean;
};

export type ConnectorLinkMode = 'access' | 'trunk' | 'mismatch';

export type ConnectorRelationSummary = {
  endpoints: ConnectorEndpointSummary[];
  /** Display VLAN for the link (from access ports; VLAN 1 / empty → „VLAN 1”). */
  vlanLabel: string;
  vlanColor: string | null;
  /**
   * - `trunk` — both ends trunk (rainbow)
   * - `mismatch` — trunk↔access or trunk↔host (red cable + port borders)
   * - `access` — normal VLAN coloring
   */
  linkMode: ConnectorLinkMode;
};

/**
 * Port ids on `itemId` that participate in a trunk mismatch link.
 */
export const getMismatchPortIdsForItem = ({
  itemId,
  connectors,
  modelItems
}: {
  itemId: string;
  connectors: { anchors: { ref: { item?: string; port?: string } }[] }[];
  modelItems: ModelItemVlanFields[];
}): Set<string> => {
  const portIds = new Set<string>();

  connectors.forEach((connector) => {
    const summary = getConnectorRelationSummary({
      anchors: connector.anchors,
      modelItems
    });
    if (summary.linkMode !== 'mismatch') return;

    summary.endpoints.forEach((endpoint) => {
      if (endpoint.itemId === itemId && endpoint.portId) {
        portIds.add(endpoint.portId);
      }
    });
  });

  return portIds;
};

/**
 * Human-readable relation + VLAN for a cable (hover popup / stroke style).
 */
export const getConnectorRelationSummary = ({
  anchors,
  modelItems,
  resolvePortLabel
}: {
  anchors: { ref: { item?: string; port?: string } }[];
  modelItems: ModelItemVlanFields[];
  resolvePortLabel?: (itemId: string, portId: string) => string;
}): ConnectorRelationSummary => {
  const endpoints: ConnectorEndpointSummary[] = [];

  anchors.forEach((anchor) => {
    if (!anchor.ref.item) return;

    const modelItem = modelItems.find((item) => {
      return item.id === anchor.ref.item;
    });
    if (!modelItem) return;

    const portId = anchor.ref.port ?? '';
    const port = portId ? modelItem.ports?.[portId] : undefined;
    const vlan = port?.vlan?.trim() || '1';
    const isNonVlanAware = isNonVlanAwareDevice(modelItem.icon);
    // Hosts never expose trunk — treat as access even if misconfigured.
    const portType =
      isNonVlanAware || port?.type !== 'trunk' ? 'access' : 'trunk';
    const custom =
      normalizeHexColor(port?.vlanColor) ??
      findSharedVlanColor(vlan, modelItems);
    const vlanColor =
      isNonVlanAware || isVlan1(vlan) ? null : custom ?? getVlanColor(vlan);

    endpoints.push({
      itemId: modelItem.id ?? anchor.ref.item,
      itemName: (modelItem as { name?: string }).name?.trim() || 'Urządzenie',
      portId,
      portLabel: portId
        ? resolvePortLabel?.(anchor.ref.item, portId) ||
          port?.name?.trim() ||
          port?.label?.trim() ||
          portId
        : '—',
      vlan,
      vlanColor,
      type: portType,
      isNonVlanAware
    });
  });

  // Cable VLAN: first non–VLAN-1 access port on a VLAN-aware device
  let vlanLabel = 'VLAN 1';
  let vlanColor: string | null = null;

  for (const endpoint of endpoints) {
    if (endpoint.isNonVlanAware) continue;
    if (endpoint.type !== 'access') continue;
    if (isVlan1(endpoint.vlan)) continue;

    vlanLabel = `VLAN ${endpoint.vlan}`;
    vlanColor = endpoint.vlanColor;
    break;
  }

  let linkMode: ConnectorLinkMode = 'access';

  if (endpoints.length >= 2) {
    const trunkCount = endpoints.filter((endpoint) => {
      return endpoint.type === 'trunk';
    }).length;
    const touchesHost = endpoints.some((endpoint) => {
      return endpoint.isNonVlanAware;
    });

    if (trunkCount >= 1 && (trunkCount < endpoints.length || touchesHost)) {
      // Trunk ↔ access, or trunk ↔ host (PC / non-VLAN device)
      linkMode = 'mismatch';
    } else if (trunkCount >= 2) {
      linkMode = 'trunk';
      vlanLabel = 'Trunk';
      vlanColor = null;
    }
  } else if (endpoints.length === 1 && endpoints[0].type === 'trunk') {
    linkMode = 'trunk';
    vlanLabel = 'Trunk';
    vlanColor = null;
  }

  return { endpoints, vlanLabel, vlanColor, linkMode };
};

export const PORT_SPEED_OPTIONS = [
  '10M',
  '100M',
  '1G',
  '2.5G',
  '5G',
  '10G',
  '25G',
  '40G',
  '100G'
] as const;
