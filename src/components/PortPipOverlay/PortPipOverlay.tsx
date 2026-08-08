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
import type { ModelItem, Rectangle, ViewItem } from 'src/types';

/** Screen size of the PiP viewport (px). */
const VIEWPORT_W = 420;
const VIEWPORT_H = 320;
/** Extra margin around the focus so it is not edge-to-edge. */
const FIT_PADDING = 1.28;
/** Cap so tiny devices do not fill the whole card. */
const MAX_WORLD_ZOOM = 0.5;
const MIN_WORLD_ZOOM = 0.04;
/** How far (tiles) around the focus to include neighbors. */
const NEIGHBOR_PAD_TILES = 14;
/** Cap duplicated neighbor DeviceShape2d mounts in the PiP card. */
const MAX_PIP_NEIGHBORS = 8;
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

type FocusRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const fitWorldZoom = (focus: FocusRect) => {
  const focusW = Math.max(1, focus.w) * TILE_SIZE_2D * FIT_PADDING;
  const focusH = Math.max(1, focus.h) * TILE_SIZE_2D * FIT_PADDING;
  const zoom = Math.min(VIEWPORT_W / focusW, VIEWPORT_H / focusH);
  return Math.min(MAX_WORLD_ZOOM, Math.max(MIN_WORLD_ZOOM, zoom));
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

const rectangleBounds = (rect: Rectangle): FocusRect => {
  const minX = Math.min(rect.from.x, rect.to.x);
  const maxX = Math.max(rect.from.x, rect.to.x);
  const minY = Math.min(rect.from.y, rect.to.y);
  const maxY = Math.max(rect.from.y, rect.to.y);
  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1
  };
};

const aabbsOverlap = (a: FocusRect, b: FocusRect) => {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  );
};

