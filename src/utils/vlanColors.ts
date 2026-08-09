import {
  SHAPE_2D_PC_ID,
  SHAPE_2D_CAMERA_ID,
  SHAPE_2D_CAMERA_V2_ID,
  SHAPE_2D_PRINTER_ID,
  SHAPE_2D_VOIP_ID,
  SHAPE_2D_SMARTPHONE_ID,
  SHAPE_2D_IOT_ID,
  SHAPE_2D_AP_ID,
  SHAPE_2D_NAS_ID,
  SHAPE_2D_TABLET_ID,
  SHAPE_2D_PATCH_PANEL_ID,
  getShape2dPorts
} from 'src/config';
import { findPatchPanelBridgePeer, isPatchPanelItem } from './patchPanel';

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

export const TRUNK_RAINBOW_CSS = `linear-gradient(90deg, ${TRUNK_RAINBOW_COLORS.join(
  ', '
)})`;

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

/**
 * Scramble a VLAN id so nearby numbers land on unrelated palette slots.
 * SplitMix32-style — stable across JS engines / platforms.
 */
const mixVlanId = (vlanNumber: number): number => {
  let z =
    (Math.imul(vlanNumber, 0x9e3779b9) + 0x243f6a88) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
};

/**
 * Fixed categorical palette — one clear colour per family so badges never
 * land on “two greens”. Same VLAN id → same hex everywhere (every project).
 * Indexed by `mixVlanId(id) % length`.
 */
export const VLAN_DISTINCT_PALETTE = [
  '#e11d48', // rose
  '#ea580c', // orange
  '#ca8a04', // amber
  '#4d7c0f', // olive
  '#0f766e', // teal
  '#0369a1', // sky
  '#1d4ed8', // blue
  '#4f46e5', // indigo
  '#7c3aed', // violet
  '#a21caf', // fuchsia
  '#be185d', // pink
  '#9f1239', // crimson
  '#c2410c', // burnt orange
  '#a16207', // mustard
  '#166534', // forest
  '#155e75', // cyan dark
  '#1e3a8a', // navy
  '#5b21b6', // purple deep
  '#86198f', // magenta deep
  '#9a3412', // rust
  '#365314', // moss
  '#134e4a', // pine
  '#0c4a6e', // steel blue
  '#312e81', // twilight
  '#f43f5e', // rose bright
  '#f97316', // orange bright
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal bright
  '#0ea5e9', // sky bright
  '#6366f1', // indigo bright
  '#d946ef', // fuchsia bright
  '#fb7185', // pink soft
  '#fdba74', // peach
  '#84cc16', // lime
  '#2dd4bf' // aqua
] as const;

/**
 * Stable auto color from a numeric VLAN id.
 * Pure function of the id — VLAN 20 / 333 / … is the same hex in every
 * project. Palette entries are mutually distinct (no near-duplicate greens).
 */
export const colorFromVlanNumber = (vlanNumber: number): string => {
  const n = Math.abs(Math.trunc(vlanNumber));
  const mixed = mixVlanId(n === 0 ? 1 : n);
  return VLAN_DISTINCT_PALETTE[mixed % VLAN_DISTINCT_PALETTE.length];
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

/**
 * Unique VLAN ids configured on a device (ports, trunk allowed lists, SVIs).
 * Used as the default checklist for trunk links.
 */
export const collectModelItemVlans = (
  item: ModelItemVlanFields | null | undefined
): string[] => {
  const vlans = new Set<string>();

  if (item?.ports) {
    Object.values(item.ports).forEach((port) => {
      const vlan = port?.vlan?.trim();
      if (vlan) vlans.add(vlan);
      port?.allowedVlans?.forEach((entry) => {
        const key = entry?.trim();
        if (key) vlans.add(key);
      });
    });
  }

  if (item?.svis) {
    item.svis.forEach((svi) => {
      const vlan = svi?.vlan?.trim();
      if (vlan) vlans.add(vlan);
    });
  }

  return Array.from(vlans).sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true });
  });
};

