import { useCallback, useMemo } from 'react';
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
  type TidyInPlaceVariant
} from 'src/utils';
import {
  CONNECTOR_DEFAULTS,
  RECTANGLE_DEFAULTS,
  TEXTBOX_DEFAULTS,
  INITIAL_SCENE_STATE
} from 'src/config';

export const useScene = () => {
  const model = useModelStore((state) => {
    return state;
  });

  const scene = useSceneStore((state) => {
    return state;
  });

  const currentViewId = useUiStateStore((state) => {
    return state.view;
  });
  const historyPush = useHistoryStore((state) => {
    return state.push;
  });
  const historyPop = useHistoryStore((state) => {
    return state.pop;
  });

  const currentView = useMemo(() => {
    return getItemByIdOrThrow(model.views, currentViewId).value;
  }, [currentViewId, model.views]);

  const items = useMemo(() => {
    return currentView.items ?? [];
  }, [currentView.items]);

  const colors = useMemo(() => {
    return model.colors;
  }, [model.colors]);

  const connectors = useMemo(() => {
    return (currentView.connectors ?? []).map((connector) => {
      const sceneConnector = scene.connectors[connector.id];

      return {
        ...CONNECTOR_DEFAULTS,
        ...connector,
        ...sceneConnector
      };
    });
  }, [currentView.connectors, scene.connectors]);

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
      const sceneTextBox = scene.textBoxes[textBox.id];

      return {
        ...TEXTBOX_DEFAULTS,
        ...textBox,
        ...sceneTextBox
      };
    });
  }, [currentView.textBoxes, scene.textBoxes]);

  const getState = useCallback(() => {
    return {
      model: model.actions.get(),
      scene: scene.actions.get()
    };
  }, [model.actions, scene.actions]);

  const recordHistory = useCallback(() => {
    historyPush(structuredClone(modelFromModelStore(model.actions.get())));
  }, [historyPush, model.actions]);

  const setState = useCallback(
    (newState: State, options?: { skipHistory?: boolean }) => {
      if (!options?.skipHistory && !isHistoryTransactionOpen()) {
        recordHistory();
      }

      model.actions.set(newState.model);
      scene.actions.set(newState.scene);
    },
    [model.actions, scene.actions, recordHistory]
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

    const current = model.actions.get();
    model.actions.set({
      ...previous,
      actions: current.actions
    });

    const synced = reducers.view({
      action: 'SYNC_SCENE',
      payload: undefined,
      ctx: {
        viewId: currentViewId,
        state: {
          model: model.actions.get(),
          scene: INITIAL_SCENE_STATE
        }
      }
    });

    scene.actions.set(synced.scene);
    return true;
  }, [historyPop, model.actions, scene.actions, currentViewId]);

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
      mode: 'vertical' | 'horizontal' | 'grid'
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
        mode
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
      currentViewId
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
        const endpointAnchors = connector.anchors.filter((anchor) => {
          return Boolean(anchor.ref.item);
        });

        const nextAnchors =
          endpointAnchors.length >= 2
            ? [endpointAnchors[0], endpointAnchors[endpointAnchors.length - 1]]
            : connector.anchors;

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
   * "Porządkuj": re-seat selected leaf nodes in port order around their
   * switch, then rebuild cable routes so they run in parallel.
   */
  const tidyItems = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;

      const state = getState();
      const view = getItemByIdOrThrow(state.model.views, currentViewId).value;
      const selectedItems = (view.items ?? []).filter((item) => {
        return ids.includes(item.id);
      });

      if (selectedItems.length === 0) return;

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
        const endpointAnchors = connector.anchors.filter((anchor) => {
          return Boolean(anchor.ref.item);
        });

        const nextAnchors =
          endpointAnchors.length >= 2
            ? [endpointAnchors[0], endpointAnchors[endpointAnchors.length - 1]]
            : connector.anchors.length >= 2
              ? [
                  connector.anchors[0],
                  connector.anchors[connector.anchors.length - 1]
                ]
              : connector.anchors;

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

  return {
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
    regenerateRoutesForItems,
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
  };
};
