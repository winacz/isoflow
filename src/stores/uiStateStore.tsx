import React, { createContext, useContext, useRef } from 'react';
import { createStore, useStore } from 'zustand';
import {
  CoordsUtils,
  getStartingMode,
  clamp
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
      focusedPortId: null,
      enableDebugTools: false,
      showGrid: INITIAL_UI_STATE.showGrid,
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
            focusedPortId: null,
            zoom: 1
          });
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
            focusedPortId: null
          });
        },
        incrementZoom: () => {
          const { zoom, projectionMode } = get();
          const minZoom =
            projectionMode === 'TWO_D' ? MIN_ZOOM_2D : MIN_ZOOM;
          const next = incrementZoom(zoom, minZoom);
          smoothZoom.sync(next);
          set({ zoom: next });
        },
        decrementZoom: () => {
          const { zoom, projectionMode } = get();
          const minZoom =
            projectionMode === 'TWO_D' ? MIN_ZOOM_2D : MIN_ZOOM;
          const next = decrementZoom(zoom, minZoom);
          smoothZoom.sync(next);
          set({ zoom: next });
        },
        setZoom: (zoom) => {
          const minZoom =
            get().projectionMode === 'TWO_D' ? MIN_ZOOM_2D : MIN_ZOOM;
          const next = clamp(zoom, minZoom, MAX_ZOOM);
          smoothZoom.sync(next);
          set({ zoom: next });
        },
        adjustZoomByWheel: (deltaY, deltaMode = 0) => {
          const { zoom, projectionMode } = get();
          const minZoom =
            projectionMode === 'TWO_D' ? MIN_ZOOM_2D : MIN_ZOOM;
          smoothZoom.applyWheel(deltaY, deltaMode, {
            zoom,
            minZoom,
            setZoom: (next) => {
              set({ zoom: next });
            }
          });
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

          set({
            itemControls,
            selectedItemIds: [],
            focusedPortId: null
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
              itemControls: null,
              focusedPortId: null
            });
            return;
          }

          set({
            selectedItemIds: [],
            itemControls: null,
            focusedPortId: null
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
        setFocusedPortId: (focusedPortId) => {
          set({ focusedPortId });
        },
        setContextMenu: (contextMenu) => {
          set({ contextMenu });
        },
        setMouse: (mouse) => {
          set({ mouse });
        },
        setEnableDebugTools: (enableDebugTools) => {
          set({ enableDebugTools });
        },
        setRendererEl: (el) => {
          set({ rendererEl: el });
        },
        setProjectionMode: (projectionMode) => {
          set({ projectionMode });
        },
        setShowGrid: (showGrid) => {
          set({ showGrid });
        },
        toggleShowGrid: () => {
          set({ showGrid: !get().showGrid });
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
