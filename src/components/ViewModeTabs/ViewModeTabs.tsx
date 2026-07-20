import React, { useCallback } from 'react';
import { Button, Stack } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore, useModelStoreApi } from 'src/stores/modelStore';
import { useView } from 'src/hooks/useView';
import { ProjectionMode, ProjectionModeEnum } from 'src/types';
import { UiElement } from 'src/components/UiElement/UiElement';
import {
  ISOMETRIC_VIEW_NAME,
  PLAN_2D_VIEW_NAME,
  PLAN_2D_V2_VIEW_NAME,
  build2Dv2SnapshotFromPlan,
  findPlanView,
  findPlan2Dv2View
} from 'src/utils';

const TABS: { mode: ProjectionMode; label: string; viewName: string }[] = [
  {
    mode: ProjectionModeEnum.ISOMETRIC,
    label: 'Isometric',
    viewName: ISOMETRIC_VIEW_NAME
  },
  {
    mode: ProjectionModeEnum.TWO_D,
    label: '2D',
    viewName: PLAN_2D_VIEW_NAME
  },
  {
    mode: ProjectionModeEnum.TWO_D_V2,
    label: '2Dv2',
    viewName: PLAN_2D_V2_VIEW_NAME
  }
];

export const ViewModeTabs = () => {
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const modelStore = useModelStoreApi();
  const modelActions = useModelStore((state) => {
    return state.actions;
  });
  const { changeView } = useView();

  const sync2Dv2FromPlan = useCallback(() => {
    const model = modelStore.getState();
    const plan = findPlanView(model.views);
    const v2 = findPlan2Dv2View(model.views);
    if (!plan || !v2) return null;

    const snapshot = build2Dv2SnapshotFromPlan({
      plan,
      modelItems: model.items
    });

    const nextViews = model.views.map((view) => {
      if (view.id !== v2.id) return view;
      return {
        ...view,
        items: snapshot.items,
        connectors: snapshot.connectors,
        rectangles: [],
        textBoxes: []
      };
    });

    modelActions.set({ views: nextViews });
    return { ...model, views: nextViews };
  }, [modelStore, modelActions]);

  const onSelectMode = useCallback(
    (mode: ProjectionMode, viewName: string) => {
      if (mode === projectionMode) return;

      let nextModel = modelStore.getState();

      if (mode === ProjectionModeEnum.TWO_D_V2) {
        nextModel = sync2Dv2FromPlan() ?? nextModel;
      }

      const targetView = nextModel.views.find((view) => {
        return view.name === viewName;
      });

      if (targetView) {
        changeView(targetView.id, nextModel);
      }

      uiStateActions.setProjectionMode(mode);
      uiStateActions.setItemControls(null);
      uiStateActions.setPortPipHover(null);
      uiStateActions.setMode({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      });

      if (mode === ProjectionModeEnum.TWO_D_V2 && nextModel.views.length > 0) {
        uiStateActions.setZoom(1);
      }
    },
    [projectionMode, uiStateActions, modelStore, changeView, sync2Dv2FromPlan]
  );

  return (
    <UiElement>
      <Stack direction="row">
        {TABS.map(({ mode, label, viewName }) => {
          const isActive = projectionMode === mode;

          return (
            <Button
              key={mode}
              variant="text"
              onClick={() => {
                onSelectMode(mode, viewName);
              }}
              sx={{
                borderRadius: 0,
                px: 2,
                py: 1,
                minWidth: 'auto',
                fontWeight: 600,
                color: isActive ? 'grey.200' : 'grey.500',
                bgcolor: isActive ? 'primary.light' : undefined
              }}
            >
              {label}
            </Button>
          );
        })}
      </Stack>
    </UiElement>
  );
};
