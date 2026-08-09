import {
  TILE_SIZE_2D,
  SHAPE_2D_CABINET_ID,
  SHAPE_2D_SWITCH_ID,
  SHAPE_2D_BLANKING_ID,
  SHAPE_2D_PATCH_PANEL_ID,
  getModelItemSize,
  getShape2dSize
} from 'src/config';
import { hasNodeDescription } from './nodeDescription';
import type { Coords } from 'src/types';

/** Keep in sync with `getShape2dHeaderFraction` in renderer.ts (avoid import cycle). */
const headerFractionForIcon = (icon: string | undefined): number => {
  if (!icon) return 1 / 3;
  const isPcLike =
    icon !== SHAPE_2D_CABINET_ID &&
    icon !== SHAPE_2D_SWITCH_ID &&
    icon !== SHAPE_2D_BLANKING_ID &&
    icon !== SHAPE_2D_PATCH_PANEL_ID &&
    !icon.startsWith('tpl-');
  return isPcLike ? 0.3 : 1 / 3;
};

export type Shape2dInfoSlotMetrics = {
  /** Visible / hit square size in CSS px (unscaled node). */
  dim: number;
  /** Extra padding around the square for hit / header exclusion. */
  hitPad: number;
  headerBandH: number;
  /** Distance from device right edge to the info square’s right edge. */
  padFromDeviceRight: number;
  headerInset: number;
  padRight: number;
};

/**
 * Layout for the header “(i)” slot — shared by DeviceShape2d (paint),
 * NodeDescriptionLabels (DOM hit target), and plan hit-tests.
 */
export const getShape2dInfoSlotMetrics = ({
  size,
  icon
}: {
  size: { width: number; height: number };
  icon?: string;
}): Shape2dInfoSlotMetrics => {
  const pxW = size.width * TILE_SIZE_2D;
  const pxH = size.height * TILE_SIZE_2D;
  const headerFrac = headerFractionForIcon(icon);
  const isCompact = headerFrac <= 0.3 + 1e-6;
  const headerBandH = pxH * headerFrac;
  const headerInset = isCompact ? TILE_SIZE_2D * 0.35 : TILE_SIZE_2D * 0.4;
  const padRight = isCompact
    ? Math.max(4, TILE_SIZE_2D * 0.15)
    : Math.max(3, TILE_SIZE_2D * 0.18);

  // Large circular control (easy to hit on switches / small nodes).
  const dim = isCompact
    ? Math.max(32, Math.min(48, Math.round(headerBandH * 0.55)))
    : Math.max(40, Math.min(64, Math.round(headerBandH * 0.42)));
  const hitPad = Math.max(12, Math.round(dim * 0.4));

  return {
    dim,
    hitPad,
    headerBandH,
    padFromDeviceRight: Math.round(headerInset + padRight),
    headerInset,
    padRight
  };
};

/** Local tile coords (origin = node centre): is `(lx, ly)` inside the info slot? */
export const isLocalPointInShape2dInfoSlot = ({
  lx,
  ly,
  size,
  icon
}: {
  lx: number;
  ly: number;
  size: { width: number; height: number };
  icon?: string;
}): boolean => {
  const m = getShape2dInfoSlotMetrics({ size, icon });
  const halfW = size.width / 2;
  const halfH = size.height / 2;
  const rightInset = m.padFromDeviceRight / TILE_SIZE_2D;
  const dimT = m.dim / TILE_SIZE_2D;
  const padT = m.hitPad / TILE_SIZE_2D;
  const slotRight = halfW - rightInset + padT;
  const slotLeft = halfW - rightInset - dimT - padT;
  const slotTop = -halfH - padT;
  const slotBottom =
    -halfH + m.headerBandH / TILE_SIZE_2D + padT;

  return lx >= slotLeft && lx < slotRight && ly >= slotTop && ly < slotBottom;
};

type InfoHitItem = { id: string; tile: Coords; parentId?: string };
type InfoHitModel = {
  id: string;
  icon?: string;
  description?: string;
  descriptionTitle?: string;
  descriptionSummary?: string;
};

/**
 * Node whose description “(i)” slot contains `point` (tile space).
 * Same ranking / scale rules as `getShape2dHeaderAtPoint`.
 */
export const getShape2dInfoButtonAtPoint = ({
  point,
  items,
  modelItems,
  scaledItemIds,
  scale = 1.15
}: {
  point: Coords;
  items: InfoHitItem[];
  modelItems: InfoHitModel[];
  scaledItemIds?: Set<string> | null;
  scale?: number;
}): string | null => {
  type Hit = {
    id: string;
    area: number;
    hasParent: boolean;
  };

  const hits: Hit[] = [];
  const map = new Map(modelItems.map((i) => [i.id, i]));

  items.forEach((viewItem) => {
    const modelItem = map.get(viewItem.id);
    if (!modelItem?.icon) return;
    if (!hasNodeDescription(modelItem)) return;

    const size =
      getModelItemSize(modelItem) ?? getShape2dSize(modelItem.icon);
    if (!size) return;

    const isScaled = Boolean(scaledItemIds?.has(viewItem.id));
    const s = isScaled ? scale : 1;
    const cx = viewItem.tile.x + size.width / 2;
    const cy = viewItem.tile.y + size.height / 2;
    const lx = (point.x - cx) / s;
    const ly = (point.y - cy) / s;

    if (
      !isLocalPointInShape2dInfoSlot({
        lx,
        ly,
        size,
        icon: modelItem.icon
      })
    ) {
      return;
    }

    hits.push({
      id: viewItem.id,
      area: size.width * size.height,
      hasParent: Boolean(viewItem.parentId)
    });
  });

  if (hits.length === 0) return null;

  hits.sort((a, b) => {
    if (a.hasParent !== b.hasParent) {
      return a.hasParent ? -1 : 1;
    }
    return a.area - b.area;
  });

  return hits[0].id;
};