export const vlansMatch = (
  a: string | undefined | null,
  b: string | undefined | null
) => {
  const keyA = normalizeVlanKey(a);
  const keyB = normalizeVlanKey(b);
  return Boolean(keyA) && keyA === keyB;
};

/** Hosts / endpoints that do not understand VLANs (e.g. PC, Camera, Printer, etc.). */
export const isNonVlanAwareDevice = (icon?: string | null) => {
  return (
    icon === SHAPE_2D_PC_ID ||
    icon === SHAPE_2D_CAMERA_ID ||
    icon === SHAPE_2D_CAMERA_V2_ID ||
    icon === SHAPE_2D_PRINTER_ID ||
    icon === SHAPE_2D_VOIP_ID ||
    icon === SHAPE_2D_SMARTPHONE_ID ||
    icon === SHAPE_2D_IOT_ID ||
    icon === SHAPE_2D_AP_ID ||
    icon === SHAPE_2D_NAS_ID ||
    icon === SHAPE_2D_TABLET_ID
  );
};

/** Passive L1 — never contributes VLAN; cables see through the bridge. */
export const isPassiveBridgeDevice = (icon?: string | null) => {
  return icon === SHAPE_2D_PATCH_PANEL_ID;
};

type PortVlanFields = {
  vlan?: string;
  vlanColor?: string;
  type?: 'access' | 'trunk';
  name?: string;
  label?: string;
  allowedVlans?: string[];
};

type SviVlanFields = {
  vlan?: string | null;
  vlanColor?: string | null;
  ip?: string | null;
  dhcp?: boolean;
};

