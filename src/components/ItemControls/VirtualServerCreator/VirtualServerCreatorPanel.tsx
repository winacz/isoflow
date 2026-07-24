import React, { useMemo, useState, useRef } from 'react';
import {
  Box, Button, Divider, FormControl, FormLabel,
  IconButton, MenuItem, Select, Stack, TextField, Typography, Alert,
  Switch, FormControlLabel
} from '@mui/material';
import {
  Add as AddIcon, DeleteOutline as DeleteIcon,
  ContentCopy as CopyIcon
} from '@mui/icons-material';
import { ControlsContainer } from 'src/components/ItemControls/components/ControlsContainer';
import { Section } from 'src/components/ItemControls/components/Section';
import { TILE_SIZE_2D } from 'src/config';
import { generateId, layoutDeviceTemplate, validateDeviceTemplateFit, cloneDeviceTemplate } from 'src/utils';
import type { DeviceTemplate, VirtualInstance, VirtualInterface } from 'src/types';
import { ProxmoxNode, buildProxmoxConfig } from 'src/components/Shapes2d/ProxmoxNode';
import { WorkshopLayout } from 'src/components/Workshop/WorkshopLayout';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { MuiColorInput } from 'mui-color-input';

const PORT_OPTIONS = [1, 2, 4, 8, 12, 16, 24, 48] as const;

const createDraft = (): DeviceTemplate => {
  return {
    id: generateId(),
    name: 'Nowy Serwer',
    kind: 'SERVER',
    formFactor: 'RACK',
    numbering: 'ROWS_LTR',
    sections: [{ id: generateId(), media: 'RJ45', ports: 4, rows: 1 }],
    virtualInstances: []
  };
};

const createInstance = (): VirtualInstance => ({
  id: generateId(),
  name: 'VM-01',
  type: 'VM',
  status: 'running',
  interfaces: [{ id: generateId(), type: 'BRIDGE' }]
});

interface Props {
  initialTemplate?: DeviceTemplate;
  mode?: 'create' | 'edit';
  onCancel: () => void;
  onSave: (template: DeviceTemplate) => void;
  onDelete?: () => void;
  isWorkshopMode?: boolean;
  instanceEdit?: boolean;
}

