import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RouteOutlined from '@mui/icons-material/RouteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import {
  getShape2dPorts,
  isShape2dIcon,
  SHAPE_2D_PC_ID,
  type Shape2dPort
} from 'src/config';
import {
  findSharedVlanColor,
  getPortStatusColor,
  isVlan1,
  VLAN_1_COLOR,
  PORT_SPEED_OPTIONS,
  isDeviceTemplateId,
  parseDeviceColor,
  normalizeDeviceColorInput,
  setDeviceColorAlpha
} from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { useViewItem } from 'src/hooks/useViewItem';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useModelItem } from 'src/hooks/useModelItem';
import type { ModelItem } from 'src/types';
import { ColorPicker } from 'src/components/ColorSelector/ColorPicker';
import { ControlsContainer } from '../components/ControlsContainer';
import { DeleteButton } from '../components/DeleteButton';

interface Props {
  id: string;
}

type PortConfig = NonNullable<ModelItem['ports']>[string];

const defaultPortConfig = (): PortConfig => {
  return {
    label: '',
    name: '',
    vlan: '',
    vlanColor: '',
    type: 'access',
    speed: '1G'
  };
};

const fieldSx = {
  '& .MuiInputBase-root': { fontSize: 12 },
  '& .MuiInputLabel-root': { fontSize: 12 },
  '& .MuiInputBase-input': { py: 0.75 }
};

const portIface = (port: Shape2dPort, index: number) => {
  return port.label ?? `Gi0/${index}`;
};

type PortRowProps = {
  port: Shape2dPort;
  index: number;
  isExpanded: boolean;
  isPc: boolean;
  config: PortConfig;
  vlanColor: string;
  onToggle: (portId: string, expanded: boolean) => void;
  onUpdatePort: (portId: string, patch: Partial<PortConfig>) => void;
  onApplyVlanNumber: (portId: string, vlan: string) => void;
  onApplyVlanColor: (portId: string, color: string, vlan: string | undefined) => void;
  setPortRef: (portId: string, el: HTMLDivElement | null) => void;
};

