import { SHAPE_2D_PC_ID, getShape2dPorts } from 'src/config';

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

export const normalizeVlanKey = (vlan: string | undefined | null) => {
  return vlan?.trim().toLowerCase() ?? '';
};

const hashString = (value: string) => {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

/** First run of digits in a VLAN key (`10`, `vlan 20`, `VLAN100` → number). */
export const parseVlanNumber = (
  vlan: string | undefined | null
): number | null => {
  const key = normalizeVlanKey(vlan);
  if (!key) return null;
  const match = key.match(/(\d{1,4})/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
};

const clampByte = (value: number) => {
  return Math.max(0, Math.min(255, Math.round(value)));
};

const hslToHex = (h: number, s: number, l: number): string => {
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lit = Math.max(0, Math.min(100, l)) / 100;
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * lit - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lit - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (channel: number) => {
    return clampByte((channel + m) * 255)
      .toString(16)
      .padStart(2, '0');
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/**
 * Golden angle (°) — successive VLAN numbers land ~137° apart on the hue
 * wheel, so neighbors never look alike (and the first 25 are all unique).
 */
const VLAN_HUE_STEP = 137.508;

/**
 * Stable auto color from a numeric VLAN id.
 * Same id → same color; different ids → clearly separated hues.
 */
export const colorFromVlanNumber = (vlanNumber: number): string => {
  const n = Math.abs(Math.trunc(vlanNumber));
  const hue = (n * VLAN_HUE_STEP) % 360;
  // Mild S/L jitter so even far wrap-arounds stay distinguishable.
  const sat = 72 - (n % 3) * 5;
  const lit = 48 + (n % 4) * 3;
  return hslToHex(hue, sat, lit);
};

/**
 * Reference swatch of the first 25 auto colors (VLAN ids 2..26).
 * Useful for UI / docs; runtime coloring always goes through `colorFromVlanNumber`.
 */
export const VLAN_AUTO_PALETTE: readonly string[] = Array.from(
  { length: 25 },
  (_, index) => {
    return colorFromVlanNumber(index + 2);
  }
);

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

type SviVlanFields = {
  vlan?: string | null;
  vlanColor?: string | null;
};

type ModelItemVlanFields = {
  id?: string;
  name?: string;
  icon?: string;
  ports?: Record<string, PortVlanFields>;
  svis?: SviVlanFields[];
};

/**
 * Manual color already assigned to any port/SVI in this VLAN (scene-wide).
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
    if (isNonVlanAwareDevice(item?.icon)) continue;

    if (item?.ports) {
      const ports = Object.values(item.ports);
      for (let j = 0; j < ports.length; j += 1) {
        const port = ports[j];
        if (!vlansMatch(port?.vlan, key)) continue;
        const custom = normalizeHexColor(port?.vlanColor);
        if (custom) return custom;
      }
    }

    if (item?.svis) {
      for (let j = 0; j < item.svis.length; j += 1) {
        const svi = item.svis[j];
        if (!vlansMatch(svi?.vlan, key)) continue;
        const custom = normalizeHexColor(svi?.vlanColor);
        if (custom) return custom;
      }
    }
  }

  return null;
};

/**
 * Auto color for a VLAN id (from its number). Returns null for empty / VLAN 1
 * (VLAN 1 must not tint cables or invent a brand color).
 */
export const getVlanColor = (vlan: string | undefined | null): string | null => {
  const key = normalizeVlanKey(vlan);
  if (!key || isVlan1(key)) return null;

  const num = parseVlanNumber(key);
  if (num != null) {
    return colorFromVlanNumber(num);
  }

  // Named VLANs without digits — stable seed into the same space as numbers.
  return colorFromVlanNumber((hashString(key) % 4094) + 2);
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

/**
 * Border tint for single-port hosts (PC / camera / 1-port templates).
 * Uses the cable’s access VLAN (peer switch), same as link coloring.
 * Returns null when not single-port or not connected.
 */
export const getSinglePortNodeVlanBorderColor = ({
  itemId,
  icon,
  connectors,
  modelItems
}: {
  itemId: string;
  icon?: string | null;
  connectors: { anchors: { ref: { item?: string; port?: string } }[] }[];
  modelItems: ModelItemVlanFields[];
}): string | null => {
  const layoutPorts = getShape2dPorts(icon ?? '');
  if (layoutPorts.length !== 1) return null;

  const portId = layoutPorts[0].id;
  const connector = connectors.find((candidate) => {
    return candidate.anchors.some((anchor) => {
      return anchor.ref.item === itemId && anchor.ref.port === portId;
    });
  });
  if (!connector) return null;

  const summary = getConnectorRelationSummary({
    anchors: connector.anchors,
    modelItems
  });

  if (summary.linkMode === 'mismatch') return TRUNK_MISMATCH_COLOR;
  if (summary.linkMode === 'trunk') return null;
  if (summary.vlanColor) return summary.vlanColor;
  return VLAN_1_COLOR;
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
 * Peer (opposite-end) ports on `itemId` when another device is selected.
 * - Node selected: all remote ports of cables touching that node.
 * - Specific ports focused: only peers of cables on those RJ45s.
 */
export const getPeerHighlightedPortIdsForItem = ({
  itemId,
  selectedItemId,
  focusedPortIds,
  connectors
}: {
  itemId: string;
  selectedItemId: string | null;
  focusedPortIds?: ReadonlySet<string> | string[] | null;
  connectors: { anchors: { ref: { item?: string; port?: string } }[] }[];
}): Set<string> => {
  const portIds = new Set<string>();
  if (!selectedItemId || selectedItemId === itemId) return portIds;

  const focused =
    !focusedPortIds || focusedPortIds instanceof Set
      ? focusedPortIds
      : new Set(focusedPortIds);

  connectors.forEach((connector) => {
    const ends = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item && anchor.ref.port);
    });
    if (ends.length < 2) return;

    const local = ends.find((anchor) => {
      return anchor.ref.item === selectedItemId;
    });
    if (!local?.ref.port) return;

    if (focused && focused.size > 0 && !focused.has(local.ref.port)) return;

    ends.forEach((anchor) => {
      if (anchor.ref.item === itemId && anchor.ref.port) {
        portIds.add(anchor.ref.port);
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

/** Stack-badge severity for overlapping cables. */
export type StackOverlapSeverity = 'sameVlan' | 'conflict';

const linkVlanKey = (summary: ConnectorRelationSummary): string => {
  if (summary.linkMode === 'trunk' || summary.linkMode === 'mismatch') {
    return summary.linkMode;
  }

  for (let i = 0; i < summary.endpoints.length; i += 1) {
    const endpoint = summary.endpoints[i];
    if (endpoint.isNonVlanAware || endpoint.type !== 'access') continue;
    if (!isVlan1(endpoint.vlan)) {
      return normalizeVlanKey(endpoint.vlan);
    }
  }

  return '1';
};

/**
 * - `sameVlan` — all links are access on the same VLAN (incl. VLAN 1)
 * - `conflict` — any trunk/mismatch, or access VLANs differ
 */
export const classifyStackOverlap = ({
  connectorIds,
  connectors,
  modelItems
}: {
  connectorIds: string[];
  connectors: {
    id: string;
    anchors: { ref: { item?: string; port?: string } }[];
  }[];
  modelItems: ModelItemVlanFields[];
}): StackOverlapSeverity => {
  if (connectorIds.length < 2) return 'sameVlan';

  const keys: string[] = [];

  for (let i = 0; i < connectorIds.length; i += 1) {
    const connector = connectors.find((candidate) => {
      return candidate.id === connectorIds[i];
    });
    if (!connector) {
      return 'conflict';
    }

    const summary = getConnectorRelationSummary({
      anchors: connector.anchors,
      modelItems
    });
    const key = linkVlanKey(summary);
    if (key === 'trunk' || key === 'mismatch') {
      return 'conflict';
    }
    keys.push(key);
  }

  const unique = new Set(keys);
  return unique.size <= 1 ? 'sameVlan' : 'conflict';
};

export const STACK_OVERLAP_COLORS = {
  sameVlan: {
    bg: '#eab308',
    bgActive: '#ca8a04',
    border: '#a16207',
    shadow: 'rgba(161, 98, 7, 0.4)'
  },
  conflict: {
    bg: '#ef4444',
    bgActive: '#dc2626',
    border: '#7f1d1d',
    shadow: 'rgba(127, 29, 29, 0.4)'
  }
} as const;

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
