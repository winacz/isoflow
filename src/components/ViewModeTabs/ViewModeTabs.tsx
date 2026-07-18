import React, { useCallback } from 'react';
import { Button, Stack } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useView } from 'src/hooks/useView';
import { ProjectionMode, ProjectionModeEnum } from 'src/types';
import { UiElement } from 'src/components/UiElement/UiElement';
import {
  ISOMETRIC_VIEW_NAME,
  PLAN_2D_VIEW_NAME
} from 'src/examples/createEditorInitialData';

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
  }
];

export const ViewModeTabs = () => {
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const model = useModelStore((state) => {
    return state;
  });
  const { changeView } = useView();

  const onSelectMode = useCallback(
    (mode: ProjectionMode, viewName: string) => {
      if (mode === projectionMode) return;

      const targetView = model.views.find((view) => {
        return view.name === viewName;
      });

      if (targetView) {
        changeView(targetView.id, model);
      }

      uiStateActions.setProjectionMode(mode);
      uiStateActions.setItemControls(null);
      uiStateActions.setMode({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      });
    },
    [projectionMode, uiStateActions, model, changeView]
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
