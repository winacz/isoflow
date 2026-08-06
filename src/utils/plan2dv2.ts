import {
  SHAPE_2D_CABINET_ID,
  SHAPE_2D_PC_ID,
  SHAPE_2D_CAMERA_ID,
  SHAPE_2D_CAMERA_V2_ID,
  SHAPE_2D_PRINTER_ID,
  SHAPE_2D_VOIP_ID,
  SHAPE_2D_SMARTPHONE_ID,
  SHAPE_2D_IOT_ID,
  SHAPE_2D_AP_ID,
  SHAPE_2D_NAS_ID,
  SHAPE_2D_TABLET_ID,
  SHAPE_2D_SWITCH_ID,
  isShape2dIcon
} from 'src/config';
import type { ModelItem, View, ViewItem, Rectangle, Connector } from 'src/types';
import { isDeviceTemplateId } from './deviceTemplateRegistry';
import {
  findPatchPanelBridgePeer,
  isPatchPanelItem
} from './patchPanel';

export const PLAN_2D_VIEW_NAME = 'Plan';
export const PLAN_2D_V3_VIEW_NAME = 'Plan v3';
export const ISOMETRIC_VIEW_NAME = 'Isometric';

/** Switches (templates + builtin) and cabinets — not PCs / hosts. */
export const isInfrastructure2dIcon = (
  iconId: string | undefined | null
): boolean => {
  if (!iconId || !isShape2dIcon(iconId)) return false;
  if (
    iconId === SHAPE_2D_PC_ID ||
    iconId === SHAPE_2D_CAMERA_ID ||
    iconId === SHAPE_2D_CAMERA_V2_ID ||
    iconId === SHAPE_2D_PRINTER_ID ||
    iconId === SHAPE_2D_VOIP_ID ||
    iconId === SHAPE_2D_SMARTPHONE_ID ||
    iconId === SHAPE_2D_IOT_ID ||
    iconId === SHAPE_2D_AP_ID ||
    iconId === SHAPE_2D_NAS_ID ||
    iconId === SHAPE_2D_TABLET_ID
  ) {
    return false;
  }
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
  const byKind = views
    .filter((view) => {
      if (view.kind === 'PLAN_2D') return true;
      if (view.kind) return false;
      return view.name === PLAN_2D_VIEW_NAME;
    })
    .sort((a, b) => {
      return (a.order ?? 0) - (b.order ?? 0);
    });
  if (byKind.length > 0) return byKind[0];
  return findPlan2dViewByName(views, PLAN_2D_VIEW_NAME);
};

export type PeerEndpoint = {
  itemId: string;
  portId: string | null;
};

/**
 * Other end of a cable attached to `itemId`+`portId` in `connectors`
 * (usually the Plan view).
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

/**
 * PiP peer resolution: patch panels are transparent.
 * Hovering a device linked to a panel → show the bridged far node, not the panel.
 */
export const resolvePortPipPeer = ({
  connectors,
  modelItems,
  itemId,
  portId
}: {
  connectors: Connector[] | undefined;
  modelItems: { id: string; icon?: string }[];
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

    const peerModel = modelItems.find((item) => item.id === peer.ref.item);
    if (isPatchPanelItem(peerModel) && peer.ref.port) {
      const bridged = findPatchPanelBridgePeer({
        panelItemId: peer.ref.item,
        portId: peer.ref.port,
        connectors,
        excludeConnectorId: connector.id
      });
      if (bridged) {
        return {
          itemId: bridged.itemId,
          portId: bridged.portId ?? null
        };
      }
    }

    return {
      itemId: peer.ref.item,
      portId: peer.ref.port ?? null
    };
  }

  return null;
};
