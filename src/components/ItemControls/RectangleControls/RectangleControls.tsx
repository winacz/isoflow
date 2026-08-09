import React, { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Slider,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useRectangle } from 'src/hooks/useRectangle';
import { ColorPicker } from 'src/components/ColorSelector/ColorPicker';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import {
  normalizeDeviceColorInput,
  parseDeviceColor,
  setDeviceColorAlpha,
  toDeviceColorHex8
} from 'src/utils';
import { ControlsContainer } from '../components/ControlsContainer';
import { Section } from '../components/Section';
import { DeleteButton } from '../components/DeleteButton';

interface Props {
  id: string;
}

const DEFAULT_OPACITY = 0.25;
const DEFAULT_FILL = '#60a5fa';

const isCssColor = (value: string) => {
  return (
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ||
    /^(rgb|hsl)a?\(/i.test(value)
  );
};

export const RectangleControls = ({ id }: Props) => {
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const rectangle = useRectangle(id);
  const { colors, updateRectangle, deleteRectangle } = useScene();
  const [personalizacjaOpen, setPersonalizacjaOpen] = useState(true);

  const kindLabel =
    rectangle.kind === 'building' ? 'Budynek' : 'Obszar / kształt';

  const resolvedHex = useMemo(() => {
    const raw = rectangle.color?.trim();
    if (raw && isCssColor(raw)) {
      return parseDeviceColor(raw).hex;
    }
    if (raw) {
      const fromPalette = colors.find((c) => c.id === raw);
      if (fromPalette) return parseDeviceColor(fromPalette.value).hex;
    }
    if (colors[0]?.value) return parseDeviceColor(colors[0].value).hex;
    return DEFAULT_FILL;
  }, [rectangle.color, colors]);

  const opacity = rectangle.opacity ?? DEFAULT_OPACITY;
  const pickerValue = toDeviceColorHex8(resolvedHex, opacity);

  return (
    <ControlsContainer>
      <Box sx={{ px: 1.5, pt: 1.25, pb: 0.5 }}>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4,
            color: 'text.secondary',
            textTransform: 'uppercase',
            mb: 1
          }}
        >
          {kindLabel}
        </Typography>

        <Accordion
          disableGutters
          elevation={0}
          expanded={personalizacjaOpen}
          onChange={(_, expanded) => {
            setPersonalizacjaOpen(expanded);
          }}
          sx={{
            bgcolor: 'transparent',
            '&:before': { display: 'none' }
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />}
            sx={{
              px: 0,
              minHeight: 28,
              '& .MuiAccordionSummary-content': { my: 0.25 }
            }}
          >
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.5,
                color: 'text.secondary',
                textTransform: 'uppercase'
              }}
            >
              Personalizacja
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 0, pt: 0.5, pb: 0.5 }}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="flex-start"
              justifyContent="space-between"
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
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
                  Nazwa
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  placeholder={`np. ${kindLabel}`}
                  value={rectangle.name ?? ''}
                  onChange={(e) => {
                    const name = e.target.value;
                    updateRectangle(rectangle.id, {
                      name: name.trim() ? name : undefined
                    });
                  }}
                  sx={{
                    '& .MuiInputBase-root': { fontSize: 12 },
                    '& .MuiInputLabel-root': { fontSize: 12 }
                  }}
                />
              </Box>
              <Box
                title="Kolor kształtu"
                sx={{
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.25,
                  minWidth: 72,
                  '& .MuiFormControl-root': { m: 0 }
                }}
              >
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
                  Kolor
                </Typography>
                <ColorPicker
                  format="hex8"
                  value={pickerValue}
                  onChange={(color) => {
                    const normalized = normalizeDeviceColorInput(color);
                    const parsed = parseDeviceColor(normalized);
                    updateRectangle(rectangle.id, {
                      color: parsed.hex,
                      opacity: parsed.alpha
                    });
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
                  {Math.round(opacity * 100)}%
                </Typography>
              </Box>
            </Stack>

            <Box sx={{ mt: 1.25 }}>
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  mb: 0.25
                }}
              >
                Przezroczystość koloru
              </Typography>
              <Slider
                size="small"
                min={5}
                max={90}
                value={Math.round(opacity * 100)}
                onChange={(_, value) => {
                  const next = (Array.isArray(value) ? value[0] : value) / 100;
                  updateRectangle(rectangle.id, {
                    color: setDeviceColorAlpha(resolvedHex, next),
                    opacity: next
                  });
                }}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}%`}
              />
            </Box>
          </AccordionDetails>
        </Accordion>
      </Box>

      <Section>
        <Box>
          <DeleteButton
            onClick={() => {
              uiStateActions.setItemControls(null);
              deleteRectangle(rectangle.id);
            }}
          />
        </Box>
      </Section>
    </ControlsContainer>
  );
};
