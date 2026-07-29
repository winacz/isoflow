import React, { useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Slider,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  ViewColumnOutlined,
  ViewStreamOutlined,
  GridViewOutlined,
  AutoFixHighOutlined,
  AltRouteOutlined
} from '@mui/icons-material';
import { ColorPicker } from 'src/components/ColorSelector/ColorPicker';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import {
  findSharedVlanColor,
  isVlan1,
  normalizeDeviceColorInput,
  parseDeviceColor,
  setDeviceColorAlpha,
  SHAPE_2D_GRID_PACK_VARIANTS,
  SHAPE_2D_PACK_VARIANTS,
  shape2dPackLabel,
  VLAN_1_COLOR
} from 'src/utils';
import type { Shape2dPackVariant } from 'src/utils';
import { getModelItemPorts, isShape2dIcon } from 'src/config';
import type { ModelItem } from 'src/types';
import { ControlsContainer } from '../components/ControlsContainer';

const sectionLabelSx = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: 'text.secondary',
  textTransform: 'uppercase'
} as const;

const fieldLabelSx = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.6,
  color: 'text.secondary',
  textTransform: 'uppercase',
  mb: 0.5
} as const;

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

const PATH_TIDY_STYLES = ['AUTO', 'ORTHOGONAL', 'DIAGONAL'] as const;
type PathTidyStyle = (typeof PATH_TIDY_STYLES)[number];

const pathTidyLabel = (style: PathTidyStyle) => {
  switch (style) {
    case 'AUTO':
      return 'auto';
    case 'ORTHOGONAL':
      return 'orto';
    case 'DIAGONAL':
      return 'diago';
    default:
      return style;
  }
};

const colorPickerWrapSx = {
  flexShrink: 0,
  pb: 0.25,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 0.25,
  minWidth: 72,
  '& .MuiFormControl-root': { m: 0 }
} as const;

/**
 * Sidebar for multi-selected plan nodes — layout + shared Personalizacja.
 */
