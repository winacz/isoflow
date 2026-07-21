import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { DeviceShape2d } from 'src/components/Shapes2d/DeviceShape2d';
import { CabinetShape2d } from 'src/components/Shapes2d/CabinetShape2d';
import {
  SHAPE_2D_CABINET_ID,
  TILE_SIZE_2D,
  getShape2dSize,
  getModelItemSize
} from 'src/config';
import { findPlanView, getDeviceTemplateLayout } from 'src/utils';
import type { ModelItem, ViewItem } from 'src/types';

/** Screen size of the PiP viewport (px). */
const VIEWPORT_W = 420;
const VIEWPORT_H = 320;
/** World→screen scale — lower = more pulled back (neighbors visible). */
const WORLD_ZOOM = 0.38;
/** How far (tiles) around the peer to include neighbors. */
const NEIGHBOR_PAD_TILES = 14;
/** Offset from cursor. */
const CURSOR_GAP = 56;

type Footprint = {
  viewItem: ViewItem;
  modelItem: ModelItem;
  x: number;
  y: number;
  w: number;
  h: number;
};

const footprintOf = (
  viewItem: ViewItem,
  modelItem: ModelItem
): Omit<Footprint, 'viewItem' | 'modelItem'> => {
  const size =
    getModelItemSize(modelItem) ??
    getShape2dSize(modelItem.icon) ??
    getDeviceTemplateLayout(modelItem.icon ?? '')?.size ?? {
      width: 8,
      height: 7
    };
  return {
    x: viewItem.tile.x,
    y: viewItem.tile.y,
    w: size.width,
    h: size.height
  };
};

const aabbsOverlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) => {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  );
};

/**
 * Picture-in-picture of the peer device (2Dv2).
 * Layout + all node types (PC, switch, cabinet, …) come from the Plan (2D) view.
 */
