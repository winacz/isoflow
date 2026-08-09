import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Chip,
  Tooltip,
  TableSortLabel
} from '@mui/material';
import PictureInPictureAltOutlinedIcon from '@mui/icons-material/PictureInPictureAltOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  SHAPE_2D_BLANKING_ID,
  SHAPE_2D_CABINET_ID,
  SHAPE_2D_PATCH_PANEL_ID,
  getModelItemPorts
} from 'src/config';
import { MarkdownEditor } from 'src/components/MarkdownEditor/MarkdownEditor';
import { useScene } from 'src/hooks/useScene';
import { useView } from 'src/hooks/useView';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { useModelStore, useModelStoreApi } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import type { ModelItem, ViewItem } from 'src/types';
import {
  findSharedVlanColor,
  focusShape2dPortOnCanvas,
  generateId,
  getDescriptionSummary,
  getDescriptionTitle,
  getIpamPlanTabs,
  getVlanColor,
  hasNodeDescription,
  hasNodeDescriptionNotes,
  isNonVlanAwareDevice,
  isSwitchLikeIcon,
  isVlan1,
  normalizeVlanKey,
  projectionModeForKind
} from 'src/utils';
import { isDeviceTemplateId } from 'src/utils/deviceTemplateRegistry';
import { ipv4NetworkKey } from 'src/utils/vlanIpHint';
import { IpamNodePipPreview } from './IpamNodePipPreview';

type DeviceRole = 'host' | 'switch' | 'server' | 'patch' | 'other';

type IpamSortKey = 'name' | 'role' | 'vlan' | 'ip' | 'dhcp';
type IpamSortDir = 'asc' | 'desc';

const ROLE_SORT_ORDER: DeviceRole[] = [
  'switch',
  'server',
  'host',
  'patch',
  'other'
];

const ROLE_LABEL: Record<DeviceRole, string> = {
  host: 'Host',
  switch: 'Switch',
  server: 'Serwer',
  patch: 'Patch',
  other: 'Inne'
};

const ROLE_COLOR: Record<
  DeviceRole,
  'default' | 'primary' | 'secondary' | 'success' | 'warning'
> = {
  host: 'default',
  switch: 'primary',
  server: 'secondary',
  patch: 'warning',
  other: 'default'
};

const fieldSx = {
  '& .MuiInputBase-root': { fontSize: 13, bgcolor: 'background.paper' },
  '& .MuiInputBase-input': { py: 0.75 }
} as const;

const hasDescription = hasNodeDescription;

const isIpamListed = (item: ModelItem): boolean => {
  if (!item.icon) return false;
  if (item.icon === SHAPE_2D_CABINET_ID) return false;
  if (item.icon === SHAPE_2D_BLANKING_ID) return false;
  return true;
};

const resolveRole = (
  item: ModelItem,
  templateKind?: string | null
): DeviceRole => {
  if (item.icon === SHAPE_2D_PATCH_PANEL_ID) return 'patch';
  if (templateKind === 'SERVER' || templateKind === 'SERVER_V2') return 'server';
  if (isSwitchLikeIcon(item.icon)) return 'switch';
  if (isNonVlanAwareDevice(item.icon)) return 'host';
  if (isDeviceTemplateId(item.icon)) return 'switch';
  return 'other';
};

const devicePortCount = (item: ModelItem): number => {
  return getModelItemPorts(item).length;
};

const primaryAccessVlan = (item: ModelItem): string => {
  const ports = item.ports ?? {};
  for (const cfg of Object.values(ports)) {
    if (!cfg || cfg.type === 'trunk') continue;
    const key = normalizeVlanKey(cfg.vlan);
    if (key) return key;
  }
  const svi = item.svis?.find((entry) => normalizeVlanKey(entry.vlan));
  if (svi) return normalizeVlanKey(svi.vlan) || '1';
  return '1';
};

const vlanSummary = (item: ModelItem): string => {
  const seen = new Set<string>();
  Object.values(item.ports ?? {}).forEach((cfg) => {
    if (!cfg || cfg.type === 'trunk') return;
    const key = normalizeVlanKey(cfg.vlan) || '1';
    seen.add(key);
  });
  (item.svis ?? []).forEach((svi) => {
    const key = normalizeVlanKey(svi.vlan);
    if (key) seen.add(key);
  });
  if (seen.size === 0) return '1';
  return [...seen]
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
    .join(', ');
};

