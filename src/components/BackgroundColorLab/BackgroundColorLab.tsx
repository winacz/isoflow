import React, { useState } from 'react';
import {
  Stack,
  Typography,
  Button,
  IconButton,
  Collapse,
  Divider,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import {
  PaletteOutlined as PaletteIcon,
  Close as CloseIcon,
  ExpandLess,
  ExpandMore,
  GridOffOutlined as GridOffIcon
} from '@mui/icons-material';
import { UiElement } from 'src/components/UiElement/UiElement';
import { ColorWheelInput } from 'src/components/ColorSelector/ColorWheelInput';
import { useUiStateStore } from 'src/stores/uiStateStore';
import {
  DIAGRAM_BG_2D_LIGHT,
  DIAGRAM_BG_2D_DARK,
  GRID_COLOR_DARK
} from 'src/config';
import { customVars } from 'src/styles/theme';
import type { GridStyle } from 'src/types';

const DEFAULT_VLAN1_CABLE = '#0a0a0a';

const GRID_OPTIONS: Array<{ value: GridStyle; label: string; hint: string }> = [
  { value: 'fine', label: 'Drobna', hint: 'Co 1 kafel' },
  { value: 'standard', label: 'Standard', hint: 'Co 5 + drobna' },
  { value: 'dense', label: 'Gęsta', hint: 'Co 2 + drobna' },
  { value: 'sparse', label: 'Rzadka', hint: 'Co 10' },
  { value: 'rack', label: 'RACK', hint: 'Kwadrat = 1U' }
];

/**
 * Left-side temp panel: canvas / VLAN1 / grid colors + 2D grid density.
 * Session-only — not persisted to the model. Prefs are per projection mode.
 */
export const BackgroundColorLab = () => {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const modeKey = projectionMode === 'TWO_D' ? 'TWO_D' : 'ISOMETRIC';
  const bgColor = useUiStateStore((state) => {
    return state.canvasByMode[modeKey].backgroundColor;
  });
  const setBgColor = useUiStateStore((state) => {
    return state.actions.setDiagramBackgroundColor;
  });
  const vlan1Color = useUiStateStore((state) => {
    return state.vlan1CableColor;
  });
  const setVlan1Color = useUiStateStore((state) => {
    return state.actions.setVlan1CableColor;
  });
  const gridColor = useUiStateStore((state) => {
    return state.canvasByMode.TWO_D.gridColor;
  });
  const setGridColor = useUiStateStore((state) => {
    return state.actions.setGridColor;
  });
  const showGrid = useUiStateStore((state) => {
    return state.showGrid;
  });
  const gridStyle = useUiStateStore((state) => {
    return state.gridStyle;
  });
  const setGridStyle = useUiStateStore((state) => {
    return state.actions.setGridStyle;
  });
  const setShowGrid = useUiStateStore((state) => {
    return state.actions.setShowGrid;
  });
  const canvasTheme = useUiStateStore((state) => {
    return state.canvasByMode[modeKey].theme;
  });
  const planTheme = useUiStateStore((state) => {
    return state.canvasByMode.TWO_D.theme;
  });
  const isTwoD = projectionMode === 'TWO_D';
  const isDark = canvasTheme === 'dark';
  // Iso: classic theme diagram color; Plan: light/dark theme defaults.
  const defaultBg = isTwoD
    ? isDark
      ? DIAGRAM_BG_2D_DARK
      : DIAGRAM_BG_2D_LIGHT
    : customVars.customPalette.diagramBg;
  const defaultGrid =
    planTheme === 'dark' ? GRID_COLOR_DARK : '#64748b';
  const activeBg = bgColor ?? defaultBg;
  const activeVlan1 = vlan1Color ?? DEFAULT_VLAN1_CABLE;
  const activeGrid = gridColor ?? defaultGrid;

  if (!open) {
    return (
      <UiElement>
        <IconButton
          size="small"
          title="TEMP kolory / siatka"
          onClick={() => {
            setOpen(true);
          }}
          sx={{ color: 'text.secondary' }}
        >
          <PaletteIcon fontSize="small" />
        </IconButton>
      </UiElement>
    );
  }

  return (
    <UiElement
      sx={{
        width: 270,
        p: 1.25,
        boxSizing: 'border-box'
      }}
    >
      <Stack spacing={1}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, letterSpacing: 0.3, color: 'warning.dark' }}
          >
            TEMP · canvas
          </Typography>
          <Stack direction="row" spacing={0.25}>
            <IconButton
              size="small"
              onClick={() => {
                setCollapsed((v) => {
                  return !v;
                });
              }}
            >
              {collapsed ? (
                <ExpandMore fontSize="small" />
              ) : (
                <ExpandLess fontSize="small" />
              )}
            </IconButton>
            <IconButton
              size="small"
              title="Ukryj panel"
              onClick={() => {
                setOpen(false);
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>

        <Collapse in={!collapsed}>
          <Stack spacing={1.25}>
            <ColorWheelInput
              label="Tło canvas"
              value={activeBg}
              fallback={defaultBg}
              onChange={(hex) => {
                setBgColor(hex);
              }}
            />

            <Divider />

            <ColorWheelInput
              label="Kable VLAN 1 / nieprzypisane"
              value={activeVlan1}
              fallback={DEFAULT_VLAN1_CABLE}
              onChange={(hex) => {
                setVlan1Color(hex);
              }}
            />

            {isTwoD && (
              <>
                <Divider />
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    Siatka
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<GridOffIcon sx={{ fontSize: 14 }} />}
                    onClick={() => {
                      setShowGrid(!showGrid);
                    }}
                    sx={{
                      textTransform: 'none',
                      fontSize: 11,
                      minHeight: 26,
                      py: 0
                    }}
                  >
                    {showGrid ? 'Ukryj' : 'Pokaż'}
                  </Button>
                </Stack>
                <ColorWheelInput
                  label="Kolor siatki"
                  value={activeGrid}
                  fallback={defaultGrid}
                  onChange={(hex) => {
                    setGridColor(hex);
                  }}
                />
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  fullWidth
                  value={showGrid ? gridStyle : null}
                  onChange={(_, value: GridStyle | null) => {
                    if (!value) return;
                    setGridStyle(value);
                  }}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 0.5,
                    '& .MuiToggleButtonGroup-grouped': {
                      border: '1px solid rgba(15,23,42,0.16) !important',
                      borderRadius: '6px !important',
                      m: 0
                    }
                  }}
                >
                  {GRID_OPTIONS.map((option) => {
                    return (
                      <ToggleButton
                        key={option.value}
                        value={option.value}
                        sx={{
                          textTransform: 'none',
                          flexDirection: 'column',
                          py: 0.6,
                          px: 0.5,
                          lineHeight: 1.15
                        }}
                      >
                        <Typography sx={{ fontSize: 11, fontWeight: 700 }}>
                          {option.label}
                        </Typography>
                        <Typography
                          sx={{ fontSize: 9, color: 'text.secondary' }}
                        >
                          {option.hint}
                        </Typography>
                      </ToggleButton>
                    );
                  })}
                </ToggleButtonGroup>
              </>
            )}

            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                fullWidth
                onClick={() => {
                  setBgColor(null);
                  setVlan1Color(null);
                  setGridColor(null);
                }}
              >
                Reset kolorów
              </Button>
              <Button
                size="small"
                variant="text"
                fullWidth
                onClick={() => {
                  // eslint-disable-next-line no-console
                  console.log('[color-lab]', {
                    background: activeBg,
                    vlan1Cable: activeVlan1,
                    gridColor: activeGrid,
                    gridStyle,
                    showGrid
                  });
                }}
              >
                Log
              </Button>
            </Stack>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ lineHeight: 1.3 }}
            >
              Tylko sesja — nie zapisuje się do modelu.
            </Typography>
          </Stack>
        </Collapse>
      </Stack>
    </UiElement>
  );
};