export const MultiNodeControls = () => {
  const selectedItemIds = useUiStateStore((state) => state.selectedItemIds);
  const clearSelectedItemIds = useUiStateStore(
    (state) => state.actions.clearSelectedItemIds
  );
  const modelItems = useModelStore((state) => state.items);
  const {
    updateModelItem,
    setVlanColorAcrossModel,
    layoutViewItems,
    tidyItems,
    tidyPathsForItems
  } = useScene();

  const [personalizacjaOpen, setPersonalizacjaOpen] = useState(true);
  const vPackIndexRef = useRef(0);
  const hPackIndexRef = useRef(0);
  const gPackIndexRef = useRef(0);
  const pathStyleIndexRef = useRef(0);
  const [nextVPack, setNextVPack] = useState<Shape2dPackVariant>(
    SHAPE_2D_PACK_VARIANTS[0]
  );
  const [nextHPack, setNextHPack] = useState<Shape2dPackVariant>(
    SHAPE_2D_PACK_VARIANTS[0]
  );
  const [nextGPack, setNextGPack] = useState<Shape2dPackVariant>(
    SHAPE_2D_GRID_PACK_VARIANTS[0]
  );
  const [nextPathStyle, setNextPathStyle] = useState<PathTidyStyle>(
    PATH_TIDY_STYLES[0]
  );

  const selectedModels = useMemo(() => {
    return selectedItemIds
      .map((id) => modelItems.find((item) => item.id === id))
      .filter((item): item is ModelItem => {
        return Boolean(item?.icon && isShape2dIcon(item.icon));
      });
  }, [selectedItemIds, modelItems]);

  const count = selectedModels.length;
  const layoutIds = selectedModels.map((item) => item.id);
  const multi = count >= 2;

  const sharedColor = useMemo(() => {
    if (count === 0) return '';
    const colors = selectedModels.map((item) => item.color?.trim() || '');
    const first = colors[0];
    return colors.every((c) => c === first) ? first : '';
  }, [selectedModels, count]);

  const sharedVlan = useMemo(() => {
    if (count === 0) return '';
    const vlans: string[] = [];
    selectedModels.forEach((item) => {
      const ports = getModelItemPorts(item);
      const configs = item.ports ?? {};
      ports.forEach((port) => {
        const cfg = configs[port.id];
        if (cfg?.type === 'trunk') return;
        vlans.push(cfg?.vlan?.trim() || '');
      });
    });
    if (vlans.length === 0) return '';
    const first = vlans[0];
    return vlans.every((v) => v === first) ? first : '';
  }, [selectedModels, count]);

  const deviceColor = parseDeviceColor(sharedColor || '#ffffff00');
  const vlanColorValue = isVlan1(sharedVlan)
    ? VLAN_1_COLOR
    : findSharedVlanColor(sharedVlan, modelItems) || '#94a3b8';

  const applyColor = (color: string) => {
    const normalized = normalizeDeviceColorInput(color);
    selectedModels.forEach((item) => {
      updateModelItem(item.id, { color: normalized });
    });
  };

  const applyAlpha = (alpha: number) => {
    const hex = deviceColor.hex || '#94a3b8';
    const next = setDeviceColorAlpha(hex, alpha);
    selectedModels.forEach((item) => {
      updateModelItem(item.id, { color: next });
    });
  };

  const applyVlan = (vlan: string) => {
    const shared = findSharedVlanColor(vlan, modelItems);
    const nextColor = isVlan1(vlan) ? '' : shared || '';

    selectedModels.forEach((item) => {
      const ports = getModelItemPorts(item);
      const nextPorts: NonNullable<ModelItem['ports']> = {
        ...(item.ports ?? {})
      };
      ports.forEach((port) => {
        const prev = nextPorts[port.id] ?? {};
        if (prev.type === 'trunk') return;
        nextPorts[port.id] = {
          ...prev,
          vlan,
          vlanColor: nextColor
        };
      });
      updateModelItem(item.id, { ports: nextPorts });
    });

    if (nextColor && !isVlan1(vlan)) {
      setVlanColorAcrossModel(vlan, nextColor);
    }
  };

  const applyVlanColor = (color: string) => {
    if (!sharedVlan || isVlan1(sharedVlan)) return;
    setVlanColorAcrossModel(sharedVlan, color);
    selectedModels.forEach((item) => {
      const ports = getModelItemPorts(item);
      const nextPorts: NonNullable<ModelItem['ports']> = {
        ...(item.ports ?? {})
      };
      ports.forEach((port) => {
        const prev = nextPorts[port.id] ?? {};
        if (prev.type === 'trunk') return;
        if (isVlan1(prev.vlan ?? sharedVlan)) return;
        nextPorts[port.id] = {
          ...prev,
          vlanColor: color
        };
      });
      updateModelItem(item.id, { ports: nextPorts });
    });
  };

  const cyclePack = (
    mode: 'horizontal' | 'vertical' | 'grid',
    indexRef: React.MutableRefObject<number>,
    setNext: (pack: Shape2dPackVariant) => void,
    variants: readonly Shape2dPackVariant[] = SHAPE_2D_PACK_VARIANTS
  ) => {
    const pack = variants[indexRef.current % variants.length];
    layoutViewItems(layoutIds, mode, pack);
    indexRef.current += 1;
    setNext(variants[indexRef.current % variants.length]);
  };

  const label =
    count === 0
      ? 'Brak zaznaczenia'
      : `Zaznaczono ${count} ${
          count === 1 ? 'urządzenie' : count < 5 ? 'urządzenia' : 'urządzeń'
        }`;

  return (
    <ControlsContainer>
      <Box sx={{ px: 1.5, pt: 1.25, pb: 1.5 }}>
        <Typography sx={{ ...sectionLabelSx, mb: 0.35 }}>
          Wiele urządzeń
        </Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1.25 }}>
          {label}
        </Typography>

        {count >= 2 && (
          <Stack spacing={1.25}>
            <Box>
              <Typography sx={{ ...sectionLabelSx, mb: 0.75 }}>Ułóż</Typography>
              <Stack spacing={0.5}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ViewStreamOutlined />}
                  disabled={!multi}
                  onClick={() => {
                    cyclePack('vertical', vPackIndexRef, setNextVPack);
                  }}
                  sx={actionBtnSx}
                >
                  W pionie ({shape2dPackLabel(nextVPack, 'vertical')})
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ViewColumnOutlined />}
                  disabled={!multi}
                  onClick={() => {
                    cyclePack('horizontal', hPackIndexRef, setNextHPack);
                  }}
                  sx={actionBtnSx}
                >
                  W poziomie ({shape2dPackLabel(nextHPack, 'horizontal')})
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<GridViewOutlined />}
                  disabled={!multi}
                  onClick={() => {
                    cyclePack(
                      'grid',
                      gPackIndexRef,
                      setNextGPack,
                      SHAPE_2D_GRID_PACK_VARIANTS
                    );
                  }}
                  sx={actionBtnSx}
                >
                  W siatce ({shape2dPackLabel(nextGPack, 'grid')})
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AutoFixHighOutlined />}
                  disabled={!multi}
                  onClick={() => {
                    tidyItems(layoutIds);
                  }}
                  sx={actionBtnSx}
                >
                  Porządkuj
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  startIcon={<AltRouteOutlined />}
                  disabled={!multi}
                  onClick={() => {
                    const style =
                      PATH_TIDY_STYLES[
                        pathStyleIndexRef.current % PATH_TIDY_STYLES.length
                      ];
                    tidyPathsForItems(layoutIds, style);
                    pathStyleIndexRef.current += 1;
                    setNextPathStyle(
                      PATH_TIDY_STYLES[
                        pathStyleIndexRef.current % PATH_TIDY_STYLES.length
                      ]
                    );
                  }}
                  sx={actionBtnSx}
                >
                  Porządkuj ścieżki ({pathTidyLabel(nextPathStyle)})
                </Button>
              </Stack>
              <Typography
                sx={{ fontSize: 10, color: 'text.secondary', mt: 0.75 }}
              >
                Pion/poziom: przy sobie → z odstępem → max 5. Siatka: przy
                sobie → z odstępem. Ścieżki: jak „Porządkuj”, potem auto
                (domyślne proste kable) → orto / diago w równoległych torach.
              </Typography>
            </Box>

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
                <Typography sx={sectionLabelSx}>Personalizacja</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0, pt: 0.5, pb: 0.5 }}>
                <Stack spacing={1.25}>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="flex-start"
                    justifyContent="space-between"
                  >
                    <Box sx={{ flex: 1, minWidth: 0, pr: 0.5 }}>
                      <Typography sx={fieldLabelSx}>
                        Kolor urządzenia
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 11,
                          color: 'text.secondary',
                          lineHeight: 1.35
                        }}
                      >
                        {sharedColor
                          ? `Wspólny tint · ${Math.round(deviceColor.alpha * 100)}%`
                          : 'Różne kolory — wybór nadpisze wszystkie'}
                      </Typography>
                    </Box>
                    <Box
                      title="Kolor urządzenia (tint + przezroczystość)"
                      sx={colorPickerWrapSx}
                    >
                      <Typography
                        sx={{
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: 0.6,
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          mb: 0.25
                        }}
                      >
                        Kolor
                      </Typography>
                      <ColorPicker
                        format="hex8"
                        value={sharedColor || '#ffffff00'}
                        onChange={applyColor}
                      />
                      <Typography
                        sx={{
                          fontSize: 9,
                          color: 'text.secondary',
                          lineHeight: 1,
                          userSelect: 'none'
                        }}
                      >
                        {Math.round(deviceColor.alpha * 100)}%
                      </Typography>
                    </Box>
                  </Stack>

                  <Box>
                    <Typography sx={fieldLabelSx}>
                      Przezroczystość koloru
                    </Typography>
                    <Slider
                      size="small"
                      min={0}
                      max={100}
                      value={Math.round(deviceColor.alpha * 100)}
                      onChange={(_, value) => {
                        const alpha =
                          (Array.isArray(value) ? value[0] : value) / 100;
                        applyAlpha(alpha);
                      }}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(v) => `${v}%`}
                    />
                  </Box>

                  <Box>
                    <Typography sx={fieldLabelSx}>
                      VLAN (porty access)
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="flex-start"
                      justifyContent="space-between"
                    >
                      <TextField
                        size="small"
                        placeholder={sharedVlan ? undefined : 'różne / puste'}
                        value={sharedVlan}
                        onChange={(e) => {
                          applyVlan(e.target.value.trim());
                        }}
                        sx={{ flex: 1, minWidth: 0 }}
                        inputProps={{ inputMode: 'numeric' }}
                      />
                      <Box
                        title={
                          !sharedVlan || isVlan1(sharedVlan)
                            ? 'Ustaw wspólny VLAN, aby zmienić kolor'
                            : 'Kolor VLAN'
                        }
                        sx={{
                          ...colorPickerWrapSx,
                          opacity:
                            !sharedVlan || isVlan1(sharedVlan) ? 0.45 : 1,
                          pointerEvents:
                            !sharedVlan || isVlan1(sharedVlan)
                              ? 'none'
                              : 'auto'
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: 0.6,
                            color: 'text.secondary',
                            textTransform: 'uppercase',
                            mb: 0.25
                          }}
                        >
                          Kolor
                        </Typography>
                        <ColorPicker
                          format="hex"
                          value={vlanColorValue}
                          onChange={applyVlanColor}
                        />
                      </Box>
                    </Stack>
                  </Box>
                </Stack>
              </AccordionDetails>
            </Accordion>

            <Button
              size="small"
              color="inherit"
              onClick={() => {
                clearSelectedItemIds();
              }}
              sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
            >
              Wyczyść zaznaczenie
            </Button>
          </Stack>
        )}
      </Box>
    </ControlsContainer>
  );
};