type ModelItemVlanFields = {
  id?: string;
  name?: string;
  icon?: string;
  /** Management / host IP (nodes, DIN switches). */
  ip?: string;
  /** Host uses DHCP instead of a static `ip`. */
  dhcp?: boolean;
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
 * Same id → same color everywhere (no project-specific palette).
 */
export const getVlanColor = (
  vlan: string | undefined | null
): string | null => {
  const key = normalizeVlanKey(vlan);
  if (!key || isVlan1(key)) return null;

  const num = parseVlanNumber(key);
  if (num != null) {
    return colorFromVlanNumber(num);
  }

  // Named VLANs without digits — stable seed into the same space as numbers.
  return colorFromVlanNumber((hashString(key) % 4094) + 2);
};

/** Port jack color. VLAN 1 → gray. Trunk → first rainbow stop (use CSS gradient for full rainbow).
 * Hosts should use `getHostPortVlanColor` (peer switch VLAN) instead of `isPc`.
 * Colors come from the VLAN id only (`getVlanColor`) so the same id matches
 * across projects; stored `vlanColor` / shared overrides are ignored.
 */
export const getPortStatusColor = (
  vlan: string | undefined | null,
  _fallbackIndex = 0,
  options?: {
    isPc?: boolean;
    /** @deprecated Ignored — color is derived from VLAN id for global consistency. */
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

  return getVlanColor(vlan) ?? VLAN_1_COLOR;
};

/**
 * Cable tint from VLAN-aware **access** ports only.
 * - Hosts don't understand VLANs — never use them for cable tint.
 * - VLAN 1 never tints the cable (lowest priority).
 * - Prefer first non–VLAN-1 access color (from VLAN id via `getVlanColor`).
 * - Trunk↔trunk uses rainbow (see `linkMode`).
 */
export const getConnectorVlanColor = ({
  anchors,
  modelItems,
  connectors,
  connectorId
}: {
  anchors: { ref: { item?: string; port?: string } }[];
  modelItems: ModelItemVlanFields[];
  connectors?: {
    id?: string;
    anchors: { ref: { item?: string; port?: string } }[];
  }[];
  connectorId?: string | null;
}): string | null => {
  return getConnectorRelationSummary({
    anchors,
    modelItems,
    connectors,
    connectorId
  }).vlanColor;
};

type ConnectorVlanLookup = {
  id?: string;
  anchors: { ref: { item?: string; port?: string } }[];
};

/**
 * Jack tint for a non–VLAN-aware host port (PC / camera / …).
 * Uses the cable’s access VLAN from the peer switch — same source as cable
 * colors / switch port pills (`getConnectorRelationSummary`).
 * Returns null when the port is not connected.
 */
export const getHostPortVlanColor = ({
  itemId,
  portId,
  connectors,
  modelItems
}: {
  itemId: string;
  portId: string;
  connectors: ConnectorVlanLookup[];
  modelItems: ModelItemVlanFields[];
}): string | null => {
  const connector = connectors.find((candidate) => {
    return candidate.anchors.some((anchor) => {
      return anchor.ref.item === itemId && anchor.ref.port === portId;
    });
  });
  if (!connector) return null;

  const summary = getConnectorRelationSummary({
    anchors: connector.anchors,
    modelItems,
    connectors,
    connectorId: connector.id
  });

  if (summary.linkMode === 'mismatch') return TRUNK_MISMATCH_COLOR;
  if (summary.linkMode === 'trunk') return null;
  if (summary.vlanColor) return summary.vlanColor;
  return VLAN_1_COLOR;
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
  connectors: ConnectorVlanLookup[];
  modelItems: ModelItemVlanFields[];
}): string | null => {
  const layoutPorts = getShape2dPorts(icon ?? '');
  if (layoutPorts.length !== 1) return null;

  return getHostPortVlanColor({
    itemId,
    portId: layoutPorts[0].id,
    connectors,
    modelItems
  });
};

export type ConnectorEndpointSummary = {
  itemId: string;
  itemName: string;
  icon?: string;
  portId: string;
  portLabel: string;
  vlan: string;
  vlanColor: string | null;
  type: 'access' | 'trunk';
  isNonVlanAware: boolean;
  /**
   * Display IP: host management IP, or switch SVI IP for the link VLAN
   * (SVI matching the access VLAN the connected node is on).
   */
  ip?: string | null;
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
  /**
   * Access endpoints carry different VLANs (e.g. switch↔switch).
   * Relation UI should show VLAN per endpoint instead of repeating the same id.
   */
  vlansDiffer: boolean;
  /** Tagged VLANs carried on a trunk link (explicit allowed list or switch defaults). */
  allowedVlans: string[];
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
      modelItems,
      connectors,
      connectorId: (connector as { id?: string }).id
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
  selectedItemIds,
  focusedPortIds,
  connectors
}: {
  itemId: string;
  selectedItemIds: string[];
  focusedPortIds?: ReadonlySet<string> | string[] | null;
  connectors: { anchors: { ref: { item?: string; port?: string } }[] }[];
}): Set<string> => {
  const portIds = new Set<string>();
  if (!selectedItemIds || selectedItemIds.length === 0 || selectedItemIds.includes(itemId)) return portIds;

  const focused =
    !focusedPortIds || focusedPortIds instanceof Set
      ? focusedPortIds
      : new Set(focusedPortIds);

  connectors.forEach((connector) => {
    const ends = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item && anchor.ref.port);
    });
    if (ends.length < 2) return;

    const locals = ends.filter((anchor) => {
      return anchor.ref.item && selectedItemIds.includes(anchor.ref.item);
    });
    if (locals.length === 0) return;

    if (focused && focused.size > 0) {
      const touchesFocused = locals.some(local => local.ref.port && focused.has(local.ref.port));
      if (!touchesFocused) return;
    }

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
 * Patch-panel jacks are bridged: VLAN comes from the real devices on both sides.
 */
