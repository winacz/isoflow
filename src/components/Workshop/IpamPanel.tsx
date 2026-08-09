import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Slider,
  Stack,
  Switch,
  Tab,
  Tabs,
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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HistoryIcon from '@mui/icons-material/History';
import UndoIcon from '@mui/icons-material/Undo';
import {
  SHAPE_2D_BLANKING_ID,
  SHAPE_2D_CABINET_ID,
  SHAPE_2D_PATCH_PANEL_ID,
  NODE_LABEL_SCALE_MIN,
  NODE_LABEL_SCALE_MAX,
  NODE_LABEL_SCALE_STEP,
  clampNodeLabelScale,
  getModelItemPorts,
  getShape2dPortIfaceName
} from 'src/config';
import { MarkdownEditor } from 'src/components/MarkdownEditor/MarkdownEditor';
import { useScene } from 'src/hooks/useScene';
import { useView } from 'src/hooks/useView';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { useModelStore, useModelStoreApi } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import type { Connector, ModelItem, ViewItem } from 'src/types';
import {
  focusShape2dPortOnCanvas,
  formatIpamChangelogTime,
  generateId,
  getIpamPlanTabs,
  getPortStatusColor,
  getVlanColor,
  hasNodeDescription,
  hasNodeDescriptionBadge,
  hasNodeDescriptionNotes,
  IPAM_CHANGELOG_LIMIT,
  isNonVlanAwareDevice,
  isSwitchLikeIcon,
  isVlan1,
  collectModelItemVlans,
  mergeIpamDraft,
  normalizeVlanKey,
  projectionModeForKind,
  snapshotIpamFields,
  snapshotToModelPatch,
  DESCRIPTION_SUMMARY_MAX,
  clampDescriptionSummary,
  type IpamChangelogEntry,
  type IpamFieldSnapshot
} from 'src/utils';
import { isDeviceTemplateId } from 'src/utils/deviceTemplateRegistry';
import { ipv4NetworkKey, resolveCablePeer } from 'src/utils/vlanIpHint';
import { IpamNodePipPreview } from './IpamNodePipPreview';

type DeviceRole = 'host' | 'switch' | 'server' | 'patch' | 'other';

type IpamSwitchUplink = {
  switchItemId: string;
  switchName: string;
  switchPortId: string;
  switchPortLabel: string;
  vlan: string;
  vlanColorCustom?: string;
};

/** Hosts / endpoints whose displayed VLAN comes from the peer switch access port. */
const usesPeerSwitchVlan = (role: DeviceRole, item: ModelItem): boolean => {
  if (role === 'switch' || role === 'patch') return false;
  return role === 'host' || isNonVlanAwareDevice(item.icon);
};

const portDisplayLabel = (item: ModelItem, portId: string): string => {
  const named = item.ports?.[portId]?.name?.trim() || item.ports?.[portId]?.label?.trim();
  if (named) return named;
  if (item.icon) {
    return getShape2dPortIfaceName(item.icon, portId) || portId;
  }
  return portId;
};

/**
 * First switch-like peer of a host cable (patch panels are bridged through).
 */
const findSwitchAccessUplink = ({
  item,
  modelItems,
  connectors
}: {
  item: ModelItem;
  modelItems: ModelItem[];
  connectors: Connector[];
}): IpamSwitchUplink | null => {
  const ports = getModelItemPorts(item);
  for (const port of ports) {
    const peer = resolveCablePeer({
      itemId: item.id,
      portId: port.id,
      connectors,
      modelItems
    });
    if (!peer) continue;

    const peerItem = modelItems.find((candidate) => candidate.id === peer.itemId);
    if (!peerItem || isNonVlanAwareDevice(peerItem.icon)) continue;
    if (!isSwitchLikeIcon(peerItem.icon)) continue;

    const peerCfg = peerItem.ports?.[peer.portId];
    if (peerCfg?.type === 'trunk') continue;

    const vlan = normalizeVlanKey(peerCfg?.vlan) || '1';
    return {
      switchItemId: peerItem.id,
      switchName: peerItem.name?.trim() || 'Switch',
      switchPortId: peer.portId,
      switchPortLabel: portDisplayLabel(peerItem, peer.portId),
      vlan,
      vlanColorCustom: peerCfg?.vlanColor
    };
  }
  return null;
};

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

const listDeviceVlans = (item: ModelItem): string[] => {
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
  if (seen.size === 0) return ['1'];
  return [...seen].sort(
    (a, b) => Number(a) - Number(b) || a.localeCompare(b)
  );
};

const vlanSummary = (item: ModelItem): string => {
  return listDeviceVlans(item).join(', ');
};

const vlanColorContrastText = (hex: string): string => {
  const h = hex.replace('#', '');
  if (h.length < 6) return '#0f172a';
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.45 ? '#f8fafc' : '#0f172a';
};