/** Collapsed rows stay light — heavy form/ColorPicker mount only when expanded. */
const PortRow = memo(
  ({
    port,
    index,
    isExpanded,
    isPc,
    config,
    vlanColor,
    onToggle,
    onUpdatePort,
    onApplyVlanNumber,
    onApplyVlanColor,
    setPortRef
  }: PortRowProps) => {
    const iface = portIface(port, index);
    const subtitle = [
      config.label || null,
      isPc ? 'VLAN 1' : config.vlan ? `VLAN ${config.vlan}` : null,
      config.type === 'trunk' ? 'trunk' : null
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <Accordion
        disableGutters
        elevation={0}
        expanded={isExpanded}
        TransitionProps={{ unmountOnExit: true }}
        onChange={(_, expanded) => {
          onToggle(port.id, expanded);
        }}
        ref={(el: HTMLDivElement | null) => {
          setPortRef(port.id, el);
        }}
        sx={{
          border: '1px solid',
          borderColor: isExpanded ? 'primary.main' : 'divider',
          borderRadius: '4px !important',
          overflow: 'hidden',
          bgcolor: 'background.paper',
          '&:before': { display: 'none' }
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
          sx={{
            minHeight: 30,
            px: 1,
            '& .MuiAccordionSummary-content': {
              my: 0.4,
              alignItems: 'center',
              gap: 0.75,
              overflow: 'hidden'
            }
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              bgcolor: vlanColor ?? '#94a3b8',
              border: '1px solid rgba(0,0,0,0.12)'
            }}
          />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                lineHeight: 1.2
              }}
            >
              {iface}
            </Typography>
            {subtitle && (
              <Typography
                sx={{
                  fontSize: 10,
                  color: 'text.secondary',
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
        </AccordionSummary>
        {isExpanded && (
          <AccordionDetails sx={{ px: 1, pt: 0, pb: 1 }}>
            <Stack spacing={1}>
              <TextField
                label="Label"
                size="small"
                fullWidth
                sx={fieldSx}
                value={config.label ?? ''}
                onChange={(e) => {
                  onUpdatePort(port.id, { label: e.target.value });
                }}
              />
              <TextField
                label="Nazwa"
                size="small"
                fullWidth
                sx={fieldSx}
                placeholder={iface}
                value={config.name ?? ''}
                onChange={(e) => {
                  onUpdatePort(port.id, { name: e.target.value });
                }}
              />
              <Stack direction="row" spacing={0.75} alignItems="center">
                {isPc ? (
                  <TextField
                    label="VLAN"
                    size="small"
                    fullWidth
                    sx={fieldSx}
                    value="1"
                    disabled
                    helperText="PC nie taguje VLAN — zawsze VLAN 1"
                  />
                ) : (
                  <TextField
                    label="VLAN"
                    size="small"
                    fullWidth
                    sx={fieldSx}
                    value={config.vlan ?? ''}
                    onChange={(e) => {
                      onApplyVlanNumber(port.id, e.target.value);
                    }}
                  />
                )}
                {isPc ? (
                  <Box
                    title="VLAN 1 (PC)"
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '4px',
                      flexShrink: 0,
                      bgcolor: VLAN_1_COLOR,
                      border: '1px solid',
                      borderColor: 'divider'
                    }}
                  />
                ) : (
                  <Box
                    title={
                      config.vlan
                        ? `Kolor VLAN ${config.vlan}`
                        : 'Kolor VLAN'
                    }
                    sx={{
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      '& .MuiFormControl-root': {
                        m: 0
                      }
                    }}
                  >
                    <ColorPicker
                      value={vlanColor}
                      onChange={(color) => {
                        onApplyVlanColor(port.id, color, config.vlan);
                      }}
                    />
                  </Box>
                )}
              </Stack>
              <Stack direction="row" spacing={0.75}>
                <FormControl
                  size="small"
                  fullWidth
                  sx={fieldSx}
                  disabled={isPc}
                >
                  <InputLabel id={`port-type-${port.id}`}>Typ</InputLabel>
                  <Select
                    labelId={`port-type-${port.id}`}
                    label="Typ"
                    value={isPc ? 'access' : config.type ?? 'access'}
                    onChange={(e) => {
                      onUpdatePort(port.id, {
                        type: e.target.value as 'access' | 'trunk'
                      });
                    }}
                  >
                    <MenuItem value="access">Access</MenuItem>
                    {!isPc && <MenuItem value="trunk">Trunk</MenuItem>}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth sx={fieldSx}>
                  <InputLabel id={`port-speed-${port.id}`}>Speed</InputLabel>
                  <Select
                    labelId={`port-speed-${port.id}`}
                    label="Speed"
                    value={config.speed ?? '1G'}
                    onChange={(e) => {
                      onUpdatePort(port.id, { speed: e.target.value });
                    }}
                  >
                    {PORT_SPEED_OPTIONS.map((speed) => {
                      return (
                        <MenuItem key={speed} value={speed}>
                          {speed}
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              </Stack>
            </Stack>
          </AccordionDetails>
        )}
      </Accordion>
    );
  }
);

PortRow.displayName = 'PortRow';

export const NodeControls2d = ({ id }: Props) => {
  const {
    updateModelItem,
    setVlanColorAcrossModel,
    deleteViewItem,
    regenerateRoutesForItems,
    beginHistoryTransaction,
    endHistoryTransaction
  } = useScene();
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const focusedPortId = useUiStateStore((state) => {
    return state.focusedPortId;
  });
  const viewItem = useViewItem(id);
  const modelItem = useModelItem(id);
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const [portsOpen, setPortsOpen] = useState(true);
  const [expandedPortId, setExpandedPortId] = useState<string | null>(
    focusedPortId
  );
  const portRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const shapePorts = useMemo(() => {
    if (!isShape2dIcon(modelItem.icon)) return [];
    return getShape2dPorts(modelItem.icon ?? '');
  }, [modelItem.icon]);

  const isPc = modelItem.icon === SHAPE_2D_PC_ID;
  const canEditTemplate = isDeviceTemplateId(modelItem.icon);
  const deviceColor = parseDeviceColor(modelItem.color);

  const portSummaries = useMemo(() => {
    return shapePorts.map((port, index) => {
      const config = {
        ...defaultPortConfig(),
        ...(modelItem.ports?.[port.id] ?? {})
      };
      const vlanColor = getPortStatusColor(config.vlan, index, {
        isPc,
        customColor: config.vlanColor,
        modelItems
      });
      return { port, index, config, vlanColor };
    });
  }, [shapePorts, modelItem.ports, isPc, modelItems]);

  useEffect(() => {
    if (!focusedPortId) return;

    setPortsOpen(true);
    setExpandedPortId(focusedPortId);

    const el = portRefs.current[focusedPortId];
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }, [focusedPortId]);

  const updatePort = useCallback(
    (portId: string, patch: Partial<PortConfig>) => {
      const current = modelItem.ports?.[portId] ?? defaultPortConfig();
      updateModelItem(viewItem.id, {
        ports: {
          ...(modelItem.ports ?? {}),
          [portId]: {
            ...current,
            ...patch
          }
        }
      });
    },
    [modelItem.ports, updateModelItem, viewItem.id]
  );

  const applyVlanColor = useCallback(
    (portId: string, color: string, vlan: string | undefined) => {
      if (!isVlan1(vlan)) {
        setVlanColorAcrossModel(vlan ?? '', color);
        return;
      }

      updatePort(portId, { vlanColor: color });
    },
    [setVlanColorAcrossModel, updatePort]
  );

  const applyVlanNumber = useCallback(
    (portId: string, vlan: string) => {
      const current = modelItem.ports?.[portId] ?? defaultPortConfig();
      const shared = findSharedVlanColor(vlan, modelItems);
      const local = current.vlanColor?.trim() || '';
      const nextColor = isVlan1(vlan) ? '' : shared || local;

      beginHistoryTransaction();
      updatePort(portId, {
        vlan,
        vlanColor: nextColor
      });
      if (nextColor && !isVlan1(vlan)) {
        setVlanColorAcrossModel(vlan, nextColor);
      }
      endHistoryTransaction();
    },
    [
      beginHistoryTransaction,
      endHistoryTransaction,
      modelItem.ports,
      modelItems,
      setVlanColorAcrossModel,
      updatePort
    ]
  );

  const onTogglePort = useCallback(
    (portId: string, expanded: boolean) => {
      setExpandedPortId(expanded ? portId : null);
      uiStateActions.setFocusedPortId(expanded ? portId : null);
    },
    [uiStateActions]
  );

  const setPortRef = useCallback((portId: string, el: HTMLDivElement | null) => {
    portRefs.current[portId] = el;
  }, []);

  return (
    <ControlsContainer>
      <Box sx={{ px: 1.5, pt: 1.25, pb: 0.5 }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="flex-end"
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
              sx={fieldSx}
              value={modelItem.name}
              onChange={(e) => {
                const text = e.target.value;
                if (modelItem.name !== text) {
                  updateModelItem(viewItem.id, { name: text });
                }
              }}
            />
          </Box>
          <Box
            title="Kolor urządzenia (delikatny tint + przezroczystość)"
            sx={{
              flexShrink: 0,
              pb: 0.25,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.25,
              minWidth: 72,
              '& .MuiFormControl-root': { m: 0 }
            }}
          >
            <ColorPicker
              format="hex8"
              value={modelItem.color?.trim() || '#ffffff00'}
              onChange={(color) => {
                updateModelItem(viewItem.id, {
                  color: normalizeDeviceColorInput(color)
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
              {Math.round(deviceColor.alpha * 100)}%
            </Typography>
          </Box>
        </Stack>
        <Box sx={{ mt: 1 }}>
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
            min={0}
            max={100}
            value={Math.round(deviceColor.alpha * 100)}
            onChange={(_, value) => {
              const alpha = (Array.isArray(value) ? value[0] : value) / 100;
              updateModelItem(viewItem.id, {
                color: setDeviceColorAlpha(
                  deviceColor.hex || '#94a3b8',
                  alpha
                )
              });
            }}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${v}%`}
          />
        </Box>
      </Box>

      <Box sx={{ px: 1.5, pt: 0.5, pb: 1 }}>
        <Accordion
          disableGutters
          elevation={0}
          expanded={portsOpen}
          onChange={(_, expanded) => {
            setPortsOpen(expanded);
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
              minHeight: 32,
              '& .MuiAccordionSummary-content': { my: 0.25 }
            }}
          >
            <Typography
              sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}
            >
              PORTY ({shapePorts.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 0, pt: 0, pb: 0 }}>
            <Stack spacing={0.4}>
              {portSummaries.map(({ port, index, config, vlanColor }) => {
                return (
                  <PortRow
                    key={port.id}
                    port={port}
                    index={index}
                    isExpanded={expandedPortId === port.id}
                    isPc={isPc}
                    config={config}
                    vlanColor={vlanColor}
                    onToggle={onTogglePort}
                    onUpdatePort={updatePort}
                    onApplyVlanNumber={applyVlanNumber}
                    onApplyVlanColor={applyVlanColor}
                    setPortRef={setPortRef}
                  />
                );
              })}
            </Stack>
          </AccordionDetails>
        </Accordion>
      </Box>

      <Box sx={{ px: 1.5, pb: 1.5 }}>
        <Stack spacing={0.75}>
          {canEditTemplate && modelItem.icon && (
            <Button
              size="small"
              variant="outlined"
              fullWidth
              startIcon={<EditOutlined />}
              onClick={() => {
                uiStateActions.setItemControls({
                  type: 'EDIT_DEVICE_TEMPLATE',
                  templateId: modelItem.icon as string,
                  returnItemId: viewItem.id
                });
              }}
              sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
            >
              Edytuj szablon
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            fullWidth
            startIcon={<RouteOutlined />}
            onClick={() => {
              regenerateRoutesForItems([viewItem.id]);
            }}
            sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
          >
            Generuj nowe trasy
          </Button>
          <DeleteButton
            onClick={() => {
              uiStateActions.setFocusedPortId(null);
              uiStateActions.clearSelectedItemIds();
              deleteViewItem(viewItem.id);
            }}
          />
        </Stack>
      </Box>
    </ControlsContainer>
  );
};
