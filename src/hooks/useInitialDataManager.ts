import { useCallback, useState, useRef } from 'react';
import { InitialData, IconCollectionState } from 'src/types';
import { INITIAL_SCENE_STATE } from 'src/config';
import { createEditorInitialData } from 'src/examples/createEditorInitialData';
import {
  getFitToViewParams,
  CoordsUtils,
  categoriseIcons,
  generateId,
  getItemByIdOrThrow,
  syncDeviceTemplateCache,
  mergeDeviceTemplatesWithLibrary,
  ensureDeviceTemplateIcons,
  saveDeviceTemplatesLibrary,
  snapModelToGrid,
  ensureProjectViews
} from 'src/utils';
import * as reducers from 'src/stores/reducers';
import { useModelStore } from 'src/stores/modelStore';
import { useView } from 'src/hooks/useView';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useHistoryStore, resetHistoryTransaction } from 'src/stores/historyStore';
import { modelSchema } from 'src/schemas/model';

export const useInitialDataManager = () => {
  const [isReady, setIsReady] = useState(false);
  const prevInitialData = useRef<InitialData>();
  const modelActions = useModelStore((state) => {
    return state.actions;
  });
  const uiStore = useUiStateStoreApi();
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const rendererEl = useUiStateStore((state) => {
    return state.rendererEl;
  });
  const { changeView } = useView();

  const load = useCallback(
    (_initialData: InitialData) => {
      if (!_initialData || prevInitialData.current === _initialData) return;

      setIsReady(false);

      // Template icons must exist before modelSchema validates icon refs.
      let initialData: InitialData = {
        ..._initialData,
        deviceTemplates: mergeDeviceTemplatesWithLibrary(
          _initialData.deviceTemplates
        )
      };
      initialData.icons = ensureDeviceTemplateIcons(
        initialData.icons ?? [],
        initialData.deviceTemplates ?? []
      );

      const validationResult = modelSchema.safeParse(initialData);

      if (!validationResult.success) {
        // TODO: let's get better at reporting error messages here (starting with how we present them to users)
        // - not in console but in a modal
        // eslint-disable-next-line no-console
        console.error(
          'Model validation failed',
          validationResult.error.errors
        );
        window.alert('There is an error in your model.');
        return;
      }

      saveDeviceTemplatesLibrary(initialData.deviceTemplates ?? []);

      // Stamp view kinds/orders and ensure default project tabs exist.
      initialData = ensureProjectViews(initialData);

      if (initialData.views.length === 0) {
        const updates = reducers.view({
          action: 'CREATE_VIEW',
          payload: {},
          ctx: {
            state: { model: initialData, scene: INITIAL_SCENE_STATE },
            viewId: generateId()
          }
        });

        Object.assign(initialData, updates.model);
      }

      // 2D: snap free devices / areas to the floor grid; reseat cabinet mounts.
      const snapped = snapModelToGrid(initialData, {
        gridStyle: uiStore.getState().gridStyle,
        projectionMode: initialData.projectionMode
      });
      initialData = {
        ...initialData,
        views: snapped.views
      };

      prevInitialData.current = initialData;
      syncDeviceTemplateCache(initialData.deviceTemplates);
      modelActions.set(initialData);

      const view = getItemByIdOrThrow(
        initialData.views,
        initialData.view ?? initialData.views[0].id
      );

      changeView(view.value.id, initialData);

      if (initialData.projectionMode) {
        uiStateActions.setProjectionMode(initialData.projectionMode);
      }

      if (initialData.fitToView) {
        const rendererSize = rendererEl?.getBoundingClientRect();

        const { zoom, scroll } = getFitToViewParams(view.value, {
          width: rendererSize?.width ?? 0,
          height: rendererSize?.height ?? 0
        }, {
          projectionMode: initialData.projectionMode,
          modelItems: initialData.items
        });

        uiStateActions.setScroll({
          position: scroll,
          offset: CoordsUtils.zero()
        });

        uiStateActions.setZoom(zoom);
      }

      const categoriesState: IconCollectionState[] = categoriseIcons(
        initialData.icons
      ).map((collection) => {
        return {
          id: collection.name,
          isExpanded: false
        };
      });

      uiStateActions.setIconCategoriesState(categoriesState);

      useHistoryStore.getState().clear();
      resetHistoryTransaction();

      setIsReady(true);
    },
    [changeView, modelActions, rendererEl, uiStateActions, uiStore]
  );

  const clear = useCallback(() => {
    uiStateActions.resetUiState();
    // Reset both isometric demo and 2D practice topology
    load(createEditorInitialData());
  }, [load, uiStateActions]);

  return {
    load,
    clear,
    isReady
  };
};
