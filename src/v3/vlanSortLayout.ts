import type { Connector, Coords, ModelItem, ViewItem } from 'src/types';
import {
  getModelItemSize,
  getShape2dSize,
  SHAPE_2D_CABINET_ID
} from 'src/config';
import { isSwitchLikeIcon } from 'src/utils/shape2dLayout';
import {
  isNonVlanAwareDevice,
  isPassiveBridgeDevice,
  normalizeVlanKey
} from 'src/utils/vlanColors';
import { collectEffectiveAccessVlans } from 'src/utils/vlanIpHint';
import {
  densityCirclePadForMemberCount,
  type DensityGroup,
  type DensityGroupBounds
} from './densityGroups';

/** Gap between different VLAN clusters (tiles) — above density-group merge threshold. */
const VLAN_CLUSTER_GAP = 4;
/** Max width of one VLAN pack before wrapping to the next row (tiles). */
const MAX_CLUSTER_ROW_TILES = 80;

export type ClusterItemsByVlanResult = {
  targets: Record<string, Coords>;
  vlanGroupCount: number;
  movedNodes: number;
};

/** One movable VLAN block (optionally scoped to a hub switch). */
export type VlanMemberGroup = {
  /** Stable key: `vlan` or `switchId::vlan`. */
  key: string;
  vlan: string;
  /** Dominant / uplink switch when known. */
  switchId: string | null;
  memberIds: string[];
};

const footprintOf = (
  itemId: string,
  modelById: Map<string, ModelItem>
): { width: number; height: number } => {
  const model = modelById.get(itemId);
  const size =
    getModelItemSize(model ?? {}) ??
    getShape2dSize(model?.icon ?? '') ?? { width: 1, height: 1 };
  return {
    width: Math.max(1, Math.ceil(size.width)),
    height: Math.max(1, Math.ceil(size.height))
  };
};

/**
 * Primary VLAN key for layout grouping.
 * Hosts: uplink access VLAN from the peer switch (else local access).
 * Switch-like / cabinets / panels: null (stay put — they span many VLANs).
 */
export const primaryVlanKeyForItem = ({
  itemId,
  modelItem,
  modelItems,
  connectors
}: {
  itemId: string;
  modelItem: ModelItem | undefined;
  modelItems: ModelItem[];
  connectors: Connector[];
}): string | null => {
  if (!modelItem?.icon) return null;
  if (modelItem.icon === SHAPE_2D_CABINET_ID) return null;
  if (isPassiveBridgeDevice(modelItem.icon)) return null;
  if (isSwitchLikeIcon(modelItem.icon) && !isNonVlanAwareDevice(modelItem.icon)) {
    return null;
  }

  const vlans = collectEffectiveAccessVlans({
    itemId,
    modelItem,
    modelItems,
    connectors
  });
  if (vlans.length === 0) return '1';
  return normalizeVlanKey(vlans[0]) || '1';
};

/**
 * First switch-like peer of a leaf (uplink hub). Used to scope VLAN packs
 * per switch so SW-A's VLAN10 does not merge with SW-B's VLAN10.
 */
export const hubSwitchIdForLeaf = ({
  itemId,
  modelItems,
  connectors
}: {
  itemId: string;
  modelItems: ModelItem[];
  connectors: Connector[];
}): string | null => {
  const iconById = new Map(
    modelItems.map((item) => [item.id, item.icon] as const)
  );
  for (const connector of connectors) {
    const ends = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (ends.length < 2) continue;
    const first = ends[0].ref.item!;
    const last = ends[ends.length - 1].ref.item!;
    if (first !== itemId && last !== itemId) continue;
    const other = first === itemId ? last : first;
    if (isSwitchLikeIcon(iconById.get(other))) return other;
  }
  return null;
};

const compareVlanKeys = (a: string, b: string) => {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === a && String(nb) === b) {
    return na - nb;
  }
  return a.localeCompare(b, undefined, { numeric: true });
};

/**
 * Build explicit VLAN membership groups for layout.
 * When `perHub` is true (2v), groups are scoped to `(switch, vlan)` so each
 * hub gets its own VLAN blocks. Scene-wide (`perHub: false`) matches 1v.
 */
