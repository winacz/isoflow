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
import {
  setLiveViewport,
  syncLiveViewportFromStore,
  getLiveViewport
} from 'src/utils/liveViewport';
import { UiStateStore } from 'src/types';
import {
  INITIAL_UI_STATE,
  MIN_ZOOM,
  MIN_ZOOM_2D,
  MAX_ZOOM
} from 'src/config';

const smoothZoom = createSmoothZoomController();

const publishStoreViewport = (zoom: number, scroll: { position: { x: number; y: number } }) => {
  syncLiveViewportFromStore({
    zoom,
    scroll: scroll.position
  });
};

/** Coalesce trackpad pan store writes to one React update per frame. */
let panStoreRaf = 0;
let pendingPanScroll: { position: { x: number; y: number }; offset: { x: number; y: number } } | null =
  null;

const schedulePanStoreCommit = (
  set: (partial: Partial<UiStateStore>) => void,
  scroll: { position: { x: number; y: number }; offset: { x: number; y: number } }
) => {
  pendingPanScroll = scroll;
  if (panStoreRaf) return;
  panStoreRaf = requestAnimationFrame(() => {
    panStoreRaf = 0;
    const next = pendingPanScroll;
    pendingPanScroll = null;
    if (!next) return;
    set({ scroll: next });
  });
};

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
      shape2dPortHoverPinned: false,
      shape2dHeaderHoverItemId: null,
      shape2dNodeHoverItemId: null,
      shape2dEnlargedItemId: null,
      nodeDescriptionDialogItemId: null,
      sviHover: null,
      showGrid: INITIAL_UI_STATE.showGrid,
      showLoupe: INITIAL_UI_STATE.showLoupe,
      showDescriptionLabels: INITIAL_UI_STATE.showDescriptionLabels,
      animateConnectors: INITIAL_UI_STATE.animateConnectors,
      nodeVisualStyle: INITIAL_UI_STATE.nodeVisualStyle,
      gridStyle: INITIAL_UI_STATE.gridStyle,
      canvasByMode: INITIAL_UI_STATE.canvasByMode,
      viewTransformByMode: INITIAL_UI_STATE.viewTransformByMode,
      vlan1CableColor: INITIAL_UI_STATE.vlan1CableColor,
      cableWidthScale: INITIAL_UI_STATE.cableWidthScale,
      simplePaths: INITIAL_UI_STATE.simplePaths,
      routingStyle: INITIAL_UI_STATE.routingStyle,
      isWorkshopOpen: INITIAL_UI_STATE.isWorkshopOpen,
      isPlanPickerOpen: INITIAL_UI_STATE.isPlanPickerOpen,
      workshopSection: INITIAL_UI_STATE.workshopSection,
      workshopIpamTab: INITIAL_UI_STATE.workshopIpamTab,
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
            shape2dPortHover: null,
            shape2dPortHoverPinned: false,
            shape2dHeaderHoverItemId: null,
            shape2dNodeHoverItemId: null,
            shape2dEnlargedItemId: null,
            nodeDescriptionDialogItemId: null,
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
            focusedPortIds: [],
            shape2dPortHover: null,
            shape2dPortHoverPinned: false,
            shape2dHeaderHoverItemId: null,
            shape2dNodeHoverItemId: null,
            shape2dEnlargedItemId: null
          });
        },
        incrementZoom: () => {
          const { zoom, projectionMode, scroll } = get();
          const minZoom = isPlanProjection(projectionMode)
            ? MIN_ZOOM_2D
            : MIN_ZOOM;
          const next = incrementZoom(zoom, minZoom);
          smoothZoom.sync(next);
          set({ zoom: next });
          publishStoreViewport(next, scroll);
        },
        decrementZoom: () => {
          const { zoom, projectionMode, scroll } = get();
          const minZoom = isPlanProjection(projectionMode)
            ? MIN_ZOOM_2D
            : MIN_ZOOM;
          const next = decrementZoom(zoom, minZoom);
          smoothZoom.sync(next);
          set({ zoom: next });
          publishStoreViewport(next, scroll);
        },
        setZoom: (zoom) => {
          const minZoom = isPlanProjection(get().projectionMode)
            ? MIN_ZOOM_2D
            : MIN_ZOOM;
          const next = clamp(zoom, minZoom, MAX_ZOOM);
          smoothZoom.sync(next);
          set({ zoom: next });
          publishStoreViewport(next, get().scroll);
        },
        adjustZoomByWheel: (deltaY, deltaMode = 0, focalFromCenter) => {
          const { zoom, projectionMode, scroll } = get();
          const minZoom = isPlanProjection(projectionMode)
            ? MIN_ZOOM_2D
            : MIN_ZOOM;
          smoothZoom.applyWheel(deltaY, deltaMode, {
            zoom,
            minZoom,
            scroll,
            focalFromCenter,
            setZoom: (next) => {
              set({ zoom: next });
            },
            setScroll: (nextScroll) => {
              set({ scroll: nextScroll });
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
          const live = getLiveViewport();
          const offset = get().scroll.offset;
          const next = getPanScrollFromDelta(
            { position: live.scroll, offset },
            {
              x: -dx,
              y: -dy
            }
          );
          // Visual pan immediately; React store catch-up is rAF-coalesced.
          setLiveViewport({
            zoom: live.zoom,
            scroll: next.position
          });
          schedulePanStoreCommit(set, next);
        },
        setScroll: ({ position, offset }) => {
          const next = { position, offset: offset ?? get().scroll.offset };
          publishStoreViewport(get().zoom, next);
          set({ scroll: next });
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
            if (get().shape2dPortHoverPinned) {
              set({
                itemControls,
                focusedPortIds: [],
                shape2dPortHover: null,
                shape2dPortHoverPinned: false
              });
              return;
            }
            set({
              itemControls,
              focusedPortIds: []
            });
            return;
          }

          if (get().shape2dPortHoverPinned) {
            set({
              itemControls,
              selectedItemIds: [],
              focusedPortIds: [],
              shape2dPortHover: null,
              shape2dPortHoverPinned: false
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
          const enlargedId = get().shape2dEnlargedItemId;
          const clearEnlarge =
            enlargedId != null && !unique.includes(enlargedId);

          if (unique.length === 1) {
            set({
              selectedItemIds: unique,
              selectedWaypointIds: [],
              itemControls: { type: 'ITEM', id: unique[0] },
              ...(clearEnlarge ? { shape2dEnlargedItemId: null } : null)
            });
            return;
          }

          if (unique.length > 1) {
            if (get().shape2dPortHoverPinned) {
              set({
                selectedItemIds: unique,
                selectedWaypointIds: [],
                // Keep primary item controls — no connection-layout algorithms UI.
                itemControls: { type: 'ITEM', id: unique[0] },
                focusedPortIds: [],
                isRightSidebarOpen: true,
                shape2dPortHover: null,
                shape2dPortHoverPinned: false,
                ...(clearEnlarge ? { shape2dEnlargedItemId: null } : null)
              });
              return;
            }
            set({
              selectedItemIds: unique,
              selectedWaypointIds: [],
              // Keep primary item controls — no connection-layout algorithms UI.
              itemControls: { type: 'ITEM', id: unique[0] },
              focusedPortIds: [],
              isRightSidebarOpen: true,
              ...(clearEnlarge ? { shape2dEnlargedItemId: null } : null)
            });
            return;
          }

          if (get().shape2dPortHoverPinned) {
            set({
              selectedItemIds: [],
              itemControls: null,
              focusedPortIds: [],
              shape2dPortHover: null,
              shape2dPortHoverPinned: false,
              shape2dEnlargedItemId: null
            });
            return;
          }

          set({
            selectedItemIds: [],
            itemControls: null,
            focusedPortIds: [],
            shape2dEnlargedItemId: null
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
          const focusedPortIds = [...new Set(portIds.filter(Boolean))];
          if (focusedPortIds.length === 0 && get().shape2dPortHoverPinned) {
            set({
              focusedPortIds,
              shape2dPortHover: null,
              shape2dPortHoverPinned: false
            });
            return;
          }
          set({ focusedPortIds });
        },
        setFocusedPortId: (portId) => {
          if (!portId && get().shape2dPortHoverPinned) {
            set({
              focusedPortIds: [],
              shape2dPortHover: null,
              shape2dPortHoverPinned: false
            });
            return;
          }
          set({
            focusedPortIds: portId ? [portId] : []
          });
        },
        toggleFocusedPortId: (portId) => {
          if (!portId) return;
          const current = get().focusedPortIds;
          if (current.includes(portId)) {
            const focusedPortIds = current.filter((id) => {
              return id !== portId;
            });
            if (focusedPortIds.length === 0 && get().shape2dPortHoverPinned) {
              set({
                focusedPortIds,
                shape2dPortHover: null,
                shape2dPortHoverPinned: false
              });
              return;
            }
            set({ focusedPortIds });
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
          // Live hover target changed (or cleared) — drop click-pin.
          set({ shape2dPortHover, shape2dPortHoverPinned: false });
        },
        pinShape2dPortHover: (hover) => {
          const prev = get().shape2dPortHover;
          if (
            prev?.itemId === hover.itemId &&
            prev?.portId === hover.portId &&
            get().shape2dPortHoverPinned
          ) {
            return;
          }
          set({
            shape2dPortHover: hover,
            shape2dPortHoverPinned: true
          });
        },
        setShape2dHeaderHoverItemId: (shape2dHeaderHoverItemId) => {
          if (get().shape2dHeaderHoverItemId === shape2dHeaderHoverItemId) {
            return;
          }
          set({ shape2dHeaderHoverItemId });
        },
        setShape2dNodeHoverItemId: (shape2dNodeHoverItemId) => {
          if (get().shape2dNodeHoverItemId === shape2dNodeHoverItemId) {
            return;
          }
          set({ shape2dNodeHoverItemId });
        },
        setShape2dEnlargedItemId: (shape2dEnlargedItemId) => {
          if (get().shape2dEnlargedItemId === shape2dEnlargedItemId) {
            return;
          }
          set({ shape2dEnlargedItemId });
        },
        setNodeDescriptionDialogItemId: (nodeDescriptionDialogItemId) => {
          if (get().nodeDescriptionDialogItemId === nodeDescriptionDialogItemId) {
            return;
          }
          set({ nodeDescriptionDialogItemId });
        },
        setSviHover: (sviHover) => {
          const prev = get().sviHover;
          if (prev === sviHover) return;
          if (
            prev &&
            sviHover &&
            prev.vlan === sviHover.vlan &&
            prev.ip === sviHover.ip &&
            prev.color === sviHover.color &&
            prev.screen.x === sviHover.screen.x &&
            prev.screen.y === sviHover.screen.y
          ) {
            return;
          }
          if (!prev && !sviHover) return;
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
            shape2dPortHover: null,
            shape2dPortHoverPinned: false,
            shape2dHeaderHoverItemId: null,
            shape2dNodeHoverItemId: null,
            shape2dEnlargedItemId: null
          });
          smoothZoom.sync(restored.zoom);
        },
        setShowGrid: (showGrid) => {
          set({ showGrid });
        },
        setShowLoupe: (showLoupe) => {
          set({ showLoupe });
        },
        setShowDescriptionLabels: (showDescriptionLabels) => {
          set({ showDescriptionLabels });
        },
        toggleShowGrid: () => {
          set({ showGrid: !get().showGrid });
        },
        toggleShowLoupe: () => {
          set({ showLoupe: !get().showLoupe });
        },
        toggleShowDescriptionLabels: () => {
          set({ showDescriptionLabels: !get().showDescriptionLabels });
        },
        toggleAnimateConnectors: () => {
          set({ animateConnectors: !get().animateConnectors });
        },
        setNodeVisualStyle: (nodeVisualStyle) => {
          if (get().nodeVisualStyle === nodeVisualStyle) return;
          set({ nodeVisualStyle });
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
        setCableWidthScale: (cableWidthScale) => {
          set({ cableWidthScale: Math.min(2.5, Math.max(0.4, cableWidthScale)) });
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
          set({
            isWorkshopOpen,
            ...(isWorkshopOpen ? { isPlanPickerOpen: false } : {})
          });
        },
        setPlanPickerOpen: (isPlanPickerOpen) => {
          set({
            isPlanPickerOpen,
            ...(isPlanPickerOpen ? { isWorkshopOpen: false } : {})
          });
        },
        setWorkshopSection: (workshopSection) => {
          set({ workshopSection });
        },
        setWorkshopIpamTab: (workshopIpamTab) => {
          set({ workshopIpamTab });
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

export function useUiStateStore<T>(
  selector: (state: UiStateStore) => T,
  /**
   * Custom equality check — lets a component treat certain state changes as
   * "no-ops" (e.g. a port-hover update on an unrelated node) so it skips
   * re-rendering instead of relying on reference equality alone.
   */
  equalityFn?: (a: T, b: T) => boolean
) {
  const store = useContext(UiStateContext);

  if (store === null) {
    throw new Error('Missing provider in the tree');
  }

  const value = useStore(store, selector, equalityFn);
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
