import type { Coords, ModelItem, Size, ViewItem } from 'src/types';
import {
  MIN_ZOOM_2D,
  MAX_ZOOM,
  getShape2dPorts,
  getModelItemSize
} from 'src/config';
import {
  getShape2dPortHandlePosition,
  getShape2dCenterPosition
} from './renderer';
import { getScrollToCenterPx } from './portal';
import { CoordsUtils } from './CoordsUtils';
import { clamp } from './common';

/** Fixed zoom when jumping to a cable endpoint from the relation panel (~45%). */
const PORT_LINK_ZOOM = 0.45;

const sidebarWidthFor = (rendererWidth: number) => {
  return Math.min(340, Math.max(290, Math.round(rendererWidth * 0.22)));
};

/**
 * Scroll so `centerPx` lands in the free canvas (left of the right-hand sidebar).
 * Sidebar sits on the right → free-area center is left of the viewport midpoint.
 */
export const getScrollToFreeCanvasCenter = (
  centerPx: Coords,
  zoom: number,
  rendererWidth: number,
  hasSidebar: boolean
): Coords => {
  const base = getScrollToCenterPx(centerPx, zoom);
  if (!hasSidebar) return base;
  const sidebarW = sidebarWidthFor(rendererWidth);
  return {
    x: base.x - sidebarW * 0.5,
    y: base.y
  };
};

export const getPortCenterPx = ({
  itemId,
  portId,
  viewItems,
  modelItems
}: {
  itemId: string;
  portId: string;
  viewItems: ViewItem[];
  modelItems: ModelItem[];
}): Coords | null => {
  const viewItem = viewItems.find((item) => {
    return item.id === itemId;
  });
  if (!viewItem) return null;

  const modelItem = modelItems.find((item) => {
    return item.id === itemId;
  });
  const size =
    (modelItem ? getModelItemSize(modelItem) : null) ?? {
      width: 1,
      height: 1
    };

  if (!portId) {
    return getShape2dCenterPosition(viewItem.tile, size);
  }

  const port = getShape2dPorts(modelItem?.icon ?? '').find((candidate) => {
    return candidate.id === portId;
  });

  if (!port) {
    return getShape2dCenterPosition(viewItem.tile, size);
  }

  // Exact jack center in world px (same cell center DeviceShape2d uses).
  return getShape2dPortHandlePosition(viewItem.tile, port.tile);
};

/**
 * Zoom + pan so a 2D port sits in the free canvas (left of the sidebar),
 * then select that device and focus the port.
 */
export const focusShape2dPortOnCanvas = ({
  itemId,
  portId,
  viewItems,
  modelItems,
  rendererSize,
  setZoom,
  setScroll,
  setItemControls,
  setSelectedItemIds,
  setFocusedPortId,
  setPortAttention,
  clearSelectedWaypointIds
}: {
  itemId: string;
  portId: string;
  viewItems: ViewItem[];
  modelItems: ModelItem[];
  rendererSize: Size;
  setZoom: (zoom: number) => void;
  setScroll: (scroll: {
    position: Coords;
    offset: Coords;
  }) => void;
  setItemControls: (controls: { type: 'ITEM'; id: string }) => void;
  setSelectedItemIds: (ids: string[]) => void;
  setFocusedPortId: (portId: string | null) => void;
  setPortAttention?: (attention: {
    itemId: string;
    portId: string;
  } | null) => void;
  clearSelectedWaypointIds?: () => void;
}): boolean => {
  const centerPx = getPortCenterPx({
    itemId,
    portId,
    viewItems,
    modelItems
  });
  if (!centerPx) return false;

  const zoom = clamp(PORT_LINK_ZOOM, MIN_ZOOM_2D, MAX_ZOOM);

  setZoom(zoom);
  const scroll = getScrollToFreeCanvasCenter(
    centerPx,
    zoom,
    rendererSize.width,
    true
  );
  setScroll({
    position: scroll,
    offset: CoordsUtils.zero()
  });

  clearSelectedWaypointIds?.();
  setSelectedItemIds([itemId]);
  setItemControls({ type: 'ITEM', id: itemId });
  setFocusedPortId(portId || null);
  if (portId) {
    setPortAttention?.({ itemId, portId });
  }

  return true;
};
