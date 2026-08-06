import { useCallback, useMemo } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import { produce } from 'immer';
import {
  ModelItem,
  ViewItem,
  Connector,
  Coords,
  TextBox,
  Rectangle,
  ItemReference,
  LayerOrderingAction
} from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useSceneStore } from 'src/stores/sceneStore';
import {
  useHistoryStore,
  enterHistoryTransaction,
  leaveHistoryTransaction,
  isHistoryTransactionOpen,
  resetHistoryTransaction
} from 'src/stores/historyStore';
import * as reducers from 'src/stores/reducers';
import type { State } from 'src/stores/reducers/types';
import { routeDensityGroupBuses } from 'src/v3/densityGroupBuses';
import {
  getItemByIdOrThrow,
  modelFromModelStore,
  generateId,
  layoutShape2dItems,
  tidyShape2dItems,
  tidyInPlaceShape2dItems,
  bundleShape2dRoutes,
  gatherBundleShape2dRoutes,
  pickGatherDirection,
  diagonalFanShape2dRoutes,
  stripToEndpointAnchors,
  analyzeGraph,
  smartPlaceNodes,
  channelRoute,
  type TidyInPlaceVariant
} from 'src/utils';
import {
  CONNECTOR_DEFAULTS,
  RECTANGLE_DEFAULTS,
  TEXTBOX_DEFAULTS,
  INITIAL_SCENE_STATE
} from 'src/config';
import { getGridSnapStep } from 'src/utils/renderer';
import {
  runAutoLayout,
  type AutoLayoutMetrics,
  type PlacementMode,
  type RouteStyle
} from 'src/utils/autoLayout';

