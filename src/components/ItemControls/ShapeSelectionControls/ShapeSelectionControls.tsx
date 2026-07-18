import React, { useCallback } from 'react';
import { Box, Button, Stack, Typography, Alert } from '@mui/material';
import { ControlsContainer } from 'src/components/ItemControls/components/ControlsContainer';
import { Section } from 'src/components/ItemControls/components/Section';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { Icon } from 'src/types';
import {
  SHAPES_2D,
  getShape2dSize,
  SHAPE_2D_SWITCH_ID,
  SHAPE_2D_PC_ID
} from 'src/config';
import { DeviceShape2d } from 'src/components/Shapes2d/DeviceShape2d';

export const ShapeSelectionControls = () => {
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const icons = useModelStore((state) => {
    return state.icons;
  });
  const modelActions = useModelStore((state) => {
    return state.actions;
  });

  const ensureShapeIcon = useCallback(
    (shape: Icon) => {
      if (icons.some((icon) => icon.id === shape.id)) return;

      modelActions.set({
        icons: [...icons, shape]
      });
    },
    [icons, modelActions]
  );

  const onSelectShape = useCallback(
    (shape: Icon) => {
      if (mode.type !== 'PLACE_ICON') return;

      ensureShapeIcon(shape);

      uiStateActions.setMode({
        type: 'PLACE_ICON',
        showCursor: true,
        id: shape.id
      });
    },
    [mode, uiStateActions, ensureShapeIcon]
  );

  return (
    <ControlsContainer
      header={
        <Section sx={{ position: 'sticky', top: 0, pt: 6, pb: 3 }}>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Shapes
            </Typography>
            <Alert severity="info">
              Select a shape, then click on the canvas to place it. Use Connector
              and drag between port handles to link devices.
            </Alert>
          </Stack>
        </Section>
      }
    >
      <Section>
        <Stack spacing={1}>
          {SHAPES_2D.map((shape) => {
            const isActive = mode.type === 'PLACE_ICON' && mode.id === shape.id;
            const size = getShape2dSize(shape.id) ?? { width: 8, height: 7 };
            const previewWidth =
              shape.id === SHAPE_2D_PC_ID ? 72 : 96;
            const previewHeight = Math.round(
              (previewWidth * size.height) / size.width
            );

            return (
              <Button
                key={shape.id}
                variant={isActive ? 'contained' : 'outlined'}
                onClick={() => {
                  onSelectShape(shape);
                }}
                sx={{
                  justifyContent: 'flex-start',
                  textTransform: 'none',
                  py: 1.5,
                  px: 2
                }}
              >
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box
                    sx={{
                      position: 'relative',
                      width: previewWidth,
                      height: previewHeight,
                      flexShrink: 0
                    }}
                  >
                    <Box
                      sx={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%'
                      }}
                    >
                      <DeviceShape2d
                        shapeId={shape.id}
                        name={
                          shape.id === SHAPE_2D_SWITCH_ID
                            ? 'SW-CORE-01'
                            : shape.id === SHAPE_2D_PC_ID
                              ? 'PC-01'
                              : shape.name
                        }
                        width={previewWidth}
                        height={previewHeight}
                      />
                    </Box>
                  </Box>
                  <Typography fontWeight={600}>{shape.name}</Typography>
                </Stack>
              </Button>
            );
          })}
        </Stack>
      </Section>
    </ControlsContainer>
  );
};
