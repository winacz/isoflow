import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import {
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
  DataObject as JsonIcon
} from '@mui/icons-material';
import { WorkshopLayout } from 'src/components/Workshop/WorkshopLayout';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { generateId, layoutDeviceTemplate, normalizeServerV2Template } from 'src/utils';
import type { DeviceTemplate } from 'src/types';
import { TILE_SIZE_2D } from 'src/config';
import { ServerV2Node } from 'src/components/Shapes2d/ServerV2Node/ServerV2Node';
import { ServerV2LogicalDiagram } from 'src/components/Shapes2d/ServerV2Node/ServerV2LogicalDiagram';
import {
  createDefaultServerV2Model,
  normalizePnic,
  syncVnicFields,
  type ServerV2ComputeNode,
  type ServerV2LogicalNetwork,
  type ServerV2Pnic,
  type ServerV2Vnic,
  type UnifiedNetworkModel
} from 'src/components/Shapes2d/ServerV2Node/types';

type PreviewMode = 'logical' | 'rack';

interface Props {
  isWorkshopMode?: boolean;
  onSave: (template: DeviceTemplate) => void;
  onCancel: () => void;
  /** Controlled from WorkshopView toolbar (Topologia / Rack). */
  previewMode?: PreviewMode;
}

const createPnic = (): ServerV2Pnic => ({
  id: `eth${Date.now() % 1000}`,
  label: 'NIC',
  badges: ['1GbE']
});

const createNetwork = (): ServerV2LogicalNetwork => ({
  id: `net_${generateId().slice(0, 6)}`,
  type: 'bridge',
  name: 'vmbr'
});

const createVnic = (networkId: string): ServerV2Vnic =>
  syncVnicFields({
    id: `vnic_${generateId().slice(0, 4)}`,
    network: networkId || 'direct',
    ip: '',
    vlan: '',
    mode: ''
  });

const createComputeNode = (networkId: string): ServerV2ComputeNode => ({
  id: `vm_${generateId().slice(0, 6)}`,
  type: 'vm',
  name: 'Nowa VM',
  vNICs: [createVnic(networkId)]
});

const modelToTemplate = (
  model: UnifiedNetworkModel,
  id?: string
): DeviceTemplate => {
  const jsonText = JSON.stringify(model, null, 2);
  return normalizeServerV2Template({
    id: id || `server-v2-${Date.now()}`,
    name: model.host.name || model.host.id || 'Server V2',
    kind: 'SERVER_V2',
    formFactor: 'RACK',
    numbering: 'ROWS_LTR',
    sections: [{ id: 'front', ports: 1, media: 'RJ45', cols: 1, rows: 1 }],
    serverV2Json: jsonText
  });
};