export const getConnectorRelationSummary = ({
  anchors,
  modelItems,
  resolvePortLabel,
  connectors,
  connectorId
}: {
  anchors: { ref: { item?: string; port?: string } }[];
  modelItems: ModelItemVlanFields[];
  resolvePortLabel?: (itemId: string, portId: string) => string;
  /** Needed to resolve patch-panel bridges to the far endpoint. */
  connectors?: {
    id?: string;
    anchors: { ref: { item?: string; port?: string } }[];
  }[];
  /** Current cable id — excluded when looking up the bridge peer. */
  connectorId?: string | null;
}): ConnectorRelationSummary => {
  const endpoints: ConnectorEndpointSummary[] = [];

  const pushEndpoint = (itemId: string, portId: string) => {
    const modelItem = modelItems.find((item) => {
      return item.id === itemId;
    });
    if (!modelItem) return;

    const port = portId ? modelItem.ports?.[portId] : undefined;
    const vlan = port?.vlan?.trim() || '1';
    const isNonVlanAware = isNonVlanAwareDevice(modelItem.icon);
    // Hosts never expose trunk — treat as access even if misconfigured.
    const portType =
      isNonVlanAware || port?.type !== 'trunk' ? 'access' : 'trunk';
    const vlanColor =
      isNonVlanAware || isVlan1(vlan) ? null : getVlanColor(vlan);

    endpoints.push({
      itemId: modelItem.id ?? itemId,
      itemName: (modelItem as { name?: string }).name?.trim() || 'Urządzenie',
      icon: modelItem.icon,
      portId,
      portLabel: portId
        ? resolvePortLabel?.(itemId, portId) ||
          port?.name?.trim() ||
          port?.label?.trim() ||
          portId
        : '—',
      vlan,
      vlanColor,
      type: portType,
      isNonVlanAware
    });
  };

  anchors.forEach((anchor) => {
    if (!anchor.ref.item) return;

    const modelItem = modelItems.find((item) => {
      return item.id === anchor.ref.item;
    });
    if (!modelItem) return;

    const portId = anchor.ref.port ?? '';

    // Patch panel is a passive bridge — use the other cable on this jack.
    if (isPatchPanelItem(modelItem) || isPassiveBridgeDevice(modelItem.icon)) {
      if (portId && connectors) {
        const peer = findPatchPanelBridgePeer({
          panelItemId: anchor.ref.item,
          portId,
          connectors,
          excludeConnectorId: connectorId
        });
        if (peer) {
          pushEndpoint(peer.itemId, peer.portId ?? '');
        }
      }
      return;
    }

    pushEndpoint(anchor.ref.item, portId);
  });

  // Cable VLAN: unique access VLANs on VLAN-aware devices
  const accessVlanEntries: { vlan: string; color: string | null }[] = [];
  const seenAccessKeys = new Set<string>();
  for (const endpoint of endpoints) {
    if (endpoint.isNonVlanAware) continue;
    if (endpoint.type !== 'access') continue;
    const key = normalizeVlanKey(endpoint.vlan) || '1';
    if (seenAccessKeys.has(key)) continue;
    seenAccessKeys.add(key);
    accessVlanEntries.push({
      vlan: endpoint.vlan.trim() || '1',
      color: endpoint.vlanColor
    });
  }

  let vlanLabel = 'VLAN 1';
  let vlanColor: string | null = null;

  if (accessVlanEntries.length === 1) {
    const only = accessVlanEntries[0];
    vlanLabel = `VLAN ${only.vlan}`;
    vlanColor = isVlan1(only.vlan) ? null : only.color;
  } else if (accessVlanEntries.length > 1) {
    vlanLabel = accessVlanEntries
      .map((entry) => {
        return `VLAN ${entry.vlan}`;
      })
      .join(' / ');
    vlanColor = null;
  }

  let linkMode: ConnectorLinkMode = 'access';
  let allowedVlans: string[] = [];

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
      vlanColor = null;
    }
  } else if (endpoints.length === 1 && endpoints[0].type === 'trunk') {
    linkMode = 'trunk';
    vlanColor = null;
  }

  if (linkMode === 'trunk') {
    const trunkEndpoints = endpoints.filter((endpoint) => {
      return endpoint.type === 'trunk' && Boolean(endpoint.portId);
    });

    const explicit = trunkEndpoints
      .map((endpoint) => {
        const item = modelItems.find((candidate) => {
          return candidate.id === endpoint.itemId;
        });
        return item?.ports?.[endpoint.portId]?.allowedVlans;
      })
      .find((list) => {
        return Array.isArray(list);
      });

    if (explicit) {
      allowedVlans = Array.from(
        new Set(
          explicit
            .map((vlan) => {
              return vlan.trim();
            })
            .filter(Boolean)
        )
      ).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true });
      });
    } else {
      const fromSwitches = new Set<string>();
      trunkEndpoints.forEach((endpoint) => {
        const item = modelItems.find((candidate) => {
          return candidate.id === endpoint.itemId;
        });
        collectModelItemVlans(item).forEach((vlan) => {
          fromSwitches.add(vlan);
        });
      });
      allowedVlans = Array.from(fromSwitches).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true });
      });
    }

    vlanLabel =
      allowedVlans.length > 0
        ? `Trunk · ${allowedVlans
            .map((vlan) => {
              return `VLAN ${vlan}`;
            })
            .join(', ')}`
        : 'Trunk';
  }

  /** Access VLAN carried by this link (for matching switch SVIs). */
  const linkAccessVlan = (() => {
    for (const endpoint of endpoints) {
      if (endpoint.isNonVlanAware) continue;
      if (endpoint.type !== 'access') continue;
      return endpoint.vlan;
    }
    return '1';
  })();

  const linkAccessVlanColor = (() => {
    if (isVlan1(linkAccessVlan)) return null;
    if (vlanColor) return vlanColor;
    return getVlanColor(linkAccessVlan);
  })();

  const endpointsWithIp: ConnectorEndpointSummary[] = endpoints.map(
    (endpoint) => {
      const modelItem = modelItems.find((item) => {
        return item.id === endpoint.itemId;
      });

      // Hosts do not configure VLANs — show the peer switch access VLAN on the link.
      const displayEndpoint =
        endpoint.isNonVlanAware && linkMode === 'access'
          ? {
              ...endpoint,
              vlan: linkAccessVlan,
              vlanColor: linkAccessVlanColor
            }
          : endpoint;

      if (!modelItem) return { ...displayEndpoint, ip: null };

      // Host / endpoint node → management IP (or DHCP)
      if (displayEndpoint.isNonVlanAware) {
        if (modelItem.dhcp) {
          return { ...displayEndpoint, ip: 'DHCP' };
        }
        const hostIp = modelItem.ip?.trim();
        return { ...displayEndpoint, ip: hostIp || null };
      }

      // Switch with SVIs → IP of SVI for the VLAN this link (node) is on
      if (modelItem.svis && modelItem.svis.length > 0) {
        const vlanForSvi =
          displayEndpoint.type === 'access'
            ? displayEndpoint.vlan
            : linkAccessVlan;
        const svi = modelItem.svis.find((candidate) => {
          return vlansMatch(candidate.vlan, vlanForSvi);
        });
        if (svi?.dhcp) {
          return { ...displayEndpoint, ip: 'DHCP' };
        }
        const sviIp = svi?.ip?.trim();
        if (sviIp) return { ...displayEndpoint, ip: sviIp };
        // Trunk without a matching access VLAN — optional management IP
        if (modelItem.dhcp) {
          return { ...displayEndpoint, ip: 'DHCP' };
        }
        const mgmt = modelItem.ip?.trim();
        return { ...displayEndpoint, ip: mgmt || null };
      }

      // Servers / other nodes → management IP (or DHCP)
      if (modelItem.dhcp) {
        return { ...displayEndpoint, ip: 'DHCP' };
      }
      const mgmt = modelItem.ip?.trim();
      return { ...displayEndpoint, ip: mgmt || null };
    }
  );

  // After host VLAN inheritance, decide whether the relation UI should show
  // VLAN per endpoint (only when access VLANs actually differ).
  const displayedAccessKeys = new Set<string>();
  endpointsWithIp.forEach((endpoint) => {
    if (endpoint.type !== 'access') return;
    displayedAccessKeys.add(normalizeVlanKey(endpoint.vlan) || '1');
  });

  return {
    endpoints: endpointsWithIp,
    vlanLabel,
    vlanColor,
    linkMode,
    vlansDiffer: linkMode === 'access' && displayedAccessKeys.size > 1,
    allowedVlans
  };
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
      modelItems,
      connectors,
      connectorId: connector.id
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