export const VirtualServerCreatorPanel = ({ 
  initialTemplate, 
  mode: initialMode = 'create', 
  onCancel, 
  onSave,
  onDelete,
  isWorkshopMode,
  instanceEdit = false
}: Props) => {
  const [draft, setDraft] = useState<DeviceTemplate>(() => initialTemplate ?? createDraft());
  const [mode, setMode] = useState<'create' | 'edit'>(initialTemplate ? initialMode : 'create');

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const { size: containerSize } = useResizeObserver(previewContainerRef.current);
  const [manualZoom, setManualZoom] = useState(1);

  const layout = useMemo(() => layoutDeviceTemplate(draft), [draft]);
  const fitError = useMemo(() => validateDeviceTemplateFit(draft), [draft]);

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

  const canSave = draft.name.trim().length > 0 && !fitError;
  const title = mode === 'edit' ? 'Edycja Serwera' : 'Kreator Serwera';
  const subtitle = 'Zdefiniuj środowisko wirtualne i fizyczne łącza serwera.';

  const updatePortsCount = (ports: number) => {
    setDraft((prev) => ({
      ...prev,
      sections: [{ ...prev.sections[0], ports }]
    }));
  };

  const addInstance = () => {
    setDraft(prev => ({
      ...prev,
      virtualInstances: [...(prev.virtualInstances || []), createInstance()]
    }));
  };

  const updateInstance = (id: string, patch: Partial<VirtualInstance>) => {
    setDraft(prev => ({
      ...prev,
      virtualInstances: (prev.virtualInstances || []).map(inst => inst.id === id ? { ...inst, ...patch } : inst)
    }));
  };

  const updateInterface = (instanceId: string, interfaceId: string, patch: Partial<VirtualInterface>) => {
    setDraft(prev => ({
      ...prev,
      virtualInstances: (prev.virtualInstances || []).map(inst => {
        if (inst.id !== instanceId) return inst;
        return {
          ...inst,
          interfaces: inst.interfaces.map(iface => iface.id === interfaceId ? { ...iface, ...patch } : iface)
        };
      })
    }));
  };

  const deleteInstance = (id: string) => {
    setDraft(prev => ({
      ...prev,
      virtualInstances: (prev.virtualInstances || []).filter(inst => inst.id !== id)
    }));
  };

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
        <ProxmoxNode
          config={buildProxmoxConfig(draft, layout.ports)}
          size={layout.size}
          layoutPorts={layout.ports}
          name={draft.name}
          centered={false}
          showShadow={false}
        />
      </Box>
    </Box>
  );

  const basicInfo = (
    <Stack spacing={2}>
      {fitError && <Alert severity="warning">{fitError}</Alert>}

      <TextField
        label="Nazwa Serwera"
        size="small"
        fullWidth
        value={draft.name}
        onChange={(e) => setDraft(prev => ({ ...prev, name: e.target.value }))}
      />

      <FormControl size="small" fullWidth>
        <FormLabel sx={{ fontSize: 11, mb: 0.5, fontWeight: 600 }}>Ilość fizycznych portów (RJ45)</FormLabel>
        <Select value={draft.sections[0]?.ports || 4} onChange={(e) => updatePortsCount(Number(e.target.value))}>
          {PORT_OPTIONS.map((count) => <MenuItem key={count} value={count}>{count} {count === 1 ? 'port' : 'portów'}</MenuItem>)}
        </Select>
      </FormControl>
    </Stack>
  );

  const instancesInfo = (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2">Maszyny i Kontenery</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={addInstance}>Dodaj instancję</Button>
      </Stack>

      {(draft.virtualInstances || []).map((inst, index) => (
        <Box key={inst.id} sx={{ p: 1.25, borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>{inst.type} {index + 1}</Typography>
              <IconButton size="small" onClick={() => deleteInstance(inst.id)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField size="small" sx={{ flex: 1 }} label="Nazwa" value={inst.name} onChange={(e) => updateInstance(inst.id, { name: e.target.value })} />
              <FormControl size="small" sx={{ width: 100 }}>
                <Select value={inst.type} onChange={(e) => updateInstance(inst.id, { type: e.target.value as any })}>
                  <MenuItem value="VM">VM</MenuItem>
                  <MenuItem value="LXC">LXC</MenuItem>
                  <MenuItem value="DOCKER">DOCKER</MenuItem>
                </Select>
              </FormControl>
              <MuiColorInput
                format="hex8"
                size="small"
                sx={{ width: 140 }}
                value={inst.color || '#e2e8f0'}
                onChange={(color) => updateInstance(inst.id, { color })}
              />
            </Stack>

            <TextField size="small" fullWidth label="Opis / Komentarz (opcjonalnie)" value={inst.description || ''} onChange={(e) => updateInstance(inst.id, { description: e.target.value })} />
            
            {inst.interfaces.map(iface => (
               <Stack key={iface.id} spacing={1} sx={{ p: 1, bgcolor: '#f8fafc', borderRadius: 1 }}>
                 <Stack direction="row" spacing={1} alignItems="center">
                   <TextField size="small" sx={{ width: 80 }} label="Nazwa" placeholder="eth0" value={iface.name || ''} onChange={(e) => updateInterface(inst.id, iface.id, { name: e.target.value })} />
                   <FormControl size="small" sx={{ minWidth: 100 }}>
                     <Select value={iface.type} onChange={(e) => updateInterface(inst.id, iface.id, { type: e.target.value as any })}>
                       <MenuItem value="BRIDGE">Bridge (Mostek)</MenuItem>
                       <MenuItem value="NAT">NAT</MenuItem>
                       <MenuItem value="PASSTHROUGH">Passthrough (Bezpośrednio)</MenuItem>
                     </Select>
                   </FormControl>
                   {(iface.type === 'BRIDGE' || iface.type === 'PASSTHROUGH') && (
                     <FormControl size="small" sx={{ flex: 1 }}>
                        <Select 
                          value={iface.targetPortId || ''} 
                          displayEmpty
                          onChange={(e) => updateInterface(inst.id, iface.id, { targetPortId: e.target.value })}
                        >
                          <MenuItem value="">Brak fizycznego portu</MenuItem>
                          {layout.ports.map(p => (
                             <MenuItem key={p.id} value={p.id}>Port zewn: {p.label}</MenuItem>
                          ))}
                        </Select>
                     </FormControl>
                   )}
                 </Stack>
                 <Stack direction="row" spacing={1} alignItems="center">
                   <TextField size="small" sx={{ flex: 2 }} label="Adres IP" placeholder="192.168.1.10" value={iface.ipAddress || ''} onChange={(e) => updateInterface(inst.id, iface.id, { ipAddress: e.target.value })} />
                   <TextField size="small" sx={{ flex: 1 }} label="VLAN" placeholder="10" value={iface.vlan || ''} onChange={(e) => updateInterface(inst.id, iface.id, { vlan: e.target.value })} />
                   <FormControlLabel control={<Switch size="small" checked={iface.isTrunk || false} onChange={(e) => updateInterface(inst.id, iface.id, { isTrunk: e.target.checked })} />} label="Trunk" sx={{ ml: 1, mr: 0, '& .MuiFormControlLabel-label': { fontSize: 12 } }} />
                 </Stack>
               </Stack>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );

  const formBody = isWorkshopMode ? (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
      {basicInfo}
      {instancesInfo}
    </Box>
  ) : (
    <Stack spacing={2}>
      {!isWorkshopMode && previewContent}
      {basicInfo}
      <Divider />
      {instancesInfo}
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
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={onCancel}>Anuluj</Button>
          <Button variant="contained" disabled={!canSave} onClick={() => onSave({ ...draft, name: draft.name.trim() })}>
            {mode === 'edit' ? 'Zapisz zmiany' : 'Zapisz Serwer'}
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
                {subtitle}
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
            <Typography variant="body2" color="text.secondary">{title}</Typography>
            <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
          </Stack>
        </Section>
      }
    >
      <Section>{formContent}</Section>
    </ControlsContainer>
  );
};
