import React, { useMemo } from 'react';
import { Box } from '@mui/material';

export type VmbrType = 'bridge' | 'vlan' | 'nat' | 'isolated';

export interface Vmbr {
  id: string;
  type: VmbrType;
  label?: string; // np. "Bridge", "VLAN Trunk", "NAT/DMZ", "Isolated"
}

export interface VmInterface {
  id: string;
  targetVmbrId: string;
  vlanTag?: number;
}

export interface Vm {
  id: string;
  name: string;
  description?: string; // np. "pfSense Router", "Web Server 1"
  type: 'qemu' | 'lxc';
  interfaces: VmInterface[];
}

export interface Nic {
  id: string;
  state: 'active' | 'unplugged';
  vmbrId?: string;
  speedLabel?: string; // np. "1 Gbps (Mgmt)", "10 Gbps (Trunk)"
}

export interface ConnectionMatrixTopologyProps {
  vmbrs: Vmbr[];
  vms: Vm[];
  nics: Nic[];
  title?: string;
}

const getVmbrStyles = (type: VmbrType) => {
  switch (type) {
    case 'bridge':
      return {
        bg: '#f0f9ff',
        line: '#bae6fd',
        header: '#0284c7',
        defaultLabel: 'Bridge'
      };
    case 'vlan':
      return {
        bg: '#faf5ff',
        line: '#e9d5ff',
        header: '#7e22ce',
        defaultLabel: 'VLAN Trunk'
      };
    case 'nat':
      return {
        bg: '#fff7ed',
        line: '#ffedd5',
        header: '#ea580c',
        defaultLabel: 'NAT/DMZ'
      };
    case 'isolated':
      return {
        bg: '#f0fdfa',
        line: '#ccfbf1',
        header: '#0d9488',
        defaultLabel: 'Isolated'
      };
    default:
      return {
        bg: '#f1f5f9',
        line: '#cbd5e1',
        header: '#64748b',
        defaultLabel: 'Unknown'
      };
  }
};

const getVlanColor = (vlan: number) => {
  if (vlan === 10) return '#3b82f6'; // blue
  if (vlan === 20) return '#ef4444'; // red
  if (vlan === 30) return '#10b981'; // green
  if (vlan === 99) return '#8b5cf6'; // purple
  const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#eab308'];
  return colors[vlan % colors.length];
};

