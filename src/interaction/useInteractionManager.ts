import { useCallback, useEffect, useRef } from 'react';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { ModeActions, State, SlimMouseEvent } from 'src/types';
import {
  getMouse,
  getItemAtTile,
  getPanScrollFromDelta,
  setWindowCursor,
  BLACK_CROSSHAIR_CURSOR,
  connectorPathTileToGlobal,
  CoordsUtils
} from 'src/utils';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { useScene } from 'src/hooks/useScene';
import { Cursor } from './modes/Cursor';
import { DragItems } from './modes/DragItems';
import { DrawRectangle } from './modes/Rectangle/DrawRectangle';
import { TransformRectangle } from './modes/Rectangle/TransformRectangle';
import { Connector } from './modes/Connector';
import { Pan } from './modes/Pan';
import { PlaceIcon } from './modes/PlaceIcon';
import { TextBox } from './modes/TextBox';

const RIGHT_MOUSE_BUTTON = 2;
const PAN_DRAG_THRESHOLD_PX = 3;

const modes: { [k in string]: ModeActions } = {
  CURSOR: Cursor,
  DRAG_ITEMS: DragItems,
  // TODO: Adopt this notation for all modes (i.e. {node.type}.{action})
  'RECTANGLE.DRAW': DrawRectangle,
  'RECTANGLE.TRANSFORM': TransformRectangle,
  CONNECTOR: Connector,
  PAN: Pan,
  PLACE_ICON: PlaceIcon,
  TEXTBOX: TextBox
};

const getModeFunction = (mode: ModeActions, e: SlimMouseEvent) => {
  switch (e.type) {
    case 'mousemove':
      return mode.mousemove;
    case 'mousedown':
      return mode.mousedown;
    case 'mouseup':
      return mode.mouseup;
    case 'dblclick':
      return mode.dblclick;
    default:
      return null;
  }
};

const restoreCursorForMode = (modeType: string) => {
  switch (modeType) {
    case 'PAN':
      setWindowCursor('grab');
      break;
    case 'CONNECTOR':
      setWindowCursor(BLACK_CROSSHAIR_CURSOR);
      break;
    case 'RECTANGLE.DRAW':
    case 'TEXTBOX':
      setWindowCursor('crosshair');
      break;
    default:
      setWindowCursor('default');
  }
};