const collectNearbyNodes = ({
  planItems,
  modelItems,
  search,
  focusItemId,
  focusViewItem,
  focusModelItem
}: {
  planItems: ViewItem[];
  modelItems: ModelItem[];
  search: FocusRect;
  focusItemId: string | null;
  focusViewItem: ViewItem | null;
  focusModelItem: ModelItem | null;
}): Footprint[] => {
  const byId = new Map<string, Footprint>();

  const pushNode = (viewItem: ViewItem, modelItem: ModelItem) => {
    if (!modelItem.icon || byId.has(viewItem.id)) return;
    byId.set(viewItem.id, {
      ...footprintOf(viewItem, modelItem),
      viewItem,
      modelItem
    });
  };

  if (focusViewItem && focusModelItem) {
    pushNode(focusViewItem, focusModelItem);
    if (focusViewItem.parentId) {
      const parentView = planItems.find((item) => {
        return item.id === focusViewItem.parentId;
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
  }

  planItems.forEach((viewItem) => {
    if (viewItem.parentId) return;
    if (focusItemId && viewItem.id === focusItemId) return;

    const modelItem = modelItems.find((item) => {
      return item.id === viewItem.id;
    });
    if (!modelItem?.icon) return;

    const fp = footprintOf(viewItem, modelItem);
    if (!aabbsOverlap(fp, search)) return;
    pushNode(viewItem, modelItem);
  });

  const nodes = Array.from(byId.values());
  if (focusItemId) {
    const focusNodes = nodes.filter((node) => {
      return node.modelItem.id === focusItemId;
    });
    const neighbors = nodes
      .filter((node) => {
        return node.modelItem.id !== focusItemId;
      })
      .slice(0, MAX_PIP_NEIGHBORS);
    return [...neighbors, ...focusNodes];
  }
  return nodes.slice(0, MAX_PIP_NEIGHBORS);
};

/**
 * Picture-in-picture of a Plan peer (2Dv2 port) or portal target (isometric).
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

  const plan = useMemo(() => {
    return findPlanView(views);
  }, [views]);

  const planItems = useMemo(() => {
    return plan?.items ?? [];
  }, [plan]);

  const planRectangles = useMemo(() => {
    return plan?.rectangles ?? [];
  }, [plan]);

  const peerViewItem = useMemo(() => {
    if (!hover?.peerItemId) return null;
    return (
      planItems.find((item) => {
        return item.id === hover.peerItemId;
      }) ?? null
    );
  }, [hover, planItems]);

  const peer = useMemo(() => {
    if (!hover?.peerItemId) return null;
    return (
      modelItems.find((item) => {
        return item.id === hover.peerItemId;
      }) ?? null
    );
  }, [hover, modelItems]);

  const peerRectangle = useMemo(() => {
    if (!hover?.peerRectangleId) return null;
    return (
      planRectangles.find((rect) => {
        return rect.id === hover.peerRectangleId;
      }) ?? null
    );
  }, [hover, planRectangles]);

  const focusRect = useMemo((): FocusRect | null => {
    if (peer && peerViewItem) {
      // Frame the parent cabinet when the target is rack-mounted.
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
          return footprintOf(parentView, parentModel);
        }
      }
      return footprintOf(peerViewItem, peer);
    }
    if (peerRectangle) return rectangleBounds(peerRectangle);
    return null;
  }, [peer, peerViewItem, peerRectangle, planItems, modelItems]);

  const sceneNodes = useMemo((): Footprint[] => {
    if (!focusRect) return [];
    const search = {
      x: focusRect.x - NEIGHBOR_PAD_TILES,
      y: focusRect.y - NEIGHBOR_PAD_TILES,
      w: focusRect.w + NEIGHBOR_PAD_TILES * 2,
      h: focusRect.h + NEIGHBOR_PAD_TILES * 2
    };
    return collectNearbyNodes({
      planItems,
      modelItems,
      search,
      focusItemId: peer?.id ?? null,
      focusViewItem: peerViewItem,
      focusModelItem: peer
    });
  }, [focusRect, planItems, modelItems, peer, peerViewItem]);

  const nearbyRectangles = useMemo(() => {
    if (!focusRect) return [];
    const search = {
      x: focusRect.x - NEIGHBOR_PAD_TILES,
      y: focusRect.y - NEIGHBOR_PAD_TILES,
      w: focusRect.w + NEIGHBOR_PAD_TILES * 2,
      h: focusRect.h + NEIGHBOR_PAD_TILES * 2
    };
    return planRectangles.filter((rect) => {
      return aabbsOverlap(rectangleBounds(rect), search);
    });
  }, [focusRect, planRectangles]);

  const pipAllowed =
    projectionMode === 'TWO_D_V2' || projectionMode === 'ISOMETRIC';

  if (!pipAllowed || !hover || !focusRect) {
    return null;
  }

  const focusCenterPx = {
    x: (focusRect.x + focusRect.w / 2) * TILE_SIZE_2D,
    y: (focusRect.y + focusRect.h / 2) * TILE_SIZE_2D
  };
  const worldZoom = fitWorldZoom(focusRect);

  const peerPortHighlight = hover.peerPortId ? [hover.peerPortId] : null;
  const titleName =
    hover.title?.trim() ||
    peer?.name ||
    (peerRectangle
      ? peerRectangle.name?.trim() ||
        (peerRectangle.kind === 'building' ? 'Budynek' : 'Obszar')
      : null) ||
    'Cel';
  const titlePrefix =
    hover.hostPortId == null ? 'Portal' : 'Podłączone';

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
        {titlePrefix} · {titleName}
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
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: VIEWPORT_W,
            height: VIEWPORT_H,
            transformOrigin: '0 0',
            transform: `translate(${VIEWPORT_W / 2}px, ${VIEWPORT_H / 2}px) scale(${worldZoom}) translate(${-focusCenterPx.x}px, ${-focusCenterPx.y}px)`
          }}
        >
          {nearbyRectangles.map((rect) => {
            const bounds = rectangleBounds(rect);
            const isFocus = rect.id === hover.peerRectangleId;
            const isBuilding = rect.kind === 'building';
            const pxW = bounds.w * TILE_SIZE_2D;
            const pxH = bounds.h * TILE_SIZE_2D;
            const headerH = Math.max(28, Math.min(56, Math.round(pxH * 0.14)));
            return (
              <Box
                key={rect.id}
                sx={{
                  position: 'absolute',
                  left: bounds.x * TILE_SIZE_2D,
                  top: bounds.y * TILE_SIZE_2D,
                  width: pxW,
                  height: pxH,
                  opacity: isFocus ? 1 : 0.55,
                  zIndex: isFocus ? 0 : 0,
                  pointerEvents: 'none'
                }}
              >
                {isBuilding && (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: '100%',
                      height: headerH,
                      mb: `${Math.round(headerH * 0.15)}px`,
                      bgcolor: rect.color ?? '#94a3b8',
                      border: '2px solid #475569',
                      borderBottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      px: 1,
                      boxSizing: 'border-box'
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: Math.max(14, Math.min(28, pxW * 0.08)),
                        fontWeight: 700,
                        color: '#0f172a',
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {rect.name?.trim() || 'Budynek'}
                    </Typography>
                  </Box>
                )}
                <Box
                  sx={{
                    width: '100%',
                    height: '100%',
                    bgcolor: rect.color ?? '#94a3b8',
                    opacity: rect.opacity ?? 0.35,
                    border: `2px solid ${isBuilding ? '#475569' : '#64748b'}`,
                    boxSizing: 'border-box',
                    boxShadow: isFocus
                      ? '0 0 0 3px rgba(37, 99, 235, 0.45)'
                      : undefined
                  }}
                />
              </Box>
            );
          })}

          {sceneNodes.map(({ viewItem, modelItem, x, y, w, h }) => {
            const isPeer = peer ? modelItem.id === peer.id : false;
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
                  opacity: isPeer || !peer ? 1 : 0.72,
                  filter: isPeer || !peer ? undefined : 'saturate(0.85)',
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
