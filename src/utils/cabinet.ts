import type { Coords, ModelItem, ViewItem } from 'src/types';
import {
  SHAPE_2D_CABINET_ID,
  SHAPE_2D_BLANKING_ID,
  CABINET_DEFAULT_UNITS,
  CABINET_EAR_TILES,
  CABINET_HEADER_TILES,
  BLANKING_DEFAULT_UNITS,
  RACK_1U_HEIGHT_TILES,
  RACK_1U_WIDTH_TILES,
  getCabinetSize,
  getModelItemSize,
  getShape2dSize
} from 'src/config';
import { getDeviceTemplateLayout } from './deviceTemplateRegistry';
import { isTileInShape2dBounds } from './renderer';
import { isPatchPanelItem } from './patchPanel';

export const isBlankingItem = (modelItem: { icon?: string }): boolean => {
  return modelItem.icon === SHAPE_2D_BLANKING_ID;
};

export const isRackFormFactorItem = (modelItem: {
  icon?: string;
}): boolean => {
  if (!modelItem.icon) return false;
  if (isBlankingItem(modelItem) || isPatchPanelItem(modelItem)) return true;
  const layout = getDeviceTemplateLayout(modelItem.icon);
  return layout?.formFactor === 'RACK';
};

export const isCabinetItem = (modelItem: { icon?: string }): boolean => {
  return modelItem.icon === SHAPE_2D_CABINET_ID;
};

/** How many contiguous U slots this mounted item occupies. */
export const getRackSpanUnits = (modelItem: {
  icon?: string;
  rackUnits?: number;
}): number => {
  if (isBlankingItem(modelItem)) {
    return Math.max(1, modelItem.rackUnits ?? BLANKING_DEFAULT_UNITS);
  }
  const size = getModelItemSize(modelItem as ModelItem) ?? getShape2dSize(modelItem.icon);
  if (size && size.height > 0) {
    return Math.round(size.height / RACK_1U_HEIGHT_TILES);
  }
  return 1;
};

/** Full-bleed faceplates span the cabinet outer width; others use standard inset mount. */
export const isFullWidthRackItem = (modelItem: {
  icon?: string;
}): boolean => {
  if (!modelItem.icon) return false;
  // Blanking / patch panel footprints include ears — mount flush to cabinet outer edges.
  if (isBlankingItem(modelItem) || isPatchPanelItem(modelItem)) return true;
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

/** Collect U indices occupied by children of a cabinet (multi-U aware). */
export const collectOccupiedRackUnits = ({
  cabinetId,
  viewItems,
  modelItems,
  excludeItemIds
}: {
  cabinetId: string;
  viewItems: ViewItem[];
  modelItems: { id: string; icon?: string; rackUnits?: number }[];
  excludeItemIds?: Iterable<string>;
}): Set<number> => {
  const excluded = excludeItemIds ? new Set(excludeItemIds) : null;
  const occupied = new Set<number>();
  const modelById = new Map(
    modelItems.map((item) => {
      return [item.id, item] as const;
    })
  );

  viewItems.forEach((item) => {
    if (excluded?.has(item.id)) return;
    if (item.parentId !== cabinetId || item.rackUnit === undefined) return;
    const model = modelById.get(item.id);
    const span = getRackSpanUnits(model ?? {});
    for (let offset = 0; offset < span; offset += 1) {
      occupied.add(item.rackUnit + offset);
    }
  });

  return occupied;
};

/** Prefer the unit under the cursor; else first free contiguous span. */
export const resolveCabinetSnap = ({
  cursorTile,
  cabinetViewItem,
  cabinetModelItem,
  viewItems,
  modelItems,
  excludeItemIds,
  fullWidth = false,
  spanUnits = 1
}: {
  cursorTile: Coords;
  cabinetViewItem: ViewItem;
  cabinetModelItem: { rackUnits?: number };
  viewItems: ViewItem[];
  modelItems?: { id: string; icon?: string; rackUnits?: number }[];
  excludeItemIds?: Iterable<string>;
  /** Faceplate spans cabinet outer width (ears baked into SVG). */
  fullWidth?: boolean;
  /** Contiguous U height required (blanking plates). */
  spanUnits?: number;
}): { rackUnit: number; tile: Coords } | null => {
  const units = cabinetModelItem.rackUnits ?? CABINET_DEFAULT_UNITS;
  const span = Math.max(1, Math.round(spanUnits) || 1);
  const occupied = collectOccupiedRackUnits({
    cabinetId: cabinetViewItem.id,
    viewItems,
    modelItems: modelItems ?? [],
    excludeItemIds
  });

  const localY =
    cursorTile.y - cabinetViewItem.tile.y - CABINET_HEADER_TILES;
  let preferred = Math.floor(localY / RACK_1U_HEIGHT_TILES);
  if (preferred < 0) preferred = 0;
  if (preferred > units - span) preferred = Math.max(0, units - span);

  const spanFree = (unit: number) => {
    if (unit < 0 || unit + span > units) return false;
    for (let offset = 0; offset < span; offset += 1) {
      if (occupied.has(unit + offset)) return false;
    }
    return true;
  };

  const tryUnit = (unit: number) => {
    if (!spanFree(unit)) return null;
    return {
      rackUnit: unit,
      tile: getCabinetSlotTile(cabinetViewItem.tile, unit, { fullWidth })
    };
  };

  const preferredHit = tryUnit(preferred);
  if (preferredHit) return preferredHit;

  for (let unit = 0; unit <= units - span; unit += 1) {
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