export const PortPipOverlay = () => {
  const hover = useUiStateStore((state) => {
    return state.portPipHover;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const views = useModelStore((state) => {
    return state.views;
  });

  // PiP always mirrors Plan positions — 2Dv2 only has infrastructure.
  const planItems = useMemo(() => {
    return findPlanView(views)?.items ?? [];
  }, [views]);

  const peerViewItem = useMemo(() => {
    if (!hover) return null;
    return (
      planItems.find((item) => {
        return item.id === hover.peerItemId;
      }) ?? null
    );
  }, [hover, planItems]);

  const peer = useMemo(() => {
    if (!hover) return null;
    return (
      modelItems.find((item) => {
        return item.id === hover.peerItemId;
      }) ?? null
    );
  }, [hover, modelItems]);

  const sceneNodes = useMemo((): Footprint[] => {
    if (!peer || !peerViewItem) return [];

    const peerFp = footprintOf(peerViewItem, peer);
    const search = {
      x: peerFp.x - NEIGHBOR_PAD_TILES,
      y: peerFp.y - NEIGHBOR_PAD_TILES,
      w: peerFp.w + NEIGHBOR_PAD_TILES * 2,
      h: peerFp.h + NEIGHBOR_PAD_TILES * 2
    };

    const byId = new Map<string, Footprint>();

    const pushNode = (viewItem: ViewItem, modelItem: ModelItem) => {
      if (!modelItem.icon || byId.has(viewItem.id)) return;
      byId.set(viewItem.id, {
        ...footprintOf(viewItem, modelItem),
        viewItem,
        modelItem
      });
    };

    // Always include the peer (even if mounted in a cabinet).
    pushNode(peerViewItem, peer);

    // If peer lives in a cabinet, show that cabinet for context.
    if (peerViewItem.parentId) {
      const parentView = planItems.find((item) => {
        return item.id === peerViewItem.parentId;
      });
      const parentModel = parentView
        ? modelItems.find((item) => {
            return item.id === parentView.id;
          })
        : undefined;
      if (parentView && parentModel) {
        pushNode(parentView, parentModel);
      }
    }

    planItems.forEach((viewItem) => {
      // Neighbors: free-standing only (mounted devices show inside cabinets).
      if (viewItem.parentId) return;
      if (viewItem.id === peer.id) return;

      const modelItem = modelItems.find((item) => {
        return item.id === viewItem.id;
      });
      if (!modelItem?.icon) return;

      const fp = footprintOf(viewItem, modelItem);
      if (!aabbsOverlap(fp, search)) return;
      pushNode(viewItem, modelItem);
    });

    const nodes = Array.from(byId.values());
    // Peer last so it paints on top of neighbors.
    nodes.sort((a, b) => {
      if (a.modelItem.id === peer.id) return 1;
      if (b.modelItem.id === peer.id) return -1;
      return 0;
    });

    return nodes;
  }, [peer, peerViewItem, planItems, modelItems]);

  if (projectionMode !== 'TWO_D_V2' || !hover || !peer || !peerViewItem) {
    return null;
  }

  const peerFp = footprintOf(peerViewItem, peer);
  const peerCenterPx = {
    x: (peerFp.x + peerFp.w / 2) * TILE_SIZE_2D,
    y: (peerFp.y + peerFp.h / 2) * TILE_SIZE_2D
  };

  const peerPortHighlight = hover.peerPortId ? [hover.peerPortId] : null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const cardW = VIEWPORT_W + 16;
  const cardH = VIEWPORT_H + 40;
  const left = Math.min(
    Math.max(12, hover.screen.x + CURSOR_GAP),
    vw - cardW - 12
  );
  const top = Math.min(
    Math.max(12, hover.screen.y + CURSOR_GAP),
    vh - Math.min(cardH, vh - 24) - 12
  );

  return (
    <Box
      sx={{
        position: 'fixed',
        left,
        top,
        zIndex: 40,
        pointerEvents: 'none',
        p: 1,
        borderRadius: 2,
        bgcolor: 'rgba(15, 23, 42, 0.92)',
        border: '1px solid rgba(148, 163, 184, 0.45)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(8px)'
      }}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.4,
          color: 'rgba(226, 232, 240, 0.9)',
          textTransform: 'uppercase',
          mb: 0.75,
          px: 0.25
        }}
      >
        Podłączone · {peer.name}
        {hover.peerPortId ? ` · ${hover.peerPortId}` : ''}
      </Typography>
      <Box
        sx={{
          position: 'relative',
          width: VIEWPORT_W,
          height: VIEWPORT_H,
          borderRadius: 1,
          bgcolor: '#e8eef5',
          backgroundImage:
            'radial-gradient(circle at 50% 45%, #f8fafc 0%, #dbe4ee 75%)',
          overflow: 'hidden'
        }}
      >
        {/* Zoomed-out Plan world: peer centered, all nearby nodes clipped at edges. */}
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: VIEWPORT_W,
            height: VIEWPORT_H,
            transformOrigin: '0 0',
            transform: `translate(${VIEWPORT_W / 2}px, ${VIEWPORT_H / 2}px) scale(${WORLD_ZOOM}) translate(${-peerCenterPx.x}px, ${-peerCenterPx.y}px)`
          }}
        >
          {sceneNodes.map(({ viewItem, modelItem, x, y, w, h }) => {
            const isPeer = modelItem.id === peer.id;
            const isCabinet = modelItem.icon === SHAPE_2D_CABINET_ID;
            const pxW = w * TILE_SIZE_2D;
            const pxH = h * TILE_SIZE_2D;
            const occupiedUnits = isCabinet
              ? planItems
                  .filter((child) => {
                    return (
                      child.parentId === modelItem.id && child.rackUnit != null
                    );
                  })
                  .map((child) => {
                    return child.rackUnit as number;
                  })
              : undefined;

            return (
              <Box
                key={viewItem.id}
                sx={{
                  position: 'absolute',
                  left: x * TILE_SIZE_2D,
                  top: y * TILE_SIZE_2D,
                  width: pxW,
                  height: pxH,
                  opacity: isPeer ? 1 : 0.72,
                  filter: isPeer ? undefined : 'saturate(0.85)',
                  zIndex: isPeer ? 2 : 1
                }}
              >
                {isCabinet ? (
                  <CabinetShape2d
                    name={modelItem.name}
                    rackUnits={modelItem.rackUnits}
                    color={modelItem.color}
                    centered={false}
                    width={pxW}
                    height={pxH}
                    occupiedUnits={occupiedUnits}
                  />
                ) : (
                  <DeviceShape2d
                    shapeId={modelItem.icon ?? 'SWITCH'}
                    name={modelItem.name}
                    ports={modelItem.ports}
                    svis={modelItem.svis}
                    color={modelItem.color}
                    modelItems={modelItems}
                    centered={false}
                    width={pxW}
                    height={pxH}
                    showShadow={isPeer}
                    mismatchPortIds={
                      isPeer ? peerPortHighlight ?? undefined : undefined
                    }
                    focusedPortIds={null}
                    connectedPortIds={
                      isPeer ? peerPortHighlight ?? undefined : undefined
                    }
                  />
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};