export const ConnectionMatrixTopology: React.FC<ConnectionMatrixTopologyProps> = ({
  vmbrs,
  vms,
  nics,
  title = 'PROXMOX NETWORK MATRIX'
}) => {
  // Layout Constants (matching the provided SVG)
  const SVG_WIDTH = 1200;
  // Calculate dynamic height based on VM count
  const VMS_START_Y = 180;
  const VM_ROW_HEIGHT = 65;
  
  const VMS_TOTAL_HEIGHT = Math.max(10 * VM_ROW_HEIGHT, vms.length * VM_ROW_HEIGHT);
  const HW_LAYER_Y = VMS_START_Y + VMS_TOTAL_HEIGHT + 40; 
  const LEGEND_Y = HW_LAYER_Y + 160;
  const SVG_HEIGHT = LEGEND_Y + 130;

  const COL_START_X = 350;
  const COL_WIDTH = 200;

  const getColCenterX = (index: number) => COL_START_X + 80 + index * COL_WIDTH;
  const getRowY = (index: number) => VMS_START_Y + 20 + index * VM_ROW_HEIGHT;

  const maxInterfaces = Math.max(1, ...vms.map(v => v.interfaces.length));
  const NIC_COL_WIDTH = 26;
  const TEXT_WIDTH = 250 - (maxInterfaces * NIC_COL_WIDTH) - 10;

  return (
    <Box sx={{ width: '100%', height: '100%', overflow: 'auto', bgcolor: '#f8fafc' }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        width="100%"
        height="100%"
        style={{ backgroundColor: '#f8fafc', fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
      >
        <defs>
          <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000000" floodOpacity="0.05" />
          </filter>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <g id="nic-port">
            <rect x="0" y="0" width="46" height="34" rx="4" fill="#2c3e50" stroke="#1a252f" strokeWidth="2" />
            <rect x="8" y="10" width="30" height="24" rx="2" fill="#111827" />
            <rect x="14" y="24" width="18" height="10" rx="1" fill="#d4af37" />
            <line x1="16" y1="24" x2="16" y2="34" stroke="#856d22" strokeWidth="1" />
            <line x1="20" y1="24" x2="20" y2="34" stroke="#856d22" strokeWidth="1" />
            <line x1="26" y1="24" x2="26" y2="34" stroke="#856d22" strokeWidth="1" />
            <line x1="30" y1="24" x2="30" y2="34" stroke="#856d22" strokeWidth="1" />
          </g>
        </defs>

        {/* Main Background */}
        <rect
          x="20"
          y="20"
          width={SVG_WIDTH - 40}
          height={SVG_HEIGHT - 40}
          rx="12"
          fill="#ffffff"
          stroke="#e2e8f0"
          strokeWidth="2"
          filter="url(#shadow)"
        />
        
        {/* Title */}
        <text
          x={SVG_WIDTH / 2}
          y="60"
          fontSize="24"
          fontWeight="800"
          textAnchor="middle"
          fill="#0f172a"
          letterSpacing="1"
        >
          {title}
        </text>

        {/* ========================================== */}
        {/* NAGŁÓWKI WĘZŁÓW (VMs/LXC i NICs) */}
        {/* ========================================== */}
        <g transform={`translate(40, 120)`}>
          <rect x="0" y="-20" width={250 - (maxInterfaces * NIC_COL_WIDTH) - 4} height="40" rx="6" fill="#475569" filter="url(#shadow)" />
          <text x="10" y="5" fontSize="12" fontWeight="bold" fill="#ffffff">
            VM / LXC
          </text>

          {(() => {
            const nicsAreaWidth = maxInterfaces * NIC_COL_WIDTH;
            const nicsAreaX = 250 - nicsAreaWidth;
            return (
              <g>
                <rect x={nicsAreaX} y="-20" width={nicsAreaWidth} height="40" rx="4" fill="#64748b" filter="url(#shadow)" />
                <text x={nicsAreaX + nicsAreaWidth / 2} y="5" fontSize="10" fontWeight="bold" fill="#ffffff" textAnchor="middle" letterSpacing="1">
                  NIC's
                </text>
              </g>
            );
          })()}
        </g>

        {/* ========================================== */}
        {/* KOLUMNY VMBR */}
        {/* ========================================== */}
        {vmbrs.map((vmbr, index) => {
          const styles = getVmbrStyles(vmbr.type);
          const colX = COL_START_X + index * COL_WIDTH;
          const centerX = getColCenterX(index);
          const colHeight = HW_LAYER_Y - 120;

          return (
            <g key={`vmbr-bg-${vmbr.id}`}>
              {/* Tło pionowe */}
              <rect x={colX} y="90" width="160" height={colHeight} rx="8" fill={styles.bg} opacity="0.6" />
              {/* Pionowa oś (Magistrala) */}
              <line
                x1={centerX}
                y1="160"
                x2={centerX}
                y2={HW_LAYER_Y - 20}
                stroke={styles.line}
                strokeWidth="6"
                strokeLinecap="round"
              />
              {/* Nagłówek VMBR */}
              <g transform={`translate(${centerX}, 120)`}>
                <rect x="-70" y="-20" width="140" height="40" rx="6" fill={styles.header} filter="url(#shadow)" />
                <text x="0" y="5" fontSize="13" fontWeight="bold" fill="#ffffff" textAnchor="middle">
                  {vmbr.id} ({vmbr.label || styles.defaultLabel})
                </text>
              </g>
            </g>
          );
        })}

        {/* ========================================== */}
        {/* WIERSZE MASZYN WIRTUALNYCH */}
        {/* ========================================== */}
        
        {/* Dotted lines for rows */}
        <g stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4">
          {Array.from({ length: Math.max(10, vms.length) }).map((_, idx) => {
            const y = getRowY(idx);
            // Draw line up to the last column's edge
            const endX = COL_START_X + (vmbrs.length * COL_WIDTH) + 20;
            return <line key={`row-line-${idx}`} x1="300" y1={y} x2={endX > 1100 ? endX : 1100} y2={y} />;
          })}
        </g>

        {/* VM Tiles and Intersections */}
        <g transform="translate(40, 180)">
          {vms.map((vm, rowIndex) => {
            const yOffset = rowIndex * VM_ROW_HEIGHT;
            
            // Special styling logic based on description or type (as seen in the SVG)
            const isStorage = vm.description?.toLowerCase().includes('storage') || vm.description?.toLowerCase().includes('monitor');
            const tileBg = isStorage ? '#f1f5f9' : '#f8fafc';
            const tileStroke = isStorage ? '#94a3b8' : '#cbd5e1';

            return (
              <g key={`vm-row-${vm.id}`} transform={`translate(0, ${yOffset})`}>
                {/* VM Card */}
                <rect width="250" height="50" rx="6" fill={tileBg} stroke={tileStroke} />
                
                {/* Text Area */}
                <foreignObject x="10" y="5" width={TEXT_WIDTH} height="40">
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.2 }}>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155', wordWrap: 'break-word', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {vm.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {vm.description || (vm.type === 'qemu' ? 'Virtual Machine' : 'LXC Container')}
                    </div>
                  </div>
                </foreignObject>

                {/* NIC Columns inside the VM Card */}
                {Array.from({ length: maxInterfaces }).map((_, i) => {
                  const iface = vm.interfaces[i];
                  const colX = 250 - (maxInterfaces * NIC_COL_WIDTH) + (i * NIC_COL_WIDTH);
                  
                  let cellContent = null;
                  if (iface) {
                    const targetVmbr = vmbrs.find(v => v.id === iface.targetVmbrId);
                    const color = targetVmbr ? getVmbrStyles(targetVmbr.type).header : '#64748b';
                    cellContent = (
                      <g>
                        <rect x={colX} y="0" width={NIC_COL_WIDTH} height="50" fill={color} fillOpacity={0.15} />
                        <circle cx={colX + NIC_COL_WIDTH / 2} cy="25" r="5" fill={color} stroke="#ffffff" strokeWidth="1" />
                      </g>
                    );
                  }

                  return (
                    <g key={`nic-col-${i}`}>
                      <line x1={colX} y1="0" x2={colX} y2="50" stroke={tileStroke} strokeWidth="1" strokeDasharray="2 2" />
                      {cellContent}
                    </g>
                  );
                })}

                {/* Intersections (Matrix Nodes) */}
                {vm.interfaces.map((iface) => {
                  const colIndex = vmbrs.findIndex((v) => v.id === iface.targetVmbrId);
                  if (colIndex === -1) return null;

                  const centerX = getColCenterX(colIndex) - 40; // Adjusting for the 'translate(40, ...)' wrapper
                  const targetVmbr = vmbrs[colIndex];
                  const styles = getVmbrStyles(targetVmbr.type);

                  return (
                    <g key={`intersect-${vm.id}-${iface.id}`} transform={`translate(${centerX}, 20)`}>
                      <circle cx="0" cy="0" r="10" fill={styles.header} filter="url(#glow)" />
                      <circle cx="0" cy="0" r="4" fill="#ffffff" />
                      <text x="16" y="4" fontSize="11" fontWeight="bold" fill={styles.header}>
                        {iface.id}
                        {iface.vlanTag ? (
                          <>
                            {' ('}
                            vlan:{' '}
                            <tspan fill={getVlanColor(iface.vlanTag)}>{iface.vlanTag}</tspan>
                            {')'}
                          </>
                        ) : targetVmbr.type === 'isolated' || targetVmbr.type === 'nat' ? (
                          ` (${styles.defaultLabel})`
                        ) : (
                          ''
                        )}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>

        {/* ========================================== */}
        {/* WARSTWA SPRZĘTOWA */}
        {/* ========================================== */}
        <g transform={`translate(0, ${HW_LAYER_Y})`}>
          {/* Linia rozdzielająca warstwy */}
          <line x1="120" y1="0" x2={SVG_WIDTH - 100} y2="0" stroke="#cbd5e1" strokeWidth="4" strokeDasharray="10 5" />

          {/* Unplugged NICs */}
          {(() => {
            const unpluggedNics = nics.filter((n) => !n.vmbrId || n.state === 'unplugged');
            return unpluggedNics.map((nic, index) => {
              const xPos = 155 + index * 160;
              return (
                <g key={`unplugged-${nic.id}`} transform={`translate(${xPos}, 30)`} filter="url(#shadow)" opacity="0.6">
                  <rect x="0" y="0" width="150" height="90" rx="8" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
                  <use href="#nic-port" x="52" y="15" />
                  <circle cx="92" cy="30" r="3" fill="#ef4444" /> {/* Czerwony LED */}
                  <text x="75" y="65" fontSize="14" fontWeight="bold" fill="#1e293b" textAnchor="middle">
                    {nic.id}
                  </text>
                  <text x="75" y="80" fontSize="11" fill="#ef4444" textAnchor="middle">
                    Unplugged / Free
                  </text>
                </g>
              );
            });
          })()}

          {/* Assigned NICs and Isolated placeholders */}
          {vmbrs.map((vmbr, index) => {
            const centerX = getColCenterX(index);
            const nic = nics.find((n) => n.vmbrId === vmbr.id);
            const styles = getVmbrStyles(vmbr.type);

            if (vmbr.type === 'isolated') {
              return (
                <g key={`hw-${vmbr.id}`} transform={`translate(${centerX - 75}, 30)`}>
                  <rect x="0" y="0" width="150" height="90" rx="8" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4 4" />
                  <text x="75" y="45" fontSize="14" fontWeight="bold" fill="#94a3b8" textAnchor="middle">
                    Isolated Network
                  </text>
                  <text x="75" y="65" fontSize="11" fill="#cbd5e1" textAnchor="middle">
                    No Physical NIC
                  </text>
                </g>
              );
            } else if (nic) {
              return (
                <g key={`hw-${vmbr.id}`} transform={`translate(${centerX - 75}, 30)`} filter="url(#shadow)">
                  <rect x="0" y="0" width="150" height="90" rx="8" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
                  <use href="#nic-port" x="52" y="15" />
                  <circle cx="92" cy="30" r="3" fill={nic.state === 'active' ? '#2ecc71' : '#ef4444'} />
                  <text x="75" y="65" fontSize="14" fontWeight="bold" fill="#1e293b" textAnchor="middle">
                    {nic.id}
                  </text>
                  <text x="75" y="80" fontSize="11" fill="#64748b" textAnchor="middle">
                    {nic.speedLabel || 'Assigned'}
                  </text>
                  <line x1="75" y1="-30" x2="75" y2="0" stroke={styles.header} strokeWidth="6" />
                </g>
              );
            }
            return null;
          })}
        </g>

        {/* ========================================== */}
        {/* LEGENDA */}
        {/* ========================================== */}
        <g transform={`translate(40, ${LEGEND_Y})`}>
          <rect width="210" height="70" rx="6" fill="#f8fafc" stroke="#cbd5e1" />
          <text x="105" y="20" fontSize="12" fontWeight="bold" textAnchor="middle" fill="#334155">
            Legenda / Oznaczenia Kolorów
          </text>
          
          <circle cx="20" cy="40" r="5" fill={getVmbrStyles('bridge').header} />
          <text x="32" y="44" fontSize="11">Bridge</text>
          
          <circle cx="80" cy="40" r="5" fill={getVmbrStyles('vlan').header} />
          <text x="92" y="44" fontSize="11">VLAN/Trunk</text>
          
          <circle cx="160" cy="40" r="5" fill={getVmbrStyles('nat').header} />
          <text x="172" y="44" fontSize="11">NAT</text>
          
          <circle cx="65" cy="58" r="5" fill={getVmbrStyles('isolated').header} />
          <text x="77" y="62" fontSize="11">Isolated / Internal</text>
        </g>

      </svg>
    </Box>
  );
};