const withAccessVlan = (
  item: ModelItem,
  vlan: string,
  vlanColor: string
): NonNullable<ModelItem['ports']> => {
  const next: NonNullable<ModelItem['ports']> = { ...(item.ports ?? {}) };
  const layoutPorts = getModelItemPorts(item);
  const color = isVlan1(vlan) ? undefined : vlanColor || undefined;

  const patchPort = (portId: string) => {
    const current = next[portId] ?? {};
    if (current.type === 'trunk') return;
    next[portId] = {
      ...current,
      type: current.type ?? 'access',
      vlan,
      vlanColor: color
    };
  };

  if (layoutPorts.length > 0) {
    layoutPorts.forEach((port) => patchPort(port.id));
  }

  Object.keys(next).forEach((portId) => patchPort(portId));

  if (Object.keys(next).length === 0) {
    next['port-1'] = {
      type: 'access',
      vlan,
      vlanColor: color,
      speed: '1G'
    };
  }

  return next;
};

const parseCidrBase = (
  raw: string
): { octets: number[]; prefix: number } | null => {
  const key = ipv4NetworkKey(raw.trim());
  if (!key) return null;
  const [net, prefixText] = key.split('/');
  const octets = net.split('.').map(Number);
  const prefix = Number(prefixText);
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o))) {
    return null;
  }
  return { octets, prefix };
};

const hostIpFromIndex = (
  octets: number[],
  prefix: number,
  hostIndex: number
): string => {
  const base =
    ((octets[0] << 24) >>> 0) +
    ((octets[1] << 16) >>> 0) +
    ((octets[2] << 8) >>> 0) +
    (octets[3] >>> 0);
  const addr = (base + hostIndex) >>> 0;
  const ip = [
    (addr >>> 24) & 255,
    (addr >>> 16) & 255,
    (addr >>> 8) & 255,
    addr & 255
  ].join('.');
  return `${ip}/${prefix}`;
};

const rowIpSortValue = (
  item: ModelItem,
  role: DeviceRole,
  selectedSviId?: string
): string => {
  if (role === 'switch') {
    const svis = item.svis ?? [];
    const selected = selectedSviId
      ? svis.find((svi) => svi.id === selectedSviId)
      : undefined;
    return (selected?.ip ?? svis.find((svi) => svi.ip)?.ip ?? '').toLowerCase();
  }
  if (item.dhcp) return '';
  return (item.ip ?? '').toLowerCase();
};

const compareIpamRows = (
  a: {
    item: ModelItem;
    role: DeviceRole;
    vlan: string;
    vlanLabel: string;
  },
  b: {
    item: ModelItem;
    role: DeviceRole;
    vlan: string;
    vlanLabel: string;
  },
  sortKey: IpamSortKey,
  sortDir: IpamSortDir,
  sviSelectionByItemId: Record<string, string>
): number => {
  const dir = sortDir === 'asc' ? 1 : -1;
  let cmp = 0;

  switch (sortKey) {
    case 'name':
      cmp = a.item.name.localeCompare(b.item.name, 'pl', {
        sensitivity: 'base'
      });
      break;
    case 'role':
      cmp =
        ROLE_SORT_ORDER.indexOf(a.role) - ROLE_SORT_ORDER.indexOf(b.role);
      if (cmp === 0 && a.role === 'switch' && b.role === 'switch') {
        // Multi-port switches before fewer-port switches.
        cmp = devicePortCount(b.item) - devicePortCount(a.item);
      }
      if (cmp === 0) {
        cmp = a.item.name.localeCompare(b.item.name, 'pl', {
          sensitivity: 'base'
        });
      }
      break;
    case 'vlan': {
      const aNum = Number(a.vlan);
      const bNum = Number(b.vlan);
      if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
        cmp = aNum - bNum;
      } else {
        cmp = a.vlanLabel.localeCompare(b.vlanLabel, 'pl', {
          numeric: true,
          sensitivity: 'base'
        });
      }
      break;
    }
    case 'ip':
      cmp = rowIpSortValue(
        a.item,
        a.role,
        sviSelectionByItemId[a.item.id]
      ).localeCompare(
        rowIpSortValue(b.item, b.role, sviSelectionByItemId[b.item.id]),
        'en',
        { numeric: true }
      );
      break;
    case 'dhcp': {
      const aDhcp =
        a.role !== 'switch' && (a.role === 'host' || a.role === 'server')
          ? Number(Boolean(a.item.dhcp))
          : -1;
      const bDhcp =
        b.role !== 'switch' && (b.role === 'host' || b.role === 'server')
          ? Number(Boolean(b.item.dhcp))
          : -1;
      cmp = aDhcp - bDhcp;
      break;
    }
    default:
      cmp = 0;
  }

  if (cmp === 0 && sortKey !== 'name') {
    cmp = a.item.name.localeCompare(b.item.name, 'pl', {
      sensitivity: 'base'
    });
  }

  return cmp * dir;
};