const vlanBadgeSx = (vlanColor: string) => {
  return {
    height: 22,
    minWidth: 36,
    fontSize: 11,
    fontWeight: 700,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    bgcolor: vlanColor,
    color: vlanColorContrastText(vlanColor),
    border: '1px solid rgba(0,0,0,0.12)',
    '& .MuiChip-label': { px: 0.75 }
  } as const;
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

const rowIpSortValue = (item: ModelItem, role: DeviceRole): string => {
  if (role === 'switch') {
    const svis = item.svis ?? [];
    return (
      svis.find((svi) => svi.ip)?.ip ??
      svis[0]?.ip ??
      ''
    ).toLowerCase();
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
  sortDir: IpamSortDir
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
      cmp = rowIpSortValue(a.item, a.role).localeCompare(
        rowIpSortValue(b.item, b.role),
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
  const vlanNames = useModelStore((state) => state.vlanNames ?? {});
  const modelActions = useModelStore((state) => state.actions);
  const modelApi = useModelStoreApi();
  const uiStateActions = useUiStateStore((state) => state.actions);
  const workshopIpamTab = useUiStateStore((state) => state.workshopIpamTab);
  const rendererEl = useUiStateStore((state) => state.rendererEl);
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const { changeView } = useView();
  const {
    updateModelItem,
    updateViewItem,
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
  const [bulkNetwork, setBulkNetwork] = useState('');
  const [pipHover, setPipHover] = useState<{
    itemId: string;
    screen: { x: number; y: number };
  } | null>(null);
  const [descItemId, setDescItemId] = useState<string | null>(null);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [sortKey, setSortKey] = useState<IpamSortKey>('role');
  const [sortDir, setSortDir] = useState<IpamSortDir>('asc');
  const [panelSection, setPanelSection] = useState<
    'devices' | 'vlans' | 'changelog'
  >(workshopIpamTab);
  const [draftById, setDraftById] = useState<Record<string, IpamFieldSnapshot>>(
    {}
  );
  const [draftVlanNames, setDraftVlanNames] = useState<Record<string, string>>(
    {}
  );
  const [pendingLines, setPendingLines] = useState<string[]>([]);
  const [changelog, setChangelog] = useState<IpamChangelogEntry[]>([]);
  const [newVlanId, setNewVlanId] = useState('');
  const [newVlanName, setNewVlanName] = useState('');

  useEffect(() => {
    setPanelSection(workshopIpamTab);
  }, [workshopIpamTab]);

  const setIpamSection = useCallback(
    (tab: 'devices' | 'vlans' | 'changelog') => {
      setPanelSection(tab);
      uiStateActions.setWorkshopIpamTab(tab);
    },
    [uiStateActions]
  );

  const draftCount = Object.keys(draftById).length;
  const draftVlanNameCount = Object.keys(draftVlanNames).length;
  const hasDraft = draftCount > 0 || draftVlanNameCount > 0;

  const workingVlanNames = useMemo(() => {
    return { ...vlanNames, ...draftVlanNames };
  }, [vlanNames, draftVlanNames]);

  const workingModelItems = useMemo(() => {
    return modelItems.map((item) => mergeIpamDraft(item, draftById[item.id]));
  }, [modelItems, draftById]);

  const workingItemById = useMemo(() => {
    const map = new Map<string, ModelItem>();
    workingModelItems.forEach((item) => map.set(item.id, item));
    return map;
  }, [workingModelItems]);

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
  const planConnectors = activePlan?.connectors ?? [];
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
    return workingModelItems
      .filter((item) => planItemIds.has(item.id) && isIpamListed(item))
      .map((item) => {
        const role = resolveRole(
          item,
          item.icon ? templateKindById.get(item.icon) : null
        );
        const peerVlan = usesPeerSwitchVlan(role, item);
        const uplink = peerVlan
          ? findSwitchAccessUplink({
              item,
              modelItems: workingModelItems,
              connectors: planConnectors
            })
          : null;
        const vlan = uplink?.vlan ?? primaryAccessVlan(item);
        const vlanLabel = uplink
          ? `${uplink.switchName} · port ${uplink.switchPortLabel}`
          : vlanSummary(item);
        return {
          item,
          role,
          vlan,
          vlanLabel,
          uplink,
          peerVlan,
          viewItem: viewItemById.get(item.id)!,
          isDraft: Boolean(draftById[item.id])
        };
      })
      .filter((row) => {
        if (!q) return true;
        const hay =
          `${row.item.name} ${row.vlanLabel} ${row.vlan} ${row.uplink?.switchName ?? ''} ${row.uplink?.switchPortLabel ?? ''} ${row.item.ip ?? ''} ${(row.item.svis ?? [])
            .map((svi) => `${svi.vlan} ${svi.ip ?? ''}`)
            .join(' ')} ${ROLE_LABEL[row.role]}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => compareIpamRows(a, b, sortKey, sortDir));
  }, [
    workingModelItems,
    planItemIds,
    planConnectors,
    viewItemById,
    templateKindById,
    filter,
    sortKey,
    sortDir,
    draftById
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

  const usedVlans = useMemo(() => {
    const seen = new Set<string>();
    workingModelItems.forEach((item) => {
      if (!planItemIds.has(item.id) || !isIpamListed(item)) return;
      collectModelItemVlans(item).forEach((vlan) => {
        const key = normalizeVlanKey(vlan) || vlan.trim();
        if (key) seen.add(key);
      });
      listDeviceVlans(item).forEach((vlan) => seen.add(vlan));
    });
    return Array.from(seen).sort(
      (a, b) =>
        Number(a) - Number(b) ||
        a.localeCompare(b, undefined, { numeric: true })
    );
  }, [workingModelItems, planItemIds]);

  /** Catalog = registered IPAM VLANs (committed + draft adds/renames). */
  const catalogVlans = useMemo(() => {
    return Object.keys(workingVlanNames).sort(
      (a, b) =>
        Number(a) - Number(b) ||
        a.localeCompare(b, undefined, { numeric: true })
    );
  }, [workingVlanNames]);

  const addCatalogVlan = useCallback(() => {
    const id = normalizeVlanKey(newVlanId) || '';
    if (!id) return;
    if (Object.prototype.hasOwnProperty.call(workingVlanNames, id)) {
      return;
    }
    const name = newVlanName.trim();
    setDraftVlanNames((prev) => ({
      ...prev,
      [id]: name
    }));
    setPendingLines((prev) => [
      ...prev,
      `VLAN ${id}: dodano do katalogu${name ? ` („${name}”)` : ''}`
    ]);
    setNewVlanId('');
    setNewVlanName('');
  }, [newVlanId, newVlanName, workingVlanNames]);

  const importUsedVlansToCatalog = useCallback(() => {
    const missing = usedVlans.filter((vlan) => {
      return !Object.prototype.hasOwnProperty.call(workingVlanNames, vlan);
    });
    if (missing.length === 0) return;
    setDraftVlanNames((prev) => {
      const next = { ...prev };
      missing.forEach((vlan) => {
        if (!(vlan in next) && !(vlan in vlanNames)) {
          next[vlan] = '';
        }
      });
      return next;
    });
    setPendingLines((prev) => [
      ...prev,
      `Zaimportowano ${missing.length} VLAN-ów z planu do katalogu`
    ]);
  }, [usedVlans, vlanNames, workingVlanNames]);

  const onPlanTabChange = useCallback((viewId: string) => {
    setSelectedViewId(viewId);
    setSelectedIds([]);
    setRangeAnchorId(null);
    setPipHover(null);
    setDescItemId(null);
    setNotesDialogOpen(false);
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

  const itemLabel = useCallback((item: ModelItem | undefined | null) => {
    return item?.name?.trim() || 'Urządzenie';
  }, []);

  const discardDraft = useCallback(() => {
    setDraftById({});
    setDraftVlanNames({});
    setPendingLines([]);
  }, []);

  const setVlanDisplayName = useCallback(
    (vlan: string, name: string) => {
      const key = normalizeVlanKey(vlan) || vlan;
      const committed = vlanNames[key] ?? '';
      const next = name.trim();
      const isNewCatalogEntry = !Object.prototype.hasOwnProperty.call(
        vlanNames,
        key
      );
      setDraftVlanNames((prev) => {
        const updated = { ...prev };
        // Keep newly added catalog IDs in draft even with empty name.
        if (next === committed && !isNewCatalogEntry) {
          delete updated[key];
        } else {
          updated[key] = next;
        }
        return updated;
      });
    },
    [vlanNames]
  );

  const commitDraft = useCallback(() => {
    const ids = Object.keys(draftById);
    const renamedVlans = Object.keys(draftVlanNames);
    if (ids.length === 0 && renamedVlans.length === 0) return;

    const before: Record<string, IpamFieldSnapshot> = {};
    const autoLines: string[] = [];
    ids.forEach((id) => {
      const item = modelItems.find((candidate) => candidate.id === id);
      if (!item) return;
      before[id] = snapshotIpamFields(item);
      const after = draftById[id];
      if (!after) return;
      const name = itemLabel(item);
      if ((item.ip ?? '') !== (after.ip ?? '')) {
        autoLines.push(`${name}: IP ${item.ip || '—'} → ${after.ip || '—'}`);
      }
      if (Boolean(item.dhcp) !== Boolean(after.dhcp)) {
        autoLines.push(`${name}: DHCP ${after.dhcp ? 'on' : 'off'}`);
      }
      if (Boolean(item.poweredByPoe) !== Boolean(after.poweredByPoe)) {
        autoLines.push(
          `${name}: PoE ${after.poweredByPoe ? 'on' : 'off'}`
        );
      }
      const beforeSvi = JSON.stringify(item.svis ?? []);
      const afterSvi = JSON.stringify(after.svis ?? []);
      if (beforeSvi !== afterSvi) {
        autoLines.push(`${name}: SVI zaktualizowane`);
      }
      const beforePorts = JSON.stringify(item.ports ?? {});
      const afterPorts = JSON.stringify(after.ports ?? {});
      if (beforePorts !== afterPorts) {
        autoLines.push(`${name}: porty / VLAN zaktualizowane`);
      }
    });

    renamedVlans.forEach((vlan) => {
      const prevName = vlanNames[vlan] ?? '';
      const nextName = draftVlanNames[vlan] ?? '';
      if (!Object.prototype.hasOwnProperty.call(vlanNames, vlan)) {
        autoLines.push(
          `VLAN ${vlan}: dodano do katalogu${
            nextName ? ` („${nextName}”)` : ''
          }`
        );
        return;
      }
      autoLines.push(
        `VLAN ${vlan}: nazwa „${prevName || '—'}” → „${nextName || '—'}”`
      );
    });

    const vlanNamesBefore =
      renamedVlans.length > 0 ? { ...vlanNames } : undefined;
    const nextVlanNames =
      renamedVlans.length > 0
        ? { ...vlanNames, ...draftVlanNames }
        : undefined;

    beginHistoryTransaction();
    ids.forEach((id) => {
      const snap = draftById[id];
      if (!snap) return;
      updateModelItem(id, snapshotToModelPatch(snap));
    });
    if (nextVlanNames) {
      // Empty string = registered in catalog without a display name.
      modelActions.set({ vlanNames: nextVlanNames });
    }
    endHistoryTransaction();

    const lines = Array.from(
      new Set([...pendingLines, ...autoLines].filter(Boolean))
    );
    const finalLines =
      lines.length > 0
        ? lines
        : ids.length > 0
          ? ids.map((id) => {
              const item = modelItems.find((candidate) => candidate.id === id);
              return `Zmiana: ${itemLabel(item)}`;
            })
          : ['Zaktualizowano nazwy VLAN'];
    const summary =
      finalLines.length === 1
        ? finalLines[0]
        : `Zatwierdzono ${finalLines.length} zmian${
            ids.length ? ` (${ids.length} urz.)` : ''
          }`;

    setChangelog((prev) =>
      [
        {
          id: generateId(),
          at: Date.now(),
          summary,
          lines: finalLines,
          before,
          vlanNamesBefore
        },
        ...prev
      ].slice(0, IPAM_CHANGELOG_LIMIT)
    );
    setDraftById({});
    setDraftVlanNames({});
    setPendingLines([]);
  }, [
    beginHistoryTransaction,
    draftById,
    draftVlanNames,
    endHistoryTransaction,
    itemLabel,
    modelActions,
    modelItems,
    pendingLines,
    updateModelItem,
    vlanNames
  ]);

  const rollbackEntry = useCallback(
    (entryId: string) => {
      const index = changelog.findIndex((entry) => entry.id === entryId);
      if (index < 0) return;

      beginHistoryTransaction();
      for (let i = 0; i <= index; i += 1) {
        const entry = changelog[i];
        Object.entries(entry.before).forEach(([itemId, snap]) => {
          updateModelItem(itemId, snapshotToModelPatch(snap));
        });
        if (entry.vlanNamesBefore) {
          modelActions.set({ vlanNames: { ...entry.vlanNamesBefore } });
        }
      }
      endHistoryTransaction();

      setChangelog((prev) => prev.slice(index + 1));
      setDraftById({});
      setDraftVlanNames({});
      setPendingLines([]);
    },
    [
      beginHistoryTransaction,
      changelog,
      endHistoryTransaction,
      modelActions,
      updateModelItem
    ]
  );

  const setItemIp = useCallback(
    (id: string, ip: string) => {
      const nextIp = ip.trim() ? ip : undefined;
      setDraftById((prev) => {
        const base = modelItems.find((candidate) => candidate.id === id);
        if (!base) return prev;
        const working = mergeIpamDraft(base, prev[id]);
        return {
          ...prev,
          [id]: {
            ...snapshotIpamFields(working),
            ip: nextIp,
            dhcp: undefined
          }
        };
      });
    },
    [modelItems]
  );

  const setSwitchSviIp = useCallback(
    (itemId: string, sviId: string, ip: string) => {
      const nextIp = ip.trim() ? ip : undefined;
      setDraftById((prev) => {
        const base = modelItems.find((candidate) => candidate.id === itemId);
        if (!base) return prev;
        const working = mergeIpamDraft(base, prev[itemId]);
        const nextSvis = (working.svis ?? []).map((svi) => {
          if (svi.id !== sviId) return svi;
          return { ...svi, ip: nextIp, dhcp: undefined };
        });
        return {
          ...prev,
          [itemId]: {
            ...snapshotIpamFields(working),
            svis: nextSvis
          }
        };
      });
    },
    [modelItems]
  );

  const setSwitchSviDhcp = useCallback(
    (itemId: string, sviId: string, dhcp: boolean) => {
      const item = workingItemById.get(itemId);
      if (!item) return;
      const nextSvis = (item.svis ?? []).map((svi) => {
        if (svi.id !== sviId) return svi;
        return { ...svi, dhcp: dhcp || undefined };
      });
      setDraftById((prev) => ({
        ...prev,
        [itemId]: {
          ...snapshotIpamFields(mergeIpamDraft(item, prev[itemId])),
          svis: nextSvis
        }
      }));
      const vlan =
        normalizeVlanKey(
          (item.svis ?? []).find((svi) => svi.id === sviId)?.vlan
        ) || '?';
      setPendingLines((prev) => [
        ...prev,
        `${itemLabel(item)} SVI VLAN ${vlan}: DHCP ${dhcp ? 'on' : 'off'}`
      ]);
    },
    [itemLabel, workingItemById]
  );

  const addSwitchSvi = useCallback(
    (itemId: string) => {
      const item = workingItemById.get(itemId);
      if (!item) return;
      const nextSvis = [
        ...(item.svis ?? []),
        {
          id: generateId(),
          vlan: '1',
          ip: '',
          vlanColor: ''
        }
      ];
      setDraftById((prev) => ({
        ...prev,
        [itemId]: {
          ...snapshotIpamFields(mergeIpamDraft(item, prev[itemId])),
          svis: nextSvis
        }
      }));
      setPendingLines((prev) => [
        ...prev,
        `${itemLabel(item)}: dodano SVI`
      ]);
    },
    [itemLabel, workingItemById]
  );

  const removeSwitchSvi = useCallback(
    (itemId: string, sviId: string) => {
      const item = workingItemById.get(itemId);
      if (!item) return;
      const removed = (item.svis ?? []).find((svi) => svi.id === sviId);
      const nextSvis = (item.svis ?? []).filter((svi) => svi.id !== sviId);
      setDraftById((prev) => ({
        ...prev,
        [itemId]: {
          ...snapshotIpamFields(mergeIpamDraft(item, prev[itemId])),
          svis: nextSvis
        }
      }));
      setPendingLines((prev) => [
        ...prev,
        `${itemLabel(item)}: usunięto SVI VLAN ${normalizeVlanKey(removed?.vlan) || '?'}`
      ]);
    },
    [itemLabel, workingItemById]
  );

  const setItemDhcp = useCallback(
    (id: string, dhcp: boolean) => {
      const item = workingItemById.get(id);
      if (!item) return;
      setDraftById((prev) => ({
        ...prev,
        [id]: {
          ...snapshotIpamFields(mergeIpamDraft(item, prev[id])),
          dhcp: dhcp || undefined,
          ip: dhcp ? undefined : item.ip
        }
      }));
      setPendingLines((prev) => [
        ...prev,
        `${itemLabel(item)}: DHCP ${dhcp ? 'on' : 'off'}`
      ]);
    },
    [itemLabel, workingItemById]
  );

  const setItemPoweredByPoe = useCallback(
    (id: string, poweredByPoe: boolean) => {
      const item = workingItemById.get(id);
      if (!item) return;
      setDraftById((prev) => ({
        ...prev,
        [id]: {
          ...snapshotIpamFields(mergeIpamDraft(item, prev[id])),
          poweredByPoe: poweredByPoe || undefined
        }
      }));
      setPendingLines((prev) => [
        ...prev,
        `${itemLabel(item)}: PoE ${poweredByPoe ? 'on' : 'off'}`
      ]);
    },
    [itemLabel, workingItemById]
  );

  const applyBulkNetwork = useCallback(() => {
    if (selectedIds.length === 0) return;
    const parsed = parseCidrBase(bulkNetwork);
    if (!parsed) return;

    const selected = selectedIds
      .map((id) => workingItemById.get(id))
      .filter((item): item is ModelItem => Boolean(item));

    const switches = selected.filter((item) => isSwitchLikeIcon(item.icon));
    const hosts = selected.filter((item) => !isSwitchLikeIcon(item.icon));
    const lines: string[] = [];

    setDraftById((prev) => {
      const next = { ...prev };
      const workingOf = (itemId: string) => {
        const base = workingItemById.get(itemId);
        if (!base) return null;
        return mergeIpamDraft(base, next[itemId]);
      };

      if (switches.length > 0) {
        const gateway = hostIpFromIndex(parsed.octets, parsed.prefix, 1);
        const swBase = workingOf(switches[0].id);
        if (swBase) {
          const vlan = primaryAccessVlan(swBase);
          const existing = swBase.svis ?? [];
          const match = existing.find(
            (svi) => normalizeVlanKey(svi.vlan) === vlan
          );
          const color = isVlan1(vlan)
            ? undefined
            : getVlanColor(vlan) || undefined;
          const nextSvis = match
            ? existing.map((svi) =>
                svi.id === match.id
                  ? { ...svi, ip: gateway, dhcp: undefined, vlanColor: color }
                  : svi
              )
            : [
                ...existing,
                {
                  id: generateId(),
                  vlan,
                  ip: gateway,
                  vlanColor: color
                }
              ];
          next[swBase.id] = {
            ...snapshotIpamFields(swBase),
            svis: nextSvis
          };
          lines.push(
            `${itemLabel(swBase)} SVI VLAN ${vlan}: IP → ${gateway}`
          );
        }
      }

      hosts.forEach((host, index) => {
        const working = workingOf(host.id);
        if (!working) return;
        const ip = hostIpFromIndex(parsed.octets, parsed.prefix, index + 2);
        next[host.id] = {
          ...snapshotIpamFields(working),
          dhcp: undefined,
          ip
        };
        lines.push(`${itemLabel(working)}: IP → ${ip}`);
      });

      return next;
    });

    if (lines.length > 0) {
      setPendingLines((prev) => [...prev, ...lines]);
    }
  }, [bulkNetwork, itemLabel, selectedIds, workingItemById]);

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
  const descRow = descItemId
    ? rows.find((row) => row.item.id === descItemId) ?? null
    : null;
  const descItem = descRow?.item ?? null;
  const descViewItem = descRow?.viewItem ?? null;
  const descHasBadge = descItem ? hasNodeDescriptionBadge(descItem) : false;
  const descHasNotes = descItem ? hasNodeDescriptionNotes(descItem) : false;

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
        open={Boolean(descItem && descViewItem)}
        onClose={() => {
          setNotesDialogOpen(false);
          setDescItemId(null);
        }}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            maxHeight: 'min(90vh, 720px)'
          }
        }}
      >
        {descItem && descViewItem && (
          <>
            <DialogTitle sx={{ fontSize: 16, fontWeight: 700, pb: 1 }}>
              Opis — {descItem.name || 'urządzenie'}
            </DialogTitle>
            <DialogContent
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1.25,
                pt: 1
              }}
            >
              <TextField
                label="Tytuł"
                size="small"
                fullWidth
                value={descItem.descriptionTitle ?? ''}
                onChange={(e) => {
                  const descriptionTitle = e.target.value;
                  updateModelItem(descItem.id, {
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
                value={descItem.descriptionSummary ?? ''}
                onChange={(e) => {
                  const descriptionSummary = clampDescriptionSummary(
                    e.target.value
                  );
                  updateModelItem(descItem.id, {
                    descriptionSummary: descriptionSummary.trim()
                      ? descriptionSummary
                      : undefined
                  });
                }}
                inputProps={{ maxLength: DESCRIPTION_SUMMARY_MAX }}
                helperText={`${(descItem.descriptionSummary ?? '').length}/${DESCRIPTION_SUMMARY_MAX} · treść plakietki (pełny opis po rozwinięciu)`}
                FormHelperTextProps={{ sx: { fontSize: 10, m: 0, mt: 0.5 } }}
                sx={fieldSx}
              />
              <Button
                variant="contained"
                size="small"
                onClick={() => setNotesDialogOpen(true)}
                sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
              >
                {descHasNotes
                  ? 'Otwórz opis (notatki)'
                  : 'Dodaj opis (notatki)'}
              </Button>
              <Typography
                sx={{
                  fontSize: 11,
                  color: 'text.secondary',
                  lineHeight: 1.35
                }}
              >
                Na plakietce: tytuł + skrót. Domyślnie opis otwierasz przyciskiem
                (i) na urządzeniu.
              </Typography>
              <FormControlLabel
                sx={{ mt: 0, ml: 0, mr: 0 }}
                control={
                  <Switch
                    size="small"
                    checked={descViewItem.showDescriptionLabel === true}
                    onChange={(e) => {
                      updateViewItem(descViewItem.id, {
                        showDescriptionLabel: e.target.checked
                      });
                    }}
                    disabled={!descHasBadge}
                  />
                }
                label={
                  <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                    Pokazuj plakietkę
                  </Typography>
                }
              />
              {descHasBadge && descViewItem.showDescriptionLabel === true && (
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
                    value={clampNodeLabelScale(descViewItem.labelScale)}
                    onChange={(_, value) => {
                      const labelScale = Array.isArray(value)
                        ? value[0]
                        : value;
                      updateViewItem(descViewItem.id, {
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
                    value={descViewItem.labelHeight ?? 140}
                    onChange={(_, value) => {
                      const labelHeight = Array.isArray(value)
                        ? value[0]
                        : value;
                      updateViewItem(descViewItem.id, {
                        labelHeight
                      });
                    }}
                    valueLabelDisplay="auto"
                  />
                </Box>
              )}
            </DialogContent>

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
                Opis — {descItem.name || 'urządzenie'}
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
                  value={descItem.description}
                  onChange={(text) => {
                    if (descItem.description !== text) {
                      updateModelItem(descItem.id, { description: text });
                    }
                  }}
                />
              </DialogContent>
            </Dialog>
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
            flexWrap="wrap"
          >
            <Button
              size="small"
              variant="contained"
              disabled={!hasDraft}
              onClick={commitDraft}
              sx={{ textTransform: 'none' }}
            >
              Zatwierdź zmiany
              {hasDraft
                ? ` (${draftCount + draftVlanNameCount})`
                : ''}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              disabled={!hasDraft}
              onClick={discardDraft}
              sx={{ textTransform: 'none' }}
            >
              Odrzuć
            </Button>
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

        <Tabs
          value={panelSection}
          onChange={(_, value) => {
            setIpamSection(value as 'devices' | 'vlans' | 'changelog');
          }}
          sx={{
            minHeight: 36,
            '& .MuiTab-root': {
              minHeight: 36,
              textTransform: 'none',
              fontSize: 13,
              py: 0.5
            }
          }}
        >
          <Tab value="devices" label="Urządzenia" />
          <Tab
            value="vlans"
            label={`Vlany${catalogVlans.length ? ` (${catalogVlans.length})` : ''}`}
          />
          <Tab
            value="changelog"
            icon={<HistoryIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label={`Changelog${changelog.length ? ` (${changelog.length})` : ''}`}
          />
        </Tabs>

        {hasDraft && (panelSection === 'devices' || panelSection === 'vlans') && (
          <Box
            sx={{
              px: 1.25,
              py: 0.75,
              borderRadius: 1.5,
              bgcolor: 'action.selected',
              border: '1px solid',
              borderColor: 'warning.main'
            }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
              Niezatwierdzone zmiany
              {draftCount ? ` · ${draftCount} urz.` : ''}
              {draftVlanNameCount ? ` · ${draftVlanNameCount} nazw VLAN` : ''}
              — użyj „Zatwierdź zmiany”.
            </Typography>
          </Box>
        )}

        {panelSection === 'changelog' ? (
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              bgcolor: 'background.paper',
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              p: 1.5
            }}
          >
            {changelog.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                Brak zatwierdzonych zmian w tej sesji IPAM. Po „Zatwierdź zmiany”
                pojawią się tu wpisy z możliwością rollbacku (do{' '}
                {IPAM_CHANGELOG_LIMIT}).
              </Typography>
            ) : (
              <Stack spacing={1.25}>
                {changelog.map((entry, index) => (
                  <Box
                    key={entry.id}
                    sx={{
                      p: 1.25,
                      borderRadius: 1.5,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: index === 0 ? 'action.hover' : 'transparent'
                    }}
                  >
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ sm: 'flex-start' }}
                      justifyContent="space-between"
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                          {entry.summary}
                        </Typography>
                        <Typography
                          sx={{ fontSize: 11, color: 'text.secondary', mb: 0.75 }}
                        >
                          {formatIpamChangelogTime(entry.at)}
                          {index === 0 ? ' · najnowszy' : ''}
                        </Typography>
                        <Stack spacing={0.25}>
                          {entry.lines.slice(0, 12).map((line, lineIndex) => (
                            <Typography
                              key={`${entry.id}-${lineIndex}`}
                              sx={{
                                fontSize: 12,
                                fontFamily:
                                  'ui-monospace, SFMono-Regular, Menlo, monospace',
                                color: 'text.primary'
                              }}
                            >
                              · {line}
                            </Typography>
                          ))}
                          {entry.lines.length > 12 && (
                            <Typography
                              sx={{ fontSize: 11, color: 'text.secondary' }}
                            >
                              …i {entry.lines.length - 12} więcej
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        startIcon={<UndoIcon />}
                        onClick={() => rollbackEntry(entry.id)}
                        sx={{ textTransform: 'none', flexShrink: 0 }}
                      >
                        Rollback
                        {index > 0 ? ` (+${index} nowsze)` : ''}
                      </Button>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        ) : panelSection === 'vlans' ? (
          <Stack spacing={1.25} sx={{ flex: 1, minHeight: 0 }}>
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
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ sm: 'center' }}
              >
                <TextField
                  size="small"
                  label="Nowy VLAN"
                  placeholder="np. 30"
                  value={newVlanId}
                  onChange={(e) => setNewVlanId(e.target.value)}
                  sx={{ ...fieldSx, width: 120 }}
                />
                <TextField
                  size="small"
                  label="Nazwa"
                  placeholder="np. Biuro"
                  value={newVlanName}
                  onChange={(e) => setNewVlanName(e.target.value)}
                  sx={{ ...fieldSx, minWidth: 200, flex: 1 }}
                />
                <Button
                  size="small"
                  variant="contained"
                  disabled={
                    !normalizeVlanKey(newVlanId) ||
                    Object.prototype.hasOwnProperty.call(
                      workingVlanNames,
                      normalizeVlanKey(newVlanId) || ''
                    )
                  }
                  onClick={addCatalogVlan}
                  sx={{ textTransform: 'none' }}
                >
                  Dodaj
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={
                    usedVlans.every((vlan) =>
                      Object.prototype.hasOwnProperty.call(
                        workingVlanNames,
                        vlan
                      )
                    )
                  }
                  onClick={importUsedVlansToCatalog}
                  sx={{ textTransform: 'none' }}
                  title="Dodaj do katalogu VLAN-y już używane na planie"
                >
                  Importuj z planu
                </Button>
              </Stack>
              <Typography
                sx={{ mt: 0.75, fontSize: 11, color: 'text.secondary' }}
              >
                Katalog VLAN-ów jest źródłem prawdy dla zakładki 2D — porty i
                SVI mogą używać tylko VLAN-ów dodanych tutaj (po zatwierdzeniu).
              </Typography>
            </Box>

            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: 'auto',
                bgcolor: 'background.paper',
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: 'divider'
              }}
            >
              {catalogVlans.length === 0 ? (
                <Typography
                  sx={{ p: 2, fontSize: 13, color: 'text.secondary' }}
                >
                  Katalog pusty. Dodaj VLAN powyżej albo zaimportuj z planu.
                </Typography>
              ) : (
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width={88}>Kolor</TableCell>
                      <TableCell width={100}>VLAN</TableCell>
                      <TableCell>Nazwa</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {catalogVlans.map((vlan) => {
                      const color = getPortStatusColor(vlan);
                      const nameValue = workingVlanNames[vlan] ?? '';
                      const isNameDraft =
                        Object.prototype.hasOwnProperty.call(
                          draftVlanNames,
                          vlan
                        );
                      return (
                        <TableRow key={vlan} hover>
                          <TableCell>
                            <Box
                              sx={{
                                width: 36,
                                height: 22,
                                borderRadius: 1,
                                bgcolor: color,
                                border: '1px solid rgba(0,0,0,0.12)'
                              }}
                              title={color}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={vlan}
                              title={`VLAN ${vlan}`}
                              sx={vlanBadgeSx(color)}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              fullWidth
                              placeholder="np. Biuro, Serwerownia, Goście…"
                              value={nameValue}
                              onChange={(e) =>
                                setVlanDisplayName(vlan, e.target.value)
                              }
                              sx={{
                                ...fieldSx,
                                maxWidth: 420,
                                ...(isNameDraft
                                  ? {
                                      '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'warning.main'
                                      }
                                    }
                                  : {})
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Box>
          </Stack>
        ) : (
          <>
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
                <TableCell width={220}>
                  <TableSortLabel
                    active={sortKey === 'vlan'}
                    direction={sortKey === 'vlan' ? sortDir : 'asc'}
                    onClick={() => toggleSort('vlan')}
                  >
                    VLAN
                  </TableSortLabel>
                </TableCell>
                <TableCell width={320}>
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
                <TableCell width={72} align="center">
                  PoE
                </TableCell>
                <TableCell width={96} align="center">
                  Mapa
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
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
                rows.map(({ item, role, vlan, vlanLabel, uplink, peerVlan, isDraft }) => {
                  const selected = selectedIds.includes(item.id);
                  const canHostIp =
                    role === 'host' || role === 'server' || role === 'switch';
                  const vlanColor = getPortStatusColor(vlan);
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
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                            {item.name}
                          </Typography>
                          {isDraft && (
                            <Chip
                              size="small"
                              label="draft"
                              color="warning"
                              sx={{ height: 18, fontSize: 10 }}
                            />
                          )}
                        </Stack>
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
                      <TableCell>
                        {peerVlan ? (
                          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                            <Chip
                              size="small"
                              label={vlan}
                              title={
                                uplink
                                  ? `VLAN ${vlan} · ${uplink.switchName} port ${uplink.switchPortLabel}`
                                  : `VLAN ${vlan}`
                              }
                              sx={vlanBadgeSx(vlanColor)}
                            />
                            <Typography
                              sx={{
                                fontSize: 11,
                                color: uplink
                                  ? 'text.secondary'
                                  : 'warning.main',
                                lineHeight: 1.25,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                              title={
                                uplink
                                  ? `${uplink.switchName} · port ${uplink.switchPortLabel}`
                                  : undefined
                              }
                            >
                              {uplink
                                ? `${uplink.switchName} · port ${uplink.switchPortLabel}`
                                : 'Brak połączenia ze switchem'}
                            </Typography>
                          </Stack>
                        ) : role === 'switch' ? (
                          <Stack
                            direction="row"
                            flexWrap="wrap"
                            gap={0.5}
                            sx={{ maxWidth: 220 }}
                          >
                            {listDeviceVlans(item).map((entry) => {
                              const color = getPortStatusColor(entry);
                              return (
                                <Chip
                                  key={entry}
                                  size="small"
                                  label={entry}
                                  title={`VLAN ${entry}`}
                                  sx={vlanBadgeSx(color)}
                                />
                              );
                            })}
                          </Stack>
                        ) : (
                          <Stack spacing={0.25}>
                            <Chip
                              size="small"
                              label={vlan}
                              title={`VLAN ${vlan}`}
                              sx={vlanBadgeSx(vlanColor)}
                            />
                            {vlanLabel !== vlan ? (
                              <Typography
                                sx={{
                                  fontSize: 10,
                                  color: 'text.secondary',
                                  lineHeight: 1.2
                                }}
                              >
                                porty: {vlanLabel}
                              </Typography>
                            ) : null}
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {role === 'switch' ? (
                          <Stack spacing={0.75}>
                            {(item.svis?.length ?? 0) === 0 ? (
                              <Typography
                                sx={{ fontSize: 12, color: 'text.secondary' }}
                              >
                                Brak SVI
                              </Typography>
                            ) : (
                              <Box
                                component="table"
                                sx={{
                                  width: '100%',
                                  borderCollapse: 'collapse',
                                  '& th, & td': {
                                    px: 0.5,
                                    py: 0.35,
                                    textAlign: 'left',
                                    verticalAlign: 'middle',
                                    borderBottom: '1px solid',
                                    borderColor: 'divider'
                                  },
                                  '& th': {
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: 'text.secondary',
                                    letterSpacing: 0.3,
                                    textTransform: 'uppercase',
                                    borderBottomColor: 'divider'
                                  },
                                  '& tr:last-of-type td': {
                                    borderBottom: 'none'
                                  }
                                }}
                              >
                                <thead>
                                  <tr>
                                    <th style={{ width: 64 }}>VLAN</th>
                                    <th>IP</th>
                                    <th style={{ width: 52 }}>DHCP</th>
                                    <th style={{ width: 36 }} />
                                  </tr>
                                </thead>
                                <tbody>
                                  {(item.svis ?? []).map((svi) => {
                                    const sviVlan =
                                      normalizeVlanKey(svi.vlan) || '1';
                                    const sviColor = getPortStatusColor(sviVlan);
                                    return (
                                      <tr key={svi.id}>
                                        <td>
                                          <Chip
                                            size="small"
                                            label={sviVlan}
                                            title={`VLAN ${sviVlan} (ustaw w zakładce 2D)`}
                                            sx={vlanBadgeSx(sviColor)}
                                          />
                                        </td>
                                        <td>
                                          <TextField
                                            size="small"
                                            fullWidth
                                            placeholder="192.168.1.1/24"
                                            value={
                                              svi.dhcp ? '' : svi.ip ?? ''
                                            }
                                            disabled={Boolean(svi.dhcp)}
                                            onChange={(e) =>
                                              setSwitchSviIp(
                                                item.id,
                                                svi.id,
                                                e.target.value
                                              )
                                            }
                                            sx={{
                                              ...fieldSx,
                                              '& .MuiInputBase-root': {
                                                ...fieldSx[
                                                  '& .MuiInputBase-root'
                                                ],
                                                fontSize: 12
                                              },
                                              '& .MuiInputBase-input': {
                                                py: 0.4
                                              }
                                            }}
                                          />
                                        </td>
                                        <td>
                                          <Checkbox
                                            size="small"
                                            checked={Boolean(svi.dhcp)}
                                            onChange={(e) =>
                                              setSwitchSviDhcp(
                                                item.id,
                                                svi.id,
                                                e.target.checked
                                              )
                                            }
                                            sx={{ p: 0.25 }}
                                          />
                                        </td>
                                        <td>
                                          <Tooltip title="Usuń SVI">
                                            <IconButton
                                              size="small"
                                              aria-label="Usuń SVI"
                                              onClick={() =>
                                                removeSwitchSvi(item.id, svi.id)
                                              }
                                              sx={{ p: 0.25 }}
                                            >
                                              <DeleteOutlineIcon
                                                sx={{ fontSize: 16 }}
                                              />
                                            </IconButton>
                                          </Tooltip>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </Box>
                            )}
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => addSwitchSvi(item.id)}
                              sx={{
                                textTransform: 'none',
                                alignSelf: 'flex-start',
                                py: 0.25
                              }}
                            >
                              Dodaj SVI
                            </Button>
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
                        {role === 'host' || isNonVlanAwareDevice(item.icon) ? (
                          <Tooltip title="Urządzenie zasilane PoE">
                            <Switch
                              size="small"
                              checked={Boolean(item.poweredByPoe)}
                              onChange={(e) =>
                                setItemPoweredByPoe(
                                  item.id,
                                  e.target.checked
                                )
                              }
                            />
                          </Tooltip>
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
                                ? 'Edytuj opis'
                                : 'Dodaj opis'
                            }
                          >
                            <IconButton
                              size="small"
                              color={
                                hasDescription(item) ? 'primary' : 'default'
                              }
                              aria-label={
                                hasDescription(item)
                                  ? 'Edytuj opis urządzenia'
                                  : 'Dodaj opis urządzenia'
                              }
                              onClick={() => {
                                setNotesDialogOpen(false);
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
          </>
        )}
      </Stack>
    </Box>
  );
};
