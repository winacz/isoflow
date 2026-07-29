import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  InputLabel,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { WorkshopLayout } from 'src/components/Workshop/WorkshopLayout';
import { ConnectionMatrixTopology, type Vmbr, type Vm, type Nic, type VmInterface } from './ConnectionMatrixTopology';

const defaultData: { vmbrs: Vmbr[]; vms: Vm[]; nics: Nic[] } = {
  vmbrs: [
    { id: 'vmbr0', type: 'bridge', label: 'Bridge' },
    { id: 'vmbr1', type: 'vlan', label: 'VLAN Trunk' },
    { id: 'vmbr2', type: 'nat', label: 'NAT/DMZ' },
    { id: 'vmbr3', type: 'isolated', label: 'Isolated' }
  ],
  vms: [
    { id: 'vm101', name: 'VM 101', description: 'pfSense Router', type: 'qemu', interfaces: [
      { id: 'net0', targetVmbrId: 'vmbr0' },
      { id: 'net1', targetVmbrId: 'vmbr1' },
      { id: 'net2', targetVmbrId: 'vmbr2' }
    ]},
    { id: 'vm102', name: 'VM 102', description: 'Web Server 1', type: 'qemu', interfaces: [
      { id: 'net0', targetVmbrId: 'vmbr1', vlanTag: 10 }
    ]},
    { id: 'vm103', name: 'VM 103', description: 'Web Server 2', type: 'qemu', interfaces: [
      { id: 'net0', targetVmbrId: 'vmbr1', vlanTag: 10 }
    ]},
    { id: 'vm104', name: 'VM 104', description: 'MySQL DB', type: 'qemu', interfaces: [
      { id: 'net0', targetVmbrId: 'vmbr1', vlanTag: 20 }
    ]},
    { id: 'vm105', name: 'VM 105', description: 'Internal Storage Node', type: 'qemu', interfaces: [
      { id: 'net0', targetVmbrId: 'vmbr0' },
      { id: 'net1', targetVmbrId: 'vmbr3' }
    ]},
    { id: 'vm106', name: 'VM 106', description: 'App Backend', type: 'qemu', interfaces: [
      { id: 'net0', targetVmbrId: 'vmbr1', vlanTag: 30 },
      { id: 'net1', targetVmbrId: 'vmbr2' }
    ]},
    { id: 'lxc201', name: 'LXC 201', description: 'Docker Swarm 1', type: 'lxc', interfaces: [
      { id: 'eth0', targetVmbrId: 'vmbr0' }
    ]},
    { id: 'lxc202', name: 'LXC 202', description: 'Docker Swarm 2', type: 'lxc', interfaces: [
      { id: 'eth0', targetVmbrId: 'vmbr0' }
    ]},
    { id: 'vm107', name: 'VM 107', description: 'Dev Sandbox', type: 'qemu', interfaces: [
      { id: 'net0', targetVmbrId: 'vmbr2' }
    ]},
    { id: 'vm108', name: 'VM 108', description: 'Network Monitor', type: 'qemu', interfaces: [
      { id: 'net0', targetVmbrId: 'vmbr0' },
      { id: 'net1', targetVmbrId: 'vmbr1', vlanTag: 99 },
      { id: 'net2', targetVmbrId: 'vmbr2' },
      { id: 'net3', targetVmbrId: 'vmbr3' }
    ]}
  ],
  nics: [
    { id: 'eno1', state: 'active', vmbrId: 'vmbr0', speedLabel: '1 Gbps (Mgmt)' },
    { id: 'eno2', state: 'active', vmbrId: 'vmbr1', speedLabel: '10 Gbps (Trunk)' },
    { id: 'eno3', state: 'active', vmbrId: 'vmbr2', speedLabel: '1 Gbps (NAT Uplink)' },
    { id: 'eno4', state: 'unplugged' }
  ]
};

