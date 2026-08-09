import { useEffect, useRef } from 'react';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import {
  getShape2dPortAtPoint,
  getShape2dHeaderAtPoint,
  getShape2dBodyAtPoint,
  getScaledShape2dItemIds,
  screenToTile2dContinuous,
  isPlanProjection,
  isTileInShape2dBounds,
  applyScenePortHoverDom,
  resolvePortPipPeer,
  computeHighlightScale,
  isLoupePortHoverFrozen
} from 'src/utils';
import {
  getModelItemSize,
  getShape2dSize,
  SHAPE_2D_CABINET_ID
} from 'src/config';
import type { PortHoverTarget } from 'src/utils/portHoverDom';
import type { Connector } from 'src/types';

/** Keep hover briefly when cursor slips between adjacent ports. */
const PORT_HOVER_CLEAR_DELAY_MS = 140;
/** Sticky device-under-cursor — avoids relation/ring flicker in port gaps. */
const NODE_HOVER_CLEAR_DELAY_MS = 100;

/**
 * Tracks RJ45/SFP under the cursor on Plan 2D and stores `shape2dPortHover`
 * so jacks can zoom on hover while keeping an expanded sticky hit box.
 * After a port click (`shape2dPortHoverPinned`), keeps the blue hover until
 * another port is hovered or port selection clears.
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
  const nodeHoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const hoveredJacksRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    let hitTestFrame: number | null = null;

    const clearPending = () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    };

    const clearHoverVisual = () => {
      applyScenePortHoverDom(null, null, hoveredJacksRef);
    };

    const peerTargetsFor = (
      itemId: string,
      portId: string,
      connectors: Connector[],
      modelItems: { id: string; icon?: string }[]
    ): PortHoverTarget[] => {
      const peer = resolvePortPipPeer({
        connectors,
        modelItems,
        itemId,
        portId
      });
      if (!peer?.portId) return [];
      return [{ itemId: peer.itemId, portId: peer.portId }];
    };

    const syncHoverVisual = (
      hover: { itemId: string; portId: string | null } | null,
      connectors: Connector[],
      modelItems: { id: string; icon?: string }[]
    ) => {
      if (!hover?.portId) {
        clearHoverVisual();
        return;
      }
      const peers = peerTargetsFor(
        hover.itemId,
        hover.portId,
        connectors,
        modelItems
      );
      applyScenePortHoverDom(
        hover.itemId,
        hover.portId,
        hoveredJacksRef,
        peers
      );
    };

    const runHitTest = () => {
      hitTestFrame = null;
      const uiState = uiStateStoreApi.getState();
      const {
        setShape2dPortHover,
        setShape2dHeaderHoverItemId,
        setShape2dNodeHoverItemId
      } = uiState.actions;
      const {
        shape2dPortHover,
        shape2dPortHoverPinned,
        shape2dHeaderHoverItemId,
        shape2dEnlargedItemId
      } = uiState;

      const clearHeaderHover = () => {
        if (shape2dHeaderHoverItemId) setShape2dHeaderHoverItemId(null);
      };

      const clearNodeHoverSoon = () => {
        if (nodeHoverClearTimerRef.current) return;
        nodeHoverClearTimerRef.current = setTimeout(() => {
          uiStateStoreApi.getState().actions.setShape2dNodeHoverItemId(null);
          nodeHoverClearTimerRef.current = null;
        }, NODE_HOVER_CLEAR_DELAY_MS);
      };

      const setNodeHover = (itemId: string | null) => {
        if (itemId) {
          if (nodeHoverClearTimerRef.current) {
            clearTimeout(nodeHoverClearTimerRef.current);
            nodeHoverClearTimerRef.current = null;
          }
          setShape2dNodeHoverItemId(itemId);
          return;
        }
        clearNodeHoverSoon();
      };

      if (
        !isPlanProjection(uiState.projectionMode) ||
        uiState.projectionMode === 'TWO_D_V2'
      ) {
        clearPending();
        if (shape2dPortHover) setShape2dPortHover(null);
        clearHeaderHover();
        if (nodeHoverClearTimerRef.current) {
          clearTimeout(nodeHoverClearTimerRef.current);
          nodeHoverClearTimerRef.current = null;
        }
        setShape2dNodeHoverItemId(null);
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
        clearHeaderHover();
        if (nodeHoverClearTimerRef.current) {
          clearTimeout(nodeHoverClearTimerRef.current);
          nodeHoverClearTimerRef.current = null;
        }
        setShape2dNodeHoverItemId(null);
        clearHoverVisual();
        return;
      }

      // Loupe glass magnifies; canvas hit-tests underneath must not steal hover.
      // (Reveal lock + glass cover this — do not also freeze on every mousedown
      // while showLoupe is on, or connector drags never retarget the end port.)
      if (isLoupePortHoverFrozen()) {
        clearPending();
        return;
      }

      if (!rendererWidth || !rendererHeight) {
        clearPending();
        if (shape2dPortHover) setShape2dPortHover(null);
        clearHeaderHover();
        if (nodeHoverClearTimerRef.current) {
          clearTimeout(nodeHoverClearTimerRef.current);
          nodeHoverClearTimerRef.current = null;
        }
        setShape2dNodeHoverItemId(null);
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
      const viewConnectors = currentView?.connectors ?? [];

      // getShape2dPortAtPoint only reads scene.items — skip connector/textBox
      // mapping to avoid unnecessary work during pointer tracking.
      const mockScene = {
        items: viewItems
      } as any;

      const scaledItemIds = getScaledShape2dItemIds({
        selectedItemIds: uiState.selectedItemIds,
        viewItems,
        modelItems: model.items,
        extraScaledItemIds: [shape2dEnlargedItemId]
      });

      const portHit = getShape2dPortAtPoint({
        point,
        scene: mockScene,
        modelItems: model.items,
        stickyHover: shape2dPortHover,
        highlightedItemIds: scaledItemIds.size > 0 ? scaledItemIds : null,
        zoom: uiState.zoom
      });

      if (!portHit) {
        // Click-pinned port: keep blue hover + peers until selection clears
        // or the cursor moves onto a different port.
        if (shape2dPortHoverPinned && shape2dPortHover?.portId) {
          clearPending();
          syncHoverVisual(shape2dPortHover, viewConnectors, model.items);
          // Still allow header highlight on other devices while a port is pinned.
        } else if (!shape2dPortHover) {
          // Selection/pin may have cleared the store while the DOM still
          // shows the last imperative blue ring.
          clearPending();
          clearHoverVisual();
        } else {
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
                const bodyScale = computeHighlightScale(
                  size.width * size.height,
                  uiState.zoom
                );
                const cx = viewItem.tile.x + size.width / 2;
                const cy = viewItem.tile.y + size.height / 2;
                const halfW = (size.width * bodyScale) / 2;
                const halfH = (size.height * bodyScale) / 2;
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
          } else if (!clearTimerRef.current) {
            clearTimerRef.current = setTimeout(() => {
              uiStateStoreApi.getState().actions.setShape2dPortHover(null);
              clearHoverVisual();
              clearTimerRef.current = null;
            }, PORT_HOVER_CLEAR_DELAY_MS);
          }
        }

        // Header hover accent (only when not over a port jack) — no enlarge.
        // Use real enlarge scale for hit-testing (hover must not pretend-scale).
        let enlargeScale = 1.15;
        if (shape2dEnlargedItemId && scaledItemIds.has(shape2dEnlargedItemId)) {
          const enlModel = model.items.find((m) => m.id === shape2dEnlargedItemId);
          const enlSize = enlModel
            ? getModelItemSize(enlModel) ??
              (enlModel.icon ? getShape2dSize(enlModel.icon) : null)
            : null;
          if (enlSize) {
            enlargeScale = computeHighlightScale(
              enlSize.width * enlSize.height,
              uiState.zoom
            );
          }
        }
        const headerItemId = getShape2dHeaderAtPoint({
          point,
          items: viewItems,
          modelItems: model.items,
          scaledItemIds: scaledItemIds.size > 0 ? scaledItemIds : null,
          scale: enlargeScale
        });
        setShape2dHeaderHoverItemId(headerItemId);

        // Whole-device hover → preview cable peers / blue ring (sticky clear).
        const bodyItemId = getShape2dBodyAtPoint({
          point,
          items: viewItems,
          modelItems: model.items,
          scaledItemIds: scaledItemIds.size > 0 ? scaledItemIds : null,
          scale: enlargeScale
        });
        setNodeHover(bodyItemId);
        return;
      }

      clearPending();
      clearHeaderHover();
      const nextHover = {
        itemId: portHit.itemId,
        portId: portHit.portId
      };
      setShape2dPortHover(nextHover);
      setNodeHover(portHit.itemId);
      syncHoverVisual(nextHover, viewConnectors, model.items);
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
      if (nodeHoverClearTimerRef.current) {
        clearTimeout(nodeHoverClearTimerRef.current);
      }
      clearHoverVisual();
      uiStateStoreApi.getState().actions.setShape2dHeaderHoverItemId(null);
      uiStateStoreApi.getState().actions.setShape2dNodeHoverItemId(null);
    };
  }, [modelStore, rendererHeight, rendererWidth, uiStateStoreApi]);

  return null;
};
