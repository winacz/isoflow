import React, { useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  IconButton,
  Collapse,
  Divider
} from '@mui/material';
import {
  PaletteOutlined as PaletteIcon,
  Close as CloseIcon,
  ExpandLess,
  ExpandMore
} from '@mui/icons-material';
import { UiElement } from 'src/components/UiElement/UiElement';
import { ColorPicker } from 'src/components/ColorSelector/ColorPicker';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useTheme } from '@mui/material/styles';

const DEFAULT_BG = '#f6faff';
const DEFAULT_VLAN1_CABLE = '#0a0a0a';

const BG_PRESETS = [
  { label: 'Default', hex: DEFAULT_BG },
  { label: 'White', hex: '#ffffff' },
  { label: 'Paper', hex: '#f4f1ea' },
  { label: 'Cool', hex: '#eef2f7' },
  { label: 'Mint', hex: '#ecfdf5' },
  { label: 'Slate', hex: '#1e293b' },
  { label: 'Ink', hex: '#0f172a' },
  { label: 'Blue', hex: '#dbeafe' }
];

const VLAN1_PRESETS = [
  { label: 'Black', hex: '#0a0a0a' },
  { label: 'Gray', hex: '#94a3b8' },
  { label: 'Slate', hex: '#64748b' },
  { label: 'Blue', hex: '#3b82f6' },
  { label: 'Green', hex: '#10b981' },
  { label: 'Orange', hex: '#f59e0b' },
  { label: 'Red', hex: '#ef4444' },
  { label: 'Violet', hex: '#8b5cf6' }
];

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

type ColorRowProps = {
  value: string;
  onChange: (hex: string) => void;
  presets: Array<{ label: string; hex: string }>;
};

const ColorRow = ({ value, onChange, presets }: ColorRowProps) => {
  const theme = useTheme();

  return (
    <Stack spacing={1}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <ColorPicker
          value={value}
          onChange={(next) => {
            onChange(next || value);
          }}
        />
        <TextField
          size="small"
          value={value}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (HEX_RE.test(v)) onChange(v);
          }}
          inputProps={{
            spellCheck: false,
            style: {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12
            }
          }}
          sx={{ flex: 1 }}
        />
      </Stack>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0.75
        }}
      >
        {presets.map((preset) => {
          const isActive = value.toLowerCase() === preset.hex.toLowerCase();
          return (
            <Box
              key={preset.hex}
              component="button"
              type="button"
              title={preset.label}
              onClick={() => {
                onChange(preset.hex);
              }}
              sx={{
                height: 26,
                borderRadius: 1,
                border: isActive
                  ? `2px solid ${theme.palette.primary.main}`
                  : '1px solid rgba(15,23,42,0.2)',
                bgcolor: preset.hex,
                cursor: 'pointer',
                p: 0,
                boxShadow: isActive
                  ? `0 0 0 2px ${theme.palette.primary.light}`
                  : undefined
              }}
            />
          );
        })}
      </Box>
    </Stack>
  );
};

/**
 * Temporary floating panel to experiment with canvas + VLAN 1 cable colors.
 * Not persisted — remove when done experimenting.
 */
export const BackgroundColorLab = () => {
  const [open, setOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const bgColor = useUiStateStore((state) => {
    return state.diagramBackgroundColor;
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
  const activeBg = bgColor ?? DEFAULT_BG;
  const activeVlan1 = vlan1Color ?? DEFAULT_VLAN1_CABLE;

  if (!open) {
    return (
      <UiElement>
        <IconButton
          size="small"
          title="TEMP kolory"
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
            TEMP · kolory
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
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Tło canvas
            </Typography>
            <ColorRow
              value={activeBg}
              onChange={(hex) => {
                setBgColor(hex);
              }}
              presets={BG_PRESETS}
            />

            <Divider />

            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Kable VLAN 1 / nieprzypisane
            </Typography>
            <ColorRow
              value={activeVlan1}
              onChange={(hex) => {
                setVlan1Color(hex);
              }}
              presets={VLAN1_PRESETS}
            />

            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                fullWidth
                onClick={() => {
                  setBgColor(null);
                  setVlan1Color(null);
                }}
              >
                Reset
              </Button>
              <Button
                size="small"
                variant="text"
                fullWidth
                onClick={() => {
                  // eslint-disable-next-line no-console
                  console.log('[color-lab]', {
                    background: activeBg,
                    vlan1Cable: activeVlan1
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
