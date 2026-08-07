import type { Connector, Coords, ModelItem, ViewItem } from 'src/types';
import {
  getModelItemSize,
  getShape2dSize,
  SHAPE_2D_CABINET_ID
} from 'src/config';
import { isSwitchLikeIcon } from 'src/utils/shape2dLayout';
import { snapTile2dToGrid } from 'src/utils/renderer';
import {
  isNonVlanAwareDevice,
  isPassiveBridgeDevice,
  normalizeVlanKey
} from 'src/utils/vlanColors';
import { collectEffectiveAccessVlans } from 'src/utils/vlanIpHint';

/** Gap between different VLAN clusters (tiles) — above density-group merge threshold. */
const VLAN_CLUSTER_GAP = 4;
/** Max width of one VLAN pack before wrapping to the next row (tiles). */
const MAX_CLUSTER_ROW_TILES = 80;

export type ClusterItemsByVlanResult = {
  targets: Record<string, Coords>;
  vlanGroupCount: number;
  movedNodes: number;
};

const footprintOf = (
  itemId: string,
  modelById: Map<string, ModelItem>
): { width: number; height: number } => {
  const model = modelById.get(itemId);
  return (
    getModelItemSize(model ?? {}) ??
    getShape2dSize(model?.icon ?? '') ?? { width: 1, height: 1 }
  );
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

const compareVlanKeys = (a: string, b: string) => {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === a && String(nb) === b) {
    return na - nb;
  }
  return a.localeCompare(b, undefined, { numeric: true });
};

/**
 * Pack leaf nodes that share a VLAN into compact clusters, then leave hubs
 * (switches / cabinets) in place. Clusters are separated so density-group
 * "Test" treats each VLAN as its own group.
 */
export const clusterItemsByVlan = ({
  items,
  modelItems,
  connectors,
  gridStep = { x: 1, y: 1 }
}: {
  items: ViewItem[];
  modelItems: ModelItem[];
  connectors: Connector[];
  gridStep?: { x: number; y: number };
}): ClusterItemsByVlanResult => {
  const modelById = new Map(modelItems.map((item) => [item.id, item]));
  const byVlan = new Map<string, string[]>();

  items.forEach((viewItem) => {
    const modelItem = modelById.get(viewItem.id);
    const vlan = primaryVlanKeyForItem({
      itemId: viewItem.id,
      modelItem,
      modelItems,
      connectors
    });
    if (!vlan) return;
    const list = byVlan.get(vlan) ?? [];
    list.push(viewItem.id);
    byVlan.set(vlan, list);
  });

  const vlanKeys = Array.from(byVlan.keys()).sort(compareVlanKeys);
  // Only clusters with 2+ members need packing; singles stay put.
  const clusters = vlanKeys
    .map((vlan) => {
      return { vlan, ids: byVlan.get(vlan) ?? [] };
    })
    .filter((cluster) => {
      return cluster.ids.length >= 2;
    });

  if (clusters.length === 0) {
    return { targets: {}, vlanGroupCount: 0, movedNodes: 0 };
  }

  const itemById = new Map(items.map((item) => [item.id, item]));

  // Scene origin for packing — top-left of current leaf bounding box.
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

  const targets: Record<string, Coords> = {};
  let cursorX = minX;
  let cursorY = minY;
  let rowMaxH = 0;

  clusters.forEach((cluster, clusterIndex) => {
    // Preserve relative left→right order within a VLAN.
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

    // Pack into one or more rows for this VLAN.
    const rows: Cell[][] = [];
    let row: Cell[] = [];
    let rowW = 0;
    let packW = 0;
    let packH = 0;

    cells.forEach((cell) => {
      if (row.length > 0 && rowW + cell.w > MAX_CLUSTER_ROW_TILES) {
        rows.push(row);
        row = [];
        rowW = 0;
      }
      row.push(cell);
      rowW += cell.w;
      packW = Math.max(packW, rowW);
    });
    if (row.length > 0) rows.push(row);

    rows.forEach((r) => {
      const h = Math.max(...r.map((c) => c.h), 1);
      packH += h;
    });

    // New scene row of clusters when this pack would stretch too far.
    if (clusterIndex > 0 && cursorX + packW - minX > MAX_CLUSTER_ROW_TILES * 1.5) {
      cursorX = minX;
      cursorY += rowMaxH + VLAN_CLUSTER_GAP;
      rowMaxH = 0;
    }

    let localY = 0;
    rows.forEach((r) => {
      const h = Math.max(...r.map((c) => c.h), 1);
      let localX = 0;
      r.forEach((cell) => {
        const tile = snapTile2dToGrid(
          { x: cursorX + localX, y: cursorY + localY },
          gridStep
        );
        const prev = itemById.get(cell.id)?.tile;
        if (!prev || prev.x !== tile.x || prev.y !== tile.y) {
          targets[cell.id] = tile;
        }
        localX += cell.w;
      });
      localY += h;
    });

    cursorX += packW + VLAN_CLUSTER_GAP;
    rowMaxH = Math.max(rowMaxH, packH);
  });

  return {
    targets,
    vlanGroupCount: clusters.length,
    movedNodes: Object.keys(targets).length
  };
};
