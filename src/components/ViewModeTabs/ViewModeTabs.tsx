import React, { useCallback, useMemo } from 'react';
import { Button, IconButton, Stack, Tooltip } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore, useModelStoreApi } from 'src/stores/modelStore';
import { useView } from 'src/hooks/useView';
import { UiElement } from 'src/components/UiElement/UiElement';
import {
  ViewKind,
  createPlan2dTab,
  getProjectTabs,
  projectionModeForKind
} from 'src/utils';

export const ViewModeTabs = () => {
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const isWorkshopOpen = useUiStateStore((state) => {
    return state.isWorkshopOpen;
  });
  const activeViewId = useUiStateStore((state) => {
    return state.view;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const modelStore = useModelStoreApi();
  const modelActions = useModelStore((state) => {
    return state.actions;
  });
  const views = useModelStore((state) => {
    return state.views;
  });
  const { changeView } = useView();

  const tabs = useMemo(() => {
    return getProjectTabs(views);
  }, [views]);

  const resetInteraction = useCallback(() => {
    uiStateActions.setItemControls(null);
    uiStateActions.setPortPipHover(null);
    uiStateActions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }, [uiStateActions]);

  const onSelectTab = useCallback(
    (viewId: string, kind: ViewKind) => {
      const mode = projectionModeForKind(kind);
      if (mode === projectionMode && viewId === activeViewId) return;

      const nextModel = modelStore.getState();

      const targetView = nextModel.views.find((view) => {
        return view.id === viewId;
      });

      if (targetView) {
        changeView(targetView.id, nextModel);
      }

      uiStateActions.setProjectionMode(mode);
      resetInteraction();
    },
    [
      projectionMode,
      activeViewId,
      uiStateActions,
      modelStore,
      changeView,
      resetInteraction
    ]
  );

  const onAddPlan2dTab = useCallback(() => {
    const model = modelStore.getState();
    const label = window.prompt('Nazwa nowej zakładki 2D', '2D 2');
    if (label === null) return;

    const tab = createPlan2dTab(model.views, label.trim() || undefined);
    const nextViews = [...model.views, tab];
    modelActions.set({ views: nextViews });
    changeView(tab.id, { ...model, views: nextViews });
    uiStateActions.setProjectionMode('TWO_D');
    resetInteraction();
  }, [modelStore, modelActions, changeView, uiStateActions, resetInteraction]);

  return (
    <UiElement>
      <Stack direction="row" alignItems="center">
        {tabs.map((tab) => {
          const isActive = activeViewId === tab.viewId;

          return (
            <Button
              key={tab.viewId}
              variant="text"
              onClick={() => {
                uiStateActions.setWorkshopOpen(false);
                onSelectTab(tab.viewId, tab.kind);
              }}
              sx={{
                borderRadius: 0,
                px: 2,
                py: 1,
                minWidth: 'auto',
                fontWeight: 600,
                color: (isActive && !isWorkshopOpen) ? 'grey.200' : 'grey.500',
                bgcolor: (isActive && !isWorkshopOpen) ? 'primary.light' : undefined
              }}
            >
              {tab.label}
            </Button>
          );
        })}
        
        {/* WARSZTAT TAB */}
        <Button
          variant="text"
          onClick={() => {
            uiStateActions.setWorkshopOpen(true);
          }}
          sx={{
            borderRadius: 0,
            px: 2,
            py: 1,
            minWidth: 'auto',
            fontWeight: 600,
            color: isWorkshopOpen ? 'grey.200' : 'grey.500',
            bgcolor: isWorkshopOpen ? 'primary.light' : undefined
          }}
        >
          Warsztat
        </Button>

        <Tooltip title="Nowa zakładka 2D">
          <IconButton
            size="small"
            onClick={onAddPlan2dTab}
            aria-label="Nowa zakładka 2D"
            sx={{
              borderRadius: 0,
              color: 'grey.500',
              '&:hover': { color: 'grey.200', bgcolor: 'action.hover' }
            }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </UiElement>
  );
};
