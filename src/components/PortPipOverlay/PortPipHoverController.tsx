import { useEffect } from 'react';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useSceneStoreApi } from 'src/stores/sceneStore';
import { useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import {
  getShape2dPortAtTile,
  screenToTile2dContinuous,
  resolvePortPipPeer,
  findPlanView
} from 'src/utils';

/**
 * Tracks port-under-cursor in 2Dv2 and fills `portPipHover` for the PiP card.
 * Peer links are resolved from the Plan view connectors (2Dv2 has none).
 * Patch panels are transparent — PiP shows the bridged node, never the panel.
 */
export const PortPipHoverController = () => {
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
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
  const setPortPipHover = useUiStateStore((state) => {
    return state.actions.setPortPipHover;
  });
  const modelStore = useModelStoreApi();
  const sceneStore = useSceneStoreApi();
  const uiStateStoreApi = useUiStateStoreApi();
  const { size: rendererSize } = useResizeObserver(rendererEl);

  useEffect(() => {
    // Isometric portal links own PiP — leave hover alone.
    if (projectionMode === 'ISOMETRIC') {
      return;
    }

    if (projectionMode !== 'TWO_D_V2') {
      setPortPipHover(null);
      return;
    }

    if (!rendererSize.width || !rendererSize.height) {
      setPortPipHover(null);
      return;
    }

    const point = screenToTile2dContinuous({
      mouse: mouse.position.screen,
      zoom,
      scroll,
      rendererSize
    });

    const model = modelStore.getState();
    const sceneStoreState = sceneStore.getState();
    const uiState = uiStateStoreApi.getState();
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
      setPortPipHover(null);
      return;
    }

    const plan = findPlanView(model.views);
    const peer = resolvePortPipPeer({
      connectors: plan?.connectors,
      modelItems: model.items,
      itemId: portHit.itemId,
      portId: portHit.portId
    });

    if (!peer) {
      setPortPipHover(null);
      return;
    }

    setPortPipHover({
      hostItemId: portHit.itemId,
      hostPortId: portHit.portId,
      peerItemId: peer.itemId,
      peerPortId: peer.portId,
      peerRectangleId: null,
      screen: {
        x:
          (rendererEl?.getBoundingClientRect().left ?? 0) +
          mouse.position.screen.x,
        y:
          (rendererEl?.getBoundingClientRect().top ?? 0) +
          mouse.position.screen.y
      }
    });
  }, [
    projectionMode,
    mouse.position.screen.x,
    mouse.position.screen.y,
    mouse.position.tile.x,
    mouse.position.tile.y,
    zoom,
    scroll,
    rendererSize.width,
    rendererSize.height,
    rendererEl,
    setPortPipHover
  ]);

  return null;
};