export const ConnectionMatrixCreatorPanel = () => {
  const [model, setModel] = useState(defaultData);
  const [manualZoom, setManualZoom] = useState(1);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(defaultData, null, 2));
  const [jsonDirty, setJsonDirty] = useState(false);
  const [jsonError, setJsonError] = useState('');

  const modelJson = useMemo(() => JSON.stringify(model, null, 2), [model]);

  React.useEffect(() => {
    if (!jsonDirty) {
      setJsonText(modelJson);
      setJsonError('');
    }
  }, [modelJson, jsonDirty]);

  const applyJsonText = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed.vmbrs) || !Array.isArray(parsed.vms) || !Array.isArray(parsed.nics)) {
        throw new Error('JSON musi zawierać tablice: vmbrs, vms, nics.');
      }
      setModel(parsed);
      setJsonText(JSON.stringify(parsed, null, 2));
      setJsonDirty(false);
      setJsonError('');
    } catch (err: unknown) {
      setJsonError(err instanceof Error ? err.message : 'Nieprawidłowy JSON');
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setManualZoom((z) => Math.max(0.15, Math.min(2.5, z + delta)));
    }
  };

  // State mutators for UI forms
  const updateVmbr = (index: number, patch: Partial<Vmbr>) => {
    const newVmbrs = [...model.vmbrs];
    newVmbrs[index] = { ...newVmbrs[index], ...patch };
    setModel({ ...model, vmbrs: newVmbrs });
  };
  const addVmbr = () => {
    setModel({ ...model, vmbrs: [...model.vmbrs, { id: `vmbr${model.vmbrs.length}`, type: 'bridge', label: 'Nowy VMBR' }] });
  };
  const deleteVmbr = (index: number) => {
    const newVmbrs = [...model.vmbrs];
    newVmbrs.splice(index, 1);
    setModel({ ...model, vmbrs: newVmbrs });
  };

  const updateNic = (index: number, patch: Partial<Nic>) => {
    const newNics = [...model.nics];
    newNics[index] = { ...newNics[index], ...patch };
    setModel({ ...model, nics: newNics });
  };
  const addNic = () => {
    setModel({ ...model, nics: [...model.nics, { id: `eno${model.nics.length + 1}`, state: 'active' }] });
  };
  const deleteNic = (index: number) => {
    const newNics = [...model.nics];
    newNics.splice(index, 1);
    setModel({ ...model, nics: newNics });
  };

  const updateVm = (index: number, patch: Partial<Vm>) => {
    const newVms = [...model.vms];
    newVms[index] = { ...newVms[index], ...patch };
    setModel({ ...model, vms: newVms });
  };
  const addVm = () => {
    setModel({ ...model, vms: [...model.vms, { id: `vm${model.vms.length + 100}`, name: `VM ${model.vms.length + 100}`, type: 'qemu', interfaces: [] }] });
  };
  const deleteVm = (index: number) => {
    const newVms = [...model.vms];
    newVms.splice(index, 1);
    setModel({ ...model, vms: newVms });
  };

  const updateVmInterface = (vmIndex: number, ifaceIndex: number, patch: Partial<VmInterface>) => {
    const newVms = [...model.vms];
    const newInterfaces = [...newVms[vmIndex].interfaces];
    newInterfaces[ifaceIndex] = { ...newInterfaces[ifaceIndex], ...patch };
    newVms[vmIndex].interfaces = newInterfaces;
    setModel({ ...model, vms: newVms });
  };
  const addVmInterface = (vmIndex: number) => {
    const newVms = [...model.vms];
    const interfaces = newVms[vmIndex].interfaces;
    interfaces.push({ id: `net${interfaces.length}`, targetVmbrId: model.vmbrs[0]?.id || '' });
    setModel({ ...model, vms: newVms });
  };
  const deleteVmInterface = (vmIndex: number, ifaceIndex: number) => {
    const newVms = [...model.vms];
    newVms[vmIndex].interfaces.splice(ifaceIndex, 1);
    setModel({ ...model, vms: newVms });
  };

  const previewContent = (
    <Box
      onWheel={handleWheel}
      sx={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        overscrollBehavior: 'contain',
        p: 2,
        boxSizing: 'border-box'
      }}
    >
      <Box
        sx={{
          minWidth: '100%',
          minHeight: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center'
        }}
      >
        <Box
          sx={{
            transform: `scale(${manualZoom})`,
            transformOrigin: 'top center',
            transition: 'transform 0.1s',
            width: 1200, 
            height: 900
          }}
        >
          <ConnectionMatrixTopology
            vmbrs={model.vmbrs}
            vms={model.vms}
            nics={model.nics}
          />
        </Box>
      </Box>
    </Box>
  );

  const vmbrsSection = (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2">Wirtualne Switche (VMBRs)</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={addVmbr}>Dodaj VMBR</Button>
      </Stack>
      {model.vmbrs.map((vmbr, index) => (
        <Box key={`vmbr-${index}`} sx={{ p: 1.25, borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>{vmbr.id}</Typography>
              <IconButton size="small" onClick={() => deleteVmbr(index)}><DeleteIcon fontSize="small" /></IconButton>
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="ID" sx={{ flex: 1 }} value={vmbr.id} onChange={(e) => updateVmbr(index, { id: e.target.value })} />
              <TextField size="small" label="Etykieta" sx={{ flex: 1 }} value={vmbr.label || ''} onChange={(e) => updateVmbr(index, { label: e.target.value })} />
              <FormControl size="small" sx={{ width: 120 }}>
                <InputLabel>Typ</InputLabel>
                <Select value={vmbr.type} label="Typ" onChange={(e) => updateVmbr(index, { type: e.target.value as any })}>
                  <MenuItem value="bridge">Bridge</MenuItem>
                  <MenuItem value="vlan">VLAN Trunk</MenuItem>
                  <MenuItem value="nat">NAT</MenuItem>
                  <MenuItem value="isolated">Isolated</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </Stack>
        </Box>
      ))}
    </Stack>
  );

  const nicsSection = (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2">Fizyczne Interfejsy (NICs)</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={addNic}>Dodaj NIC</Button>
      </Stack>
      {model.nics.map((nic, index) => (
        <Box key={`nic-${index}`} sx={{ p: 1.25, borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>{nic.id}</Typography>
              <IconButton size="small" onClick={() => deleteNic(index)}><DeleteIcon fontSize="small" /></IconButton>
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="ID (np. eno1)" sx={{ flex: 1 }} value={nic.id} onChange={(e) => updateNic(index, { id: e.target.value })} />
              <TextField size="small" label="Szybkość/Opis" sx={{ flex: 1 }} value={nic.speedLabel || ''} onChange={(e) => updateNic(index, { speedLabel: e.target.value })} />
            </Stack>
            <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ width: 120 }}>
                <InputLabel>Status</InputLabel>
                <Select value={nic.state} label="Status" onChange={(e) => updateNic(index, { state: e.target.value as any })}>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="unplugged">Unplugged</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Przypisany do VMBR</InputLabel>
                <Select
                  value={nic.vmbrId || ''}
                  label="Przypisany do VMBR"
                  onChange={(e) => updateNic(index, { vmbrId: e.target.value || undefined })}
                >
                  <MenuItem value="">Brak (Nieprzypisany)</MenuItem>
                  {model.vmbrs.map((v) => (
                    <MenuItem key={v.id} value={v.id}>{v.id}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Stack>
        </Box>
      ))}
    </Stack>
  );

  const vmsSection = (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2">Maszyny i Kontenery (VMs / LXC)</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={addVm}>Dodaj Instancję</Button>
      </Stack>
      {model.vms.map((vm, vmIndex) => (
        <Accordion key={`vm-${vmIndex}`} variant="outlined" disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={600}>{vm.name} ({vm.type.toUpperCase()})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1}>
                <TextField size="small" label="ID" sx={{ width: 100 }} value={vm.id} onChange={(e) => updateVm(vmIndex, { id: e.target.value })} />
                <TextField size="small" label="Nazwa (np. VM 101)" sx={{ flex: 1 }} value={vm.name} onChange={(e) => updateVm(vmIndex, { name: e.target.value })} />
                <TextField size="small" label="Opis (np. pfSense)" sx={{ flex: 1 }} value={vm.description || ''} onChange={(e) => updateVm(vmIndex, { description: e.target.value })} />
              </Stack>
              <Stack direction="row" spacing={1}>
                <FormControl size="small" sx={{ width: 120 }}>
                  <InputLabel>Typ</InputLabel>
                  <Select value={vm.type} label="Typ" onChange={(e) => updateVm(vmIndex, { type: e.target.value as any })}>
                    <MenuItem value="qemu">QEMU (VM)</MenuItem>
                    <MenuItem value="lxc">LXC (CT)</MenuItem>
                  </Select>
                </FormControl>
                <Button size="small" color="error" onClick={() => deleteVm(vmIndex)}>Usuń Maszynę</Button>
              </Stack>

              <Divider />
              
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" fontWeight={600}>Interfejsy Sieciowe (vNICs)</Typography>
                <Button size="small" onClick={() => addVmInterface(vmIndex)}>+ Interfejs</Button>
              </Stack>
              {vm.interfaces.map((iface, ifaceIndex) => (
                <Stack key={`iface-${ifaceIndex}`} direction="row" spacing={1} alignItems="center" sx={{ bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                  <TextField size="small" label="ID (np. net0)" sx={{ width: 100 }} value={iface.id} onChange={(e) => updateVmInterface(vmIndex, ifaceIndex, { id: e.target.value })} />
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <InputLabel>Podłącz do</InputLabel>
                    <Select value={iface.targetVmbrId} label="Podłącz do" onChange={(e) => updateVmInterface(vmIndex, ifaceIndex, { targetVmbrId: e.target.value })}>
                      {model.vmbrs.map(v => <MenuItem key={v.id} value={v.id}>{v.id}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <TextField size="small" type="number" label="VLAN Tag" sx={{ width: 100 }} value={iface.vlanTag || ''} onChange={(e) => updateVmInterface(vmIndex, ifaceIndex, { vlanTag: e.target.value ? parseInt(e.target.value) : undefined })} />
                  <IconButton size="small" color="error" onClick={() => deleteVmInterface(vmIndex, ifaceIndex)}><DeleteIcon fontSize="small" /></IconButton>
                </Stack>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
    </Stack>
  );

  const formContent = (
    <Stack spacing={4}>
      <Alert severity="info">
        Kreator Macierzy Proxmox. Zmiany w formularzu natychmiast aktualizują podgląd powyżej.
      </Alert>
      
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 4 }}>
        {vmbrsSection}
        {nicsSection}
      </Box>

      <Divider />
      {vmsSection}
      <Divider />

      <Accordion variant="outlined" disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Zaawansowane: JSON Modelu</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Możesz bezpośrednio wkleić własny JSON. Naciśnij Zastosuj, by odświeżyć formularz i podgląd.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Button variant="contained" color="primary" onClick={applyJsonText} disabled={!jsonDirty} size="small">
                Zastosuj JSON
              </Button>
              <Button variant="outlined" onClick={() => { setJsonText(modelJson); setJsonDirty(false); setJsonError(''); }} disabled={!jsonDirty} size="small">
                Odrzuć
              </Button>
            </Stack>
            {jsonError && <Alert severity="error" sx={{ mb: 2, py: 0 }}>{jsonError}</Alert>}
            <TextField
              multiline fullWidth variant="outlined" size="small" value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); setJsonDirty(true); setJsonError(''); }}
              sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace', fontSize: '12px', bgcolor: '#1e1e1e', color: '#d4d4d4', p: 1.5, minHeight: 300 } }}
            />
          </Box>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );

  return <WorkshopLayout preview={previewContent} form={formContent} />;
};