/**
 * Workshop IPAM — inventory of plan-tab devices with inline IP / VLAN editing
 * and multi-select bulk network assignment.
 */
export const IpamPanel = () => {
  const modelItems = useModelStore((state) => state.items);
  const views = useModelStore((state) => state.views);
  const projectTitle = useModelStore((state) => state.title);
  const deviceTemplates = useModelStore((state) => state.deviceTemplates ?? []);
  const modelApi = useModelStoreApi();
  const uiStateActions = useUiStateStore((state) => state.actions);
  const rendererEl = useUiStateStore((state) => state.rendererEl);
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const { changeView } = useView();
  const {
    updateModelItem,
    setVlanColorAcrossModel,
    beginHistoryTransaction,
    endHistoryTransaction
  } = useScene();

  const planTabs = useMemo(() => {
    return getIpamPlanTabs(views, projectTitle);
  }, [views, projectTitle]);

  const [selectedViewId, setSelectedViewId] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rangeAnchorId, setRangeAnchorId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [bulkVlan, setBulkVlan] = useState('');
  const [bulkNetwork, setBulkNetwork] = useState('');
  const [pipHover, setPipHover] = useState<{
    itemId: string;
    screen: { x: number; y: number };
  } | null>(null);
  const [descItemId, setDescItemId] = useState<string | null>(null);
  /** Selected SVI id per switch — IP field stays locked until set. */
  const [sviSelectionByItemId, setSviSelectionByItemId] = useState<
    Record<string, string>
  >({});
  const [sortKey, setSortKey] = useState<IpamSortKey>('role');
  const [sortDir, setSortDir] = useState<IpamSortDir>('asc');

  const activeViewId = useMemo(() => {
    if (planTabs.some((tab) => tab.viewId === selectedViewId)) {
      return selectedViewId;
    }
    return planTabs[0]?.viewId ?? '';
  }, [planTabs, selectedViewId]);

  const activeTab = useMemo(() => {
    return planTabs.find((tab) => tab.viewId === activeViewId) ?? null;
  }, [planTabs, activeViewId]);

  const activePlan = useMemo(() => {
    return views.find((view) => view.id === activeViewId) ?? null;
  }, [views, activeViewId]);

  const planItems = activePlan?.items ?? [];
  const planItemIds = useMemo(() => {
    return new Set(planItems.map((item) => item.id));
  }, [planItems]);
  const viewItemById = useMemo(() => {
    const map = new Map<string, ViewItem>();
    planItems.forEach((item) => map.set(item.id, item));
    return map;
  }, [planItems]);

  const templateKindById = useMemo(() => {
    const map = new Map<string, string>();
    deviceTemplates.forEach((template) => {
      map.set(template.id, template.kind);
    });
    return map;
  }, [deviceTemplates]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return modelItems
      .filter((item) => planItemIds.has(item.id) && isIpamListed(item))
      .map((item) => {
        const role = resolveRole(
          item,
          item.icon ? templateKindById.get(item.icon) : null
        );
        return {
          item,
          role,
          vlan: primaryAccessVlan(item),
          vlanLabel: vlanSummary(item),
          viewItem: viewItemById.get(item.id)!
        };
      })
      .filter((row) => {
        if (!q) return true;
        const hay =
          `${row.item.name} ${row.vlanLabel} ${row.item.ip ?? ''} ${(row.item.svis ?? [])
            .map((svi) => `${svi.vlan} ${svi.ip ?? ''}`)
            .join(' ')} ${ROLE_LABEL[row.role]}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        compareIpamRows(a, b, sortKey, sortDir, sviSelectionByItemId)
      );
  }, [
    modelItems,
    planItemIds,
    viewItemById,
    templateKindById,
    filter,
    sortKey,
    sortDir,
    sviSelectionByItemId
  ]);

  const toggleSort = useCallback((key: IpamSortKey) => {
    if (sortKey === key) {
      setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  }, [sortKey]);

  const visibleIds = useMemo(() => {
    return rows.map((row) => row.item.id);
  }, [rows]);

  const allVisibleSelected =
    visibleIds.length > 0 &&
    visibleIds.every((id) => selectedIds.includes(id));

  const onPlanTabChange = useCallback((viewId: string) => {
    setSelectedViewId(viewId);
    setSelectedIds([]);
    setRangeAnchorId(null);
    setPipHover(null);
    setDescItemId(null);
  }, []);

  const toggleAllVisible = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      setRangeAnchorId(null);
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...visibleIds])]);
    setRangeAnchorId(visibleIds[0] ?? null);
  }, [allVisibleSelected, visibleIds]);

  const selectRow = useCallback(
    (id: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
      const additive = event.ctrlKey || event.metaKey;
      const index = visibleIds.indexOf(id);

      if (event.shiftKey && rangeAnchorId) {
        const anchorIndex = visibleIds.indexOf(rangeAnchorId);
        if (anchorIndex >= 0 && index >= 0) {
          const from = Math.min(anchorIndex, index);
          const to = Math.max(anchorIndex, index);
          const range = visibleIds.slice(from, to + 1);
          if (additive) {
            setSelectedIds((prev) => [...new Set([...prev, ...range])]);
          } else {
            setSelectedIds(range);
          }
          return;
        }
      }

      if (additive) {
        setSelectedIds((prev) => {
          if (prev.includes(id)) return prev.filter((x) => x !== id);
          return [...prev, id];
        });
        setRangeAnchorId(id);
        return;
      }

      setSelectedIds([id]);
      setRangeAnchorId(id);
    },
    [visibleIds, rangeAnchorId]
  );

  const setItemIp = useCallback(
    (id: string, ip: string) => {
      updateModelItem(id, { ip: ip.trim() ? ip : undefined });
    },
    [updateModelItem]
  );

  const setSwitchSviIp = useCallback(
    (itemId: string, sviId: string, ip: string) => {
      const item = modelItems.find((candidate) => candidate.id === itemId);
      if (!item) return;
      const next = (item.svis ?? []).map((svi) => {
        if (svi.id !== sviId) return svi;
        return { ...svi, ip: ip.trim() ? ip : undefined };
      });
      updateModelItem(itemId, { svis: next });
    },
    [modelItems, updateModelItem]
  );

  const setItemDhcp = useCallback(
    (id: string, dhcp: boolean) => {
      updateModelItem(id, { dhcp: dhcp || undefined });
    },
    [updateModelItem]
  );

  const setItemVlan = useCallback(
    (id: string, vlanRaw: string) => {
      const item = modelItems.find((candidate) => candidate.id === id);
      if (!item) return;
      const vlan = normalizeVlanKey(vlanRaw) || '1';
      const shared = findSharedVlanColor(vlan, modelItems);
      const color = isVlan1(vlan) ? '' : shared || getVlanColor(vlan) || '';

      beginHistoryTransaction();
      updateModelItem(id, {
        ports: withAccessVlan(item, vlan, color)
      });
      if (color && !isVlan1(vlan)) {
        setVlanColorAcrossModel(vlan, color);
      }
      endHistoryTransaction();
    },
    [
      beginHistoryTransaction,
      endHistoryTransaction,
      modelItems,
      setVlanColorAcrossModel,
      updateModelItem
    ]
  );

  const applyBulkVlan = useCallback(() => {
    const vlan = normalizeVlanKey(bulkVlan);
    if (!vlan || selectedIds.length === 0) return;
    const shared = findSharedVlanColor(vlan, modelItems);
    const color = isVlan1(vlan) ? '' : shared || getVlanColor(vlan) || '';

    beginHistoryTransaction();
    selectedIds.forEach((id) => {
      const item = modelItems.find((candidate) => candidate.id === id);
      if (!item) return;
      updateModelItem(id, {
        ports: withAccessVlan(item, vlan, color)
      });
    });
    if (color && !isVlan1(vlan)) {
      setVlanColorAcrossModel(vlan, color);
    }
    endHistoryTransaction();
  }, [
    bulkVlan,
    selectedIds,
    modelItems,
    beginHistoryTransaction,
    endHistoryTransaction,
    setVlanColorAcrossModel,
    updateModelItem
  ]);

  const applyBulkNetwork = useCallback(() => {
    if (selectedIds.length === 0) return;
    const parsed = parseCidrBase(bulkNetwork);
    if (!parsed) return;

    const selected = selectedIds
      .map((id) => modelItems.find((item) => item.id === id))
      .filter((item): item is ModelItem => Boolean(item));

    const switches = selected.filter((item) => isSwitchLikeIcon(item.icon));
    const hosts = selected.filter((item) => !isSwitchLikeIcon(item.icon));

    beginHistoryTransaction();

    if (switches.length > 0) {
      const gateway = hostIpFromIndex(parsed.octets, parsed.prefix, 1);
      const sw = switches[0];
      const vlan = primaryAccessVlan(sw);
      const existing = sw.svis ?? [];
      const match = existing.find(
        (svi) => normalizeVlanKey(svi.vlan) === vlan
      );
      const shared = findSharedVlanColor(vlan, modelItems);
      const color = isVlan1(vlan)
        ? undefined
        : shared || getVlanColor(vlan) || undefined;
      if (match) {
        updateModelItem(sw.id, {
          svis: existing.map((svi) =>
            svi.id === match.id ? { ...svi, ip: gateway, vlanColor: color } : svi
          )
        });
      } else {
        updateModelItem(sw.id, {
          svis: [
            ...existing,
            {
              id: generateId(),
              vlan,
              ip: gateway,
              vlanColor: color
            }
          ]
        });
      }
    }

    hosts.forEach((host, index) => {
      updateModelItem(host.id, {
        dhcp: undefined,
        ip: hostIpFromIndex(parsed.octets, parsed.prefix, index + 2)
      });
    });

    endHistoryTransaction();
  }, [
    bulkNetwork,
    selectedIds,
    modelItems,
    beginHistoryTransaction,
    endHistoryTransaction,
    updateModelItem
  ]);

  const locateOnMap = useCallback(
    (itemId: string) => {
      if (!activePlan || !activeTab) return;
      const model = modelApi.getState();
      const mode = projectionModeForKind(activeTab.kind);
      uiStateActions.setWorkshopOpen(false);
      changeView(activePlan.id, model);
      uiStateActions.setProjectionMode(mode);
      uiStateActions.setMode({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      });

      const planId = activePlan.id;
      // Defer focus until the selected plan scene is mounted.
      window.setTimeout(() => {
        const live = modelApi.getState();
        const view = live.views.find((candidate) => candidate.id === planId);
        if (!view) return;
        focusShape2dPortOnCanvas({
          itemId,
          portId: '',
          viewItems: view.items,
          modelItems: live.items,
          rendererSize: {
            width: rendererSize.width || 800,
            height: rendererSize.height || 600
          },
          setZoom: uiStateActions.setZoom,
          setScroll: uiStateActions.setScroll,
          setItemControls: uiStateActions.setItemControls,
          setSelectedItemIds: uiStateActions.setSelectedItemIds,
          setFocusedPortId: uiStateActions.setFocusedPortId,
          clearSelectedWaypointIds: () => {
            uiStateActions.setSelectedWaypointIds([]);
          }
        });
      }, 40);
    },
    [activePlan, activeTab, modelApi, changeView, uiStateActions, rendererSize]
  );

  const pipItem = pipHover
    ? rows.find((row) => row.item.id === pipHover.itemId)
    : null;
  const descItem = descItemId
    ? rows.find((row) => row.item.id === descItemId)?.item
    : null;

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        pt: 8,
        px: 2,
        pb: 2
      }}
    >
      {pipItem && pipHover && (
        <IpamNodePipPreview
          item={pipItem.item}
          viewItem={pipItem.viewItem}
          screen={pipHover.screen}
        />
      )}

      <Dialog
        open={Boolean(descItem && hasDescription(descItem))}
        onClose={() => setDescItemId(null)}
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
        {descItem && (
          <>
            <DialogTitle sx={{ fontSize: 16, fontWeight: 700, pb: 1 }}>
              {getDescriptionTitle(descItem) || descItem.name || 'Opis'}
            </DialogTitle>
            <DialogContent
              sx={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                gap: 1.5
              }}
            >
              {getDescriptionSummary(descItem) ? (
                <Typography
                  sx={{
                    fontSize: 13,
                    color: 'text.secondary',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {getDescriptionSummary(descItem)}
                </Typography>
              ) : null}
              {hasNodeDescriptionNotes(descItem) ? (
                <MarkdownEditor
                  value={descItem.description}
                  readOnly
                  variant="notebook"
                  height={480}
                  styles={{ fontSize: 13, lineHeight: 1.45 }}
                />
              ) : (
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                  Brak notatek w opisie.
                </Typography>
              )}
            </DialogContent>
          </>
        )}
      </Dialog>

      <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1}
          alignItems={{ md: 'center' }}
          justifyContent="space-between"
        >
          <Box>
            <Typography sx={{ fontSize: 18, fontWeight: 700 }}>IPAM</Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
              Urządzenia z wybranej zakładki · Ctrl = multi, Shift = zakres
            </Typography>
          </Box>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            alignItems={{ sm: 'center' }}
          >
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="ipam-plan-tab-label">Zakładka</InputLabel>
              <Select
                labelId="ipam-plan-tab-label"
                label="Zakładka"
                value={activeViewId}
                disabled={planTabs.length === 0}
                onChange={(event) => {
                  onPlanTabChange(String(event.target.value));
                }}
                sx={{ fontSize: 13, bgcolor: 'background.paper' }}
              >
                {planTabs.map((tab) => (
                  <MenuItem key={tab.viewId} value={tab.viewId}>
                    {tab.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder="Filtruj nazwę / VLAN / IP…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              sx={{ ...fieldSx, minWidth: 260 }}
            />
          </Stack>
        </Stack>

        <Box
          sx={{
            p: 1.25,
            borderRadius: 1.5,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider'
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1}
            alignItems={{ md: 'center' }}
          >
            <Typography
              sx={{ fontSize: 12, color: 'text.secondary', minWidth: 110 }}
            >
              Zaznaczone: {selectedIds.length}
            </Typography>
            <TextField
              size="small"
              label="VLAN"
              placeholder="np. 10"
              value={bulkVlan}
              onChange={(e) => setBulkVlan(e.target.value)}
              sx={{ ...fieldSx, width: 120 }}
            />
            <Button
              size="small"
              variant="contained"
              disabled={selectedIds.length === 0 || !normalizeVlanKey(bulkVlan)}
              onClick={applyBulkVlan}
              sx={{ textTransform: 'none' }}
            >
              Ustaw VLAN
            </Button>
            <TextField
              size="small"
              label="Sieć"
              placeholder="np. 10.10.10.0/24"
              value={bulkNetwork}
              onChange={(e) => setBulkNetwork(e.target.value)}
              sx={{ ...fieldSx, width: 200 }}
            />
            <Button
              size="small"
              variant="contained"
              color="secondary"
              disabled={
                selectedIds.length === 0 || !parseCidrBase(bulkNetwork)
              }
              onClick={applyBulkNetwork}
              sx={{ textTransform: 'none' }}
              title="Switch → SVI .1, hosty → kolejne adresy od .2"
            >
              Nadaj adresy
            </Button>
          </Stack>
        </Box>

        <TableContainer
          sx={{
            flex: 1,
            minHeight: 0,
            bgcolor: 'background.paper',
            borderRadius: 1.5,
            border: '1px solid',
            borderColor: 'divider'
          }}
        >
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    indeterminate={
                      selectedIds.length > 0 && !allVisibleSelected
                    }
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                  />
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortKey === 'name'}
                    direction={sortKey === 'name' ? sortDir : 'asc'}
                    onClick={() => toggleSort('name')}
                  >
                    Urządzenie
                  </TableSortLabel>
                </TableCell>
                <TableCell width={100}>
                  <TableSortLabel
                    active={sortKey === 'role'}
                    direction={sortKey === 'role' ? sortDir : 'asc'}
                    onClick={() => toggleSort('role')}
                  >
                    Typ
                  </TableSortLabel>
                </TableCell>
                <TableCell width={140}>
                  <TableSortLabel
                    active={sortKey === 'vlan'}
                    direction={sortKey === 'vlan' ? sortDir : 'asc'}
                    onClick={() => toggleSort('vlan')}
                  >
                    VLAN
                  </TableSortLabel>
                </TableCell>
                <TableCell width={260}>
                  <TableSortLabel
                    active={sortKey === 'ip'}
                    direction={sortKey === 'ip' ? sortDir : 'asc'}
                    onClick={() => toggleSort('ip')}
                  >
                    SVI / IP
                  </TableSortLabel>
                </TableCell>
                <TableCell width={90}>
                  <TableSortLabel
                    active={sortKey === 'dhcp'}
                    direction={sortKey === 'dhcp' ? sortDir : 'asc'}
                    onClick={() => toggleSort('dhcp')}
                  >
                    DHCP
                  </TableSortLabel>
                </TableCell>
                <TableCell width={96} align="center">
                  Mapa
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography
                      sx={{
                        py: 3,
                        color: 'text.secondary',
                        textAlign: 'center'
                      }}
                    >
                      {activePlan
                        ? `Brak urządzeń na zakładce ${activeTab?.label ?? ''}.`
                        : 'Brak zakładki planu 2D w projekcie.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(({ item, role, vlan, vlanLabel }) => {
                  const selected = selectedIds.includes(item.id);
                  const canHostIp =
                    role === 'host' || role === 'server' || role === 'switch';
                  return (
                    <TableRow
                      key={item.id}
                      hover
                      selected={selected}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (
                          target.closest(
                            'input,button,textarea,label,.MuiSwitch-root,.MuiIconButton-root'
                          )
                        ) {
                          return;
                        }
                        selectRow(item.id, e);
                      }}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={selected}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Checkbox always toggles; Shift still expands a range.
                            selectRow(item.id, {
                              shiftKey: e.shiftKey,
                              ctrlKey: true,
                              metaKey: e.metaKey
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                          {item.name}
                        </Typography>
                        {role === 'switch' && (item.svis?.length ?? 0) > 0 && (
                          <Typography
                            sx={{ fontSize: 11, color: 'text.secondary' }}
                          >
                            SVI:{' '}
                            {(item.svis ?? [])
                              .map((svi) =>
                                svi.ip
                                  ? `VLAN ${svi.vlan} → ${svi.ip}`
                                  : `VLAN ${svi.vlan}`
                              )
                              .join(' · ')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={ROLE_LABEL[role]}
                          color={ROLE_COLOR[role]}
                          variant="outlined"
                          sx={{ fontSize: 11, height: 22 }}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <TextField
                          size="small"
                          defaultValue={vlan}
                          key={`${item.id}:${vlan}`}
                          onBlur={(e) => {
                            const next =
                              normalizeVlanKey(e.target.value) || '1';
                            if (next !== vlan) setItemVlan(item.id, next);
                          }}
                          helperText={
                            vlanLabel !== vlan
                              ? `porty: ${vlanLabel}`
                              : undefined
                          }
                          FormHelperTextProps={{
                            sx: { fontSize: 10, m: 0 }
                          }}
                          sx={{ ...fieldSx, width: 100 }}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {role === 'switch' ? (
                          <Stack spacing={0.75}>
                            <FormControl
                              size="small"
                              fullWidth
                              disabled={(item.svis?.length ?? 0) === 0}
                              sx={fieldSx}
                            >
                              <InputLabel
                                id={`ipam-svi-${item.id}`}
                                shrink
                              >
                                SVI
                              </InputLabel>
                              <Select
                                labelId={`ipam-svi-${item.id}`}
                                label="SVI"
                                displayEmpty
                                notched
                                value={
                                  (item.svis ?? []).some(
                                    (svi) =>
                                      svi.id === sviSelectionByItemId[item.id]
                                  )
                                    ? sviSelectionByItemId[item.id]
                                    : ''
                                }
                                onChange={(e) => {
                                  const sviId = String(e.target.value);
                                  setSviSelectionByItemId((prev) => ({
                                    ...prev,
                                    [item.id]: sviId
                                  }));
                                }}
                                renderValue={(selected) => {
                                  if (!selected) {
                                    return (
                                      <Typography
                                        sx={{
                                          fontSize: 13,
                                          color: 'text.secondary'
                                        }}
                                      >
                                        {(item.svis?.length ?? 0) === 0
                                          ? 'Brak SVI'
                                          : 'Wybierz SVI…'}
                                      </Typography>
                                    );
                                  }
                                  const svi = (item.svis ?? []).find(
                                    (entry) => entry.id === selected
                                  );
                                  return svi
                                    ? `VLAN ${svi.vlan}`
                                    : 'Wybierz SVI…';
                                }}
                              >
                                {(item.svis ?? []).map((svi) => (
                                  <MenuItem key={svi.id} value={svi.id}>
                                    VLAN {svi.vlan}
                                    {svi.ip ? ` · ${svi.ip}` : ''}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                            <TextField
                              size="small"
                              fullWidth
                              placeholder={
                                (item.svis?.length ?? 0) === 0
                                  ? 'Najpierw dodaj SVI w urządzeniu'
                                  : sviSelectionByItemId[item.id]
                                    ? '192.168.1.1/24'
                                    : 'Najpierw wybierz SVI'
                              }
                              value={
                                (() => {
                                  const sviId = sviSelectionByItemId[item.id];
                                  if (!sviId) return '';
                                  return (
                                    (item.svis ?? []).find(
                                      (svi) => svi.id === sviId
                                    )?.ip ?? ''
                                  );
                                })()
                              }
                              disabled={
                                !(item.svis ?? []).some(
                                  (svi) =>
                                    svi.id === sviSelectionByItemId[item.id]
                                )
                              }
                              onChange={(e) => {
                                const sviId = sviSelectionByItemId[item.id];
                                if (!sviId) return;
                                setSwitchSviIp(item.id, sviId, e.target.value);
                              }}
                              sx={fieldSx}
                            />
                          </Stack>
                        ) : canHostIp ? (
                          <TextField
                            size="small"
                            fullWidth
                            placeholder="192.168.1.10/24"
                            value={item.dhcp ? '' : item.ip ?? ''}
                            disabled={Boolean(item.dhcp)}
                            onChange={(e) =>
                              setItemIp(item.id, e.target.value)
                            }
                            sx={fieldSx}
                          />
                        ) : (
                          <Typography
                            sx={{ fontSize: 12, color: 'text.secondary' }}
                          >
                            —
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {canHostIp && role !== 'switch' ? (
                          <FormControlLabel
                            sx={{ m: 0 }}
                            control={
                              <Switch
                                size="small"
                                checked={Boolean(item.dhcp)}
                                onChange={(e) =>
                                  setItemDhcp(item.id, e.target.checked)
                                }
                              />
                            }
                            label=""
                          />
                        ) : (
                          <Typography
                            sx={{ fontSize: 12, color: 'text.secondary' }}
                          >
                            —
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell
                        align="center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Stack
                          direction="row"
                          spacing={0.25}
                          justifyContent="center"
                          alignItems="center"
                        >
                          <Tooltip
                            title={
                              hasDescription(item)
                                ? 'Pokaż opis'
                                : 'Brak opisu'
                            }
                          >
                            <span>
                              <IconButton
                                size="small"
                                color={
                                  hasDescription(item) ? 'primary' : 'default'
                                }
                                aria-label="Pokaż opis urządzenia"
                                disabled={!hasDescription(item)}
                                onClick={() => {
                                  setDescItemId(item.id);
                                }}
                                sx={
                                  hasDescription(item)
                                    ? {
                                        color: 'primary.main',
                                        bgcolor: 'rgba(37, 99, 235, 0.12)',
                                        '&:hover': {
                                          bgcolor: 'rgba(37, 99, 235, 0.2)'
                                        }
                                      }
                                    : undefined
                                }
                              >
                                <InfoOutlinedIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Podgląd PiP · kliknij, aby otworzyć na mapie">
                            <IconButton
                              size="small"
                              aria-label="Pokaż na mapie"
                              onMouseEnter={(e) => {
                                setPipHover({
                                  itemId: item.id,
                                  screen: { x: e.clientX, y: e.clientY }
                                });
                              }}
                              onMouseMove={(e) => {
                                setPipHover({
                                  itemId: item.id,
                                  screen: { x: e.clientX, y: e.clientY }
                                });
                              }}
                              onMouseLeave={() => setPipHover(null)}
                              onClick={() => {
                                setPipHover(null);
                                locateOnMap(item.id);
                              }}
                            >
                              <PictureInPictureAltOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </Box>
  );
};
