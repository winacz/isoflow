import type { Coords, ModelItem, ViewItem } from 'src/types';
import {
  SHAPE_2D_CABINET_ID,
  CABINET_DEFAULT_UNITS,
  CABINET_EAR_TILES,
  CABINET_HEADER_TILES,
  RACK_1U_HEIGHT_TILES,
  RACK_1U_WIDTH_TILES,
  getCabinetSize,
  getModelItemSize,
  getShape2dSize
} from 'src/config';
import { getDeviceTemplateLayout } from './deviceTemplateRegistry';
import { isTileInShape2dBounds } from './renderer';

export const isRackFormFactorItem = (modelItem: {
  icon?: string;
}): boolean => {
  if (!modelItem.icon) return false;
  const layout = getDeviceTemplateLayout(modelItem.icon);
  return layout?.formFactor === 'RACK';
};

export const isCabinetItem = (modelItem: { icon?: string }): boolean => {
  return modelItem.icon === SHAPE_2D_CABINET_ID;
};

/** Full-bleed faceplates span the cabinet outer width; others use standard inset mount. */
export const isFullWidthRackItem = (modelItem: {
  icon?: string;
}): boolean => {
  if (!modelItem.icon) return false;
  const size = getShape2dSize(modelItem.icon);
  return Boolean(
    size && size.width >= RACK_1U_WIDTH_TILES + CABINET_EAR_TILES * 2
  );
};

/** Top-left tile for a switch mounted at rackUnit inside a cabinet. */
export const getCabinetSlotTile = (
  cabinetTile: Coords,
  rackUnit: number,
  options?: { fullWidth?: boolean }
): Coords => {
  const xOffset = options?.fullWidth ? 0 : CABINET_EAR_TILES;
  return {
    x: cabinetTile.x + xOffset,
    y: cabinetTile.y + CABINET_HEADER_TILES + rackUnit * RACK_1U_HEIGHT_TILES
  };
};

export const findCabinetAtTile = ({
  tile,
  viewItems,
  modelItems
}: {
  tile: Coords;
  viewItems: ViewItem[];
  modelItems: { id: string; icon?: string; rackUnits?: number; name?: string }[];
}): {
  viewItem: ViewItem;
  modelItem: ModelItem;
  size: ReturnType<typeof getCabinetSize>;
} | null => {
  for (let i = 0; i < viewItems.length; i += 1) {
    const viewItem = viewItems[i];
    const modelItem = modelItems.find((item) => {
      return item.id === viewItem.id;
    });
    if (!modelItem || !isCabinetItem(modelItem)) continue;
    const size = getCabinetSize(modelItem.rackUnits ?? CABINET_DEFAULT_UNITS);
    if (isTileInShape2dBounds(tile, viewItem.tile, size)) {
      return {
        viewItem,
        modelItem: modelItem as ModelItem,
        size
      };
    }
  }
  return null;
};

/** Prefer the unit under the cursor; else first free slot. */
export const resolveCabinetSnap = ({
  cursorTile,
  cabinetViewItem,
  cabinetModelItem,
  viewItems,
  excludeItemIds,
  fullWidth = false
}: {
  cursorTile: Coords;
  cabinetViewItem: ViewItem;
  cabinetModelItem: { rackUnits?: number };
  viewItems: ViewItem[];
  excludeItemIds?: Iterable<string>;
  /** Faceplate spans cabinet outer width (ears baked into SVG). */
  fullWidth?: boolean;
}): { rackUnit: number; tile: Coords } | null => {
  const units = cabinetModelItem.rackUnits ?? CABINET_DEFAULT_UNITS;
  const excluded = excludeItemIds ? new Set(excludeItemIds) : null;
  const occupied = new Set<number>();

  viewItems.forEach((item) => {
    if (excluded?.has(item.id)) return;
    if (item.parentId === cabinetViewItem.id && item.rackUnit !== undefined) {
      occupied.add(item.rackUnit);
    }
  });

  const localY =
    cursorTile.y - cabinetViewItem.tile.y - CABINET_HEADER_TILES;
  let preferred = Math.floor(localY / RACK_1U_HEIGHT_TILES);
  if (preferred < 0) preferred = 0;
  if (preferred >= units) preferred = units - 1;

  const tryUnit = (unit: number) => {
    if (unit < 0 || unit >= units || occupied.has(unit)) return null;
    return {
      rackUnit: unit,
      tile: getCabinetSlotTile(cabinetViewItem.tile, unit, { fullWidth })
    };
  };

  const preferredHit = tryUnit(preferred);
  if (preferredHit) return preferredHit;

  for (let unit = 0; unit < units; unit += 1) {
    const hit = tryUnit(unit);
    if (hit) return hit;
  }

  return null;
};

export const getMountedChildren = (
  cabinetId: string,
  viewItems: ViewItem[]
): ViewItem[] => {
  return viewItems.filter((item) => {
    return item.parentId === cabinetId;
  });
};

export { getModelItemSize };
