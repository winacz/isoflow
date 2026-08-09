import type { Coords, Model, ProjectionMode, View, ViewItem } from 'src/types';
import {
  CABINET_HEADER_TILES,
  CABINET_DEFAULT_UNITS,
  RACK_1U_HEIGHT_TILES,
  isShape2dIcon
} from 'src/config';
import { CoordsUtils } from './CoordsUtils';
import { getCabinetSlotTile, isCabinetItem, isFullWidthRackItem } from './cabinet';
import { getGridSnapStep, snapTile2dToGrid } from './renderer';

const tileNeedsSnap = (tile: Coords, step: { x: number; y: number }) => {
  const snapped = snapTile2dToGrid(tile, step);
  return !CoordsUtils.isEqual(tile, snapped);
};

const snapTileIfNeeded = (
  tile: Coords,
  step: { x: number; y: number }
): Coords => {
  if (!tileNeedsSnap(tile, step)) return tile;
  return snapTile2dToGrid(tile, step);
};

const clampRackUnit = (unit: number, maxUnits: number) => {
  if (unit < 0) return 0;
  if (unit >= maxUnits) return Math.max(0, maxUnits - 1);
  return unit;
};

/** True when the view is a 2D Plan (devices / cabinets), not classic isometric. */
const isPlan2dView = (view: View, modelItems: Model['items']): boolean => {
  return view.items.some((viewItem) => {
    const modelItem = modelItems.find((item) => {
      return item.id === viewItem.id;
    });
    return isShape2dIcon(modelItem?.icon);
  });
};

const snapViewToGrid = (
  view: View,
  modelItems: Model['items'],
  floorStep: { x: number; y: number }
): View => {
  const items: ViewItem[] = view.items.map((item) => {
    return { ...item, tile: { ...item.tile } };
  });
  const byId = new Map(items.map((item) => [item.id, item]));

  // Free items (cabinets + floor devices) → active floor grid.
  items.forEach((item) => {
    if (item.parentId) return;
    item.tile = snapTileIfNeeded(item.tile, floorStep);
  });

  // Mounted switches → exact 1U slots relative to (possibly moved) cabinets.
  items.forEach((item) => {
    if (!item.parentId) return;
    const parent = byId.get(item.parentId);
    if (!parent) return;

    const parentModel = modelItems.find((candidate) => {
      return candidate.id === parent.id;
    });
    const units =
      (parentModel && isCabinetItem(parentModel)
        ? parentModel.rackUnits
        : undefined) ?? CABINET_DEFAULT_UNITS;

    let unit = item.rackUnit;
    if (unit === undefined) {
      const localY = item.tile.y - parent.tile.y - CABINET_HEADER_TILES;
      unit = clampRackUnit(
        Math.round(localY / RACK_1U_HEIGHT_TILES),
        units
      );
      item.rackUnit = unit;
    } else {
      item.rackUnit = clampRackUnit(unit, units);
    }

    const childModel = modelItems.find((candidate) => {
      return candidate.id === item.id;
    });
    item.tile = getCabinetSlotTile(parent.tile, item.rackUnit, {
      fullWidth: Boolean(childModel && isFullWidthRackItem(childModel))
    });
  });

  const rectangles = view.rectangles?.map((rect) => {
    return {
      ...rect,
      from: snapTileIfNeeded(rect.from, floorStep),
      to: snapTileIfNeeded(rect.to, floorStep)
    };
  });

  const textBoxes = view.textBoxes?.map((textBox) => {
    return {
      ...textBox,
      tile: snapTileIfNeeded(textBox.tile, floorStep)
    };
  });

  // Free cable waypoints stay on the fine tile grid (not RACK squares).
  const fineStep = { x: 1, y: 1 };
  const connectors = view.connectors?.map((connector) => {
    return {
      ...connector,
      anchors: connector.anchors.map((anchor) => {
        if (!anchor.ref.tile || anchor.ref.item || anchor.ref.port) {
          return anchor;
        }
        return {
          ...anchor,
          ref: {
            ...anchor.ref,
            tile: snapTileIfNeeded(anchor.ref.tile, fineStep)
          }
        };
      })
    };
  });

  return {
    ...view,
    items,
    rectangles,
    textBoxes,
    connectors
  };
};

/**
 * Snap Plan-view free nodes / areas to the floor grid and re-seat mounted
 * devices into exact cabinet 1U slots.
 * Never touch classic isometric views (even in a mixed Iso+Plan model).
 * Runs regardless of the currently active projection (app may open on Iso).
 */
export const snapModelToGrid = (
  model: Model,
  options: {
    gridStyle?: string | null;
    /** @deprecated ignored — plan views are always snapped */
    projectionMode?: ProjectionMode;
  } = {}
): Model => {
  const floorStep = getGridSnapStep(options.gridStyle);
  const views = model.views.map((view) => {
    if (!isPlan2dView(view, model.items)) {
      return view;
    }
    return snapViewToGrid(view, model.items, floorStep);
  });

  return {
    ...model,
    views
  };
};
