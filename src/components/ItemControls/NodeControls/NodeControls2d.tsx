import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
  IconButton
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RouteOutlined from '@mui/icons-material/RouteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import {
  getModelItemPorts,
  isShape2dIcon,
  SHAPE_2D_PC_ID,
  SHAPE_2D_CAMERA_ID,
  SHAPE_2D_CAMERA_V2_ID,
  SHAPE_2D_PRINTER_ID,
  SHAPE_2D_VOIP_ID,
  SHAPE_2D_SMARTPHONE_ID,
  SHAPE_2D_IOT_ID,
  SHAPE_2D_AP_ID,
  SHAPE_2D_NAS_ID,
  SHAPE_2D_TABLET_ID,
  SHAPE_2D_CABINET_ID,
  SHAPE_2D_BLANKING_ID,
  SHAPE_2D_PATCH_PANEL_ID,
  CABINET_DEFAULT_UNITS,
  CABINET_MIN_UNITS,
  CABINET_MAX_UNITS,
  BLANKING_DEFAULT_UNITS,
  BLANKING_MIN_UNITS,
  BLANKING_MAX_UNITS,
  PATCH_PANEL_DEFAULT_PORTS,
  PATCH_PANEL_MIN_PORTS,
  PATCH_PANEL_MAX_PORTS,
  clampPatchPanelPorts,
  NODE_LABEL_SCALE_MIN,
  NODE_LABEL_SCALE_MAX,
  NODE_LABEL_SCALE_STEP,
  clampNodeLabelScale,
  type Shape2dPort
} from 'src/config';
import {
  getPortStatusColor,
  isVlan1,
  TRUNK_RAINBOW_CSS,
  PORT_SPEED_OPTIONS,
  parseDeviceColor,
  normalizeDeviceColorInput,
  setDeviceColorAlpha,
  getValidPatchPanelPortIds,
  isPatchPanelMounted,
  isDeviceTemplateId,
  generateId,
  getMountedChildren,
  getCabinetSlotTile,
  collectOccupiedRackUnits,
  isFullWidthRackItem,
  getVlanIpHint,
  findSwitchAccessUplinkForPort,
  type SwitchAccessUplink,
  supportsConnectorTools,
  DESCRIPTION_SUMMARY_MAX,
  clampDescriptionSummary,
  hasNodeDescription,
  hasNodeDescriptionBadge,
  hasNodeDescriptionNotes
} from 'src/utils';
import {
  DeviceTypeIcon,
  NODE_ICON_OPTIONS,
  resolveDeviceTypeIconKind,
  type NodeIconKind
} from 'src/components/Icons/DeviceTypeIcon';
import { useScene } from 'src/hooks/useScene';
import { useViewItem } from 'src/hooks/useViewItem';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useModelItem } from 'src/hooks/useModelItem';
import type { ModelItem } from 'src/types';
import { ColorPicker } from 'src/components/ColorSelector/ColorPicker';
import { VlanCatalogPicker } from 'src/components/VlanCatalogPicker/VlanCatalogPicker';
import { MarkdownEditor } from 'src/components/MarkdownEditor/MarkdownEditor';
import { ControlsContainer } from '../components/ControlsContainer';
import { DeleteButton } from '../components/DeleteButton';

type SidebarSection = 'personalizacja' | 'ustawienia' | 'opis';

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

