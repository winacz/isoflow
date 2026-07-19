import React, { useRef, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import {
  ViewColumnOutlined,
  ViewStreamOutlined,
  GridViewOutlined,
  RouteOutlined,
  AutoFixHighOutlined,
  SwapHorizOutlined,
  TimelineOutlined,
  ScienceOutlined,
  StraightOutlined
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

const actionBtnSx = {
  justifyContent: 'flex-start',
  textTransform: 'none',
  fontSize: 12,
  py: 0.35,
  px: 1,
  minHeight: 28,
  lineHeight: 1.2,
  '& .MuiButton-startIcon': {
    marginRight: 0.75,
    '& > *:nth-of-type(1)': { fontSize: 16 }
  }
} as const;

export const MultiNodeControls = () => {
  const selectedItemIds = useUiStateStore((state) => {
    return state.selectedItemIds;
  });
  const simplePaths = useUiStateStore((state) => {
    return state.simplePaths;
  });
  const clearSelectedItemIds = useUiStateStore((state) => {
    return state.actions.clearSelectedItemIds;
  });
  const {
    layoutViewItems,
    tidyItems,
    tidyItemsInPlace,
    routeDiagonalFanForItems,
    runTestLayoutForItems,
    regenerateRoutesForItems,
    setSimplePathsMode
  } = useScene();

  // Cycle algorithms on every press ("porządkuj w wybranym miejscu").
  const variantIndexRef = useRef(0);
  const [nextVariant, setNextVariant] = useState(TIDY_IN_PLACE_VARIANTS[0]);

  const count = selectedItemIds.length;

  return (
    <ControlsContainer>
      <Box sx={{ px: 1.25, pt: 1, pb: 1.25 }}>
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.6,
            color: 'text.secondary',
            textTransform: 'uppercase',
            mb: 0.5
          }}
        >
          Zaznaczenie
        </Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>
          Zaznaczono {count}{' '}
          {count === 1 ? 'urządzenie' : count < 5 ? 'urządzenia' : 'urządzeń'}
        </Typography>

        <Stack spacing={0.5}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ViewStreamOutlined />}
            onClick={() => {
              layoutViewItems(selectedItemIds, 'vertical');
            }}
            sx={actionBtnSx}
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
            sx={actionBtnSx}
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
            sx={actionBtnSx}
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
            sx={actionBtnSx}
          >
            Porządkuj
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<TimelineOutlined />}
            onClick={() => {
              routeDiagonalFanForItems(selectedItemIds);
            }}
            disabled={simplePaths}
            sx={actionBtnSx}
          >
            Mój algorytm
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ScienceOutlined />}
            onClick={() => {
              runTestLayoutForItems(selectedItemIds);
            }}
            disabled={simplePaths}
            sx={actionBtnSx}
          >
            Test
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
            sx={actionBtnSx}
          >
            Porządkuj w miejscu ({TIDY_IN_PLACE_LABELS[nextVariant]})
          </Button>
          <Button
            size="small"
            variant={simplePaths ? 'contained' : 'outlined'}
            startIcon={<StraightOutlined />}
            onClick={() => {
              setSimplePathsMode(!simplePaths);
            }}
            sx={actionBtnSx}
          >
            {simplePaths ? 'Włącz obliczanie' : 'Wyłącz obliczanie'}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RouteOutlined />}
            onClick={() => {
              regenerateRoutesForItems(selectedItemIds);
            }}
            sx={actionBtnSx}
          >
            Generuj nowe trasy
          </Button>
          <Button
            size="small"
            color="inherit"
            onClick={() => {
              clearSelectedItemIds();
            }}
            sx={{ ...actionBtnSx, mt: 0.25 }}
          >
            Wyczyść zaznaczenie
          </Button>
        </Stack>
      </Box>
    </ControlsContainer>
  );
};
