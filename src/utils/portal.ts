import {
  Coords,
  Model,
  ModelItem,
  Rectangle,
  Size,
  View,
  ViewItem
} from 'src/types';
import {
  getModelItemSize,
  MIN_ZOOM_2D,
  SHAPE_2D_CABINET_ID,
  TILE_SIZE_2D
} from 'src/config';
import { getShape2dCenterPosition } from './renderer';
import { findPlanView } from './plan2dv2';

export type PortalTargetType = 'ITEM' | 'RECTANGLE';

export type PortalTarget = {
  targetType: PortalTargetType;
  targetId: string;
  label: string;
  kindLabel: string;
};

export type ModelItemPortal = NonNullable<ModelItem['portal']>;

export const findPlan2dView = (model: Pick<Model, 'views'>): View | null => {
  return findPlanView(model.views);
};

const rectangleLabel = (rect: Rectangle) => {
  if (rect.name?.trim()) return rect.name.trim();
  const kind = rect.kind === 'building' ? 'Budynek' : 'Obszar';
  const cx = Math.round((rect.from.x + rect.to.x) / 2);
  const cy = Math.round((rect.from.y + rect.to.y) / 2);
  return `${kind} (${cx}, ${cy})`;
};

const itemKindLabel = (modelItem: ModelItem | undefined) => {
  if (!modelItem?.icon) return 'Urządzenie';
  if (modelItem.icon === SHAPE_2D_CABINET_ID) return 'Szafa';
  return 'Urządzenie';
};

/** Resolve portal link text (building / device name on the Plan). */
export const getPortalDisplayLabel = (
  portal: ModelItemPortal,
  model: Model
): string => {
  if (portal.label?.trim()) return portal.label.trim();
  const match = listPlan2dPortalTargets(model).find((target) => {
    return (
      target.targetType === portal.targetType &&
      target.targetId === portal.targetId
    );
  });
  return match?.label ?? portal.targetId;
};

/** All Plan-view nodes, cabinets and areas available as portal targets. */
export const listPlan2dPortalTargets = (model: Model): PortalTarget[] => {
  const plan = findPlan2dView(model);
  if (!plan) return [];

  const items: PortalTarget[] = (plan.items ?? []).map((viewItem) => {
    const modelItem = model.items.find((candidate) => {
      return candidate.id === viewItem.id;
    });
    const kindLabel = itemKindLabel(modelItem);
    const name = modelItem?.name?.trim() || viewItem.id.slice(0, 8);
    return {
      targetType: 'ITEM' as const,
      targetId: viewItem.id,
      label: name,
      kindLabel
    };
  });

  const rectangles: PortalTarget[] = (plan.rectangles ?? []).map((rect) => {
    const kindLabel = rect.kind === 'building' ? 'Budynek' : 'Obszar';
    return {
      targetType: 'RECTANGLE' as const,
      targetId: rect.id,
      label: rectangleLabel(rect),
      kindLabel
    };
  });

  return [...items, ...rectangles].sort((a, b) => {
    return a.label.localeCompare(b.label, 'pl', { sensitivity: 'base' });
  });
};

const rectangleCenterTile = (rect: Rectangle): Coords => {
  return {
    x: (rect.from.x + rect.to.x) / 2,
    y: (rect.from.y + rect.to.y) / 2
  };
};

export const getPortalTargetCenterPx = (
  portal: ModelItemPortal,
  plan: View,
  modelItems: ModelItem[]
): Coords | null => {
  if (portal.targetType === 'ITEM') {
    const viewItem = plan.items?.find((item) => {
      return item.id === portal.targetId;
    }) as ViewItem | undefined;
    if (!viewItem) return null;

    const modelItem = modelItems.find((item) => {
      return item.id === viewItem.id;
    });
    const size =
      (modelItem ? getModelItemSize(modelItem) : null) ?? {
        width: 1,
        height: 1
      };
    return getShape2dCenterPosition(viewItem.tile, size);
  }

  const rect = plan.rectangles?.find((candidate) => {
    return candidate.id === portal.targetId;
  });
  if (!rect) return null;

  const center = rectangleCenterTile(rect);
  return {
    x: center.x * TILE_SIZE_2D,
    y: center.y * TILE_SIZE_2D
  };
};

export const getScrollToCenterPx = (centerPx: Coords, zoom: number): Coords => {
  return {
    x: -centerPx.x * zoom,
    y: -centerPx.y * zoom
  };
};

/** Zoom so the whole footprint fits in the viewport with a small margin. */
export const getPortalJumpZoom = (
  viewport: Size,
  footprintPx: Size,
  fallback = 1
) => {
  if (!viewport.width || !viewport.height) return fallback;
  // Fit target into ~82% of the visible area (margin around cabinets / areas).
  const fit = 0.82;
  const byW =
    (viewport.width * fit) / Math.max(footprintPx.width, TILE_SIZE_2D);
  const byH =
    (viewport.height * fit) / Math.max(footprintPx.height, TILE_SIZE_2D);
  return Math.min(1.4, Math.max(MIN_ZOOM_2D, Math.min(byW, byH)));
};

export const getPortalTargetFootprintPx = (
  portal: ModelItemPortal,
  plan: View,
  modelItems: ModelItem[]
): Size => {
  if (portal.targetType === 'ITEM') {
    const modelItem = modelItems.find((item) => {
      return item.id === portal.targetId;
    });
    const size =
      (modelItem ? getModelItemSize(modelItem) : null) ?? {
        width: 1,
        height: 1
      };
    return {
      width: size.width * TILE_SIZE_2D,
      height: size.height * TILE_SIZE_2D
    };
  }

  const rect = plan.rectangles?.find((candidate) => {
    return candidate.id === portal.targetId;
  });
  if (!rect) {
    return { width: TILE_SIZE_2D, height: TILE_SIZE_2D };
  }

  return {
    width: Math.abs(rect.to.x - rect.from.x) * TILE_SIZE_2D || TILE_SIZE_2D,
    height: Math.abs(rect.to.y - rect.from.y) * TILE_SIZE_2D || TILE_SIZE_2D
  };
};

export type PortalJumpPlan = {
  planViewId: string;
  zoom: number;
  scroll: Coords;
  select:
    | { type: 'ITEM'; id: string }
    | { type: 'RECTANGLE'; id: string };
};

/** Compute 2D jump (zoom/scroll/selection) for an isometric→Plan portal. */
export const planPortalJump = ({
  portal,
  model,
  rendererSize
}: {
  portal: ModelItemPortal;
  model: Model;
  rendererSize: Size;
}): PortalJumpPlan | null => {
  const plan = findPlan2dView(model);
  if (!plan) return null;

  const centerPx = getPortalTargetCenterPx(portal, plan, model.items);
  if (!centerPx) return null;

  const footprint = getPortalTargetFootprintPx(portal, plan, model.items);
  const sidebarW = Math.min(
    340,
    Math.max(290, Math.round(rendererSize.width * 0.22))
  );
  const viewport = {
    width: Math.max(120, rendererSize.width - sidebarW),
    height: rendererSize.height
  };
  const zoom = getPortalJumpZoom(viewport, footprint);
  const scroll = getScrollToCenterPx(centerPx, zoom);

  return {
    planViewId: plan.id,
    zoom,
    scroll: {
      x: scroll.x - sidebarW * 0.5,
      y: scroll.y
    },
    select:
      portal.targetType === 'ITEM'
        ? { type: 'ITEM', id: portal.targetId }
        : { type: 'RECTANGLE', id: portal.targetId }
  };
};