export const ServerV2CreatorPanel = ({
  isWorkshopMode,
  onSave,
  onCancel,
  previewMode = 'logical'
}: Props) => {
  const [model, setModel] = useState<UnifiedNetworkModel>(createDefaultServerV2Model);
  const [manualZoom, setManualZoom] = useState(1);
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(createDefaultServerV2Model(), null, 2)
  );
  const [jsonDirty, setJsonDirty] = useState(false);
  const [jsonError, setJsonError] = useState('');
  const [jsonCopied, setJsonCopied] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const { size: containerSize } = useResizeObserver(previewContainerRef.current);

  React.useEffect(() => {
    setManualZoom(1);
  }, [previewMode]);

  const modelJson = useMemo(() => JSON.stringify(model, null, 2), [model]);

  React.useEffect(() => {
    if (!jsonDirty) {
      setJsonText(modelJson);
      setJsonError('');
    }
  }, [modelJson, jsonDirty]);

  const applyJsonText = (): UnifiedNetworkModel | null => {
    try {
      const parsed = JSON.parse(jsonText) as UnifiedNetworkModel;
      if (!parsed?.host || !Array.isArray(parsed.logicalNetworks) || !Array.isArray(parsed.computeNodes)) {
        throw new Error(
          'JSON musi zawierać host, logicalNetworks oraz computeNodes.'
        );
      }
      if (!Array.isArray(parsed.host.pNICs)) {
        throw new Error('host.pNICs musi być tablicą.');
      }
      setModel(parsed);
      setJsonText(JSON.stringify(parsed, null, 2));
      setJsonDirty(false);
      setJsonError('');
      return parsed;
    } catch (err: unknown) {
      setJsonError(err instanceof Error ? err.message : 'Nieprawidłowy JSON');
      return null;
    }
  };

  const copyJson = async () => {
    const text = jsonDirty ? jsonText : modelJson;
    try {
      await navigator.clipboard.writeText(text);
      setJsonCopied(true);
      window.setTimeout(() => setJsonCopied(false), 1500);
    } catch {
      setJsonError('Nie udało się skopiować do schowka.');
    }
  };

  const downloadJson = () => {
    const text = jsonDirty ? jsonText : modelJson;
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const base =
      (model.host.name || model.host.id || 'server-v2')
        .replace(/[^\w.-]+/g, '_')
        .slice(0, 48) || 'server-v2';
    a.href = url;
    a.download = `${base}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pnics = useMemo(
    () => model.host.pNICs.map(normalizePnic),
    [model.host.pNICs]
  );

  const draft = useMemo(() => modelToTemplate(model, 'server-v2-preview'), [model]);
  const layout = useMemo(() => layoutDeviceTemplate(draft), [draft]);
  const naturalW = layout.size.width * TILE_SIZE_2D;
  const naturalH = layout.size.height * TILE_SIZE_2D;

  const handleWheel = (e: React.WheelEvent) => {
    if (!isWorkshopMode) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setManualZoom((z) => Math.max(0.15, Math.min(2.5, z + delta)));
  };

  const fitScale =
    isWorkshopMode && containerSize.width > 0 && containerSize.height > 0
      ? previewMode === 'rack'
        ? Math.min(
            (containerSize.width * 0.92) / Math.max(1, naturalW),
            (containerSize.height * 0.88) / Math.max(1, naturalH),
            1
          )
        : 1
      : 1;
  const scale = fitScale * manualZoom;
  const rackScaledW = naturalW * scale;
  const rackScaledH = naturalH * scale;

  const previewContent = (
    <Box
      ref={previewContainerRef}
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
      {/* Inner min-size box so flex centering works and scroll appears when zoomed */}
      <Box
        sx={{
          minWidth: '100%',
          minHeight: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {previewMode === 'rack' ? (
          <Box
            sx={{
              width: rackScaledW,
              height: rackScaledH,
              position: 'relative',
              flex: 'none'
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: naturalW,
                height: naturalH,
                transform: `translate(-50%, -50%) scale(${scale})`,
                transformOrigin: 'center center'
              }}
            >
              <ServerV2Node
                jsonText={draft.serverV2Json || ''}
                layout={layout}
                shapeId={draft.id}
                name={draft.name}
                centered={false}
                showShadow={false}
                showLogicalButton={false}
              />
            </Box>
          </Box>
        ) : (
          <ServerV2LogicalDiagram model={model} scale={manualZoom} />
        )}
      </Box>
    </Box>
  );

  const canSave = Boolean(model.host.name?.trim() || model.host.id.trim());

  const setHost = (patch: Partial<UnifiedNetworkModel['host']>) => {
    setModel((prev) => ({ ...prev, host: { ...prev.host, ...patch } }));
  };

  const setPnics = (next: ServerV2Pnic[]) => {
    setHost({ pNICs: next });
  };

  const updatePnic = (index: number, patch: Partial<ServerV2Pnic>) => {
    setPnics(pnics.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const updateNetwork = (id: string, patch: Partial<ServerV2LogicalNetwork>) => {
    setModel((prev) => ({
      ...prev,
      logicalNetworks: prev.logicalNetworks.map((n) =>
        n.id === id ? { ...n, ...patch } : n
      )
    }));
  };

  const updateCompute = (id: string, patch: Partial<ServerV2ComputeNode>) => {
    setModel((prev) => ({
      ...prev,
      computeNodes: prev.computeNodes.map((n) =>
        n.id === id ? { ...n, ...patch } : n
      )
    }));
  };

  const updateVnic = (
    nodeId: string,
    vnicIndex: number,
    patch: Partial<ServerV2Vnic>
  ) => {
    setModel((prev) => ({
      ...prev,
      computeNodes: prev.computeNodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          vNICs: node.vNICs.map((v, i) =>
            i === vnicIndex ? syncVnicFields({ ...v, ...patch }) : v
          )
        };
      })
    }));
  };

  const hostSection = (
    <Stack spacing={2}>
      <TextField
        label="Nazwa hosta"
        size="small"
        fullWidth
        value={model.host.name || ''}
        onChange={(e) => setHost({ name: e.target.value })}
      />
      <TextField
        label="ID hosta"
        size="small"
        fullWidth
        value={model.host.id}
        onChange={(e) => setHost({ id: e.target.value })}
      />
    </Stack>
  );

  const pnicsSection = (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2">Porty fizyczne (pNIC)</Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setPnics([...pnics, createPnic()])}
        >
          Dodaj port
        </Button>
      </Stack>

      {pnics.map((pnic, index) => (
        <Box
          key={`${pnic.id}-${index}`}
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
                pNIC {index + 1}
              </Typography>
              <IconButton
                size="small"
                disabled={pnics.length <= 1}
                onClick={() => setPnics(pnics.filter((_, i) => i !== index))}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                label="ID"
                sx={{ flex: 1 }}
                value={pnic.id}
                onChange={(e) => updatePnic(index, { id: e.target.value })}
              />
              <TextField
                size="small"
                label="Etykieta"
                sx={{ flex: 1 }}
                value={pnic.label || ''}
                onChange={(e) => updatePnic(index, { label: e.target.value })}
              />
            </Stack>
            <TextField
              size="small"
              fullWidth
              label="Badges (po przecinku)"
              placeholder="10GbE, Trunk"
              value={(pnic.badges || []).join(', ')}
              onChange={(e) =>
                updatePnic(index, {
                  badges: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                })
              }
            />
          </Stack>
        </Box>
      ))}
    </Stack>
  );

  const networksSection = (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2">Sieci logiczne</Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() =>
            setModel((prev) => ({
              ...prev,
              logicalNetworks: [...prev.logicalNetworks, createNetwork()]
            }))
          }
        >
          Dodaj sieć
        </Button>
      </Stack>

      {model.logicalNetworks.map((net) => (
        <Box
          key={net.id}
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
                {net.type === 'nat' ? 'NAT' : 'Bridge'}
              </Typography>
              <IconButton
                size="small"
                onClick={() =>
                  setModel((prev) => ({
                    ...prev,
                    logicalNetworks: prev.logicalNetworks.filter(
                      (n) => n.id !== net.id
                    )
                  }))
                }
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                label="ID"
                sx={{ flex: 1 }}
                value={net.id}
                onChange={(e) => updateNetwork(net.id, { id: e.target.value })}
              />
              <TextField
                size="small"
                label="Nazwa"
                sx={{ flex: 1 }}
                value={net.name || ''}
                onChange={(e) => updateNetwork(net.id, { name: e.target.value })}
              />
              <FormControl size="small" sx={{ width: 120 }}>
                <Select
                  value={net.type}
                  onChange={(e) =>
                    updateNetwork(net.id, { type: e.target.value })
                  }
                >
                  <MenuItem value="bridge">Bridge</MenuItem>
                  <MenuItem value="nat">NAT</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <Stack direction="row" spacing={1}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <FormLabel sx={{ fontSize: 11, mb: 0.5 }}>Uplink (pNIC)</FormLabel>
                <Select
                  displayEmpty
                  value={net.uplink || ''}
                  onChange={(e) =>
                    updateNetwork(net.id, {
                      uplink: e.target.value || undefined
                    })
                  }
                >
                  <MenuItem value="">Brak</MenuItem>
                  {pnics.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.id}
                      {p.label ? ` — ${p.label}` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: 1 }}>
                <FormLabel sx={{ fontSize: 11, mb: 0.5 }}>
                  Łączy z siecią
                </FormLabel>
                <Select
                  displayEmpty
                  value={net.connectsTo || ''}
                  onChange={(e) =>
                    updateNetwork(net.id, {
                      connectsTo: e.target.value || undefined
                    })
                  }
                >
                  <MenuItem value="">Brak</MenuItem>
                  {model.logicalNetworks
                    .filter((n) => n.id !== net.id)
                    .map((n) => (
                      <MenuItem key={n.id} value={n.id}>
                        {n.id}
                        {n.name ? ` — ${n.name}` : ''}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Stack>
            {net.type === 'nat' && (
              <TextField
                size="small"
                fullWidth
                label="Gateway IP"
                value={net.gateway_ip || ''}
                onChange={(e) =>
                  updateNetwork(net.id, { gateway_ip: e.target.value })
                }
              />
            )}
          </Stack>
        </Box>
      ))}
    </Stack>
  );

  const computeSection = (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2">Maszyny i kontenery</Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() =>
            setModel((prev) => ({
              ...prev,
              computeNodes: [
                ...prev.computeNodes,
                createComputeNode(prev.logicalNetworks[0]?.id || 'direct')
              ]
            }))
          }
        >
          Dodaj instancję
        </Button>
      </Stack>

      {model.computeNodes.map((node, index) => (
        <Box
          key={node.id}
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
                {String(node.type).toUpperCase()} {index + 1}
              </Typography>
              <IconButton
                size="small"
                onClick={() =>
                  setModel((prev) => ({
                    ...prev,
                    computeNodes: prev.computeNodes.filter(
                      (n) => n.id !== node.id
                    )
                  }))
                }
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>

            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                label="ID"
                sx={{ width: 120 }}
                value={node.id}
                onChange={(e) => updateCompute(node.id, { id: e.target.value })}
              />
              <TextField
                size="small"
                label="Nazwa"
                sx={{ flex: 1 }}
                value={node.name || ''}
                onChange={(e) =>
                  updateCompute(node.id, { name: e.target.value })
                }
              />
              <FormControl size="small" sx={{ width: 110 }}>
                <Select
                  value={node.type}
                  onChange={(e) =>
                    updateCompute(node.id, { type: e.target.value })
                  }
                >
                  <MenuItem value="vm">VM</MenuItem>
                  <MenuItem value="lxc">LXC</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography variant="caption" fontWeight={600}>
                Interfejsy wirtualne (vNIC)
              </Typography>
              <Button
                size="small"
                onClick={() =>
                  updateCompute(node.id, {
                    vNICs: [
                      ...node.vNICs,
                      createVnic(model.logicalNetworks[0]?.id || 'direct')
                    ]
                  })
                }
              >
                + vNIC
              </Button>
            </Stack>

            {node.vNICs.map((vnic, vIdx) => {
              const mode = (vnic.mode || '').toLowerCase();
              const isPassthrough = mode === 'passthrough';
              return (
                <Stack
                  key={vnic.id || vIdx}
                  spacing={1}
                  sx={{ p: 1, bgcolor: '#f8fafc', borderRadius: 1 }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                      <Select
                        value={isPassthrough ? 'PASSTHROUGH' : 'NETWORK'}
                        onChange={(e) => {
                          if (e.target.value === 'PASSTHROUGH') {
                            updateVnic(node.id, vIdx, {
                              mode: 'Passthrough',
                              network: 'direct',
                              target: pnics[0]?.id
                            });
                          } else {
                            updateVnic(node.id, vIdx, {
                              mode: '',
                              network: model.logicalNetworks[0]?.id || '',
                              target: undefined
                            });
                          }
                        }}
                      >
                        <MenuItem value="NETWORK">Sieć logiczna</MenuItem>
                        <MenuItem value="PASSTHROUGH">Passthrough</MenuItem>
                      </Select>
                    </FormControl>

                    {isPassthrough ? (
                      <FormControl size="small" sx={{ flex: 1 }}>
                        <Select
                          displayEmpty
                          value={vnic.target || ''}
                          onChange={(e) =>
                            updateVnic(node.id, vIdx, {
                              target: e.target.value,
                              network: 'direct',
                              mode: 'Passthrough'
                            })
                          }
                        >
                          <MenuItem value="">Wybierz pNIC</MenuItem>
                          {pnics.map((p) => (
                            <MenuItem key={p.id} value={p.id}>
                              {p.id}
                              {p.label ? ` — ${p.label}` : ''}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <FormControl size="small" sx={{ flex: 1 }}>
                        <Select
                          displayEmpty
                          value={vnic.network || ''}
                          onChange={(e) =>
                            updateVnic(node.id, vIdx, {
                              network: e.target.value
                            })
                          }
                        >
                          <MenuItem value="">Wybierz sieć</MenuItem>
                          {model.logicalNetworks.map((n) => (
                            <MenuItem key={n.id} value={n.id}>
                              {n.id}
                              {n.name ? ` — ${n.name}` : ''}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}

                    <IconButton
                      size="small"
                      disabled={node.vNICs.length <= 1}
                      onClick={() =>
                        updateCompute(node.id, {
                          vNICs: node.vNICs.filter((_, i) => i !== vIdx)
                        })
                      }
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>

                  {!isPassthrough && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        size="small"
                        sx={{ flex: 2 }}
                        label="Adres IP"
                        value={vnic.ip || ''}
                        onChange={(e) =>
                          updateVnic(node.id, vIdx, { ip: e.target.value })
                        }
                      />
                      <TextField
                        size="small"
                        sx={{ flex: 1 }}
                        label="VLAN"
                        value={vnic.vlan || ''}
                        onChange={(e) =>
                          updateVnic(node.id, vIdx, { vlan: e.target.value })
                        }
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={mode === 'trunk'}
                            onChange={(e) =>
                              updateVnic(node.id, vIdx, {
                                mode: e.target.checked ? 'Trunk' : ''
                              })
                            }
                          />
                        }
                        label="Trunk"
                        sx={{
                          ml: 1,
                          mr: 0,
                          '& .MuiFormControlLabel-label': { fontSize: 12 }
                        }}
                      />
                    </Stack>
                  )}
                </Stack>
              );
            })}
          </Stack>
        </Box>
      ))}
    </Stack>
  );

  const formContent = (
    <Stack spacing={3}>
      <Alert severity="info">
        Edytujesz model graficznie — w racku serwer wygląda jak switch; topologia
        logiczna jest widoczna w podglądzie / „Pokaż węzeł”.
      </Alert>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 4
        }}
      >
        <Stack spacing={3}>
          {hostSection}
          <Divider />
          {pnicsSection}
        </Stack>
        <Stack spacing={3}>
          {networksSection}
        </Stack>
      </Box>

      <Divider />
      {computeSection}

      <Divider />
      <Stack spacing={1.5}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          gap={1}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <JsonIcon fontSize="small" color="action" />
            <Typography variant="subtitle2">JSON modelu</Typography>
            {jsonDirty && (
              <Typography variant="caption" color="warning.main">
                niezapisane zmiany w edytorze
              </Typography>
            )}
          </Stack>
          <Stack direction="row" spacing={0.75} flexWrap="wrap">
            <Button
              size="small"
              startIcon={<CopyIcon />}
              onClick={() => {
                void copyJson();
              }}
            >
              {jsonCopied ? 'Skopiowano' : 'Kopiuj'}
            </Button>
            <Button
              size="small"
              startIcon={<DownloadIcon />}
              onClick={downloadJson}
            >
              Pobierz .json
            </Button>
            <Button
              size="small"
              disabled={!jsonDirty}
              onClick={() => {
                setJsonText(modelJson);
                setJsonDirty(false);
                setJsonError('');
              }}
            >
              Cofnij
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={!jsonDirty}
              onClick={() => {
                applyJsonText();
              }}
            >
              Zastosuj JSON
            </Button>
          </Stack>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Podgląd, kopia i eksport aktualnego modelu. Możesz też wkleić własny
          JSON i kliknąć „Zastosuj JSON”, żeby przejąć konfigurację do
          formularza.
        </Typography>
        <TextField
          multiline
          fullWidth
          minRows={12}
          maxRows={28}
          value={jsonText}
          onChange={(e) => {
            setJsonText(e.target.value);
            setJsonDirty(true);
            setJsonError('');
          }}
          error={Boolean(jsonError)}
          helperText={jsonError || ' '}
          inputProps={{
            spellCheck: false,
            style: {
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 12,
              lineHeight: 1.45
            }
          }}
          sx={{
            '& .MuiInputBase-root': {
              bgcolor: '#0f172a',
              color: '#e2e8f0',
              alignItems: 'flex-start'
            },
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(148,163,184,0.35)'
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(148,163,184,0.55)'
            },
            '& .MuiFormHelperText-root': {
              mx: 0
            }
          }}
        />
      </Stack>

      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
        <Button onClick={onCancel}>Anuluj</Button>
        <Button
          variant="contained"
          disabled={!canSave}
          onClick={() => {
            if (jsonDirty) {
              const parsed = applyJsonText();
              if (!parsed) return;
              onSave(modelToTemplate(parsed));
              return;
            }
            onSave(modelToTemplate(model));
          }}
        >
          Zapisz Serwer V2
        </Button>
      </Stack>
    </Stack>
  );

  if (isWorkshopMode) {
    return (
      <WorkshopLayout
        preview={previewContent}
        form={
          <Stack spacing={3}>
            <Stack spacing={1}>
              <Typography variant="h6">Kreator Serwera V2</Typography>
              <Typography variant="body2" color="text.secondary">
                Zdefiniuj hosta, porty fizyczne, sieci logiczne oraz VM/LXC —
                tak jak w JSON, ale w formularzu. Scroll / kółko myszy zoomuje
                podgląd.
              </Typography>
            </Stack>
            {formContent}
          </Stack>
        }
      />
    );
  }

  return (
    <Box sx={{ p: 2, maxWidth: 900, mx: 'auto' }}>
      {formContent}
    </Box>
  );
};
