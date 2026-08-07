import React, { createContext, useContext, useRef } from 'react';
import { createStore, useStore } from 'zustand';
import {
  CoordsUtils,
  getStartingMode,
  clamp,
  setSimplePathsEnabled,
  setRoutingStyleEnabled,
  getPanScrollFromDelta,
  projectionPrefsKey,
  isPlanProjection
} from 'src/utils';
import {
  incrementZoom,
  decrementZoom,
  createSmoothZoomController
} from 'src/utils/zoom';
import { UiStateStore } from 'src/types';
import {
  INITIAL_UI_STATE,
  MIN_ZOOM,
  MIN_ZOOM_2D,
  MAX_ZOOM
} from 'src/config';

const smoothZoom = createSmoothZoomController();

const initialState = () => {
  setSimplePathsEnabled(INITIAL_UI_STATE.simplePaths);
  setRoutingStyleEnabled(INITIAL_UI_STATE.routingStyle);

  return createStore<UiStateStore>((set, get) => {
    return {
      zoom: INITIAL_UI_STATE.zoom,
      scroll: INITIAL_UI_STATE.scroll,
      projectionMode: INITIAL_UI_STATE.projectionMode,
      view: '',
      mainMenuOptions: [],
      editorMode: 'EXPLORABLE_READONLY',
      mode: getStartingMode('EXPLORABLE_READONLY'),
      iconCategoriesState: [],
      isMainMenuOpen: false,
      dialog: null,
      rendererEl: null,
      contextMenu: null,
      mouse: {
        position: { screen: CoordsUtils.zero(), tile: CoordsUtils.zero() },
        mousedown: null,
        delta: null,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false
      },
      itemControls: null,
      selectedItemIds: [],
      selectedWaypointIds: [],
      focusedPortIds: [],
      portAttention: null,
      portPipHover: null,
      shape2dPortHover: null,
      sviHover: null,
      showGrid: INITIAL_UI_STATE.showGrid,
      showLoupe: INITIAL_UI_STATE.showLoupe,
      gridStyle: INITIAL_UI_STATE.gridStyle,
      canvasByMode: INITIAL_UI_STATE.canvasByMode,
      viewTransformByMode: INITIAL_UI_STATE.viewTransformByMode,
      vlan1CableColor: INITIAL_UI_STATE.vlan1CableColor,
      simplePaths: INITIAL_UI_STATE.simplePaths,
      routingStyle: INITIAL_UI_STATE.routingStyle,
      isWorkshopOpen: INITIAL_UI_STATE.isWorkshopOpen,
      isRightSidebarOpen: INITIAL_UI_STATE.isRightSidebarOpen,
      actions: {
        setView: (view) => {
          set({ view });
        },
        setMainMenuOptions: (mainMenuOptions) => {
          set({ mainMenuOptions });
        },
        setEditorMode: (mode) => {
          set({ editorMode: mode, mode: getStartingMode(mode) });
        },
        setIconCategoriesState: (iconCategoriesState) => {
          set({ iconCategoriesState });
        },
        resetUiState: () => {
          set({
            mode: getStartingMode(get().editorMode),
            scroll: {
              position: CoordsUtils.zero(),
              offset: CoordsUtils.zero()
            },
            itemControls: null,
            selectedItemIds: [],
            focusedPortIds: [],
            portAttention: null,
            zoom: 1,
            viewTransformByMode: INITIAL_UI_STATE.viewTransformByMode
          });
          smoothZoom.sync(1);
        },
        setMode: (mode) => {
          set({ mode });
        },
        setDialog: (dialog) => {
          set({ dialog });
        },
        setIsMainMenuOpen: (isMainMenuOpen) => {
          set({
            isMainMenuOpen,
            itemControls: null,
            selectedItemIds: [],
            focusedPortIds: []
          });
        },
        incrementZoom: () => {
          const { zoom, projectionMode } = get();
          const minZoom = isPlanProjection(projectionMode)
            ? MIN_ZOOM_2D
            : MIN_ZOOM;
          const next = incrementZoom(zoom, minZoom);
          smoothZoom.sync(next);
          set({ zoom: next });
        },
        decrementZoom: () => {
          const { zoom, projectionMode } = get();
          const minZoom = isPlanProjection(projectionMode)
            ? MIN_ZOOM_2D
            : MIN_ZOOM;
          const next = decrementZoom(zoom, minZoom);
          smoothZoom.sync(next);
          set({ zoom: next });
        },
        setZoom: (zoom) => {
          const minZoom = isPlanProjection(get().projectionMode)
            ? MIN_ZOOM_2D
            : MIN_ZOOM;
          const next = clamp(zoom, minZoom, MAX_ZOOM);
          smoothZoom.sync(next);
          set({ zoom: next });
        },
        adjustZoomByWheel: (deltaY, deltaMode = 0, focalFromCenter) => {
          const { zoom, projectionMode } = get();
          const minZoom = isPlanProjection(projectionMode)
            ? MIN_ZOOM_2D
            : MIN_ZOOM;
          smoothZoom.applyWheel(deltaY, deltaMode, {
            zoom,
            minZoom,
            focalFromCenter,
            setZoom: (next) => {
              set({ zoom: next });
            },
            setScroll: (updater) => {
              set((state) => ({ scroll: updater(state.scroll) }));
            }
          });
        },
        panByWheel: (deltaX, deltaY, deltaMode = 0) => {
          let dx = deltaX;
          let dy = deltaY;
          if (deltaMode === 1) {
            dx *= 16;
            dy *= 16;
          } else if (deltaMode === 2) {
            dx *= 800;
            dy *= 800;
          }
          // Negate so natural two-finger scroll moves the canvas with the fingers.
          const next = getPanScrollFromDelta(get().scroll, {
            x: -dx,
            y: -dy
          });
          set({ scroll: next });
        },
        setScroll: ({ position, offset }) => {
          set({ scroll: { position, offset: offset ?? get().scroll.offset } });
        },
        setItemControls: (itemControls) => {
          if (itemControls?.type === 'ITEM') {
            set({
              itemControls,
              selectedItemIds: [itemControls.id]
            });
            return;
          }

          // Algorithms panel must keep the current multi-selection.
          if (itemControls?.type === 'ALGORITHMS') {
            set({
              itemControls,
              focusedPortIds: []
            });
            return;
          }

          set({
            itemControls,
            selectedItemIds: [],
            focusedPortIds: []
          });
        },
        setSelectedItemIds: (ids) => {
          const unique = [...new Set(ids.filter(Boolean))];

          if (unique.length === 1) {
            set({
              selectedItemIds: unique,
              selectedWaypointIds: [],
              itemControls: { type: 'ITEM', id: unique[0] }
            });
            return;
          }

          if (unique.length > 1) {
            set({
              selectedItemIds: unique,
              selectedWaypointIds: [],
              // Keep primary item controls — no connection-layout algorithms UI.
              itemControls: { type: 'ITEM', id: unique[0] },
              focusedPortIds: [],
              isRightSidebarOpen: true
            });
            return;
          }

          set({
            selectedItemIds: [],
            itemControls: null,
            focusedPortIds: []
          });
        },
        setSelectedWaypointIds: (ids) => {
          set({ selectedWaypointIds: [...new Set(ids.filter(Boolean))] });
        },
        toggleSelectedItemId: (id) => {
          const current = get().selectedItemIds;
          const next = current.includes(id)
            ? current.filter((itemId) => {
                return itemId !== id;
              })
            : [...current, id];
          get().actions.setSelectedItemIds(next);
        },
        clearSelectedItemIds: () => {
          get().actions.setSelectedItemIds([]);
        },
        setFocusedPortIds: (portIds) => {
          set({
            focusedPortIds: [...new Set(portIds.filter(Boolean))]
          });
        },
        setFocusedPortId: (portId) => {
          set({
            focusedPortIds: portId ? [portId] : []
          });
        },
        toggleFocusedPortId: (portId) => {
          if (!portId) return;
          const current = get().focusedPortIds;
          if (current.includes(portId)) {
            set({
              focusedPortIds: current.filter((id) => {
                return id !== portId;
              })
            });
            return;
          }
          set({ focusedPortIds: [...current, portId] });
        },
        setPortAttention: (attention) => {
          if (!attention) {
            set({ portAttention: null });
            return;
          }
          const token = Date.now();
          set({
            portAttention: {
              itemId: attention.itemId,
              portId: attention.portId,
              token
            }
          });
          window.setTimeout(() => {
            const current = get().portAttention;
            if (current?.token === token) {
              set({ portAttention: null });
            }
          }, 1100);
        },
        setPortPipHover: (portPipHover) => {
          set({ portPipHover });
        },
        setShape2dPortHover: (shape2dPortHover) => {
          const prev = get().shape2dPortHover;
          if (
            prev?.itemId === shape2dPortHover?.itemId &&
            prev?.portId === shape2dPortHover?.portId
          ) {
            return;
          }
          set({ shape2dPortHover });
        },
        setSviHover: (sviHover) => {
          set({ sviHover });
        },
        setContextMenu: (contextMenu) => {
          set({ contextMenu });
        },
        setMouse: (mouse) => {
          set({ mouse });
        },
        getMouse: () => {
          return get().mouse;
        },
        setRendererEl: (el) => {
          set({ rendererEl: el });
        },
        setProjectionMode: (projectionMode) => {
          const prev = get().projectionMode;
          if (prev === projectionMode) {
            set({ projectionMode });
            return;
          }

          const prevKey = projectionPrefsKey(prev);
          const nextKey = projectionPrefsKey(projectionMode);
          const viewTransformByMode = {
            ...get().viewTransformByMode,
            [prevKey]: {
              zoom: get().zoom,
              scroll: get().scroll
            }
          };
          const restored = viewTransformByMode[nextKey];

          set({
            projectionMode,
            viewTransformByMode,
            zoom: restored.zoom,
            scroll: restored.scroll,
            portPipHover: null,
            shape2dPortHover: null
          });
          smoothZoom.sync(restored.zoom);
        },
        setShowGrid: (showGrid) => {
          set({ showGrid });
        },
        setShowLoupe: (showLoupe) => {
          set({ showLoupe });
        },
        toggleShowGrid: () => {
          set({ showGrid: !get().showGrid });
        },
        toggleShowLoupe: () => {
          set({ showLoupe: !get().showLoupe });
        },
        setGridStyle: (gridStyle) => {
          set({ gridStyle, showGrid: true });
        },
        setGridColor: (gridColor) => {
          const key = projectionPrefsKey(get().projectionMode);
          set({
            canvasByMode: {
              ...get().canvasByMode,
              [key]: { ...get().canvasByMode[key], gridColor }
            }
          });
        },
        setCanvasTheme: (theme) => {
          const key = projectionPrefsKey(get().projectionMode);
          // Clear temp overrides for this mode so theme defaults apply.
          set({
            canvasByMode: {
              ...get().canvasByMode,
              [key]: {
                theme,
                backgroundColor: null,
                gridColor: null
              }
            }
          });
        },
        toggleCanvasTheme: () => {
          const key = projectionPrefsKey(get().projectionMode);
          const current = get().canvasByMode[key].theme;
          get().actions.setCanvasTheme(current === 'dark' ? 'light' : 'dark');
        },
        setDiagramBackgroundColor: (backgroundColor) => {
          const key = projectionPrefsKey(get().projectionMode);
          set({
            canvasByMode: {
              ...get().canvasByMode,
              [key]: { ...get().canvasByMode[key], backgroundColor }
            }
          });
},
        setVlan1CableColor: (vlan1CableColor) => {
          set({ vlan1CableColor });
        },
        setSimplePaths: (simplePaths) => {
          set({ simplePaths });
          setSimplePathsEnabled(simplePaths);
        },
        toggleSimplePaths: () => {
          set((state) => {
            const next = !state.simplePaths;
            setSimplePathsEnabled(next);
            return { simplePaths: next };
          });
        },
        setRoutingStyle: (routingStyle) => {
          setRoutingStyleEnabled(routingStyle);
          set({ routingStyle });
        },
        setWorkshopOpen: (isWorkshopOpen) => {
          set({ isWorkshopOpen });
        },
        setRightSidebarOpen: (isRightSidebarOpen) => {
          set({ isRightSidebarOpen });
        },
        toggleRightSidebar: () => {
          set((state) => ({
            isRightSidebarOpen: !state.isRightSidebarOpen
          }));
        }
      }
    };
  });
};

const UiStateContext = createContext<ReturnType<typeof initialState> | null>(
  null
);

interface ProviderProps {
  children: React.ReactNode;
}

// TODO: Typings below are pretty gnarly due to the way Zustand works.
// see https://github.com/pmndrs/zustand/discussions/1180#discussioncomment-3439061

export const UiStateProvider = ({ children }: ProviderProps) => {
  const storeRef = useRef<ReturnType<typeof initialState>>();

  if (!storeRef.current) {
    storeRef.current = initialState();
  }

  return (
    <UiStateContext.Provider value={storeRef.current}>
      {children}
    </UiStateContext.Provider>
  );
};

export function useUiStateStore<T>(selector: (state: UiStateStore) => T) {
  const store = useContext(UiStateContext);

  if (store === null) {
    throw new Error('Missing provider in the tree');
  }

  const value = useStore(store, selector);
  return value;
}

/** Imperative store access for event handlers that must not wait for a React render. */
export function useUiStateStoreApi() {
  const store = useContext(UiStateContext);

  if (store === null) {
    throw new Error('Missing provider in the tree');
  }

  return store;
}