export const useScene = () => {
  const modelActions = useModelStore((state) => state.actions);
  const modelViews = useModelStore((state) => state.views);
  const colors = useModelStore((state) => state.colors);

  const sceneActions = useSceneStore((state) => state.actions);
  const sceneConnectors = useSceneStore((state) => state.connectors);
  const sceneTextBoxes = useSceneStore((state) => state.textBoxes);

  const currentViewId = useUiStateStore((state) => {
    return state.view;
  });
  const gridStyle = useUiStateStore((state) => {
    return state.gridStyle;
  });
  const uiActions = useUiStateStore((state) => {
    return state.actions;
  });
  const historyPush = useHistoryStore((state) => {
    return state.push;
  });
  const historyPop = useHistoryStore((state) => {
    return state.pop;
  });

  const currentView = useMemo(() => {
    return getItemByIdOrThrow(modelViews, currentViewId).value;
  }, [currentViewId, modelViews]);

  const items = currentView.items ?? [];

  const connectors = useMemo(() => {
    return (currentView.connectors ?? []).map((connector) => {
      const sceneConnector = sceneConnectors[connector.id];

      return {
        ...CONNECTOR_DEFAULTS,
        ...connector,
        ...sceneConnector
      };
    });
  }, [currentView.connectors, sceneConnectors]);

  const rectangles = useMemo(() => {
    return (currentView.rectangles ?? []).map((rectangle) => {
      return {
        ...RECTANGLE_DEFAULTS,
        ...rectangle
      };
    });
  }, [currentView.rectangles]);

  const textBoxes = useMemo(() => {
    return (currentView.textBoxes ?? []).map((textBox) => {
      const sceneTextBox = sceneTextBoxes[textBox.id];

      return {
        ...TEXTBOX_DEFAULTS,
        ...textBox,
        ...sceneTextBox
      };
    });
  }, [currentView.textBoxes, sceneTextBoxes]);

  const getState = useCallback(() => {
    return {
      model: modelActions.get(),
      scene: sceneActions.get()
    };
  }, [modelActions, sceneActions]);

  const recordHistory = useCallback(() => {
    historyPush(structuredClone(modelFromModelStore(modelActions.get())));
  }, [historyPush, modelActions]);

  const setState = useCallback(
    (newState: State, options?: { skipHistory?: boolean }) => {
      if (!options?.skipHistory && !isHistoryTransactionOpen()) {
        recordHistory();
      }

      unstable_batchedUpdates(() => {
        modelActions.set(newState.model);
        sceneActions.set(newState.scene);
      });
    },
    [modelActions, sceneActions, recordHistory]
  );

  const beginHistoryTransaction = useCallback(() => {
    if (!isHistoryTransactionOpen()) {
      recordHistory();
    }
    enterHistoryTransaction();
  }, [recordHistory]);

  const endHistoryTransaction = useCallback(() => {
    leaveHistoryTransaction();
  }, []);

  const undo = useCallback(() => {
    const previous = historyPop();
    if (!previous) return false;

    resetHistoryTransaction();

    const current = modelActions.get();
    modelActions.set({
      ...previous,
      actions: current.actions
    });

    const synced = reducers.view({
      action: 'SYNC_SCENE',
      payload: undefined,
      ctx: {
        viewId: currentViewId,
        state: {
          model: modelActions.get(),
          scene: INITIAL_SCENE_STATE
        }
      }
    });

    sceneActions.set(synced.scene);
    return true;
  }, [historyPop, modelActions, sceneActions, currentViewId]);

  const createModelItem = useCallback(
    (newModelItem: ModelItem) => {
      const newState = reducers.createModelItem(newModelItem, getState());
      setState(newState);
    },
    [getState, setState]
  );

  const updateModelItem = useCallback(
    (id: string, updates: Partial<ModelItem>) => {
      const newState = reducers.updateModelItem(id, updates, getState());
      setState(newState);
    },
    [getState, setState]
  );

  const setVlanColorAcrossModel = useCallback(
    (vlan: string, vlanColor: string) => {
      const newState = reducers.setVlanColorAcrossModel(
        vlan,
        vlanColor,
        getState()
      );
      setState(newState);
    },
    [getState, setState]
  );

  const deleteModelItem = useCallback(
    (id: string) => {
      const newState = reducers.deleteModelItem(id, getState());
      setState(newState);
    },
    [getState, setState]
  );

  const createViewItem = useCallback(
    (newViewItem: ViewItem) => {
      const newState = reducers.view({
        action: 'CREATE_VIEWITEM',
        payload: newViewItem,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId]
  );

  const updateViewItem = useCallback(
    (id: string, updates: Partial<ViewItem>) => {
      const newState = reducers.view({
        action: 'UPDATE_VIEWITEM',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId]
  );

  const layoutViewItems = useCallback(
    (
      ids: string[],
      mode: 'vertical' | 'horizontal' | 'grid',
      _pack?: 'tight' | 'spaced' | 'wrap5'
    ) => {
      const state = getState();
      const view = getItemByIdOrThrow(state.model.views, currentViewId).value;
      const selectedItems = (view.items ?? []).filter((item) => {
        return ids.includes(item.id);
      });

      if (selectedItems.length < 2) return;

      const targets = layoutShape2dItems({
        selectedItems,
        allItems: view.items ?? [],
        modelItems: state.model.items,
        mode,
        gridStep: getGridSnapStep(gridStyle)
      });

      beginHistoryTransaction();
      Object.entries(targets).forEach(([id, tile]) => {
        const newState = reducers.view({
          action: 'UPDATE_VIEWITEM',
          payload: { id, tile },
          ctx: { viewId: currentViewId, state: getState() }
        });
        setState(newState, { skipHistory: true });
      });
      endHistoryTransaction();
    },
    [
      beginHistoryTransaction,
      endHistoryTransaction,
      getState,
      setState,
      currentViewId,
      gridStyle
    ]
  );

  /** Apply new tiles + rebuild all cables touching `ids` (one history step). */
  const applyTilesAndRebuildRoutes = useCallback(
    (targets: Record<string, Coords>, ids: string[]) => {
      beginHistoryTransaction();

      Object.entries(targets).forEach(([id, tile]) => {
        const newState = reducers.view({
          action: 'UPDATE_VIEWITEM',
          payload: { id, tile },
          ctx: { viewId: currentViewId, state: getState() }
        });
        setState(newState, { skipHistory: true });
      });

      // Rebuild every cable touching the selection (drop stale waypoints).
      const selected = new Set(ids);
      const freshView = getItemByIdOrThrow(
        getState().model.views,
        currentViewId
      ).value;
      const touched = (freshView.connectors ?? []).filter((connector) => {
        return connector.anchors.some((anchor) => {
          return Boolean(anchor.ref.item && selected.has(anchor.ref.item));
        });
      });

      touched.forEach((connector) => {
        const nextAnchors = stripToEndpointAnchors(connector.anchors);

        const newState = reducers.view({
          action: 'UPDATE_CONNECTOR',
          payload: {
            id: connector.id,
            anchors: nextAnchors,
            overlapResolve: 'off'
          },
          ctx: { viewId: currentViewId, state: getState() }
        });
        setState(newState, { skipHistory: true });
      });

      endHistoryTransaction();
    },
    [
      beginHistoryTransaction,
      endHistoryTransaction,
      getState,
      setState,
      currentViewId
    ]
  );

  /**
   * "Porządkuj": only swap selected nodes among their current slots
   * (same footprint) to cut straight-line crossings — never invents new
   * positions. Afterwards drop free waypoints and rebuild routes.
   */
  const tidyItems = useCallback(
    (ids: string[]) => {
      if (ids.length < 2) return;

      const state = getState();
      const view = getItemByIdOrThrow(state.model.views, currentViewId).value;
      const selectedItems = (view.items ?? []).filter((item) => {
        return ids.includes(item.id);
      });

      if (selectedItems.length < 2) return;

      const targets = tidyShape2dItems({
        selectedItems,
        allItems: view.items ?? [],
        modelItems: state.model.items,
        connectors: view.connectors ?? []
      });

      applyTilesAndRebuildRoutes(targets, ids);
    },
    [applyTilesAndRebuildRoutes, getState, currentViewId]
  );

  /**
   * "Porządkuj w miejscu": keep the slots, permute selected nodes between
   * them (per algorithm variant) and rebuild routes. Bundle variants keep
   * node positions and instead lay cables into parallel trunk lanes via
   * generated waypoints.
   */
  const tidyItemsInPlace = useCallback(
    (ids: string[], variant: TidyInPlaceVariant) => {
      if (ids.length < 2) return;

      const state = getState();
      const view = getItemByIdOrThrow(state.model.views, currentViewId).value;
      const selectedItems = (view.items ?? []).filter((item) => {
        return ids.includes(item.id);
      });

      if (selectedItems.length < 2) return;

      if (
        variant === 'bundleVertical' ||
        variant === 'bundleHorizontal' ||
        variant === 'bundleTidy' ||
        variant === 'gatherDown' ||
        variant === 'gatherUp' ||
        variant === 'gatherAuto'
      ) {
        beginHistoryTransaction();

        // "Porządkuj": first swap selected nodes into switch-port order,
        // then lay the bundle over the updated positions.
        if (variant === 'bundleTidy') {
          const swapTargets = tidyInPlaceShape2dItems({
            selectedItems,
            allItems: view.items ?? [],
            modelItems: state.model.items,
            connectors: view.connectors ?? [],
            variant: 'portOrder'
          });

          Object.entries(swapTargets).forEach(([id, tile]) => {
            const newState = reducers.view({
              action: 'UPDATE_VIEWITEM',
              payload: { id, tile },
              ctx: { viewId: currentViewId, state: getState() }
            });
            setState(newState, { skipHistory: true });
          });
        }

        // Fresh view after possible swaps.
        const freshView = getItemByIdOrThrow(
          getState().model.views,
          currentViewId
        ).value;
        const freshSelected = (freshView.items ?? []).filter((item) => {
          return ids.includes(item.id);
        });

        const isGather =
          variant === 'gatherDown' ||
          variant === 'gatherUp' ||
          variant === 'gatherAuto';

        const routes = isGather
          ? gatherBundleShape2dRoutes({
              selectedItems: freshSelected,
              allItems: freshView.items ?? [],
              modelItems: getState().model.items,
              connectors: freshView.connectors ?? [],
              direction:
                variant === 'gatherDown'
                  ? 'down'
                  : variant === 'gatherUp'
                    ? 'up'
                    : pickGatherDirection({
                        selectedItems: freshSelected,
                        allItems: freshView.items ?? [],
                        modelItems: getState().model.items,
                        connectors: freshView.connectors ?? []
                      })
            })
          : bundleShape2dRoutes({
              selectedItems: freshSelected,
              allItems: freshView.items ?? [],
              modelItems: getState().model.items,
              connectors: freshView.connectors ?? [],
              orientation: (() => {
                if (variant === 'bundleVertical') return 'vertical';
                if (variant === 'bundleHorizontal') return 'horizontal';
                const xs = freshSelected.map((item) => item.tile.x);
                const ys = freshSelected.map((item) => item.tile.y);
                const width = Math.max(...xs) - Math.min(...xs);
                const height = Math.max(...ys) - Math.min(...ys);
                return width >= height ? 'horizontal' : 'vertical';
              })()
            });

        Object.entries(routes).forEach(([connectorId, tiles]) => {
          const connector = (freshView.connectors ?? []).find((candidate) => {
            return candidate.id === connectorId;
          });
          if (!connector) return;

          const endpointAnchors = connector.anchors.filter((anchor) => {
            return Boolean(anchor.ref.item);
          });
          if (endpointAnchors.length < 2) return;

          const anchors = [
            endpointAnchors[0],
            ...tiles.map((tile) => {
              return { id: generateId(), ref: { tile } };
            }),
            endpointAnchors[endpointAnchors.length - 1]
          ];

          const newState = reducers.view({
            action: 'UPDATE_CONNECTOR',
            payload: {
              id: connectorId,
              anchors,
              overlapResolve: 'off'
            },
            ctx: { viewId: currentViewId, state: getState() }
          });
          setState(newState, { skipHistory: true });
        });

        endHistoryTransaction();
        return;
      }

      const targets = tidyInPlaceShape2dItems({
        selectedItems,
        allItems: view.items ?? [],
        modelItems: state.model.items,
        connectors: view.connectors ?? [],
        variant
      });

      // Even with no swaps, still refresh routes for a clean look.
      applyTilesAndRebuildRoutes(targets, ids);
    },
    [
      applyTilesAndRebuildRoutes,
      beginHistoryTransaction,
      endHistoryTransaction,
      getState,
      setState,
      currentViewId
    ]
  );

  /**
   * "Mój algorytm": diagonal fan from switch/hub toward selected leaves,
   * nearest-to-diagonal first, no shared grid edges between cables.
   */
  const routeDiagonalFanForItems = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;

      const state = getState();
      const view = getItemByIdOrThrow(state.model.views, currentViewId).value;
      const selectedItems = (view.items ?? []).filter((item) => {
        return ids.includes(item.id);
      });

      if (selectedItems.length === 0) return;

      const routes = diagonalFanShape2dRoutes({
        selectedItems,
        allItems: view.items ?? [],
        modelItems: state.model.items,
        connectors: view.connectors ?? []
      });

      if (Object.keys(routes).length === 0) return;

      beginHistoryTransaction();

      Object.entries(routes).forEach(([connectorId, tiles]) => {
        const connector = (view.connectors ?? []).find((candidate) => {
          return candidate.id === connectorId;
        });
        if (!connector) return;

        const endpointAnchors = connector.anchors.filter((anchor) => {
          return Boolean(anchor.ref.item);
        });
        if (endpointAnchors.length < 2) return;

        const anchors = [
          endpointAnchors[0],
          ...tiles.map((tile) => {
            return { id: generateId(), ref: { tile } };
          }),
          endpointAnchors[endpointAnchors.length - 1]
        ];

        const newState = reducers.view({
          action: 'UPDATE_CONNECTOR',
          payload: {
            id: connectorId,
            anchors,
            overlapResolve: 'off'
          },
          ctx: { viewId: currentViewId, state: getState() }
        });
        setState(newState, { skipHistory: true });
      });

      endHistoryTransaction();
    },
    [
      beginHistoryTransaction,
      endHistoryTransaction,
      getState,
      setState,
      currentViewId
    ]
  );

  /**
   * "Test": 1) Porządkuj (swap selected nodes so links don't cross)
   *         2) Mój algorytm (diagonal fan routes) on the new layout.
   */
  const runTestLayoutForItems = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;

      beginHistoryTransaction();

      // --- 1. Porządkuj: swap nodes among existing slots ---
      if (ids.length >= 2) {
        const state = getState();
        const view = getItemByIdOrThrow(state.model.views, currentViewId).value;
        const selectedItems = (view.items ?? []).filter((item) => {
          return ids.includes(item.id);
        });

        if (selectedItems.length >= 2) {
          const targets = tidyShape2dItems({
            selectedItems,
            allItems: view.items ?? [],
            modelItems: state.model.items,
            connectors: view.connectors ?? []
          });

          Object.entries(targets).forEach(([id, tile]) => {
            const newState = reducers.view({
              action: 'UPDATE_VIEWITEM',
              payload: { id, tile, skipConnectorSync: true },
              ctx: { viewId: currentViewId, state: getState() }
            });
            setState(newState, { skipHistory: true });
          });
        }
      }

      // --- 2. Mój algorytm: fan routes from the (possibly swapped) layout ---
      const stateAfterTidy = getState();
      const viewAfterTidy = getItemByIdOrThrow(
        stateAfterTidy.model.views,
        currentViewId
      ).value;
      const selectedAfterTidy = (viewAfterTidy.items ?? []).filter((item) => {
        return ids.includes(item.id);
      });

      if (selectedAfterTidy.length > 0) {
        const routes = diagonalFanShape2dRoutes({
          selectedItems: selectedAfterTidy,
          allItems: viewAfterTidy.items ?? [],
          modelItems: stateAfterTidy.model.items,
          connectors: viewAfterTidy.connectors ?? []
        });

        Object.entries(routes).forEach(([connectorId, routeTiles]) => {
          const connector = (viewAfterTidy.connectors ?? []).find(
            (candidate) => {
              return candidate.id === connectorId;
            }
          );
          if (!connector) return;

          const endpointAnchors = connector.anchors.filter((anchor) => {
            return Boolean(anchor.ref.item);
          });
          if (endpointAnchors.length < 2) return;

          const anchors = [
            endpointAnchors[0],
            ...routeTiles.map((tile) => {
              return { id: generateId(), ref: { tile } };
            }),
            endpointAnchors[endpointAnchors.length - 1]
          ];

          const newState = reducers.view({
            action: 'UPDATE_CONNECTOR',
            payload: {
              id: connectorId,
              anchors,
              overlapResolve: 'off'
            },
            ctx: { viewId: currentViewId, state: getState() }
          });
          setState(newState, { skipHistory: true });
        });
      }

      endHistoryTransaction();
    },
    [
      beginHistoryTransaction,
      endHistoryTransaction,
      getState,
      setState,
      currentViewId
    ]
  );

  const runSmartLayoutForItems = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;

      beginHistoryTransaction();

      const state = getState();
      const view = getItemByIdOrThrow(state.model.views, currentViewId).value;
      const selectedItems = (view.items ?? []).filter((item) => {
        return ids.includes(item.id);
      });

      if (selectedItems.length >= 2) {
        // Faza A: Analiza grafu
        const graph = analyzeGraph({
          selectedItems,
          allItems: view.items ?? [],
          modelItems: state.model.items,
          connectors: view.connectors ?? [],
          rectangles: view.rectangles ?? []
        });

        // Faza B: Rozmieszczenie (snap do aktywnej siatki)
        const targets = smartPlaceNodes({
          graph,
          selectedItems,
          allItems: view.items ?? [],
          modelItems: state.model.items,
          gridStep: getGridSnapStep(gridStyle)
        });

        // Aplikuj pozycje
        Object.entries(targets).forEach(([id, tile]) => {
          const newState = reducers.view({
            action: 'UPDATE_VIEWITEM',
            payload: { id, tile },
            ctx: { viewId: currentViewId, state: getState() }
          });
          setState(newState, { skipHistory: true });
        });
      }

      // Faza C: Routing (na nowych pozycjach)
      const stateAfterPlace = getState();
      const viewAfterPlace = getItemByIdOrThrow(
        stateAfterPlace.model.views,
        currentViewId
      ).value;
      const selectedAfterPlace = (viewAfterPlace.items ?? []).filter((item) => {
        return ids.includes(item.id);
      });

      if (selectedAfterPlace.length > 0) {
        const routes = channelRoute({
          selectedItems: selectedAfterPlace,
          allItems: viewAfterPlace.items ?? [],
          modelItems: stateAfterPlace.model.items,
          connectors: viewAfterPlace.connectors ?? []
        });

        Object.entries(routes).forEach(([connectorId, routeTiles]) => {
          const connector = (viewAfterPlace.connectors ?? []).find(
            (candidate) => candidate.id === connectorId
          );
          if (!connector) return;

          const endpointAnchors = connector.anchors.filter((anchor) => {
            return Boolean(anchor.ref.item);
          });
          if (endpointAnchors.length < 2) return;

          const anchors = [
            endpointAnchors[0],
            ...routeTiles.map((tile) => {
              return { id: generateId(), ref: { tile } };
            }),
            endpointAnchors[endpointAnchors.length - 1]
          ];

          const newState = reducers.view({
            action: 'UPDATE_CONNECTOR',
            payload: {
              id: connectorId,
              anchors,
              overlapResolve: 'off'
            },
            ctx: { viewId: currentViewId, state: getState() }
          });
          setState(newState, { skipHistory: true });
        });
      }

      endHistoryTransaction();
    },
    [
      beginHistoryTransaction,
      endHistoryTransaction,
      getState,
      setState,
      currentViewId,
      gridStyle
    ]
  );

  const runSmartLayout2ForItems = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;

      beginHistoryTransaction();

      const state = getState();
      const view = getItemByIdOrThrow(state.model.views, currentViewId).value;
      const selectedItems = (view.items ?? []).filter((item) => {
        return ids.includes(item.id);
      });

      if (selectedItems.length >= 2) {
        // Faza A: Analiza grafu i układ siatkowy (Smart Layout)
        const graph = analyzeGraph({
          selectedItems,
          allItems: view.items ?? [],
          modelItems: state.model.items,
          connectors: view.connectors ?? [],
          rectangles: view.rectangles ?? []
        });

        const targets = smartPlaceNodes({
          graph,
          selectedItems,
          allItems: view.items ?? [],
          modelItems: state.model.items,
          gridStep: getGridSnapStep(gridStyle)
        });

        // Aplikuj pozycje
        Object.entries(targets).forEach(([id, tile]) => {
          const newState = reducers.view({
            action: 'UPDATE_VIEWITEM',
            payload: { id, tile },
            ctx: { viewId: currentViewId, state: getState() }
          });
          setState(newState, { skipHistory: true });
        });
      }

      // Faza B: Diagonal Routing (algorytm Test)
      const stateAfterPlace = getState();
      const viewAfterPlace = getItemByIdOrThrow(
        stateAfterPlace.model.views,
        currentViewId
      ).value;
      const selectedAfterPlace = (viewAfterPlace.items ?? []).filter((item) => {
        return ids.includes(item.id);
      });

      if (selectedAfterPlace.length > 0) {
        const routes = diagonalFanShape2dRoutes({
          selectedItems: selectedAfterPlace,
          allItems: viewAfterPlace.items ?? [],
          modelItems: stateAfterPlace.model.items,
          connectors: viewAfterPlace.connectors ?? []
        });

        Object.entries(routes).forEach(([connectorId, routeTiles]) => {
          const connector = (viewAfterPlace.connectors ?? []).find(
            (candidate) => candidate.id === connectorId
          );
          if (!connector) return;

          const endpointAnchors = connector.anchors.filter((anchor) => {
            return Boolean(anchor.ref.item);
          });
          if (endpointAnchors.length < 2) return;

          const anchors = [
            endpointAnchors[0],
            ...routeTiles.map((tile) => {
              return { id: generateId(), ref: { tile } };
            }),
            endpointAnchors[endpointAnchors.length - 1]
          ];

          const newState = reducers.view({
            action: 'UPDATE_CONNECTOR',
            payload: {
              id: connectorId,
              anchors,
              overlapResolve: 'off'
            },
            ctx: { viewId: currentViewId, state: getState() }
          });
          setState(newState, { skipHistory: true });
        });
      }

      endHistoryTransaction();
    },
    [
      beginHistoryTransaction,
      endHistoryTransaction,
      getState,
      setState,
      currentViewId,
      gridStyle
    ]
  );

  /**
   * Auto-Układ: place nodes without overlaps and route every in-scope cable
   * with the crossing-aware global router.
   *
   * `ids` empty ⇒ the whole view. Returns metrics so the panel can report
   * how many crossings / overlaps the run removed.
   */
  const runAutoLayoutForItems = useCallback(
    (
      ids: string[],
      options: { style: RouteStyle; placement: PlacementMode }
    ): AutoLayoutMetrics | null => {
      const state = getState();
      const view = getItemByIdOrThrow(state.model.views, currentViewId).value;
      const viewItems = view.items ?? [];
      if (viewItems.length === 0) return null;

      const scopeItems =
        ids.length > 0
          ? viewItems.filter((item) => {
              return ids.includes(item.id);
            })
          : viewItems;

      if (scopeItems.length === 0) return null;

      const result = runAutoLayout({
        scopeItems,
        allItems: viewItems,
        modelItems: state.model.items,
        connectors: view.connectors ?? [],
        options: {
          style: options.style,
          placement: options.placement,
          gridStep: getGridSnapStep(gridStyle)
        }
      });

      beginHistoryTransaction();

      Object.entries(result.targets).forEach(([id, tile]) => {
        const newState = reducers.view({
          action: 'UPDATE_VIEWITEM',
          payload: { id, tile },
          ctx: { viewId: currentViewId, state: getState() }
        });
        setState(newState, { skipHistory: true });
      });

      // Re-read: node moves above changed the anchors we are about to rebuild.
      const viewAfterPlace = getItemByIdOrThrow(
        getState().model.views,
        currentViewId
      ).value;

      Object.entries(result.routes).forEach(([connectorId, routeTiles]) => {
        const connector = (viewAfterPlace.connectors ?? []).find((candidate) => {
          return candidate.id === connectorId;
        });
        if (!connector) return;

        const endpointAnchors = connector.anchors.filter((anchor) => {
          return Boolean(anchor.ref.item);
        });
        if (endpointAnchors.length < 2) return;

        const anchors = [
          endpointAnchors[0],
          ...routeTiles.map((tile) => {
            return { id: generateId(), ref: { tile } };
          }),
          endpointAnchors[endpointAnchors.length - 1]
        ];

        const newState = reducers.view({
          action: 'UPDATE_CONNECTOR',
          payload: {
            id: connectorId,
            anchors,
            // The engine already resolved overlaps globally; the built-in
            // pairwise resolver would only undo that work.
            overlapResolve: 'off'
          },
          ctx: { viewId: currentViewId, state: getState() }
        });
        setState(newState, { skipHistory: true });
      });

      endHistoryTransaction();

      return result.metrics;
    },
    [
      beginHistoryTransaction,
      endHistoryTransaction,
      getState,
      setState,
      currentViewId,
      gridStyle
    ]
  );

  /** Auto-Układ, cables only — node positions are preserved. */
  const runAutoRouteForItems = useCallback(
    (ids: string[], options: { style: RouteStyle }) => {
      return runAutoLayoutForItems(ids, {
        style: options.style,
        placement: 'none'
      });
    },
    [runAutoLayoutForItems]
  );

  /**
   * 2D v3 test: density-group cables as magistrala (shared trunk lanes).
   * Untangles leaf↔port order by swapping nodes, then rewrites mid-waypoints.
   */
  const runDensityGroupBuses = useCallback(() => {
    const state = getState();
    const view = getItemByIdOrThrow(state.model.views, currentViewId).value;
    const viewItems = view.items ?? [];
    const viewConnectors = view.connectors ?? [];
    if (viewItems.length === 0) {
      return {
        groupCount: 0,
        cableCount: 0,
        swappedNodes: 0,
        routes: {},
        targets: {}
      };
    }

    const result = routeDensityGroupBuses({
      items: viewItems,
      modelItems: state.model.items,
      connectors: viewConnectors
    });

    if (result.cableCount === 0 && result.swappedNodes === 0) return result;

    beginHistoryTransaction();

    Object.entries(result.targets).forEach(([id, tile]) => {
      const newState = reducers.view({
        action: 'UPDATE_VIEWITEM',
        payload: { id, tile },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState, { skipHistory: true });
    });

    Object.entries(result.routes).forEach(([connectorId, routeTiles]) => {
      const connector = viewConnectors.find((candidate) => {
        return candidate.id === connectorId;
      });
      if (!connector) return;

      const endpointAnchors = connector.anchors.filter((anchor) => {
        return Boolean(anchor.ref.item);
      });
      if (endpointAnchors.length < 2) return;

      const anchors = [
        endpointAnchors[0],
        ...routeTiles.map((tile) => {
          return { id: generateId(), ref: { tile } };
        }),
        endpointAnchors[endpointAnchors.length - 1]
      ];

      const newState = reducers.view({
        action: 'UPDATE_CONNECTOR',
        payload: {
          id: connectorId,
          anchors,
          overlapResolve: 'off'
        },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState, { skipHistory: true });
    });

    endHistoryTransaction();
    return result;
  }, [
    beginHistoryTransaction,
    endHistoryTransaction,
    getState,
    setState,
    currentViewId
  ]);

  /** Soft compat for leftover AlgorithmsPopup — alias / no-op after 88e2dab restore. */
  const runSmartLayout3ForItems = runSmartLayout2ForItems;
  const runSmartLayout4ForItems = runSmartLayout2ForItems;
  const runClaudeSortForItems = runSmartLayout2ForItems;
  const arrangeSelectedNodes = useCallback((_ids: string[]) => {
    // Occupancy arrange engine not present in 88e2dab tooling.
  }, []);
  const recalculateAllRoutes = useCallback(() => {
    // Occupancy recalculate pass not present in 88e2dab tooling.
  }, []);

  /**
   * Drop intermediate waypoints on cables touching the given nodes and
   * rebuild paths (fresh A* between port endpoints).
   */
  const regenerateRoutesForItems = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;

      const selected = new Set(ids);
      const state = getState();
      const view = getItemByIdOrThrow(state.model.views, currentViewId).value;
      const connectors = view.connectors ?? [];

      const touched = connectors.filter((connector) => {
        return connector.anchors.some((anchor) => {
          return Boolean(anchor.ref.item && selected.has(anchor.ref.item));
        });
      });

      if (touched.length === 0) return;

      beginHistoryTransaction();

      touched.forEach((connector) => {
        const nextAnchors = stripToEndpointAnchors(connector.anchors);

        const newState = reducers.view({
          action: 'UPDATE_CONNECTOR',
          payload: {
            id: connector.id,
            anchors: nextAnchors,
            overlapResolve: 'off'
          },
          ctx: { viewId: currentViewId, state: getState() }
        });
        setState(newState, { skipHistory: true });
      });

      endHistoryTransaction();
    },
    [
      beginHistoryTransaction,
      endHistoryTransaction,
      getState,
      setState,
      currentViewId
    ]
  );

  const deleteViewItem = useCallback(
    (id: string) => {
      const newState = reducers.view({
        action: 'DELETE_VIEWITEM',
        payload: id,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId]
  );

  const setSimplePathsMode = useCallback(
    (enabled: boolean) => {
      uiActions.setSimplePaths(enabled);

      const state = getState();
      const view = getItemByIdOrThrow(state.model.views, currentViewId).value;
      const list = view.connectors ?? [];
      if (list.length === 0) return;

      beginHistoryTransaction();
      list.forEach((connector) => {
        const itemEnds = connector.anchors.filter((anchor) => {
          return Boolean(anchor.ref.item);
        });
        const ends =
          itemEnds.length >= 2
            ? [itemEnds[0], itemEnds[itemEnds.length - 1]]
            : connector.anchors.length > 2
              ? [
                  connector.anchors[0],
                  connector.anchors[connector.anchors.length - 1]
                ]
              : connector.anchors;

        const newState = reducers.view({
          action: 'UPDATE_CONNECTOR',
          payload: {
            id: connector.id,
            anchors: ends,
            overlapResolve: 'off',
            simplePaths: enabled
          },
          ctx: { viewId: currentViewId, state: getState() }
        });
        setState(newState, { skipHistory: true });
      });
      endHistoryTransaction();
    },
    [
      uiActions,
      beginHistoryTransaction,
      endHistoryTransaction,
      getState,
      setState,
      currentViewId
    ]
  );

  const createConnector = useCallback(
    (newConnector: Connector) => {
      const newState = reducers.view({
        action: 'CREATE_CONNECTOR',
        payload: newConnector,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId]
  );

  const updateConnector = useCallback(
    (
      id: string,
      updates: Partial<Connector>,
      options?: {
        overlapResolve?: 'default' | 'orthogonalDetour' | 'off';
        removedTile?: { x: number; y: number };
        ignoreWaypoints?: boolean;
        materializeBends?: boolean;
        /** Cheap orthogonal preview during drag — finalize on mouseup. */
        fastPath?: boolean;
        simplePaths?: boolean;
      }
    ) => {
      const newState = reducers.view({
        action: 'UPDATE_CONNECTOR',
        payload: { id, ...updates, ...options },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId]
  );

  const deleteConnector = useCallback(
    (id: string) => {
      const newState = reducers.view({
        action: 'DELETE_CONNECTOR',
        payload: id,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId]
  );

  const createTextBox = useCallback(
    (newTextBox: TextBox) => {
      const newState = reducers.view({
        action: 'CREATE_TEXTBOX',
        payload: newTextBox,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId]
  );

  const updateTextBox = useCallback(
    (id: string, updates: Partial<TextBox>) => {
      const newState = reducers.view({
        action: 'UPDATE_TEXTBOX',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId]
  );

  const deleteTextBox = useCallback(
    (id: string) => {
      const newState = reducers.view({
        action: 'DELETE_TEXTBOX',
        payload: id,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId]
  );

  const createRectangle = useCallback(
    (newRectangle: Rectangle) => {
      const newState = reducers.view({
        action: 'CREATE_RECTANGLE',
        payload: newRectangle,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId]
  );

  const updateRectangle = useCallback(
    (id: string, updates: Partial<Rectangle>) => {
      const newState = reducers.view({
        action: 'UPDATE_RECTANGLE',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId]
  );

  const deleteRectangle = useCallback(
    (id: string) => {
      const newState = reducers.view({
        action: 'DELETE_RECTANGLE',
        payload: id,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId]
  );

  const changeLayerOrder = useCallback(
    (action: LayerOrderingAction, item: ItemReference) => {
      const newState = reducers.view({
        action: 'CHANGE_LAYER_ORDER',
        payload: { action, item },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [getState, setState, currentViewId]
  );

  /** Remove every item / connector / rectangle / text box from the active view. */
  const clearView = useCallback(() => {
    const state = getState();
    const viewId = currentViewId;

    const emptied = produce(state, (draft) => {
      const view = getItemByIdOrThrow(draft.model.views, viewId);
      const removedIds = new Set(
        view.value.items.map((item) => {
          return item.id;
        })
      );

      view.value.items = [];
      view.value.connectors = [];
      view.value.rectangles = [];
      view.value.textBoxes = [];

      draft.model.items = draft.model.items.filter((item) => {
        if (!removedIds.has(item.id)) {
          return true;
        }

        return draft.model.views.some((otherView) => {
          if (otherView.id === viewId) return false;
          return otherView.items.some((viewItem) => {
            return viewItem.id === item.id;
          });
        });
      });

      draft.scene.connectors = {};
      draft.scene.textBoxes = {};
    });

    setState(emptied);
  }, [getState, setState, currentViewId]);

  return useMemo(
    () => ({
      items,
      connectors,
      colors,
      rectangles,
      textBoxes,
      currentView,
      createModelItem,
      updateModelItem,
      setVlanColorAcrossModel,
      deleteModelItem,
      createViewItem,
      updateViewItem,
      layoutViewItems,
      tidyItems,
      tidyItemsInPlace,
      routeDiagonalFanForItems,
      runTestLayoutForItems,
      runSmartLayoutForItems,
      runSmartLayout2ForItems,
      runAutoLayoutForItems,
      runAutoRouteForItems,
      runDensityGroupBuses,
      runSmartLayout3ForItems,
      runSmartLayout4ForItems,
      runClaudeSortForItems,
      arrangeSelectedNodes,
      recalculateAllRoutes,
      regenerateRoutesForItems,
      setSimplePathsMode,
      deleteViewItem,
      createConnector,
      updateConnector,
      deleteConnector,
      createTextBox,
      updateTextBox,
      deleteTextBox,
      createRectangle,
      updateRectangle,
      deleteRectangle,
      changeLayerOrder,
      clearView,
      beginHistoryTransaction,
      endHistoryTransaction,
      undo
    }),
    [
      items,
      connectors,
      colors,
      rectangles,
      textBoxes,
      currentView,
      createModelItem,
      updateModelItem,
      setVlanColorAcrossModel,
      deleteModelItem,
      createViewItem,
      updateViewItem,
      layoutViewItems,
      tidyItems,
      tidyItemsInPlace,
      routeDiagonalFanForItems,
      runTestLayoutForItems,
      runSmartLayoutForItems,
      runSmartLayout2ForItems,
      runAutoLayoutForItems,
      runAutoRouteForItems,
      runDensityGroupBuses,
      runSmartLayout3ForItems,
      runSmartLayout4ForItems,
      runClaudeSortForItems,
      arrangeSelectedNodes,
      recalculateAllRoutes,
      regenerateRoutesForItems,
      setSimplePathsMode,
      deleteViewItem,
      createConnector,
      updateConnector,
      deleteConnector,
      createTextBox,
      updateTextBox,
      deleteTextBox,
      createRectangle,
      updateRectangle,
      deleteRectangle,
      changeLayerOrder,
      clearView,
      beginHistoryTransaction,
      endHistoryTransaction,
      undo
    ]
  );
};
