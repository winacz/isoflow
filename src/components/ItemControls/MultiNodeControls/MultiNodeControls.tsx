import React, { useRef, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import {
  ViewColumnOutlined,
  ViewStreamOutlined,
  GridViewOutlined,
  RouteOutlined,
  AutoFixHighOutlined,
  SwapHorizOutlined
} from '@mui/icons-material';
import { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { TIDY_IN_PLACE_VARIANTS } from 'src/utils';
import { ControlsContainer } from '../components/ControlsContainer';

const TIDY_IN_PLACE_LABELS: Record<string, string> = {
  bundleTidy: 'porządkuj wiązką',
  wireLength: 'krótkie kable',
  crossings: 'mało skrzyżowań',
  portOrder: 'wg portów',
  bundleVertical: 'wiązka pionowa',
  bundleHorizontal: 'wiązka pozioma',
  gatherDown: 'zbij w dół',
  gatherUp: 'zbij w górę',
  gatherAuto: 'zbij auto'
};

export const MultiNodeControls = () => {
  const selectedItemIds = useUiStateStore((state) => {
    return state.selectedItemIds;
  });
  const clearSelectedItemIds = useUiStateStore((state) => {
    return state.actions.clearSelectedItemIds;
  });
  const {
    layoutViewItems,
    tidyItems,
    tidyItemsInPlace,
    regenerateRoutesForItems
  } = useScene();

  // Cycle algorithms on every press ("porządkuj w wybranym miejscu").
  const variantIndexRef = useRef(0);
  const [nextVariant, setNextVariant] = useState(TIDY_IN_PLACE_VARIANTS[0]);

  const count = selectedItemIds.length;

  return (
    <ControlsContainer>
      <Box sx={{ px: 1.5, pt: 1.25, pb: 1.5 }}>
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.6,
            color: 'text.secondary',
            textTransform: 'uppercase',
            mb: 0.75
          }}
        >
          Zaznaczenie
        </Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1.25 }}>
          Zaznaczono {count}{' '}
          {count === 1 ? 'urządzenie' : count < 5 ? 'urządzenia' : 'urządzeń'}
        </Typography>

        <Stack spacing={0.75}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ViewStreamOutlined />}
            onClick={() => {
              layoutViewItems(selectedItemIds, 'vertical');
            }}
            sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
          >
            Rozłóż w pionie
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ViewColumnOutlined />}
            onClick={() => {
              layoutViewItems(selectedItemIds, 'horizontal');
            }}
            sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
          >
            Rozłóż w poziomie
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<GridViewOutlined />}
            onClick={() => {
              layoutViewItems(selectedItemIds, 'grid');
            }}
            sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
          >
            Rozłóż w siatce
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AutoFixHighOutlined />}
            onClick={() => {
              tidyItems(selectedItemIds);
            }}
            sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
          >
            Porządkuj
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<SwapHorizOutlined />}
            onClick={() => {
              const variant =
                TIDY_IN_PLACE_VARIANTS[
                  variantIndexRef.current % TIDY_IN_PLACE_VARIANTS.length
                ];
              tidyItemsInPlace(selectedItemIds, variant);
              variantIndexRef.current += 1;
              setNextVariant(
                TIDY_IN_PLACE_VARIANTS[
                  variantIndexRef.current % TIDY_IN_PLACE_VARIANTS.length
                ]
              );
            }}
            sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
          >
            Porządkuj w miejscu ({TIDY_IN_PLACE_LABELS[nextVariant]})
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RouteOutlined />}
            onClick={() => {
              regenerateRoutesForItems(selectedItemIds);
            }}
            sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
          >
            Generuj nowe trasy
          </Button>
          <Button
            size="small"
            color="inherit"
            onClick={() => {
              clearSelectedItemIds();
            }}
            sx={{ justifyContent: 'flex-start', textTransform: 'none', mt: 0.5 }}
          >
            Wyczyść zaznaczenie
          </Button>
        </Stack>
      </Box>
    </ControlsContainer>
  );
};
