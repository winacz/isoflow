import { useEffect, useRef } from 'react';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useSceneStoreApi } from 'src/stores/sceneStore';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import {
  getShape2dPortAtTile,
  screenToTile2dContinuous,
  resolvePortPipPeer,
  getCachedBoundingClientRect
} from 'src/utils';

/**
 * Tracks port-under-cursor in 2Dv2 and fills `portPipHover` for the PiP card.
 * Uses store.subscribe + rAF so the controller does not re-render every mouse px.
 */
export const PortPipHoverController = () => {
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const rendererEl = useUiStateStore((state) => {
    return state.rendererEl;
  });
  const setPortPipHover = useUiStateStore((state) => {
    return state.actions.setPortPipHover;
  });
  const modelStore = useModelStoreApi();
  const sceneStore = useSceneStoreApi();
  const uiStateStoreApi = useUiStateStoreApi();
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const rafRef = useRef<number | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const rendererSizeRef = useRef(rendererSize);
  rendererSizeRef.current = rendererSize;

  useEffect(() => {
    const clearHover = () => {
      if (lastKeyRef.current !== null) {
        lastKeyRef.current = null;
        setPortPipHover(null);
      }
    };

    const run = () => {
      rafRef.current = null;
      const uiState = uiStateStoreApi.getState();
      const { projectionMode: mode, mouse, zoom, scroll, rendererEl: el } =
        uiState;
      const size = rendererSizeRef.current;

      if (mode === 'ISOMETRIC') {
        return;
      }

      if (mode !== 'TWO_D_V2') {
        clearHover();
        return;
      }

      if (!size.width || !size.height) {
        clearHover();
        return;
      }

      const point = screenToTile2dContinuous({
        mouse: mouse.position.screen,
        zoom,
        scroll,
        rendererSize: size
      });

      const model = modelStore.getState();
      const sceneStoreState = sceneStore.getState();
      const currentView = model.views.find((v) => v.id === uiState.view);

      const mockScene = {
        items: currentView?.items ?? [],
        connectors: (currentView?.connectors ?? []).map((connector) => ({
          ...connector,
          ...sceneStoreState.connectors[connector.id]
        })),
        rectangles: currentView?.rectangles ?? [],
        textBoxes: (currentView?.textBoxes ?? []).map((textBox) => ({
          ...textBox,
          ...sceneStoreState.textBoxes[textBox.id]
        }))
      } as any;

      const portHit = getShape2dPortAtTile({
        tile: mouse.position.tile,
        point,
        scene: mockScene,
        modelItems: model.items
      });

      if (!portHit) {
        clearHover();
        return;
      }

      const peer = resolvePortPipPeer({
        connectors: mockScene.connectors,
        modelItems: model.items,
        itemId: portHit.itemId,
        portId: portHit.portId
      });

      if (!peer) {
        clearHover();
        return;
      }

      const key = `${portHit.itemId}:${portHit.portId}:${peer.itemId}:${peer.portId}`;
      const rect = el ? getCachedBoundingClientRect(el) : { left: 0, top: 0 };
      const screen = {
        x: rect.left + mouse.position.screen.x,
        y: rect.top + mouse.position.screen.y
      };

      // Update when port identity changes or screen moves (card follows cursor).
      lastKeyRef.current = key;
      setPortPipHover({
        hostItemId: portHit.itemId,
        hostPortId: portHit.portId,
        peerItemId: peer.itemId,
        peerPortId: peer.portId,
        peerRectangleId: null,
        screen
      });
    };

    const schedule = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(run);
    };

    if (projectionMode !== 'TWO_D_V2') {
      clearHover();
    }

    const unsub = uiStateStoreApi.subscribe((state, prev) => {
      if (
        state.mouse === prev.mouse &&
        state.zoom === prev.zoom &&
        state.scroll === prev.scroll &&
        state.projectionMode === prev.projectionMode
      ) {
        return;
      }
      schedule();
    });

    schedule();

    return () => {
      unsub();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [
    projectionMode,
    modelStore,
    sceneStore,
    uiStateStoreApi,
    setPortPipHover
  ]);

  return null;
};