export const buildVlanMemberGroups = ({
  items,
  modelItems,
  connectors,
  perHub = false
}: {
  items: ViewItem[];
  modelItems: ModelItem[];
  connectors: Connector[];
  perHub?: boolean;
}): VlanMemberGroup[] => {
  const modelById = new Map(modelItems.map((item) => [item.id, item] as const));
  const buckets = new Map<string, VlanMemberGroup>();

  items.forEach((viewItem) => {
    if (viewItem.parentId) return;
    const modelItem = modelById.get(viewItem.id);
    const vlan = primaryVlanKeyForItem({
      itemId: viewItem.id,
      modelItem,
      modelItems,
      connectors
    });
    if (!vlan) return;

    const switchId = perHub
      ? hubSwitchIdForLeaf({
          itemId: viewItem.id,
          modelItems,
          connectors
        })
      : null;
    const key = switchId ? `${switchId}::${vlan}` : vlan;
    const existing = buckets.get(key);
    if (existing) {
      existing.memberIds.push(viewItem.id);
    } else {
      buckets.set(key, { key, vlan, switchId, memberIds: [viewItem.id] });
    }
  });

  return Array.from(buckets.values())
    .filter((group) => {
      return group.memberIds.length >= 2;
    })
    .sort((a, b) => {
      if (a.switchId !== b.switchId) {
        return (a.switchId ?? '').localeCompare(b.switchId ?? '');
      }
      return compareVlanKeys(a.vlan, b.vlan);
    });
};

/** Bounds + circumcircle for an explicit member set (current tile positions). */
export const densityGroupFromMemberIds = ({
  id,
  memberIds,
  items,
  modelItems
}: {
  id: string;
  memberIds: string[];
  items: Array<Pick<ViewItem, 'id' | 'tile'>>;
  modelItems: ModelItem[];
}): DensityGroup | null => {
  if (memberIds.length === 0) return null;
  const modelById = new Map(modelItems.map((item) => [item.id, item] as const));
  const itemById = new Map(items.map((item) => [item.id, item] as const));

  const fps: DensityGroupBounds[] = [];
  memberIds.forEach((mid) => {
    const item = itemById.get(mid);
    if (!item) return;
    const size = footprintOf(mid, modelById);
    fps.push({ x: item.tile.x, y: item.tile.y, w: size.width, h: size.height });
  });
  if (fps.length === 0) return null;

  const x = Math.min(...fps.map((fp) => fp.x));
  const y = Math.min(...fps.map((fp) => fp.y));
  const right = Math.max(...fps.map((fp) => fp.x + fp.w));
  const bottom = Math.max(...fps.map((fp) => fp.y + fp.h));
  const w = right - x;
  const h = bottom - y;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const pad = densityCirclePadForMemberCount(fps.length);
  const r = Math.sqrt((w / 2) ** 2 + (h / 2) ** 2) + pad;

  return {
    id,
    memberIds: [...memberIds],
    bounds: { x, y, w, h },
    circle: { cx, cy, r }
  };
};

export const densityGroupsFromVlanMembers = ({
  vlanGroups,
  items,
  modelItems
}: {
  vlanGroups: VlanMemberGroup[];
  items: Array<Pick<ViewItem, 'id' | 'tile'>>;
  modelItems: ModelItem[];
}): DensityGroup[] => {
  const groups: DensityGroup[] = [];
  vlanGroups.forEach((vg, index) => {
    const group = densityGroupFromMemberIds({
      id: `vlan-group-${index}`,
      memberIds: vg.memberIds,
      items,
      modelItems
    });
    if (group) groups.push(group);
  });
  return groups;
};

const ceilToStep = (value: number, step: number): number => {
  const s = Math.max(1, step);
  return Math.max(s, Math.ceil(value / s) * s);
};

