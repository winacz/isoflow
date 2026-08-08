import React, { useCallback, useMemo } from 'react';
import { Box } from '@mui/material';
import OpenWithOutlinedIcon from '@mui/icons-material/OpenWithOutlined';
import { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useNodeDragStore } from 'src/stores/nodeDragStore';
import { getModelItemSize, TILE_SIZE_2D, TRANSFORM_CONTROLS_COLOR } from 'src/config';
import { isPlanProjection } from 'src/utils';
import type { ItemReference } from 'src/types';

const HANDLE_SIZE = 36;
/** Gap above the selection bounding box (scene px, before counter-zoom). */
const HANDLE_LIFT_PX = 12;

/** Keep the control readable when the scene is zoomed out. */
const counterZoom = (zoom: number) => {
  return 1 / Math.max(zoom, 0.08);
};

/**
 * Plan 2D: grab handle above a multi-selection so nodes are easy to drag
 * without hunting for a free pixel on a device body (ports steal clicks).
 * Must sit above the interaction capture layer (see Renderer).
 */
export const MultiSelectMoveHandle = () => {
  const { items } = useScene();
  const selectedItemIds = useUiStateStore((state) => state.selectedItemIds);
  const editorMode = useUiStateStore((state) => state.editorMode);
  const projectionMode = useUiStateStore((state) => state.projectionMode);
  const zoom = useUiStateStore((state) => state.zoom);
  const modeType = useUiStateStore((state) => state.mode.type);
  const uiActions = useUiStateStore((state) => state.actions);
  const rendererEl = useUiStateStore((state) => state.rendererEl);
  const modelItems = useModelStore((state) => state.items);
  const liveTiles = useNodeDragStore((state) => state.tiles);

  const isDragging = modeType === 'DRAG_ITEMS';
  const scale = useMemo(() => counterZoom(zoom), [zoom]);

  const movableIds = useMemo(() => {
    if (!isPlanProjection(projectionMode)) return [];
    if (editorMode !== 'EDITABLE') return [];
    if (selectedItemIds.length < 2) return [];

    return selectedItemIds.filter((id) => {
      const viewItem = items.find((item) => item.id === id);
      return Boolean(viewItem) && !viewItem?.locked;
    });
  }, [projectionMode, editorMode, selectedItemIds, items]);

  const anchorPx = useMemo(() => {
    if (movableIds.length < 2) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let count = 0;

    movableIds.forEach((id) => {
      const viewItem = items.find((item) => item.id === id);
      if (!viewItem) return;
      const modelItem = modelItems.find((item) => item.id === id);
      const size = getModelItemSize(modelItem ?? {}) ?? { width: 1, height: 1 };
      const tile = liveTiles[id] ?? viewItem.tile;
      const left = tile.x * TILE_SIZE_2D;
      const right = (tile.x + size.width) * TILE_SIZE_2D;
      const top = tile.y * TILE_SIZE_2D;
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, right);
      minY = Math.min(minY, top);
      count += 1;
    });

    if (count < 2 || !Number.isFinite(minX)) return null;

    return {
      x: (minX + maxX) / 2,
      y: minY - HANDLE_LIFT_PX
    };
  }, [movableIds, items, modelItems, liveTiles]);

  const startGroupDrag = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return;
      if (movableIds.length < 2) return;

      event.preventDefault();
      event.stopPropagation();

      const itemOrigins: Record<string, { x: number; y: number }> = {};
      const dragItems: ItemReference[] = [];

      movableIds.forEach((id) => {
        const viewItem = items.find((item) => item.id === id);
        if (!viewItem) return;
        dragItems.push({ type: 'ITEM', id });
        itemOrigins[id] = { ...(liveTiles[id] ?? viewItem.tile) };
      });

      if (dragItems.length === 0) return;

      const mouse = uiActions.getMouse();
      const originTile = itemOrigins[dragItems[0].id] ?? mouse.position.tile;

      // Screen coords are renderer-relative (same space as getMouse).
      const rect = rendererEl?.getBoundingClientRect();
      const screen = rect
        ? {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
          }
        : { ...mouse.position.screen };

      uiActions.setMouse({
        ...mouse,
        mousedown: {
          screen,
          tile: { ...originTile }
        },
        position: {
          ...mouse.position,
          screen
        },
        delta: null
      });

      uiActions.setMode({
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: dragItems,
        isInitialMovement: true,
        itemOrigins
      });
    },
    [movableIds, items, liveTiles, uiActions, rendererEl]
  );

  if (!anchorPx || movableIds.length < 2) return null;

  return (
    <Box
      title="Przeciągnij zaznaczone urządzenia"
      onMouseDown={startGroupDrag}
      sx={{
        position: 'absolute',
        left: anchorPx.x,
        top: anchorPx.y,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        transform: `translate(-50%, -100%) scale(${scale})`,
        transformOrigin: 'center bottom',
        borderRadius: '10px',
        bgcolor: TRANSFORM_CONTROLS_COLOR,
        border: '2px solid #fff',
        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: isDragging ? 'grabbing' : 'grab',
        // While dragging, let events fall through to the interaction layer.
        pointerEvents: isDragging ? 'none' : 'auto',
        zIndex: 8,
        userSelect: 'none',
        opacity: isDragging ? 0.85 : 1,
        transition: 'opacity 0.12s ease, box-shadow 0.12s ease',
        '&:hover': isDragging
          ? undefined
          : {
              boxShadow: '0 3px 14px rgba(3, 146, 255, 0.45)',
              filter: 'brightness(1.06)'
            }
      }}
    >
      <OpenWithOutlinedIcon
        sx={{
          fontSize: 22,
          color: '#fff'
        }}
      />
    </Box>
  );
};