export const useInteractionManager = () => {
  const rendererRef = useRef<HTMLElement>();
  const reducerTypeRef = useRef<string>();
  const rightButtonPanRef = useRef({ active: false, didPan: false });
  const uiState = useUiStateStore((state) => {
    return state;
  });
  const model = useModelStore((state) => {
    return state;
  });
  const scene = useScene();
  const { size: rendererSize } = useResizeObserver(uiState.rendererEl);

  const onMouseEvent = useCallback(
    (e: SlimMouseEvent) => {
      if (!rendererRef.current) return;

      const isRendererInteraction = rendererRef.current === e.target;
      const rightButtonPan = rightButtonPanRef.current;

      const nextMouse = getMouse({
        interactiveElement: rendererRef.current,
        zoom: uiState.zoom,
        scroll: uiState.scroll,
        lastMouse: uiState.mouse,
        mouseEvent: e,
        rendererSize,
        projectionMode: uiState.projectionMode
      });

      if (e.type === 'mousedown' && e.button === RIGHT_MOUSE_BUTTON) {
        if (!isRendererInteraction) return;

        e.preventDefault();
        rightButtonPan.active = true;
        rightButtonPan.didPan = false;
        setWindowCursor('grabbing');
        uiState.actions.setMouse(nextMouse);
        return;
      }

      // Prevent native browser drag (shows ⃠) on the empty interaction layer
      if (e.type === 'mousedown' && isRendererInteraction && e.button === 0) {
        e.preventDefault();
      }

      if (e.type === 'dblclick' && isRendererInteraction) {
        e.preventDefault();
      }

      if (rightButtonPan.active && e.type === 'mousemove') {
        uiState.actions.setMouse(nextMouse);

        if (nextMouse.mousedown) {
          const dx = nextMouse.position.screen.x - nextMouse.mousedown.screen.x;
          const dy = nextMouse.position.screen.y - nextMouse.mousedown.screen.y;

          if (Math.hypot(dx, dy) > PAN_DRAG_THRESHOLD_PX) {
            rightButtonPan.didPan = true;
          }
        }

        uiState.actions.setScroll(
          getPanScrollFromDelta(uiState.scroll, nextMouse.delta?.screen)
        );
        return;
      }

      if (rightButtonPan.active && e.type === 'mouseup') {
        uiState.actions.setMouse(nextMouse);
        rightButtonPan.active = false;
        restoreCursorForMode(uiState.mode.type);
        return;
      }

      const mode = modes[uiState.mode.type];
      const modeFunction = getModeFunction(mode, e);

      if (!modeFunction) return;

      uiState.actions.setMouse(nextMouse);

      const baseState: State = {
        model,
        scene,
        uiState,
        rendererRef: rendererRef.current,
        rendererSize,
        isRendererInteraction
      };

      if (reducerTypeRef.current !== uiState.mode.type) {
        const prevReducer = reducerTypeRef.current
          ? modes[reducerTypeRef.current]
          : null;

        if (prevReducer && prevReducer.exit) {
          prevReducer.exit(baseState);
        }

        if (mode.entry) {
          mode.entry(baseState);
        }
      }

      modeFunction(baseState);
      reducerTypeRef.current = uiState.mode.type;
    },
    [model, scene, uiState, rendererSize]
  );

  const onContextMenu = useCallback(
    (e: SlimMouseEvent) => {
      e.preventDefault();

      if (rightButtonPanRef.current.didPan) {
        rightButtonPanRef.current.didPan = false;
        return;
      }

      const tile = uiState.mouse.position.tile;

      const connectorAtTile = scene.connectors.find((con) => {
        return con.path.tiles.some((pathTile) => {
          const globalPathTile = connectorPathTileToGlobal(
            pathTile,
            con.path.rectangle.from
          );
          return CoordsUtils.isEqual(globalPathTile, tile);
        });
      });

      if (connectorAtTile) {
        uiState.actions.setItemControls({
          type: 'CONNECTOR',
          id: connectorAtTile.id
        });
        uiState.actions.setContextMenu({
          item: { type: 'CONNECTOR', id: connectorAtTile.id },
          tile
        });
        return;
      }

      const itemAtTile = getItemAtTile({
        tile,
        scene
      });

      if (itemAtTile?.type === 'RECTANGLE') {
        uiState.actions.setContextMenu({
          item: itemAtTile,
          tile
        });
      } else if (uiState.contextMenu) {
        uiState.actions.setContextMenu(null);
      }
    },
    [uiState.mouse, scene, uiState.contextMenu, uiState.actions]
  );

  useEffect(() => {
    if (uiState.mode.type === 'INTERACTIONS_DISABLED') return;

    const el = window;

    const onTouchStart = (e: TouchEvent) => {
      onMouseEvent({
        ...e,
        clientX: Math.floor(e.touches[0].clientX),
        clientY: Math.floor(e.touches[0].clientY),
        type: 'mousedown',
        button: 0
      });
    };

    const onTouchMove = (e: TouchEvent) => {
      onMouseEvent({
        ...e,
        clientX: Math.floor(e.touches[0].clientX),
        clientY: Math.floor(e.touches[0].clientY),
        type: 'mousemove',
        button: 0
      });
    };

    const onTouchEnd = (e: TouchEvent) => {
      onMouseEvent({
        ...e,
        clientX: 0,
        clientY: 0,
        type: 'mouseup',
        button: 0
      });
    };

    const onScroll = (e: WheelEvent) => {
      if (e.deltaY > 0) {
        uiState.actions.decrementZoom();
      } else {
        uiState.actions.incrementZoom();
      }
    };

    const onKeyChange = (e: KeyboardEvent) => {
      if (e.key !== 'Shift') return;
      uiState.actions.setMouse({
        ...uiState.mouse,
        shiftKey: e.type === 'keydown'
      });
    };

    el.addEventListener('mousemove', onMouseEvent);
    el.addEventListener('mousedown', onMouseEvent);
    el.addEventListener('mouseup', onMouseEvent);
    el.addEventListener('dblclick', onMouseEvent);
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('touchstart', onTouchStart);
    el.addEventListener('touchmove', onTouchMove);
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('keydown', onKeyChange);
    el.addEventListener('keyup', onKeyChange);
    uiState.rendererEl?.addEventListener('wheel', onScroll);

    return () => {
      el.removeEventListener('mousemove', onMouseEvent);
      el.removeEventListener('mousedown', onMouseEvent);
      el.removeEventListener('mouseup', onMouseEvent);
      el.removeEventListener('dblclick', onMouseEvent);
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('keydown', onKeyChange);
      el.removeEventListener('keyup', onKeyChange);
      uiState.rendererEl?.removeEventListener('wheel', onScroll);
    };
  }, [
    uiState.editorMode,
    onMouseEvent,
    uiState.mode.type,
    onContextMenu,
    uiState.actions,
    uiState.rendererEl
  ]);

  const setInteractionsElement = useCallback((element: HTMLElement) => {
    rendererRef.current = element;
  }, []);

  return {
    setInteractionsElement
  };
};