const packMemberClusters = ({
  clusters,
  items,
  modelItems,
  gridStep
}: {
  clusters: Array<{ ids: string[] }>;
  items: ViewItem[];
  modelItems: ModelItem[];
  gridStep: { x: number; y: number };
}): Record<string, Coords> => {
  if (clusters.length === 0) return {};

  const modelById = new Map(modelItems.map((item) => [item.id, item]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const stepX = Math.max(1, gridStep.x);
  const stepY = Math.max(1, gridStep.y);

  let minX = Infinity;
  let minY = Infinity;
  clusters.forEach((cluster) => {
    cluster.ids.forEach((id) => {
      const item = itemById.get(id);
      if (!item) return;
      minX = Math.min(minX, item.tile.x);
      minY = Math.min(minY, item.tile.y);
    });
  });
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;

  // Anchor on a grid line so every packed tile stays aligned.
  minX = Math.round(minX / stepX) * stepX;
  minY = Math.round(minY / stepY) * stepY;

  const targets: Record<string, Coords> = {};
  let cursorX = minX;
  let cursorY = minY;
  let rowMaxH = 0;

  clusters.forEach((cluster, clusterIndex) => {
    const ordered = [...cluster.ids].sort((a, b) => {
      const ta = itemById.get(a)?.tile;
      const tb = itemById.get(b)?.tile;
      if (!ta || !tb) return 0;
      if (ta.y !== tb.y) return ta.y - tb.y;
      return ta.x - tb.x;
    });

    type Cell = { id: string; w: number; h: number };
    const cells: Cell[] = ordered.map((id) => {
      const size = footprintOf(id, modelById);
      return { id, w: size.width, h: size.height };
    });

    const rows: Cell[][] = [];
    let row: Cell[] = [];
    let rowW = 0;
    let packW = 0;
    let packH = 0;

    cells.forEach((cell) => {
      const cellAdvance = ceilToStep(cell.w, stepX);
      if (row.length > 0 && rowW + cellAdvance > MAX_CLUSTER_ROW_TILES) {
        rows.push(row);
        row = [];
        rowW = 0;
      }
      row.push(cell);
      rowW += cellAdvance;
      packW = Math.max(packW, rowW);
    });
    if (row.length > 0) rows.push(row);

    rows.forEach((r) => {
      const h = ceilToStep(Math.max(...r.map((c) => c.h), 1), stepY);
      packH += h;
    });

    if (clusterIndex > 0 && cursorX + packW - minX > MAX_CLUSTER_ROW_TILES * 1.5) {
      cursorX = minX;
      cursorY += rowMaxH + ceilToStep(VLAN_CLUSTER_GAP, stepY);
      rowMaxH = 0;
    }

    let localY = 0;
    rows.forEach((r) => {
      const h = ceilToStep(Math.max(...r.map((c) => c.h), 1), stepY);
      let localX = 0;
      r.forEach((cell) => {
        const tile = { x: cursorX + localX, y: cursorY + localY };
        const prev = itemById.get(cell.id)?.tile;
        if (!prev || prev.x !== tile.x || prev.y !== tile.y) {
          targets[cell.id] = tile;
        }
        // Advance by whole grid cells — never snap(prev+w) which can round
        // *down* into the previous footprint (19 → snap 18 on a 9-step grid).
        localX += ceilToStep(cell.w, stepX);
      });
      localY += h;
    });

    cursorX += packW + ceilToStep(VLAN_CLUSTER_GAP, stepX);
    rowMaxH = Math.max(rowMaxH, packH);
  });

  return targets;
};

/**
 * Pack leaf nodes that share a VLAN into compact clusters, then leave hubs
 * (switches / cabinets) in place. Clusters are separated so density-group
 * "Test" treats each VLAN as its own group.
 *
 * When `perHub` is true, packs are scoped to `(switch, vlan)` — required for
 * 2v so different VLANs on the same switch become separate rigid blocks.
 */
export const clusterItemsByVlan = ({
  items,
  modelItems,
  connectors,
  gridStep = { x: 1, y: 1 },
  perHub = false
}: {
  items: ViewItem[];
  modelItems: ModelItem[];
  connectors: Connector[];
  gridStep?: { x: number; y: number };
  perHub?: boolean;
}): ClusterItemsByVlanResult => {
  const vlanGroups = buildVlanMemberGroups({
    items,
    modelItems,
    connectors,
    perHub
  });

  if (vlanGroups.length === 0) {
    return { targets: {}, vlanGroupCount: 0, movedNodes: 0 };
  }

  // One strip of packs: each `(switch, vlan)` (or scene-wide vlan) is a
  // contiguous block separated by VLAN_CLUSTER_GAP so proximity grouping
  // cannot merge different VLANs before arrange seats them.
  const targets = packMemberClusters({
    clusters: vlanGroups.map((g) => ({ ids: g.memberIds })),
    items,
    modelItems,
    gridStep
  });

  return {
    targets,
    vlanGroupCount: vlanGroups.length,
    movedNodes: Object.keys(targets).length
  };
};
