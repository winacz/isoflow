import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowDownward as ArrowDownIcon,
  ArrowUpward as ArrowUpIcon,
  ContentCopy as CopyIcon,
  DeleteOutline as DeleteIcon
} from '@mui/icons-material';
import { ControlsContainer } from 'src/components/ItemControls/components/ControlsContainer';
import { Section } from 'src/components/ItemControls/components/Section';
import { DeviceShape2d } from 'src/components/Shapes2d/DeviceShape2d';
import { TILE_SIZE_2D, MAX_SWITCH_TEMPLATE_PORTS } from 'src/config';
import {
  generateId,
  layoutDeviceTemplate,
  validateDeviceTemplateFit,
  cloneDeviceTemplate
} from 'src/utils';
import type { DeviceTemplate } from 'src/types';

const PORT_OPTIONS_BASE = [1, 2, 4, 8, 12, 16, 24] as const;
/** RACK may use a single dense 48-port block (24 cols × 2 rows). */
const PORT_OPTIONS_RACK = [1, 2, 4, 8, 12, 16, 24, 48] as const;

const NUMBERING_HELP: Record<DeviceTemplate['numbering'], string> = {
  ODD_EVEN: 'Góra nieparzyste, dół parzyste (SCALANCE / Cisco)',
  ROWS_LTR: 'Rządami: góra L→P, potem dół L→P',
  COLS_TTB: 'Jak MikroTik: kolumnami góra→dół, potem L→P'
};

const defaultSection = (): DeviceTemplate['sections'][number] => {
  return {
    id: generateId(),
    media: 'RJ45',
    ports: 8,
    rows: 2
  };
};

const createDraft = (): DeviceTemplate => {
  return {
    id: generateId(),
    name: 'Nowy switch',
    kind: 'SWITCH',
    formFactor: 'DIN',
    numbering: 'ODD_EVEN',
    sections: [defaultSection()]
  };
};

interface Props {
  /** Prefill when editing / copying an existing template. */
  initialTemplate?: DeviceTemplate;
  /** edit = update same id; create = new entry (also after local copy). */
  mode?: 'create' | 'edit';
  onCancel: () => void;
  onSave: (template: DeviceTemplate) => void;
}

