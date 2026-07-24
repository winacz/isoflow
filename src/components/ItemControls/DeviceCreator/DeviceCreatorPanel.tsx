import React, { useMemo, useState, useRef } from 'react';
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
import { WorkshopLayout } from 'src/components/Workshop/WorkshopLayout';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import {
  SWITCH_ROLE_LABELS,
  switchRoleOptions
} from 'src/schemas/deviceTemplates';

const PORT_OPTIONS_BASE = [1, 2, 4, 8, 12, 16, 24] as const;
/** RACK may use a single dense 48-port block (24 cols × 2 rows). */
const PORT_OPTIONS_RACK = [1, 2, 4, 8, 12, 16, 24, 48] as const;

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
    numbering: 'ROWS_LTR',
    switchRole: 'SW',
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
  /** When set, shows „Usuń szablon” in edit mode. */
  onDelete?: () => void;
  isWorkshopMode?: boolean;
}

export const DeviceCreatorPanel = ({
  initialTemplate,
  mode: initialMode = 'create',
  onCancel,
  onSave,
  onDelete,
  isWorkshopMode
}: Props) => {
  const [draft, setDraft] = useState<DeviceTemplate>(() => {
    const base = initialTemplate ?? createDraft();
    if (base.kind === 'SWITCH' && !base.switchRole) {
      return { ...base, switchRole: 'SW' };
    }
    return base;
  });
  const [mode, setMode] = useState<'create' | 'edit'>(initialTemplate ? 'edit' : 'create');

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const { size: containerSize } = useResizeObserver(previewContainerRef.current);
  const [manualZoom, setManualZoom] = useState(1);

  const layout = useMemo(() => {
    return layoutDeviceTemplate(draft);
  }, [draft]);

  const fitError = useMemo(() => {
    return validateDeviceTemplateFit(draft);
  }, [draft]);

  const totalPorts = draft.sections.reduce((sum, section) => {
    return sum + section.ports;
  }, 0);

  const normalPreviewWidth = Math.min(380, layout.size.width * TILE_SIZE_2D * 0.22);
  const normalScale = normalPreviewWidth / (layout.size.width * TILE_SIZE_2D);
  const normalPreviewHeight = Math.round(layout.size.height * TILE_SIZE_2D * normalScale);
  const naturalW = layout.size.width * TILE_SIZE_2D;
  const naturalH = layout.size.height * TILE_SIZE_2D;
  
  let scale = normalScale;
  let previewWidth = normalPreviewWidth;
  let previewHeight = normalPreviewHeight;
  
  if (isWorkshopMode) {
    previewWidth = '100%' as any;
    previewHeight = '100%' as any;
    if (containerSize.width > 0 && containerSize.height > 0) {
      const scaleX = (containerSize.width * 0.8) / Math.max(1, naturalW);
      const scaleY = (containerSize.height * 0.8) / Math.max(1, naturalH);
      scale = Math.min(scaleX, scaleY, 1.5) * manualZoom;
    } else {
      scale = 1 * manualZoom;
    }
  }

  const updateSection = (
    sectionId: string,
    patch: Partial<DeviceTemplate['sections'][number]>
  ) => {
    setDraft((prev) => {
      const sections = prev.sections.map((section) => {
        return section.id === sectionId ? { ...section, ...patch } : section;
      });
      const nextDraft = { ...prev, sections };
      const validIds = new Set(
        layoutDeviceTemplate(nextDraft).ports.map((p) => p.id)
      );
      const portPoe = Object.fromEntries(
        Object.entries(prev.portPoe || {}).filter(([id]) => validIds.has(id))
      );
      return {
        ...nextDraft,
        portPoe: Object.keys(portPoe).length ? portPoe : undefined
      };
    });
  };

  const setPortPoe = (portId: string, value: 'IN' | 'OUT' | 'NONE') => {
    setDraft((prev) => {
      const next = { ...(prev.portPoe || {}) };
      if (value === 'NONE') {
        delete next[portId];
      } else {
        next[portId] = value;
      }
      return {
        ...prev,
        portPoe: Object.keys(next).length ? next : undefined
      };
    });
  };

  const setAllRj45Poe = (value: 'IN' | 'OUT' | 'NONE') => {
    setDraft((prev) => {
      const next = { ...(prev.portPoe || {}) };
      layout.ports.forEach((port) => {
        if ((port.media ?? 'RJ45') !== 'RJ45') return;
        if (value === 'NONE') delete next[port.id];
        else next[port.id] = value;
      });
      return {
        ...prev,
        portPoe: Object.keys(next).length ? next : undefined
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
  const switchRole = draft.switchRole || 'SW';
  const title =
    mode === 'edit'
      ? `Edycja szablonu (${SWITCH_ROLE_LABELS[switchRole]})`
      : `Kreator: ${SWITCH_ROLE_LABELS[switchRole]}`;

  const handleWheel = (e: React.WheelEvent) => {
    if (!isWorkshopMode) return;
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setManualZoom(z => Math.max(0.1, Math.min(5, z + delta)));
  };

  const previewContent = (
    <Box
      ref={previewContainerRef}
      onWheel={handleWheel}
      sx={{
        width: previewWidth,
        height: previewHeight,
        mx: 'auto',
        overflow: 'hidden',
        borderRadius: 1,
        border: isWorkshopMode ? 'none' : '1px solid',
        borderColor: 'divider',
        bgcolor: isWorkshopMode ? 'transparent' : '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Box
        sx={{
          width: naturalW,
          height: naturalH,
          transform: `scale(${scale})`,
          transformOrigin: isWorkshopMode ? 'center' : 'top left'
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
  );

  const basicInfo = (
    <Stack spacing={2}>
      <FormControl>
        <FormLabel sx={{ fontSize: 11, mb: 0.5, fontWeight: 600 }}>
          Typ obudowy
        </FormLabel>
        <RadioGroup
          row
          value={draft.formFactor}
          onChange={(event) => {
            const formFactor = event.target.value as DeviceTemplate['formFactor'];
            setDraft((prev) => {
              const sections =
                formFactor === 'RACK'
                  ? prev.sections
                  : prev.sections.map((section) => {
                      return section.ports > 24 ? { ...section, ports: 24 } : section;
                    });
              return { ...prev, formFactor, sections };
            });
          }}
          sx={{
            flexWrap: 'wrap',
            columnGap: 0.5,
            rowGap: 0,
            '& .MuiFormControlLabel-root': { mr: 0.75, ml: 0 },
            '& .MuiFormControlLabel-label': { fontSize: 11, fontWeight: 600 },
            '& .MuiRadio-root': { py: 0.25, px: 0.5 }
          }}
        >
          <FormControlLabel value="RACK" control={<Radio size="small" />} label="RACK" />
          <FormControlLabel value="DIN" control={<Radio size="small" />} label="DIN" />
          <FormControlLabel value="CUSTOM" control={<Radio size="small" />} label="Dowolna" />
        </RadioGroup>
      </FormControl>

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
        <FormLabel sx={{ fontSize: 11, mb: 0.5, fontWeight: 600 }}>
          Typ urządzenia
        </FormLabel>
        <RadioGroup
          row
          value={switchRole}
          onChange={(event) => {
            setDraft((prev) => ({
              ...prev,
              switchRole: event.target.value as DeviceTemplate['switchRole']
            }));
          }}
          sx={{
            flexWrap: 'wrap',
            columnGap: 0.5,
            '& .MuiFormControlLabel-root': { mr: 0.75, ml: 0 },
            '& .MuiFormControlLabel-label': { fontSize: 11, fontWeight: 600 },
            '& .MuiRadio-root': { py: 0.25, px: 0.5 }
          }}
        >
          {switchRoleOptions.map((role) => (
            <FormControlLabel
              key={role}
              value={role}
              control={<Radio size="small" />}
              label={SWITCH_ROLE_LABELS[role]}
            />
          ))}
        </RadioGroup>
      </FormControl>

      <Typography variant="caption" color="text.secondary">
        Porty RJ45: 1, 2, 3… (góra L→P, potem dół)
      </Typography>
    </Stack>
  );

  const sectionsInfo = (
    <Stack spacing={2}>

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
                          const sections = prev.sections.filter((item) => {
                            return item.id !== section.id;
                          });
                          const nextDraft = { ...prev, sections };
                          const validIds = new Set(
                            layoutDeviceTemplate(nextDraft).ports.map((p) => p.id)
                          );
                          const portPoe = Object.fromEntries(
                            Object.entries(prev.portPoe || {}).filter(([id]) =>
                              validIds.has(id)
                            )
                          );
                          return {
                            ...nextDraft,
                            portPoe: Object.keys(portPoe).length
                              ? portPoe
                              : undefined
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
    </Stack>
  );

  const rj45Ports = layout.ports.filter((p) => (p.media ?? 'RJ45') === 'RJ45');

  const poeInfo = (
    <Stack spacing={1.5}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap={1}
      >
        <Typography variant="subtitle2">PoE na portach (RJ45)</Typography>
        <Stack direction="row" spacing={0.5}>
          <Button size="small" onClick={() => setAllRj45Poe('NONE')}>
            Wyczyść
          </Button>
          <Button size="small" onClick={() => setAllRj45Poe('OUT')}>
            Wszystkie Out
          </Button>
          <Button size="small" onClick={() => setAllRj45Poe('IN')}>
            Wszystkie In
          </Button>
        </Stack>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        PoE Out — zasilanie urządzeń (AP, kamera). PoE In — port przyjmujący
        zasilanie.
      </Typography>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0.75
        }}
      >
        {rj45Ports.map((port) => {
          const value = draft.portPoe?.[port.id] || 'NONE';
          return (
            <FormControl key={port.id} size="small" sx={{ minWidth: 88 }}>
              <Select
                value={value}
                displayEmpty
                onChange={(event) => {
                  setPortPoe(
                    port.id,
                    event.target.value as 'IN' | 'OUT' | 'NONE'
                  );
                }}
                sx={{
                  fontSize: 11,
                  '& .MuiSelect-select': { py: 0.6, pr: 3 }
                }}
              >
                <MenuItem value="NONE">
                  {port.label || '?'} · —
                </MenuItem>
                <MenuItem value="OUT">
                  {port.label || '?'} · Out
                </MenuItem>
                <MenuItem value="IN">
                  {port.label || '?'} · In
                </MenuItem>
              </Select>
            </FormControl>
          );
        })}
      </Box>
      {rj45Ports.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          Brak portów RJ45 — dodaj sekcję RJ45 powyżej.
        </Typography>
      )}
    </Stack>
  );

  const formBody = isWorkshopMode ? (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
      <Stack spacing={3}>
        {basicInfo}
        <Divider />
        {poeInfo}
      </Stack>
      {sectionsInfo}
    </Box>
  ) : (
    <Stack spacing={2}>
      {!isWorkshopMode && previewContent}
      {basicInfo}
      <Divider />
      {sectionsInfo}
      <Divider />
      {poeInfo}
    </Stack>
  );

  const formContent = (
    <Stack spacing={2}>
      {formBody}

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
            {mode === 'edit' && onDelete && (
              <Button
                color="error"
                variant="outlined"
                startIcon={<DeleteIcon />}
                onClick={onDelete}
                sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
              >
                Usuń szablon
              </Button>
            )}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={onCancel}>Anuluj</Button>
              <Button
                variant="contained"
                disabled={!canSave}
                onClick={() => {
                  const validIds = new Set(layout.ports.map((p) => p.id));
                  const portPoe = Object.fromEntries(
                    Object.entries(draft.portPoe || {}).filter(([id]) =>
                      validIds.has(id)
                    )
                  );
                  onSave({
                    ...draft,
                    name: draft.name.trim(),
                    switchRole: draft.switchRole || 'SW',
                    portPoe: Object.keys(portPoe).length ? portPoe : undefined
                  });
                }}
              >
                {mode === 'edit' ? 'Zapisz zmiany' : 'Zapisz szablon'}
              </Button>
            </Stack>
          </Stack>
        </Stack>
  );

  if (isWorkshopMode) {
    return (
      <WorkshopLayout
        preview={previewContent}
        form={
          <Stack spacing={4}>
            <Stack spacing={1}>
              <Typography variant="h6">{title}</Typography>
              <Typography variant="body2" color="text.secondary">
                Zdefiniuj typ (SW / Router / Other), sekcje portów i PoE In/Out —
                podgląd aktualizuje się na żywo.
              </Typography>
            </Stack>
            {formContent}
          </Stack>
        }
      />
    );
  }

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
      <Section>{formContent}</Section>
    </ControlsContainer>
  );
};
