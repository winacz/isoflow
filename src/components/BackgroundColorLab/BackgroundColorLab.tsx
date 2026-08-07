import React, { useState } from 'react';
import {
  Stack,
  Typography,
  Button,
  IconButton,
  Collapse,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Slider
} from '@mui/material';
import {
  Close as CloseIcon,
  ExpandLess,
  ExpandMore,
  GridOffOutlined as GridOffIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { UiElement } from 'src/components/UiElement/UiElement';
import { ColorWheelInput } from 'src/components/ColorSelector/ColorWheelInput';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { isPlan2dCanvas, projectionPrefsKey } from 'src/utils';
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

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Temp panel: canvas / VLAN1 / grid colors + 2D grid density.
 * Session-only — not persisted to the model. Prefs are per projection mode.
 * Opened from the main menu.
 */
export const BackgroundColorLab = ({ open, onClose }: Props) => {
  const [collapsed, setCollapsed] = useState(false);
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const modeKey = projectionPrefsKey(projectionMode);
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
  const cableWidthScale = useUiStateStore((state) => {
    return state.cableWidthScale;
  });
  const setCableWidthScale = useUiStateStore((state) => {
    return state.actions.setCableWidthScale;
  });
  const gridColor = useUiStateStore((state) => {
    return state.canvasByMode[modeKey]?.gridColor;
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
  const showLoupe = useUiStateStore((state) => {
    return state.showLoupe;
  });
  const setShowLoupe = useUiStateStore((state) => {
    return state.actions.setShowLoupe;
  });
  const canvasTheme = useUiStateStore((state) => {
    return state.canvasByMode[modeKey].theme;
  });
  const planTheme = useUiStateStore((state) => {
    return state.canvasByMode.TWO_D.theme;
  });
  const isTwoD = isPlan2dCanvas(projectionMode);
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
    return null;
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
              onClick={onClose}
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

            <Divider />

            <Stack spacing={0.5}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
              >
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  Grubość kabli
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {cableWidthScale.toFixed(1)}×
                </Typography>
              </Stack>
              <Slider
                size="small"
                min={0.4}
                max={2.5}
                step={0.1}
                value={cableWidthScale}
                onChange={(_, value) => {
                  setCableWidthScale(value as number);
                }}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => {
                  return `${Number(v).toFixed(1)}×`;
                }}
              />
            </Stack>

            {isTwoD && (
              <>
                <Divider />
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    Siatka i Lupa
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      startIcon={<SearchIcon sx={{ fontSize: 14 }} />}
                      onClick={() => {
                        setShowLoupe(!showLoupe);
                      }}
                      sx={{
                        textTransform: 'none',
                        fontSize: 11,
                        minHeight: 26,
                        py: 0
                      }}
                    >
                      {showLoupe ? 'Lupa (Wł)' : 'Lupa (Wył)'}
                    </Button>
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
                      {showGrid ? 'Siatka (Ukryj)' : 'Siatka (Pokaż)'}
                    </Button>
                  </Stack>
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
                  setCableWidthScale(1);
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
                    cableWidthScale,
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