/** Scroll only inside the item-controls sidebar — never the page/canvas. */
const scrollSidebarTo = (el: HTMLElement | null | undefined) => {
  if (!el) return;

  const parent =
    (el.closest('[data-item-controls-scroll]') as HTMLElement | null) ??
    (() => {
      let node: HTMLElement | null = el.parentElement;
      while (node) {
        const { overflowY } = window.getComputedStyle(node);
        if (
          (overflowY === 'auto' ||
            overflowY === 'scroll' ||
            overflowY === 'overlay') &&
          node.scrollHeight > node.clientHeight + 1
        ) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    })();

  if (!parent) return;

  // Leave room under any sticky bars still inside the scroll pane (e.g. tabs).
  let stickyPad = 10;
  parent.querySelectorAll<HTMLElement>('[data-item-controls-sticky]').forEach(
    (sticky) => {
      stickyPad = Math.max(stickyPad, sticky.offsetHeight + 8);
    }
  );

  const parentRect = parent.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const nextTop =
    parent.scrollTop + (elRect.top - parentRect.top) - stickyPad;
  parent.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
};

const fieldSx = {
  '& .MuiInputBase-root': { fontSize: 12 },
  '& .MuiInputLabel-root': { fontSize: 12 },
  '& .MuiInputBase-input': { py: 0.75 }
};

const portIface = (_port: Shape2dPort, index: number) => {
  return String(index + 1);
};

type PortRowProps = {
  port: Shape2dPort;
  index: number;
  isExpanded: boolean;
  isSelected: boolean;
  isPc: boolean;
  config: PortConfig;
  vlanColor: string;
  isTrunk: boolean;
  /** For endpoint nodes: VLAN inherited from peer switch access port. */
  accessUplink: SwitchAccessUplink | null;
  onToggle: (portId: string, expanded: boolean, additive: boolean) => void;
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
    isSelected,
    isPc,
    config,
    vlanColor,
    isTrunk,
    accessUplink,
    onToggle,
    onUpdatePort,
    onApplyVlanNumber,
    onApplyVlanColor,
    setPortRef
  }: PortRowProps) => {
    const iface = portIface(port, index);
    const subtitle = (() => {
      if (isPc) {
        // Access / VLAN shown once in the summary card below — not as a second line.
        return config.label?.trim() || '';
      }
      const parts: string[] = [];
      if (config.label) parts.push(config.label);
      if (config.vlan) parts.push(`VLAN ${config.vlan}`);
      if (config.type === 'trunk') parts.push('trunk');
      return parts.join(' · ');
    })();

    const accessSummary = isPc ? (
      <Box
        sx={{
          px: 1,
          py: 0.55,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'action.hover',
          minWidth: 0,
          flex: 1
        }}
      >
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.25
          }}
        >
          {accessUplink?.isTrunk
            ? 'Access · port switcha jest trunk'
            : accessUplink
              ? `Access · VLAN ${accessUplink.vlan}`
              : 'Access · brak połączenia ze switchem'}
        </Typography>
        {accessUplink ? (
          <Typography
            sx={{
              fontSize: 11,
              color: 'text.secondary',
              lineHeight: 1.25,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
            title={`${accessUplink.switchName} · port ${accessUplink.switchPortLabel}`}
          >
            {accessUplink.switchName} · port {accessUplink.switchPortLabel}
          </Typography>
        ) : (
          <Typography
            sx={{
              fontSize: 11,
              color: 'text.secondary',
              lineHeight: 1.25
            }}
          >
            VLAN dziedziczony z portu access switcha
          </Typography>
        )}
      </Box>
    ) : null;

    return (
      <Accordion
        disableGutters
        elevation={0}
        expanded={isExpanded}
        TransitionProps={{ unmountOnExit: true }}
        onChange={() => {
          // Expansion is driven by summary onClick (supports Ctrl multi-select).
        }}
        ref={(el: HTMLDivElement | null) => {
          setPortRef(port.id, el);
        }}
        sx={{
          border: '1px solid',
          borderColor: isSelected || isExpanded ? 'primary.main' : 'divider',
          borderRadius: '4px !important',
          overflow: 'hidden',
          bgcolor: isSelected ? 'action.selected' : 'background.paper',
          '&:before': { display: 'none' }
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const additive = e.ctrlKey || e.metaKey;
            if (additive) {
              onToggle(port.id, false, true);
              return;
            }
            onToggle(port.id, !isExpanded, false);
          }}
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
              bgcolor: isTrunk ? undefined : vlanColor ?? '#94a3b8',
              background: isTrunk ? TRUNK_RAINBOW_CSS : undefined,
              border: '1px solid rgba(0,0,0,0.12)'
            }}
          />
          {isPc ? (
            <>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, monospace',
                  lineHeight: 1.2,
                  flexShrink: 0
                }}
              >
                {iface}
              </Typography>
              {accessSummary}
            </>
          ) : (
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
          )}
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
              {!isPc && (
                <Stack direction="row" spacing={0.75} alignItems="flex-start">
                  <VlanCatalogPicker
                    value={config.vlan ?? ''}
                    onChange={(vlan) => {
                      onApplyVlanNumber(port.id, vlan);
                    }}
                  />
                  <Box
                    title={
                      config.vlan
                        ? `Kolor VLAN ${config.vlan}`
                        : 'Kolor VLAN'
                    }
                    sx={{
                      flexShrink: 0,
                      mt: 0.5,
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
                </Stack>
              )}
              <Stack direction="row" spacing={0.75}>
                {!isPc && (
                  <FormControl
                    size="small"
                    fullWidth
                    sx={fieldSx}
                  >
                    <InputLabel id={`port-type-${port.id}`}>Typ</InputLabel>
                    <Select
                      labelId={`port-type-${port.id}`}
                      label="Typ"
                      value={config.type ?? 'access'}
                      onChange={(e) => {
                        onUpdatePort(port.id, {
                          type: e.target.value as 'access' | 'trunk'
                        });
                      }}
                    >
                      <MenuItem value="access">Access</MenuItem>
                      <MenuItem value="trunk">Trunk</MenuItem>
                    </Select>
                  </FormControl>
                )}
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
    updateViewItem,
    setVlanColorAcrossModel,
    deleteViewItem,
    deleteConnector,
    regenerateRoutesForItems,
    beginHistoryTransaction,
    endHistoryTransaction,
    items: viewItems,
    connectors
  } = useScene();
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const focusedPortIds = useUiStateStore((state) => {
    return state.focusedPortIds;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  // 2D v3 keeps nodes + ports only — no cable routing tools.
  const hasConnectorTools = supportsConnectorTools(projectionMode);
  const viewItem = useViewItem(id);
  const modelItem = useModelItem(id);
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const [expandedPortId, setExpandedPortId] = useState<string | null>(
    focusedPortIds.length === 1 ? focusedPortIds[0] : null
  );
  const [expandedSviId, setExpandedSviId] = useState<string | null>(null);
  const portRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const multiPanelRef = useRef<HTMLDivElement | null>(null);

  const shapePorts = useMemo(() => {
    if (!isShape2dIcon(modelItem.icon)) return [];
    return getModelItemPorts(modelItem);
  }, [modelItem]);

  const applyBlankingUnits = useCallback(
    (next: number) => {
      const units = Math.min(
        BLANKING_MAX_UNITS,
        Math.max(BLANKING_MIN_UNITS, Math.round(next))
      );
      beginHistoryTransaction();
      updateModelItem(viewItem.id, { rackUnits: units });
      if (viewItem.parentId != null && viewItem.rackUnit !== undefined) {
        const cabinet = viewItems.find((item) => {
          return item.id === viewItem.parentId;
        });
        const cabinetModel = cabinet
          ? modelItems.find((item) => {
              return item.id === cabinet.id;
            })
          : undefined;
        if (cabinet && cabinetModel) {
          const occupied = collectOccupiedRackUnits({
            cabinetId: cabinet.id,
            viewItems,
            modelItems,
            excludeItemIds: [viewItem.id]
          });
          const cabUnits = cabinetModel.rackUnits ?? CABINET_DEFAULT_UNITS;
          let fits = viewItem.rackUnit + units <= cabUnits;
          for (let i = 0; i < units && fits; i += 1) {
            if (occupied.has(viewItem.rackUnit + i)) fits = false;
          }
          if (!fits) {
            updateViewItem(viewItem.id, {
              parentId: undefined,
              rackUnit: undefined
            });
          }
        }
      }
      endHistoryTransaction();
    },
    [
      beginHistoryTransaction,
      endHistoryTransaction,
      modelItems,
      updateModelItem,
      updateViewItem,
      viewItem.id,
      viewItem.parentId,
      viewItem.rackUnit,
      viewItems
    ]
  );

  const applyPatchPanelPorts = useCallback(
    (next: number) => {
      const count = clampPatchPanelPorts(next);
      const validIds = getValidPatchPanelPortIds(count);
      beginHistoryTransaction();
      updateModelItem(viewItem.id, { portCount: count });
      connectors.forEach((connector) => {
        const usesRemoved = connector.anchors.some((anchor) => {
          return (
            anchor.ref.item === viewItem.id &&
            Boolean(anchor.ref.port) &&
            !validIds.has(anchor.ref.port!)
          );
        });
        if (usesRemoved) {
          deleteConnector(connector.id);
        }
      });
      endHistoryTransaction();
    },
    [
      beginHistoryTransaction,
      connectors,
      deleteConnector,
      endHistoryTransaction,
      updateModelItem,
      viewItem.id
    ]
  );

  const isPc =
    modelItem.icon === SHAPE_2D_PC_ID ||
    modelItem.icon === SHAPE_2D_CAMERA_ID ||
    modelItem.icon === SHAPE_2D_CAMERA_V2_ID ||
    modelItem.icon === SHAPE_2D_PRINTER_ID ||
    modelItem.icon === SHAPE_2D_VOIP_ID ||
    modelItem.icon === SHAPE_2D_SMARTPHONE_ID ||
    modelItem.icon === SHAPE_2D_IOT_ID ||
    modelItem.icon === SHAPE_2D_AP_ID ||
    modelItem.icon === SHAPE_2D_NAS_ID ||
    modelItem.icon === SHAPE_2D_TABLET_ID;
  const isCabinet = modelItem.icon === SHAPE_2D_CABINET_ID;
  const isBlanking = modelItem.icon === SHAPE_2D_BLANKING_ID;
  const isPatchPanel = modelItem.icon === SHAPE_2D_PATCH_PANEL_ID;
  const isPatchPanelActive = isPatchPanel && isPatchPanelMounted(viewItem);
  const isSwitch =
    !isPc &&
    !isCabinet &&
    !isBlanking &&
    !isPatchPanel &&
    isShape2dIcon(modelItem.icon);
  const canEditTemplate = isDeviceTemplateId(modelItem.icon);
  const deviceTemplate = useModelStore((state) => {
    if (!modelItem.icon) return null;
    return (
      (state.deviceTemplates ?? []).find((t) => t.id === modelItem.icon) ?? null
    );
  });
  const isServerTemplate =
    deviceTemplate?.kind === 'SERVER' || deviceTemplate?.kind === 'SERVER_V2';
  const isDinSwitch =
    isSwitch && deviceTemplate?.formFactor === 'DIN';
  /** Management IP — DIN switches + endpoint / server nodes. */
  const showIpField = isPc || isDinSwitch || isServerTemplate;
  const deviceColor = parseDeviceColor(modelItem.color);
  const [sidebarTab, setSidebarTab] = useState<SidebarSection | null>(
    'personalizacja'
  );
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const showPortsSection = !isCabinet && !isBlanking && !isPatchPanel;
  const showVlanySection = isSwitch;
  const showUstawieniaSection =
    isPc || showIpField || showPortsSection || showVlanySection;
  const svis = modelItem.svis ?? [];
  const rackUnits = isBlanking
    ? modelItem.rackUnits ?? BLANKING_DEFAULT_UNITS
    : modelItem.rackUnits ?? CABINET_DEFAULT_UNITS;
  const patchPortCount =
    modelItem.portCount ?? PATCH_PANEL_DEFAULT_PORTS;
  const multiPort = focusedPortIds.length > 1;
  const hasDescription = hasNodeDescription(modelItem);
  const hasBadge = hasNodeDescriptionBadge(modelItem);
  const hasNotes = hasNodeDescriptionNotes(modelItem);

  const vlanIpHint = useMemo(() => {
    if (!isPc) return { kind: 'none' as const };
    return getVlanIpHint({
      itemId: viewItem.id,
      modelItem,
      modelItems,
      connectors
    });
  }, [isPc, viewItem.id, modelItem, modelItems, connectors]);

  const portSummaries = useMemo(() => {
    return shapePorts.map((port, index) => {
      const config = {
        ...defaultPortConfig(),
        ...(modelItem.ports?.[port.id] ?? {})
      };
      const accessUplink = isPc
        ? findSwitchAccessUplinkForPort({
            itemId: viewItem.id,
            portId: port.id,
            connectors,
            modelItems
          })
        : null;
      const isTrunk = !isPc && config.type === 'trunk';
      const displayVlan = isPc
        ? accessUplink && !accessUplink.isTrunk
          ? accessUplink.vlan
          : undefined
        : config.vlan;
      const vlanColor = getPortStatusColor(displayVlan, index, {
        isPc: isPc && !(accessUplink && !accessUplink.isTrunk),
        customColor: isPc
          ? accessUplink?.vlanColorCustom
          : config.vlanColor,
        modelItems,
        portType:
          isTrunk || accessUplink?.isTrunk ? 'trunk' : 'access'
      });
      return { port, index, config, vlanColor, isTrunk, accessUplink };
    });
  }, [
    shapePorts,
    modelItem.ports,
    isPc,
    modelItems,
    connectors,
    viewItem.id
  ]);

  const multiPortDraft = useMemo(() => {
    if (!multiPort) {
      return {
        name: '',
        vlan: '',
        type: 'access' as 'access' | 'trunk',
        mixedName: false,
        mixedVlan: false,
        mixedType: false
      };
    }
    const configs = focusedPortIds.map((portId) => {
      return {
        ...defaultPortConfig(),
        ...(modelItem.ports?.[portId] ?? {})
      };
    });
    const names = configs.map((c) => {
      return c.name ?? '';
    });
    const vlans = configs.map((c) => {
      return c.vlan ?? '';
    });
    const types = configs.map((c) => {
      return (c.type ?? 'access') as 'access' | 'trunk';
    });
    const mixedName = names.some((n) => {
      return n !== names[0];
    });
    const mixedVlan = vlans.some((v) => {
      return v !== vlans[0];
    });
    const mixedType = types.some((t) => {
      return t !== types[0];
    });
    return {
      name: mixedName ? '' : names[0],
      vlan: mixedVlan ? '' : vlans[0],
      type: mixedType ? 'access' : types[0],
      mixedName,
      mixedVlan,
      mixedType
    };
  }, [multiPort, focusedPortIds, modelItem.ports]);

  // Reset section when switching to another device.
  useEffect(() => {
    setSidebarTab('personalizacja');
    setExpandedSviId(null);
  }, [viewItem.id]);

  useEffect(() => {
    if (focusedPortIds.length === 0) return;
    if (!showPortsSection) return;

    setSidebarTab('ustawienia');

    if (focusedPortIds.length === 1) {
      const portId = focusedPortIds[0];
      setExpandedPortId(portId);
      // Wait for accordion expand + details mount before scrolling.
      const timer = window.setTimeout(() => {
        scrollSidebarTo(portRefs.current[portId]);
      }, 180);
      return () => {
        window.clearTimeout(timer);
      };
    }

    // Multi-select: keep rows collapsed, show group panel, scroll to it.
    setExpandedPortId(null);
    const timer = window.setTimeout(() => {
      scrollSidebarTo(multiPanelRef.current);
    }, 80);
    return () => {
      window.clearTimeout(timer);
    };
  }, [focusedPortIds, showPortsSection]);

  // Keep ustawienia available even when some sub-blocks are missing.
  useEffect(() => {
    if (sidebarTab === 'ustawienia' && !showUstawieniaSection) {
      setSidebarTab('personalizacja');
    }
  }, [showUstawieniaSection, sidebarTab]);

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

  const updatePorts = useCallback(
    (portIds: string[], patch: Partial<PortConfig>) => {
      if (portIds.length === 0) return;
      const nextPorts = { ...(modelItem.ports ?? {}) };
      portIds.forEach((portId) => {
        const current = nextPorts[portId] ?? defaultPortConfig();
        nextPorts[portId] = { ...current, ...patch };
      });
      updateModelItem(viewItem.id, { ports: nextPorts });
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
      beginHistoryTransaction();
      // Color is derived from VLAN id globally — do not persist per-port overrides.
      updatePort(portId, {
        vlan,
        vlanColor: ''
      });
      endHistoryTransaction();
    },
    [beginHistoryTransaction, endHistoryTransaction, updatePort]
  );

  const applyVlanNumberMulti = useCallback(
    (vlan: string) => {
      beginHistoryTransaction();
      updatePorts(focusedPortIds, {
        vlan,
        vlanColor: ''
      });
      endHistoryTransaction();
    },
    [
      beginHistoryTransaction,
      endHistoryTransaction,
      focusedPortIds,
      updatePorts
    ]
  );

  const onTogglePort = useCallback(
    (portId: string, expanded: boolean, additive: boolean) => {
      if (additive) {
        uiStateActions.toggleFocusedPortId(portId);
        setExpandedPortId(null);
        return;
      }
      setExpandedPortId(expanded ? portId : null);
      uiStateActions.setFocusedPortId(expanded ? portId : null);
    },
    [uiStateActions]
  );

  const setPortRef = useCallback((portId: string, el: HTMLDivElement | null) => {
    portRefs.current[portId] = el;
  }, []);

  const updateSvi = useCallback(
    (sviId: string, patch: Partial<NonNullable<ModelItem['svis']>[number]>) => {
      const next = (modelItem.svis ?? []).map((svi) => {
        if (svi.id !== sviId) return svi;
        return { ...svi, ...patch };
      });
      updateModelItem(viewItem.id, { svis: next });
    },
    [modelItem.svis, updateModelItem, viewItem.id]
  );

  const addSvi = useCallback(() => {
    const next = [
      ...(modelItem.svis ?? []),
      {
        id: generateId(),
        vlan: '1',
        ip: '',
        vlanColor: ''
      }
    ];
    const newId = next[next.length - 1]?.id ?? null;
    updateModelItem(viewItem.id, { svis: next });
    setSidebarTab('ustawienia');
    setExpandedSviId(newId);
  }, [modelItem.svis, updateModelItem, viewItem.id]);

  const removeSvi = useCallback(
    (sviId: string) => {
      updateModelItem(viewItem.id, {
        svis: (modelItem.svis ?? []).filter((svi) => {
          return svi.id !== sviId;
        })
      });
    },
    [modelItem.svis, updateModelItem, viewItem.id]
  );

  const applySviVlan = useCallback(
    (sviId: string, vlan: string) => {
      beginHistoryTransaction();
      updateSvi(sviId, { vlan, vlanColor: '' });
      endHistoryTransaction();
    },
    [beginHistoryTransaction, endHistoryTransaction, updateSvi]
  );

  const toggleSection = useCallback((section: SidebarSection) => {
    setSidebarTab((prev) => (prev === section ? null : section));
  }, []);

  const sectionTabs: { id: SidebarSection; label: string; show: boolean }[] = [
    { id: 'personalizacja', label: 'Personalizacja', show: true },
    {
      id: 'ustawienia',
      label: 'Ustawienia',
      show: showUstawieniaSection
    },
    {
      id: 'opis',
      label: hasDescription ? 'Opis' : 'Opis (pusty)',
      show: true
    }
  ];

  return (
    <ControlsContainer>
      <Box
        data-item-controls-sticky
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0,
          px: 0.75,
          pt: 0.5,
          bgcolor: 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid',
          borderColor: 'rgba(148, 163, 184, 0.28)'
        }}
      >
        {sectionTabs
          .filter((tab) => tab.show)
          .map((tab) => {
            const active = sidebarTab === tab.id;
            return (
              <Button
                key={tab.id}
                size="small"
                disableElevation
                onClick={() => toggleSection(tab.id)}
                sx={{
                  flex: '0 1 auto',
                  minWidth: 0,
                  textTransform: 'none',
                  fontWeight: active ? 700 : 550,
                  fontSize: 12.5,
                  letterSpacing: 0.01,
                  px: 1.35,
                  py: 0.85,
                  borderRadius: 0,
                  color: active ? 'primary.main' : 'text.secondary',
                  bgcolor: 'transparent',
                  boxShadow: 'none',
                  borderBottom: '2px solid',
                  borderColor: active ? 'primary.main' : 'transparent',
                  mb: '-1px',
                  '&:hover': {
                    bgcolor: 'rgba(15, 23, 42, 0.04)',
                    color: active ? 'primary.main' : 'text.primary'
                  }
                }}
              >
                {tab.label}
              </Button>
            );
          })}
      </Box>

      <Box sx={{ px: 1.5, pt: 1, pb: 0.5 }}>
        {sidebarTab === 'personalizacja' && (
          <Stack spacing={1.25}>
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
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <DeviceTypeIcon
                    iconId={modelItem.icon}
                    sx={{ fontSize: 22, color: 'text.secondary', flexShrink: 0 }}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    sx={fieldSx}
                    value={modelItem.name}
                    disabled={isPatchPanel}
                    onChange={(e) => {
                      const text = e.target.value;
                      if (modelItem.name !== text) {
                        updateModelItem(viewItem.id, { name: text });
                      }
                    }}
                  />
                </Stack>
              </Box>
              {!isPatchPanel && (
                <Box
                  title={
                    isCabinet
                      ? 'Kolor szafy (tint + przezroczystość)'
                      : isBlanking
                        ? 'Kolor zaślepki (tint + przezroczystość)'
                        : 'Kolor urządzenia (delikatny tint + przezroczystość)'
                  }
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
              )}
            </Stack>

            {!isPatchPanel && (
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
                  min={0}
                  max={100}
                  value={Math.round(deviceColor.alpha * 100)}
                  onChange={(_, value) => {
                    const alpha =
                      (Array.isArray(value) ? value[0] : value) / 100;
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
            )}

        {isPc && (
          <Box>
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.6,
                color: 'text.secondary',
                textTransform: 'uppercase',
                mb: 0.75
              }}
            >
              Ikona
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
                gap: 0.75
              }}
            >
              {(() => {
                const fromShape = resolveDeviceTypeIconKind(modelItem.icon);
                const activeKind: NodeIconKind =
                  modelItem.nodeIcon ??
                  (NODE_ICON_OPTIONS.some((o) => o.kind === fromShape)
                    ? (fromShape as NodeIconKind)
                    : 'pc');
                return NODE_ICON_OPTIONS.map((opt) => {
                  const selected = activeKind === opt.kind;
                  return (
                    <Box
                      key={opt.kind}
                      component="button"
                      type="button"
                      title={opt.label}
                      onClick={() => {
                        updateModelItem(viewItem.id, { nodeIcon: opt.kind });
                      }}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        aspectRatio: '1',
                        p: 0,
                        m: 0,
                        cursor: 'pointer',
                        borderRadius: 1,
                        border: '1.5px solid',
                        borderColor: selected ? 'primary.main' : 'divider',
                        bgcolor: selected
                          ? 'action.selected'
                          : 'background.paper',
                        color: selected ? 'primary.main' : 'text.secondary',
                        transition:
                          'border-color 0.12s ease, background 0.12s ease',
                        '&:hover': {
                          borderColor: 'primary.main',
                          bgcolor: 'action.hover'
                        }
                      }}
                    >
                      <DeviceTypeIcon kind={opt.kind} sx={{ fontSize: 22 }} />
                    </Box>
                  );
                });
              })()}
            </Box>
          </Box>
        )}
        {isPatchPanel && !isPatchPanelActive && (
          <Alert severity="info" sx={{ py: 0, fontSize: 12 }}>
            Umieść patch panel w szafie, aby włączyć porty i połączenia.
          </Alert>
        )}
        {isCabinet && (
          <Box>
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.4,
                color: 'text.secondary',
                textTransform: 'uppercase',
                mb: 0.5
              }}
            >
              Wysokość (U)
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Slider
                size="small"
                min={CABINET_MIN_UNITS}
                max={CABINET_MAX_UNITS}
                value={rackUnits}
                onChange={(_, value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  beginHistoryTransaction();
                  updateModelItem(viewItem.id, { rackUnits: next });
                  getMountedChildren(viewItem.id, viewItems).forEach((child) => {
                    if (
                      child.rackUnit !== undefined &&
                      child.rackUnit >= next
                    ) {
                      updateViewItem(child.id, {
                        parentId: undefined,
                        rackUnit: undefined
                      });
                    } else if (child.rackUnit !== undefined) {
                      const childModel = modelItems.find((candidate) => {
                        return candidate.id === child.id;
                      });
                      updateViewItem(child.id, {
                        tile: getCabinetSlotTile(
                          viewItem.tile,
                          child.rackUnit,
                          {
                            fullWidth: isFullWidthRackItem(childModel ?? {})
                          }
                        )
                      });
                    }
                  });
                  endHistoryTransaction();
                }}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}U`}
              />
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  minWidth: 36,
                  textAlign: 'right'
                }}
              >
                {rackUnits}U
              </Typography>
            </Stack>
          </Box>
        )}
        {isBlanking && (
          <Box>
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.4,
                color: 'text.secondary',
                textTransform: 'uppercase',
                mb: 0.5
              }}
            >
              Wysokość (U)
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                size="small"
                type="number"
                inputProps={{
                  min: BLANKING_MIN_UNITS,
                  max: BLANKING_MAX_UNITS,
                  step: 1
                }}
                value={rackUnits}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (!Number.isFinite(raw)) return;
                  applyBlankingUnits(raw);
                }}
                sx={{
                  width: 72,
                  ...fieldSx,
                  '& input': { textAlign: 'center', fontWeight: 700 }
                }}
              />
              <Slider
                size="small"
                min={BLANKING_MIN_UNITS}
                max={BLANKING_MAX_UNITS}
                value={rackUnits}
                onChange={(_, value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  applyBlankingUnits(next);
                }}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}U`}
                sx={{ flex: 1 }}
              />
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  minWidth: 28,
                  textAlign: 'right'
                }}
              >
                U
              </Typography>
            </Stack>
          </Box>
        )}
        {isPatchPanel && (
          <Box>
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.4,
                color: 'text.secondary',
                textTransform: 'uppercase',
                mb: 0.5
              }}
            >
              Liczba portów
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                size="small"
                type="number"
                inputProps={{
                  min: PATCH_PANEL_MIN_PORTS,
                  max: PATCH_PANEL_MAX_PORTS,
                  step: 1
                }}
                value={patchPortCount}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (!Number.isFinite(raw)) return;
                  applyPatchPanelPorts(raw);
                }}
                sx={{
                  width: 72,
                  ...fieldSx,
                  '& input': { textAlign: 'center', fontWeight: 700 }
                }}
              />
              <Slider
                size="small"
                min={PATCH_PANEL_MIN_PORTS}
                max={PATCH_PANEL_MAX_PORTS}
                step={1}
                value={patchPortCount}
                onChange={(_, value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  applyPatchPanelPorts(next);
                }}
                valueLabelDisplay="auto"
                sx={{ flex: 1 }}
              />
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  minWidth: 36,
                  textAlign: 'right'
                }}
              >
                {patchPortCount}
              </Typography>
            </Stack>
            <Typography
              sx={{
                mt: 0.75,
                fontSize: 11,
                color: 'text.secondary',
                lineHeight: 1.35
              }}
            >
              Każdy port łączy dwa przewody (bridge). Po zaznaczeniu portu
              podświetlane są tylko węzeł początkowy i końcowy.
            </Typography>
          </Box>
        )}
          </Stack>
        )}

        {sidebarTab === 'ustawienia' && showUstawieniaSection && (
          <Stack spacing={1.75}>
            {isPc && (
              <Box>
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.55,
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  mb: 0.75
                }}
              >
                PoE
              </Typography>
                <FormControlLabel
                  sx={{ m: 0 }}
                  control={
                    <Switch
                      size="small"
                      checked={Boolean(modelItem.poweredByPoe)}
                      onChange={(e) => {
                        updateModelItem(viewItem.id, {
                          poweredByPoe: e.target.checked
                        });
                      }}
                    />
                  }
                  label={
                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                      Urządzenie zasilane PoE
                    </Typography>
                  }
                />
              </Box>
            )}

            {showIpField && (
              <Box>
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.55,
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  mb: 0.75
                }}
              >
                Adresacja
              </Typography>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ mb: 0.5 }}
                >
                  <Typography
                    sx={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 0.6,
                      color: 'text.secondary',
                      textTransform: 'uppercase'
                    }}
                  >
                    IP
                  </Typography>
                  <FormControlLabel
                    sx={{ m: 0, ml: 1 }}
                    control={
                      <Switch
                        size="small"
                        checked={Boolean(modelItem.dhcp)}
                        onChange={(e) => {
                          updateModelItem(viewItem.id, {
                            dhcp: e.target.checked || undefined
                          });
                        }}
                      />
                    }
                    label={
                      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                        DHCP
                      </Typography>
                    }
                  />
                </Stack>
                <TextField
                  fullWidth
                  size="small"
                  sx={fieldSx}
                  placeholder={
                    vlanIpHint.kind === 'suggestion'
                      ? vlanIpHint.placeholder
                      : 'np. 192.168.1.10/24'
                  }
                  value={modelItem.ip ?? ''}
                  disabled={Boolean(modelItem.dhcp)}
                  onChange={(e) => {
                    const next = e.target.value;
                    updateModelItem(viewItem.id, {
                      ip: next.trim() ? next : undefined
                    });
                  }}
                  helperText={
                    modelItem.dhcp
                      ? undefined
                      : modelItem.ip?.trim()
                        ? undefined
                        : vlanIpHint.kind === 'suggestion'
                          ? `Podpowiedź z VLAN: ${vlanIpHint.placeholder}`
                          : vlanIpHint.kind === 'ambiguous'
                            ? 'W tym VLAN są różne sieci IP — brak jednoznacznej podpowiedzi'
                            : undefined
                  }
                  FormHelperTextProps={{
                    sx:
                      !modelItem.ip?.trim() && vlanIpHint.kind === 'ambiguous'
                        ? { color: 'warning.main', fontWeight: 600 }
                        : undefined
                  }}
                />
              </Box>
            )}

            {showPortsSection && (
              <Box>
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.55,
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  mb: 0.75
                }}
              >
                Porty
              </Typography>
                <>
                {multiPort && (
                  <Box
                    ref={multiPanelRef}
                    sx={{
                      mb: 1,
                      p: 1,
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'primary.main',
                      bgcolor: 'action.hover'
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 11,
                        fontWeight: 700,
                        mb: 0.75
                      }}
                    >
                      Zaznaczono {focusedPortIds.length} portów
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 10,
                        color: 'text.secondary',
                        mb: 1
                      }}
                    >
                      Ustawienia grupowe — Ctrl/Cmd+klik dodaje lub usuwa port.
                    </Typography>
                    <Stack spacing={1}>
                      <TextField
                        label="Nazwa"
                        size="small"
                        fullWidth
                        sx={fieldSx}
                        placeholder={
                          multiPortDraft.mixedName
                            ? '(różne wartości)'
                            : undefined
                        }
                        value={multiPortDraft.name}
                        onChange={(e) => {
                          updatePorts(focusedPortIds, {
                            name: e.target.value
                          });
                        }}
                      />
                      {!isPc && (
                        <VlanCatalogPicker
                          value={multiPortDraft.vlan}
                          onChange={(vlan) => {
                            applyVlanNumberMulti(vlan);
                          }}
                        />
                      )}
                      {!isPc && (
                        <FormControl size="small" fullWidth sx={fieldSx}>
                          <InputLabel id="multi-port-type">Typ</InputLabel>
                          <Select
                            labelId="multi-port-type"
                            label="Typ"
                            value={
                              multiPortDraft.mixedType
                                ? ''
                                : multiPortDraft.type
                            }
                            displayEmpty={multiPortDraft.mixedType}
                            onChange={(e) => {
                              const next = e.target.value as
                                | 'access'
                                | 'trunk';
                              if (!next) return;
                              updatePorts(focusedPortIds, { type: next });
                            }}
                          >
                            {multiPortDraft.mixedType && (
                              <MenuItem value="" disabled>
                                (różne wartości)
                              </MenuItem>
                            )}
                            <MenuItem value="access">Access</MenuItem>
                            <MenuItem value="trunk">Trunk</MenuItem>
                          </Select>
                        </FormControl>
                      )}
                    </Stack>
                  </Box>
                )}
              <Stack spacing={0.4}>
                    {portSummaries.map(
                      ({
                        port,
                        index,
                        config,
                        vlanColor,
                        isTrunk,
                        accessUplink
                      }) => {
                        return (
                          <PortRow
                            key={port.id}
                            port={port}
                            index={index}
                            isExpanded={
                              !multiPort && expandedPortId === port.id
                            }
                            isSelected={focusedPortIds.includes(port.id)}
                            isPc={isPc}
                            config={config}
                            vlanColor={vlanColor}
                            isTrunk={isTrunk}
                            accessUplink={accessUplink}
                            onToggle={onTogglePort}
                            onUpdatePort={updatePort}
                            onApplyVlanNumber={applyVlanNumber}
                            onApplyVlanColor={applyVlanColor}
                            setPortRef={setPortRef}
                          />
                        );
                      }
                    )}
                  </Stack>
              </>
              </Box>
            )}

            {showVlanySection && (
              <Box>
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.55,
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  mb: 0.75
                }}
              >
                Vlany / SVI
              </Typography>
                <Stack spacing={0.75}>
                <Button
                  size="small"
                  variant="outlined"
                  fullWidth
                  startIcon={<AddOutlined />}
                  onClick={addSvi}
                  sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
                >
                  Dodaj SVI
                </Button>
                {svis.length === 0 ? (
                  <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                    Brak SVI — dodaj interfejs VLAN z adresem IP.
                  </Typography>
                ) : (
                  svis.map((svi) => {
                    const vlanColor = getPortStatusColor(svi.vlan, 0, {
                      customColor: svi.vlanColor,
                      modelItems
                    });
                    const isExpanded = expandedSviId === svi.id;
                    return (
                      <Accordion
                        key={svi.id}
                        disableGutters
                        elevation={0}
                        expanded={isExpanded}
                        TransitionProps={{ unmountOnExit: true }}
                        onChange={(_, expanded) => {
                          setExpandedSviId(expanded ? svi.id : null);
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
                              bgcolor: vlanColor,
                              border: '1px solid rgba(0,0,0,0.12)'
                            }}
                          />
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography
                              sx={{
                                fontSize: 12,
                                fontWeight: 700,
                                fontFamily:
                                  'ui-monospace, SFMono-Regular, Menlo, monospace',
                                lineHeight: 1.2
                              }}
                            >
                              VLAN {svi.vlan || '1'}
                            </Typography>
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
                              {svi.dhcp
                                ? 'DHCP'
                                : svi.ip?.trim() || 'brak IP'}
                            </Typography>
                          </Box>
                        </AccordionSummary>
                        {isExpanded && (
                          <AccordionDetails sx={{ px: 1, pt: 0, pb: 1 }}>
                            <Stack spacing={1}>
                              <Stack
                                direction="row"
                                spacing={0.75}
                                alignItems="flex-start"
                              >
                                <VlanCatalogPicker
                                  value={svi.vlan ?? ''}
                                  onChange={(vlan) => {
                                    applySviVlan(svi.id, vlan);
                                  }}
                                />
                                <Box
                                  title={
                                    svi.vlan
                                      ? `Kolor VLAN ${svi.vlan}`
                                      : 'Kolor VLAN'
                                  }
                                  sx={{
                                    flexShrink: 0,
                                    mt: 0.5,
                                    display: 'flex',
                                    alignItems: 'center',
                                    '& .MuiFormControl-root': { m: 0 }
                                  }}
                                >
                                  <ColorPicker
                                    value={vlanColor}
                                    onChange={(color) => {
                                      if (isVlan1(svi.vlan)) {
                                        updateSvi(svi.id, { vlanColor: color });
                                        return;
                                      }
                                      setVlanColorAcrossModel(
                                        svi.vlan ?? '',
                                        color
                                      );
                                    }}
                                  />
                                </Box>
                              </Stack>
                              <TextField
                                label="Adres IP"
                                size="small"
                                fullWidth
                                sx={fieldSx}
                                placeholder="10.0.0.1/24"
                                value={svi.dhcp ? '' : svi.ip ?? ''}
                                disabled={Boolean(svi.dhcp)}
                                onChange={(e) => {
                                  updateSvi(svi.id, { ip: e.target.value });
                                }}
                              />
                              <FormControlLabel
                                sx={{ m: 0, ml: 0.25 }}
                                control={
                                  <Switch
                                    size="small"
                                    checked={Boolean(svi.dhcp)}
                                    onChange={(e) => {
                                      updateSvi(svi.id, {
                                        dhcp: e.target.checked || undefined
                                      });
                                    }}
                                  />
                                }
                                label={
                                  <Typography sx={{ fontSize: 12 }}>
                                    DHCP
                                  </Typography>
                                }
                              />
                              <Button
                                size="small"
                                color="error"
                                startIcon={<DeleteOutline />}
                                onClick={() => {
                                  removeSvi(svi.id);
                                }}
                                sx={{
                                  textTransform: 'none',
                                  alignSelf: 'flex-start'
                                }}
                              >
                                Usuń SVI
                              </Button>
                            </Stack>
                          </AccordionDetails>
                        )}
                      </Accordion>
                    );
                  })
                )}
              </Stack>
              </Box>
            )}
          </Stack>
        )}

      </Box>

      <Box sx={{ px: 1.5, pt: 0.5, pb: 1 }}>
        {sidebarTab === 'opis' && (
          <Box sx={{ pt: 0.5 }}>
            <Stack spacing={1.25}>
              <TextField
                label="Tytuł"
                size="small"
                fullWidth
                value={modelItem.descriptionTitle ?? ''}
                onChange={(e) => {
                  const descriptionTitle = e.target.value;
                  updateModelItem(viewItem.id, {
                    descriptionTitle: descriptionTitle.trim()
                      ? descriptionTitle
                      : undefined
                  });
                }}
                sx={fieldSx}
              />
              <TextField
                label="Skrót"
                size="small"
                fullWidth
                value={modelItem.descriptionSummary ?? ''}
                onChange={(e) => {
                  const descriptionSummary = clampDescriptionSummary(
                    e.target.value
                  );
                  updateModelItem(viewItem.id, {
                    descriptionSummary: descriptionSummary.trim()
                      ? descriptionSummary
                      : undefined
                  });
                }}
                inputProps={{ maxLength: DESCRIPTION_SUMMARY_MAX }}
                helperText={`${(modelItem.descriptionSummary ?? '').length}/${DESCRIPTION_SUMMARY_MAX} · treść plakietki (pełny opis po rozwinięciu)`}
                FormHelperTextProps={{ sx: { fontSize: 10, m: 0, mt: 0.5 } }}
                sx={fieldSx}
              />
              <Button
                variant="contained"
                size="small"
                onClick={() => setNotesDialogOpen(true)}
                sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
              >
                {hasNotes ? 'Otwórz opis (notatki)' : 'Dodaj opis (notatki)'}
              </Button>
              <Typography
                sx={{
                  fontSize: 11,
                  color: 'text.secondary',
                  lineHeight: 1.35
                }}
              >
                Na plakietce: tytuł + skrót. Strzałka rozwija pełny opis na karcie.
              </Typography>
              <FormControlLabel
                sx={{ mt: 0, ml: 0, mr: 0 }}
                control={
                  <Switch
                    size="small"
                    checked={viewItem.showDescriptionLabel === true}
                    onChange={(e) => {
                      updateViewItem(viewItem.id, {
                        showDescriptionLabel: e.target.checked
                      });
                    }}
                    disabled={!hasBadge}
                  />
                }
                label={
                  <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                    Pokazuj plakietkę
                  </Typography>
                }
              />
              <Typography
                sx={{
                  fontSize: 11,
                  color: 'text.secondary',
                  lineHeight: 1.35,
                  mt: -0.5
                }}
              >
                Domyślnie opis otwierasz przyciskiem (i) na urządzeniu. Włącz
                plakietkę tylko dla ważniejszych notatek.
              </Typography>
              {hasBadge && viewItem.showDescriptionLabel === true && (
                <Box>
                  <Typography
                    sx={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      mb: 0.5
                    }}
                  >
                    Wielkość plakietki
                  </Typography>
                  <Slider
                    size="small"
                    step={NODE_LABEL_SCALE_STEP}
                    min={NODE_LABEL_SCALE_MIN}
                    max={NODE_LABEL_SCALE_MAX}
                    value={clampNodeLabelScale(viewItem.labelScale)}
                    onChange={(_, value) => {
                      const labelScale = Array.isArray(value) ? value[0] : value;
                      updateViewItem(viewItem.id, {
                        labelScale: clampNodeLabelScale(labelScale)
                      });
                    }}
                    valueLabelDisplay="off"
                  />
                  <Typography
                    sx={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      mb: 0.5,
                      mt: 1
                    }}
                  >
                    Długość linii
                  </Typography>
                  <Slider
                    size="small"
                    marks
                    step={20}
                    min={60}
                    max={480}
                    value={viewItem.labelHeight ?? 140}
                    onChange={(_, value) => {
                      const labelHeight = Array.isArray(value) ? value[0] : value;
                      updateViewItem(viewItem.id, {
                        labelHeight
                      });
                    }}
                    valueLabelDisplay="auto"
                  />
                </Box>
              )}
            </Stack>

            <Dialog
              open={notesDialogOpen}
              onClose={() => setNotesDialogOpen(false)}
              fullWidth
              maxWidth="md"
              PaperProps={{
                sx: {
                  height: 'min(82vh, 720px)',
                  display: 'flex',
                  flexDirection: 'column'
                }
              }}
            >
              <DialogTitle sx={{ fontSize: 16, fontWeight: 700, pb: 1 }}>
                Opis — {modelItem.name || 'urządzenie'}
              </DialogTitle>
              <DialogContent
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  minHeight: 0,
                  pt: 1
                }}
              >
                <MarkdownEditor
                  variant="notebook"
                  height={520}
                  value={modelItem.description}
                  onChange={(text) => {
                    if (modelItem.description !== text) {
                      updateModelItem(viewItem.id, { description: text });
                    }
                  }}
                />
              </DialogContent>
            </Dialog>
          </Box>
        )}
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
              {isServerTemplate ? 'Edytuj serwer' : 'Edytuj szablon'}
            </Button>
          )}
          {hasConnectorTools && (
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
          )}
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
