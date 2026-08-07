import { useEffect, useRef } from 'react';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import {
  getShape2dPortAtPoint,
  screenToTile2dContinuous,
  isPlanProjection,
  isTileInShape2dBounds,
  applyScenePortHoverDom
} from 'src/utils';
import {
  getModelItemSize,
  getShape2dSize,
  SHAPE_2D_CABINET_ID
} from 'src/config';

/** Keep hover briefly when cursor slips between adjacent ports. */
const PORT_HOVER_CLEAR_DELAY_MS = 140;
/** Must match Nodes.tsx / getShape2dPortAtPoint highlight scale. */
const NODE_HIGHLIGHT_SCALE = 1.15;

/**
 * Item ids that currently render with CSS scale(1.15) — selected nodes
 * (and gear mounted in a selected cabinet). Cable peers are glow-only and
 * must NOT be included or hit-testing drifts on large switches.
 */
const getScaledItemIds = (
  selectedItemIds: string[],
  viewItems: { id: string; parentId?: string }[],
  modelItems: { id: string; icon?: string }[]
): Set<string> => {
  const ids = new Set<string>();
  if (selectedItemIds.length === 0) return ids;

  const iconById = new Map(
    modelItems.map((item) => {
      return [item.id, item.icon];
    })
  );
  const selected = new Set(selectedItemIds);

  selectedItemIds.forEach((id) => {
    if (iconById.get(id) !== SHAPE_2D_CABINET_ID) {
      ids.add(id);
    }
  });

  viewItems.forEach((item) => {
    if (item.parentId && selected.has(item.parentId)) {
      ids.add(item.id);
    }
  });

  return ids;
};

/**
 * Tracks RJ45/SFP under the cursor on Plan 2D and stores `shape2dPortHover`
 * so jacks can zoom on hover while keeping an expanded sticky hit box.
 */
export const Shape2dPortHoverController = () => {
  const rendererEl = useUiStateStore((state) => {
    return state.rendererEl;
  });
  const modelStore = useModelStoreApi();
  const uiStateStoreApi = useUiStateStoreApi();
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const rendererWidth = rendererSize.width;
  const rendererHeight = rendererSize.height;
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredJackRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let hitTestFrame: number | null = null;

    const clearPending = () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    };

    const clearHoverVisual = () => {
      applyScenePortHoverDom(null, null, hoveredJackRef);
    };

    const syncHoverVisual = (
      hover: { itemId: string; portId: string | null } | null
    ) => {
      if (!hover?.portId) {
        clearHoverVisual();
        return;
      }
      applyScenePortHoverDom(hover.itemId, hover.portId, hoveredJackRef);
    };

    const runHitTest = () => {
      hitTestFrame = null;
      const uiState = uiStateStoreApi.getState();
      const { setShape2dPortHover } = uiState.actions;
      const { shape2dPortHover } = uiState;

      if (
        !isPlanProjection(uiState.projectionMode) ||
        uiState.projectionMode === 'TWO_D_V2'
      ) {
        clearPending();
        if (shape2dPortHover) setShape2dPortHover(null);
        clearHoverVisual();
        return;
      }

      // Skip hit-tests while dragging — saves work and avoids loupe churn.
      if (
        uiState.mode.type === 'DRAG_ITEMS' ||
        uiState.mode.type === 'CONNECTOR'
      ) {
        clearPending();
        if (shape2dPortHover) setShape2dPortHover(null);
        clearHoverVisual();
        return;
      }

      if (!rendererWidth || !rendererHeight) {
        clearPending();
        if (shape2dPortHover) setShape2dPortHover(null);
        clearHoverVisual();
        return;
      }

      const point = screenToTile2dContinuous({
        mouse: uiState.mouse.position.screen,
        zoom: uiState.zoom,
        scroll: uiState.scroll,
        rendererSize: { width: rendererWidth, height: rendererHeight }
      });

      const model = modelStore.getState();
      const currentView = model.views.find((v) => {
        return v.id === uiState.view;
      });
      const viewItems = currentView?.items ?? [];

      // getShape2dPortAtPoint only reads scene.items — skip connector/textBox
      // mapping to avoid unnecessary work during pointer tracking.
      const mockScene = {
        items: viewItems
      } as any;

      const scaledItemIds = getScaledItemIds(
        uiState.selectedItemIds,
        viewItems,
        model.items
      );

      const portHit = getShape2dPortAtPoint({
        point,
        scene: mockScene,
        modelItems: model.items,
        stickyHover: shape2dPortHover,
        highlightedItemIds: scaledItemIds.size > 0 ? scaledItemIds : null
      });

      if (!portHit) {
        if (!shape2dPortHover) return;

        // Check if we are still on the body of the currently hovered device.
        let isOnBody = false;
        const viewItem = viewItems.find((item) => {
          return item.id === shape2dPortHover.itemId;
        });
        const modelItem = model.items.find((item) => {
          return item.id === shape2dPortHover.itemId;
        });
        if (viewItem && modelItem?.icon) {
          const size =
            getModelItemSize(modelItem) ?? getShape2dSize(modelItem.icon);
          if (size) {
            if (
              scaledItemIds.has(viewItem.id) &&
              modelItem.icon !== SHAPE_2D_CABINET_ID
            ) {
              // Body is CSS-scaled from the device centre — expand AABB.
              const cx = viewItem.tile.x + size.width / 2;
              const cy = viewItem.tile.y + size.height / 2;
              const halfW = (size.width * NODE_HIGHLIGHT_SCALE) / 2;
              const halfH = (size.height * NODE_HIGHLIGHT_SCALE) / 2;
              isOnBody =
                point.x >= cx - halfW &&
                point.x < cx + halfW &&
                point.y >= cy - halfH &&
                point.y < cy + halfH;
            } else {
              isOnBody = isTileInShape2dBounds(point, viewItem.tile, size);
            }
          }
        }

        if (isOnBody) {
          clearPending();
          if (shape2dPortHover.portId !== null) {
            setShape2dPortHover({
              itemId: shape2dPortHover.itemId,
              portId: null
            });
            clearHoverVisual();
          }
          return;
        }

        if (clearTimerRef.current) return;
        clearTimerRef.current = setTimeout(() => {
          uiStateStoreApi.getState().actions.setShape2dPortHover(null);
          clearHoverVisual();
          clearTimerRef.current = null;
        }, PORT_HOVER_CLEAR_DELAY_MS);
        return;
      }

      clearPending();
      const nextHover = {
        itemId: portHit.itemId,
        portId: portHit.portId
      };
      setShape2dPortHover(nextHover);
      syncHoverVisual(nextHover);
    };

    const scheduleHitTest = () => {
      if (hitTestFrame == null) {
        hitTestFrame = requestAnimationFrame(runHitTest);
      }
    };

    // Pointer events can arrive faster than the display refresh rate. Reading
    // the store imperatively avoids a React render per event, while rAF
    // coalesces all pending hit-tests into at most one pass per frame.
    const unsubscribe = uiStateStoreApi.subscribe(scheduleHitTest);
    scheduleHitTest();

    return () => {
      unsubscribe();
      if (hitTestFrame != null) cancelAnimationFrame(hitTestFrame);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearHoverVisual();
    };
  }, [modelStore, rendererHeight, rendererWidth, uiStateStoreApi]);

  return null;
};
