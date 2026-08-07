import React from 'react';
import {
  Add as ZoomInIcon,
  Remove as ZoomOutIcon,
  CropFreeOutlined as FitToScreenIcon,
  GridOnOutlined as GridOnIcon,
  GridOffOutlined as GridOffIcon,
  SearchOutlined as LoupeOnIcon,
  SearchOffOutlined as LoupeOffIcon
} from '@mui/icons-material';
import { Stack, Box, Typography, Divider } from '@mui/material';
import { toPx } from 'src/utils';
import { UiElement } from 'src/components/UiElement/UiElement';
import { IconButton } from 'src/components/IconButton/IconButton';
import { MAX_ZOOM, MIN_ZOOM, MIN_ZOOM_2D } from 'src/config';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useDiagramUtils } from 'src/hooks/useDiagramUtils';
import { isPlanProjection } from 'src/utils';

export const ZoomControls = () => {
  const uiStateStoreActions = useUiStateStore((state) => {
    return state.actions;
  });
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });
  const showGrid = useUiStateStore((state) => {
    return state.showGrid;
  });
  const showLoupe = useUiStateStore((state) => {
    return state.showLoupe;
  });
  const animateConnectors = useUiStateStore((state) => {
    return state.animateConnectors;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const { fitToView } = useDiagramUtils();
  const minZoom = isPlanProjection(projectionMode) ? MIN_ZOOM_2D : MIN_ZOOM;

  return (
    <Stack direction="row" spacing={1}>
      <UiElement>
        <Stack direction="row">
          <IconButton
            name="Zoom out"
            Icon={<ZoomOutIcon />}
            onClick={uiStateStoreActions.decrementZoom}
            disabled={zoom <= minZoom}
          />
          <Divider orientation="vertical" flexItem />
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minWidth: toPx(60)
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {`${(zoom * 100).toFixed(zoom < 0.2 ? 1 : 0)}%`}
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem />
          <IconButton
            name="Zoom in"
            Icon={<ZoomInIcon />}
            onClick={uiStateStoreActions.incrementZoom}
            disabled={zoom >= MAX_ZOOM}
          />
        </Stack>
      </UiElement>
      <UiElement>
        <IconButton
          name="Fit to screen"
          Icon={<FitToScreenIcon />}
          onClick={fitToView}
        />
      </UiElement>
      <UiElement>
        <IconButton
          name={showGrid ? 'Hide grid' : 'Show grid'}
          Icon={showGrid ? <GridOnIcon /> : <GridOffIcon />}
          onClick={uiStateStoreActions.toggleShowGrid}
          isActive={showGrid}
        />
      </UiElement>
      <UiElement>
        <IconButton
          name={showLoupe ? 'Wyłącz lupę' : 'Włącz lupę'}
          Icon={showLoupe ? <LoupeOnIcon /> : <LoupeOffIcon />}
          onClick={uiStateStoreActions.toggleShowLoupe}
          isActive={showLoupe}
        />
      </UiElement>
      <UiElement>
        <IconButton
          name={animateConnectors ? 'Wyłącz animację' : 'Włącz animację'}
          Icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>}
          onClick={uiStateStoreActions.toggleAnimateConnectors}
          isActive={animateConnectors}
        />
      </UiElement>
    </Stack>
  );
};
