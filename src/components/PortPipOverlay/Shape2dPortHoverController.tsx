import { useEffect, useRef } from 'react';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import {
  getShape2dPortAtPoint,
  screenToTile2dContinuous,
  isPlanProjection
} from 'src/utils';

/** Keep hover briefly when cursor slips between adjacent ports. */
const PORT_HOVER_CLEAR_DELAY_MS = 140;

/**
 * Tracks RJ45/SFP under the cursor on Plan 2D and stores `shape2dPortHover`
 * so jacks can zoom on hover while keeping an expanded sticky hit box.
 */
export const Shape2dPortHoverController = () => {
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const modeType = useUiStateStore((state) => {
    return state.mode.type;
  });
  const mouse = useUiStateStore((state) => {
    return state.mouse;
  });
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });
  const scroll = useUiStateStore((state) => {
    return state.scroll;
  });
  const rendererEl = useUiStateStore((state) => {
    return state.rendererEl;
  });
  const shape2dPortHover = useUiStateStore((state) => {
    return state.shape2dPortHover;
  });
  const setShape2dPortHover = useUiStateStore((state) => {
    return state.actions.setShape2dPortHover;
  });
  const modelStore = useModelStoreApi();
  const uiStateStoreApi = useUiStateStoreApi();
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearPending = () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    };

    if (!isPlanProjection(projectionMode) || projectionMode === 'TWO_D_V2') {
      clearPending();
      setShape2dPortHover(null);
      return;
    }

    // Skip hit-tests while dragging — saves work and avoids loupe churn.
    if (modeType === 'DRAG_ITEMS' || modeType === 'CONNECTOR') {
      clearPending();
      if (shape2dPortHover) setShape2dPortHover(null);
      return;
    }

    if (!rendererSize.width || !rendererSize.height) {
      clearPending();
      setShape2dPortHover(null);
      return;
    }

    const point = screenToTile2dContinuous({
      mouse: mouse.position.screen,
      zoom,
      scroll,
      rendererSize
    });

    const model = modelStore.getState();

    const uiState = uiStateStoreApi.getState();
    const currentView = model.views.find((v) => v.id === uiState.view);

    // getShape2dPortAtPoint only reads scene.items — skip connector/textBox
    // mapping to avoid O(n) work on every mouse move.
    const mockScene = {
      items: currentView?.items ?? []
    } as any;

    // When a port is hovered the device gets CSS scale(1.15) — tell the
    // hit-test about it so port positions match the visual layout.
    let highlightedItemIds: Set<string> | null = null;
    if (shape2dPortHover) {
      highlightedItemIds = new Set([shape2dPortHover.itemId]);
    }

    const portHit = getShape2dPortAtPoint({
      point,
      scene: mockScene,
      modelItems: model.items,
      stickyHover: shape2dPortHover,
      highlightedItemIds
    });

    if (!portHit) {
      if (!shape2dPortHover || clearTimerRef.current) return;
      clearTimerRef.current = setTimeout(() => {
        setShape2dPortHover(null);
        clearTimerRef.current = null;
      }, PORT_HOVER_CLEAR_DELAY_MS);
      return;
    }

    clearPending();
    setShape2dPortHover({
      itemId: portHit.itemId,
      portId: portHit.portId
    });
  }, [
    projectionMode,
    modeType,
    mouse.position.screen.x,
    mouse.position.screen.y,
    zoom,
    scroll,
    rendererSize.width,
    rendererSize.height,
    shape2dPortHover,
    setShape2dPortHover,
    modelStore,
    uiStateStoreApi
  ]);

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  return null;
};
