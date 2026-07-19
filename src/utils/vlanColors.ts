import { SHAPE_2D_PC_ID } from 'src/config';

/**
 * Visual for VLAN 1 / non-VLAN devices (PC) on ports only.
 * Never used to tint cables — VLAN 1 has lowest priority and must not color links.
 */
export const VLAN_1_COLOR = '#94a3b8';

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

type PortVlanFields = {
  vlan?: string;
  vlanColor?: string;
  type?: 'access' | 'trunk';
};

type ModelItemVlanFields = {
  id?: string;
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
    if (!item?.ports || item.icon === SHAPE_2D_PC_ID) continue;

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

/** Port jack color. PC / VLAN 1 → gray. */
export const getPortStatusColor = (
  vlan: string | undefined | null,
  _fallbackIndex = 0,
  options?: {
    isPc?: boolean;
    customColor?: string | null;
    modelItems?: ModelItemVlanFields[];
  }
): string => {
  if (options?.isPc) {
    return VLAN_1_COLOR;
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
 * - PC / non-VLAN devices never drive cable color (their ports stay gray).
 * - VLAN 1 never tints the cable (lowest priority).
 * - Prefer first non–VLAN-1 access color (manual `vlanColor` or auto hash).
 */
export const getConnectorVlanColor = ({
  anchors,
  modelItems
}: {
  anchors: { ref: { item?: string; port?: string } }[];
  modelItems: ModelItemVlanFields[];
}): string | null => {
  let accessColor: string | null = null;

  anchors.forEach((anchor) => {
    if (accessColor) return;
    if (!anchor.ref.item || !anchor.ref.port) return;

    const modelItem = modelItems.find((item) => {
      return item.id === anchor.ref.item;
    });
    if (!modelItem) return;

    // Hosts don't understand VLANs — never use them for cable tint.
    if (modelItem.icon === SHAPE_2D_PC_ID) return;

    const port = modelItem.ports?.[anchor.ref.port];
    const portType = port?.type ?? 'access';
    if (portType !== 'access') return;

    // VLAN 1 / unset: lowest priority — do not color the link.
    if (isVlan1(port?.vlan)) return;

    const custom =
      normalizeHexColor(port?.vlanColor) ??
      findSharedVlanColor(port?.vlan, modelItems);
    if (custom) {
      accessColor = custom;
      return;
    }

    const auto = getVlanColor(port?.vlan);
    if (auto) {
      accessColor = auto;
    }
  });

  return accessColor;
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