export const DeviceCreatorPanel = ({
  initialTemplate,
  mode: initialMode = 'create',
  onCancel,
  onSave
}: Props) => {
  const [draft, setDraft] = useState<DeviceTemplate>(
    () => initialTemplate ?? createDraft()
  );
  const [mode, setMode] = useState<'create' | 'edit'>(
    initialTemplate ? initialMode : 'create'
  );

  const layout = useMemo(() => {
    return layoutDeviceTemplate(draft);
  }, [draft]);

  const fitError = useMemo(() => {
    return validateDeviceTemplateFit(draft);
  }, [draft]);

  const totalPorts = draft.sections.reduce((sum, section) => {
    return sum + section.ports;
  }, 0);

  const previewWidth = Math.min(380, layout.size.width * TILE_SIZE_2D * 0.22);
  const scale = previewWidth / (layout.size.width * TILE_SIZE_2D);
  const previewHeight = Math.round(layout.size.height * TILE_SIZE_2D * scale);
  const naturalW = layout.size.width * TILE_SIZE_2D;
  const naturalH = layout.size.height * TILE_SIZE_2D;

  const updateSection = (
    sectionId: string,
    patch: Partial<DeviceTemplate['sections'][number]>
  ) => {
    setDraft((prev) => {
      return {
        ...prev,
        sections: prev.sections.map((section) => {
          return section.id === sectionId ? { ...section, ...patch } : section;
        })
      };
    });
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    setDraft((prev) => {
      const next = [...prev.sections];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return { ...prev, sections: next };
    });
  };

  const portOptions =
    draft.formFactor === 'RACK' ? PORT_OPTIONS_RACK : PORT_OPTIONS_BASE;

  const canSave = draft.name.trim().length > 0 && !fitError;
  const title =
    mode === 'edit' ? 'Edycja szablonu' : 'Kreator switcha';

  return (
    <ControlsContainer
      header={
        <Section sx={{ position: 'sticky', top: 0, pt: 6, pb: 2 }}>
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {mode === 'edit'
                ? 'Zmiany trafią do wszystkich urządzeń z tym szablonem.'
                : 'Zdefiniuj sekcje portów — podgląd aktualizuje się na żywo.'}
            </Typography>
          </Stack>
        </Section>
      }
    >
      <Section>
        <Stack spacing={2}>
          <Box
            sx={{
              width: previewWidth,
              height: previewHeight,
              mx: 'auto',
              overflow: 'hidden',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: '#f8fafc'
            }}
          >
            <Box
              sx={{
                width: naturalW,
                height: naturalH,
                transform: `scale(${scale})`,
                transformOrigin: 'top left'
              }}
            >
              <DeviceShape2d
                shapeId={draft.id}
                centered={false}
                name={draft.name || 'SWITCH'}
                layoutOverride={layout}
              />
            </Box>
          </Box>

          <Typography variant="caption" color="text.secondary" textAlign="center">
            {totalPorts}/{MAX_SWITCH_TEMPLATE_PORTS} portów · {layout.size.width}×
            {layout.size.height} kratek
          </Typography>

          {fitError && <Alert severity="warning">{fitError}</Alert>}

          <TextField
            label="Nazwa"
            size="small"
            fullWidth
            value={draft.name}
            onChange={(event) => {
              setDraft((prev) => {
                return { ...prev, name: event.target.value };
              });
            }}
          />

          <FormControl>
            <FormLabel sx={{ fontSize: 12, mb: 0.5 }}>Typ obudowy</FormLabel>
            <RadioGroup
              row
              value={draft.formFactor}
              onChange={(event) => {
                const formFactor = event.target
                  .value as DeviceTemplate['formFactor'];
                setDraft((prev) => {
                  const sections =
                    formFactor === 'RACK'
                      ? prev.sections
                      : prev.sections.map((section) => {
                          // 48 is RACK-only in the UI; clamp when leaving RACK.
                          return section.ports > 24
                            ? { ...section, ports: 24 }
                            : section;
                        });
                  return { ...prev, formFactor, sections };
                });
              }}
            >
              <FormControlLabel value="RACK" control={<Radio size="small" />} label="RACK" />
              <FormControlLabel value="DIN" control={<Radio size="small" />} label="DIN" />
              <FormControlLabel
                value="CUSTOM"
                control={<Radio size="small" />}
                label="Dowolna"
              />
            </RadioGroup>
          </FormControl>

          <FormControl fullWidth size="small">
            <FormLabel sx={{ fontSize: 12, mb: 0.5 }}>Numeracja</FormLabel>
            <Select
              value={draft.numbering}
              onChange={(event) => {
                setDraft((prev) => {
                  return {
                    ...prev,
                    numbering: event.target
                      .value as DeviceTemplate['numbering']
                  };
                });
              }}
            >
              <MenuItem value="ODD_EVEN">Nieparzyste / parzyste</MenuItem>
              <MenuItem value="ROWS_LTR">Rządami L→P</MenuItem>
              <MenuItem value="COLS_TTB">MikroTik (kolumnami)</MenuItem>
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              {NUMBERING_HELP[draft.numbering]}
            </Typography>
          </FormControl>

          <Divider />

          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography variant="subtitle2">Sekcje</Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => {
                setDraft((prev) => {
                  return {
                    ...prev,
                    sections: [...prev.sections, defaultSection()]
                  };
                });
              }}
            >
              Dodaj
            </Button>
          </Stack>

          {draft.sections.map((section, index) => {
            return (
              <Box
                key={section.id}
                sx={{
                  p: 1.25,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper'
                }}
              >
                <Stack spacing={1.25}>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
                      Sekcja {index + 1}
                    </Typography>
                    <IconButton
                      size="small"
                      disabled={index === 0}
                      onClick={() => {
                        moveSection(index, -1);
                      }}
                    >
                      <ArrowUpIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      disabled={index === draft.sections.length - 1}
                      onClick={() => {
                        moveSection(index, 1);
                      }}
                    >
                      <ArrowDownIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      disabled={draft.sections.length <= 1}
                      onClick={() => {
                        setDraft((prev) => {
                          return {
                            ...prev,
                            sections: prev.sections.filter((item) => {
                              return item.id !== section.id;
                            })
                          };
                        });
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>

                  <Stack direction="row" spacing={1}>
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <Select
                        value={section.media}
                        onChange={(event) => {
                          updateSection(section.id, {
                            media: event.target.value as 'RJ45' | 'SFP'
                          });
                        }}
                      >
                        <MenuItem value="RJ45">RJ45</MenuItem>
                        <MenuItem value="SFP">SFP</MenuItem>
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <Select
                        value={section.ports}
                        onChange={(event) => {
                          updateSection(section.id, {
                            ports: Number(event.target.value)
                          });
                        }}
                      >
                        {portOptions.map((count) => {
                          const label =
                            count === 1
                              ? '1 port'
                              : count === 48
                                ? '48 portów'
                                : `${count} porty`;
                          return (
                            <MenuItem key={count} value={count}>
                              {label}
                            </MenuItem>
                          );
                        })}
                      </Select>
                    </FormControl>
                  </Stack>
                </Stack>
              </Box>
            );
          })}

          <Stack spacing={1} sx={{ pt: 1 }}>
            {(mode === 'edit' || initialTemplate) && (
              <Button
                variant="outlined"
                startIcon={<CopyIcon />}
                onClick={() => {
                  setDraft(cloneDeviceTemplate(draft));
                  setMode('create');
                }}
                sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
              >
                Kopiuj szablon
              </Button>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={onCancel}>Anuluj</Button>
              <Button
                variant="contained"
                disabled={!canSave}
                onClick={() => {
                  onSave({
                    ...draft,
                    name: draft.name.trim()
                  });
                }}
              >
                {mode === 'edit' ? 'Zapisz zmiany' : 'Zapisz szablon'}
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Section>
    </ControlsContainer>
  );
};
