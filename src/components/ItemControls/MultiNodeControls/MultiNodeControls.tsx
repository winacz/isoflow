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
  StraightOutlined,
  AutoAwesomeOutlined,
  AccountTreeOutlined
} from '@mui/icons-material';
import { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { TIDY_IN_PLACE_VARIANTS, supportsConnectorTools, normalizeDeviceColorInput, parseDeviceColor } from 'src/utils';
import { ControlsContainer } from '../components/ControlsContainer';
import { useModelStore } from 'src/stores/modelStore';
import { ColorPicker } from 'src/components/ColorSelector/ColorPicker';

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
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  // 2D v3 keeps nodes + ports only — no cable routing / sorting tools.
  const hasConnectorTools = supportsConnectorTools(projectionMode);
  const {
    layoutViewItems,
    tidyItems,
    tidyItemsInPlace,
    routeDiagonalFanForItems,
    runTestLayoutForItems,
    runSmartLayoutForItems,
    runSmartLayout2ForItems,
    regenerateRoutesForItems,
    setSimplePathsMode,
    updateModelItem,
    beginHistoryTransaction,
    endHistoryTransaction
  } = useScene();

  // Cycle algorithms on every press ("porządkuj w wybranym miejscu").
  const variantIndexRef = useRef(0);
  const [nextVariant, setNextVariant] = useState(TIDY_IN_PLACE_VARIANTS[0]);

  const count = selectedItemIds.length;
  const multi = count >= 2;

  const modelItems = useModelStore((state) => state.items);

  const selectedModelItems = React.useMemo(() => {
    return selectedItemIds
      .map(id => modelItems.find(m => m.id === id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
  }, [selectedItemIds, modelItems]);
  
  const commonColor = React.useMemo(() => {
    if (selectedModelItems.length === 0) return '#ffffff00';
    const firstColor = selectedModelItems[0]?.color?.trim() || '#ffffff00';
    const allSame = selectedModelItems.every(m => (m.color?.trim() || '#ffffff00') === firstColor);
    return allSame ? firstColor : ''; // empty string for mixed colors
  }, [selectedModelItems]);

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
          Algorytmy
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 1 }}>
          Auto-Układ — PPM na planie.
        </Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>
          {count === 0
            ? 'Brak zaznaczenia'
            : `Zaznaczono ${count} ${
                count === 1 ? 'urządzenie' : count < 5 ? 'urządzenia' : 'urządzeń'
              }`}
        </Typography>

        <Stack spacing={0.5}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ViewStreamOutlined />}
            onClick={() => {
              layoutViewItems(selectedItemIds, 'vertical');
            }}
            disabled={!multi}
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
            disabled={!multi}
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
            disabled={!multi}
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
            disabled={!multi}
            sx={actionBtnSx}
          >
            Porządkuj
          </Button>
          {hasConnectorTools && (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<TimelineOutlined />}
                onClick={() => {
                  routeDiagonalFanForItems(selectedItemIds);
                }}
                disabled={simplePaths || count < 1}
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
                disabled={simplePaths || count < 1}
                sx={actionBtnSx}
              >
                Test
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AutoAwesomeOutlined />}
                onClick={() => {
                  runSmartLayoutForItems(selectedItemIds);
                }}
                disabled={simplePaths || count < 1}
                sx={actionBtnSx}
                color="secondary"
              >
                Smart Layout
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AccountTreeOutlined />}
                onClick={() => {
                  runSmartLayout2ForItems(selectedItemIds);
                }}
                disabled={simplePaths || count < 1}
                sx={actionBtnSx}
                color="secondary"
              >
                Smart Layout 2
              </Button>
            </>
          )}
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
            disabled={!multi}
            sx={actionBtnSx}
          >
            Porządkuj w miejscu ({TIDY_IN_PLACE_LABELS[nextVariant]})
          </Button>
          {hasConnectorTools && (
            <>
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
                disabled={count < 1}
                sx={actionBtnSx}
              >
                Generuj nowe trasy
              </Button>
            </>
          )}
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

      {count > 0 && (
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', px: 1.25, pt: 1.25, pb: 1.5 }}>
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 0.6,
              color: 'text.secondary',
              textTransform: 'uppercase',
              mb: 1
            }}
          >
            Personalizacja
          </Typography>
          
          <Box sx={{ mt: 1 }}>
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.4,
                color: 'text.secondary',
                textTransform: 'uppercase',
                mb: 0.75
              }}
            >
              Kolor tła
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <ColorPicker
                format="hex8"
                value={commonColor}
                onChange={(color) => {
                  const normalized = normalizeDeviceColorInput(color);
                  beginHistoryTransaction();
                  selectedItemIds.forEach(id => {
                    updateModelItem(id, { color: normalized });
                  });
                  endHistoryTransaction();
                }}
              />
              <Typography
                sx={{
                  fontSize: 9,
                  color: 'text.secondary',
                  lineHeight: 1,
                  userSelect: 'none'
                }}
              >
                {commonColor === '' ? 'Mieszany' : `${Math.round((parseDeviceColor(commonColor).alpha) * 100)}%`}
              </Typography>
            </Stack>
          </Box>
        </Box>
      )}
    </ControlsContainer>
  );
};
