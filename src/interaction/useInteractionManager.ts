import { useCallback, useEffect, useRef } from 'react';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { ModeActions, State, SlimMouseEvent } from 'src/types';
import {
  getMouse,
  getItemAtTile,
  getShape2dItemAtTile,
  getPanScrollFromDelta,
  setWindowCursor,
  BLACK_CROSSHAIR_CURSOR,
  connectorPathTouchesTile,
  isPlanProjection
} from 'src/utils';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { useScene } from 'src/hooks/useScene';
import { Cursor } from './modes/Cursor';
import { DragItems } from './modes/DragItems';
import { DrawRectangle } from './modes/Rectangle/DrawRectangle';
import { TransformRectangle } from './modes/Rectangle/TransformRectangle';
import { Connector } from './modes/Connector';
import { ConnectorV3 } from './modes/ConnectorV3';
import { Pan } from './modes/Pan';
import { PlaceIcon } from './modes/PlaceIcon';
import { TextBox } from './modes/TextBox';

const RIGHT_MOUSE_BUTTON = 2;
const PAN_DRAG_THRESHOLD_PX = 3;

type RightButtonPanState = {
  active: boolean;
  didPan: boolean;
};

const modes: { [k in string]: ModeActions } = {
  CURSOR: Cursor,
  DRAG_ITEMS: DragItems,
  // TODO: Adopt this notation for all modes (i.e. {node.type}.{action})
  'RECTANGLE.DRAW': DrawRectangle,
  'RECTANGLE.TRANSFORM': TransformRectangle,
  CONNECTOR: Connector,
  CONNECTOR_V3: ConnectorV3,
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
    case 'CONNECTOR_V3':
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
  const rightButtonPanRef = useRef<RightButtonPanState>({
    active: false,
    didPan: false
  });
  const uiStore = useUiStateStoreApi();
  const editorMode = useUiStateStore((state) => state.editorMode);
  const modeType = useUiStateStore((state) => state.mode.type);
  const rendererEl = useUiStateStore((state) => state.rendererEl);

  const model = useModelStore((state) => {
    return state;
  });
  const scene = useScene();
  const { size: rendererSize } = useResizeObserver(rendererEl);

  const mouseRef = useRef(uiStore.getState().mouse);
  // Do not clobber the live event-chain mouse while a button is held —
  // a stale React snapshot would clear `mousedown` and break marquee.
  if (!mouseRef.current.mousedown) {
    mouseRef.current = uiStore.getState().mouse;
  }

  const commitMouse = (nextMouse: typeof mouseRef.current) => {
    mouseRef.current = nextMouse;
    uiStore.getState().actions.setMouse(nextMouse);
  };

  /** Open lock / connector context menu for the tile under the cursor. */
  const openContextMenuAtTile = useCallback(() => {
    const liveUiState = uiStore.getState();
    const tile = liveUiState.mouse.position.tile;
    const modelItems = model.actions.get().items;

    // Prefer topmost cable (same order as Connectors paint: later = on top).
    let connectorAtTile: (typeof scene.connectors)[number] | undefined;
    for (let i = scene.connectors.length - 1; i >= 0; i -= 1) {
      const con = scene.connectors[i];
      if (connectorPathTouchesTile(con.path, tile)) {
        connectorAtTile = con;
        break;
      }
    }

    if (connectorAtTile) {
      liveUiState.actions.setItemControls({
        type: 'CONNECTOR',
        id: connectorAtTile.id
      });
      liveUiState.actions.setContextMenu({
        item: { type: 'CONNECTOR', id: connectorAtTile.id },
        tile
      });
      return;
    }

    if (isPlanProjection(liveUiState.projectionMode)) {
      const nodeHit = getShape2dItemAtTile({
        tile,
        scene,
        modelItems
      });
      if (nodeHit?.type === 'ITEM') {
        liveUiState.actions.setItemControls({
          type: 'ITEM',
          id: nodeHit.id
        });
        liveUiState.actions.setContextMenu({
          item: nodeHit,
          tile
        });
        return;
      }
    }

    const itemAtTile = getItemAtTile({
      tile,
      scene
    });

    if (itemAtTile?.type === 'RECTANGLE' || itemAtTile?.type === 'ITEM') {
      if (itemAtTile.type === 'ITEM') {
        liveUiState.actions.setItemControls({
          type: 'ITEM',
          id: itemAtTile.id
        });
      }
      liveUiState.actions.setContextMenu({
        item: itemAtTile,
        tile
      });
    } else if (isPlanProjection(liveUiState.projectionMode)) {
      // Blank plan tile — still open context menu (Auto-Układ / grupy).
      liveUiState.actions.setContextMenu({
        item: { type: 'EMPTY' },
        tile
      });
    } else if (liveUiState.contextMenu) {
      liveUiState.actions.setContextMenu(null);
    }
  }, [scene, uiStore, model]);

  const onMouseEvent = useCallback(
    (e: SlimMouseEvent) => {
      if (!rendererRef.current) return;

      const isRendererInteraction = rendererRef.current === e.target;
      const rightButtonPan = rightButtonPanRef.current;
      // Preserve across mouseup — getMouse clears mousedown on that event, but
      // mode handlers (marquee select, etc.) still need the press location.
      const activePress = mouseRef.current.mousedown;

      // Use the ref chain, not the React snapshot — otherwise a mousemove in the
      // same frame as mousedown drops `mousedown` and marquee / multi-drag break.
      const liveUiState = uiStore.getState();
      const nextMouse = getMouse({
        interactiveElement: rendererRef.current,
        zoom: liveUiState.zoom,
        scroll: liveUiState.scroll,
        lastMouse: mouseRef.current,
        mouseEvent: e,
        rendererSize,
        projectionMode: liveUiState.projectionMode
      });

      if (e.type === 'mousedown' && e.button === RIGHT_MOUSE_BUTTON) {
        if (!isRendererInteraction) return;

        e.preventDefault();
        rightButtonPan.active = true;
        rightButtonPan.didPan = false;
        // Never show the lock toolbar while a possible pan is in progress.
        if (liveUiState.contextMenu) {
          liveUiState.actions.setContextMenu(null);
        }
        setWindowCursor('grabbing');
        commitMouse(nextMouse);
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
        commitMouse(nextMouse);

        if (nextMouse.mousedown) {
          const dx = nextMouse.position.screen.x - nextMouse.mousedown.screen.x;
          const dy = nextMouse.position.screen.y - nextMouse.mousedown.screen.y;

          if (Math.hypot(dx, dy) > PAN_DRAG_THRESHOLD_PX) {
            rightButtonPan.didPan = true;
            // Hide menu if it somehow appeared mid-drag.
            if (uiStore.getState().contextMenu) {
              uiStore.getState().actions.setContextMenu(null);
            }
          }
        }

        const live = uiStore.getState();
        live.actions.setScroll(
          getPanScrollFromDelta(live.scroll, nextMouse.delta?.screen)
        );
        return;
      }

      if (rightButtonPan.active && e.type === 'mouseup') {
        const wasClick = !rightButtonPan.didPan;
        commitMouse(nextMouse);
        rightButtonPan.active = false;
        rightButtonPan.didPan = false;
        restoreCursorForMode(uiStore.getState().mode.type);
        // Open lock toolbar only on click+release (no pan).
        if (wasClick) {
          openContextMenuAtTile();
        }
        return;
      }

      commitMouse(nextMouse);

      // Read mode / selection from the store — React's snapshot lags behind
      // setMode (marquee) and setMouse from earlier events in the same frame.
      const liveUi = uiStore.getState();
      const mode = modes[liveUi.mode.type];
      const modeFunction = getModeFunction(mode, e);

      if (!modeFunction) return;

      const uiForHandler =
        e.type === 'mouseup' && activePress
          ? { ...liveUi, mouse: { ...liveUi.mouse, mousedown: activePress } }
          : liveUi;

      const baseState: State = {
        model,
        scene,
        uiState: uiForHandler,
        rendererRef: rendererRef.current,
        rendererSize,
        isRendererInteraction
      };

      if (reducerTypeRef.current !== liveUi.mode.type) {
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
      reducerTypeRef.current = uiStore.getState().mode.type;
    },
    [model, scene, uiStore, rendererSize, openContextMenuAtTile]
  );

  // Native contextmenu only blocks the browser menu — app toolbar opens on RMB mouseup.
  const onContextMenu = useCallback((e: SlimMouseEvent) => {
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (modeType === 'INTERACTIONS_DISABLED') return undefined;

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

    const onKeyChange = (e: KeyboardEvent) => {
      if (e.key !== 'Shift') return;
      const nextMouse = {
        ...mouseRef.current,
        shiftKey: e.type === 'keydown'
      };
      mouseRef.current = nextMouse;
      uiStore.getState().actions.setMouse(nextMouse);
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
    };
  }, [
    editorMode,
    onMouseEvent,
    modeType,
    onContextMenu,
    uiStore
  ]);

  const setInteractionsElement = useCallback((element: HTMLElement) => {
    rendererRef.current = element;
  }, []);

  return {
    setInteractionsElement
  };
};
