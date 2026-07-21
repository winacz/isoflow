import {
  SHAPE_2D_CABINET_ID,
  SHAPE_2D_PC_ID,
  SHAPE_2D_SWITCH_ID,
  isShape2dIcon
} from 'src/config';
import type { ModelItem, View, ViewItem, Rectangle, Connector } from 'src/types';
import { isDeviceTemplateId } from './deviceTemplateRegistry';

export const PLAN_2D_VIEW_NAME = 'Plan';
export const PLAN_2D_V2_VIEW_NAME = '2Dv2';
export const ISOMETRIC_VIEW_NAME = 'Isometric';

/** Switches (templates + builtin) and cabinets — not PCs / hosts. */
export const isInfrastructure2dIcon = (
  iconId: string | undefined | null
): boolean => {
  if (!iconId || !isShape2dIcon(iconId)) return false;
  if (iconId === SHAPE_2D_PC_ID) return false;
  if (iconId === SHAPE_2D_CABINET_ID) return true;
  if (iconId === SHAPE_2D_SWITCH_ID) return true;
  return isDeviceTemplateId(iconId);
};

export const findPlan2dViewByName = (
  views: View[],
  name: string
): View | null => {
  return (
    views.find((view) => {
      return view.name === name;
    }) ?? null
  );
};

export const findPlanView = (views: View[]): View | null => {
  return findPlan2dViewByName(views, PLAN_2D_VIEW_NAME);
};

export const findPlan2Dv2View = (views: View[]): View | null => {
  return findPlan2dViewByName(views, PLAN_2D_V2_VIEW_NAME);
};

/**
 * Copy Plan layout into a 2Dv2 snapshot: all nodes + areas, no cables.
 * Link state (connected RJ45) is still resolved from Plan connectors at render time.
 */
export const build2Dv2SnapshotFromPlan = ({
  plan
}: {
  plan: View;
  /** Kept for call-site compatibility; items are no longer filtered by type. */
  modelItems?: ModelItem[];
}): {
  items: ViewItem[];
  rectangles: Rectangle[];
  connectors: Connector[];
  textBoxes: NonNullable<View['textBoxes']>;
} => {
  return {
    items: [...(plan.items ?? [])],
    rectangles: [...(plan.rectangles ?? [])],
    connectors: [],
    textBoxes: []
  };
};

export type PeerEndpoint = {
  itemId: string;
  portId: string | null;
};

/**
 * Other end of a cable attached to `itemId`+`portId` in `connectors`
 * (usually the Plan view — 2Dv2 has no connectors of its own).
 */
export const findPeerEndpoint = ({
  connectors,
  itemId,
  portId
}: {
  connectors: Connector[] | undefined;
  itemId: string;
  portId: string;
}): PeerEndpoint | null => {
  if (!connectors?.length) return null;

  for (const connector of connectors) {
    const anchors = connector.anchors ?? [];
    const selfIndex = anchors.findIndex((anchor) => {
      return anchor.ref.item === itemId && anchor.ref.port === portId;
    });
    if (selfIndex < 0) continue;

    const peer = anchors.find((anchor, index) => {
      return index !== selfIndex && Boolean(anchor.ref.item);
    });
    if (!peer?.ref.item) continue;

    return {
      itemId: peer.ref.item,
      portId: peer.ref.port ?? null
    };
  }

  return null;
};
