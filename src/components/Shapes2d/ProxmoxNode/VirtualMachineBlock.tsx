import React from 'react';
import type { VirtualMachine } from './types';

interface Props {
  vm: VirtualMachine;
  x: number;
  y: number;
  width: number;
  height: number;
}

const FONT = 'ui-sans-serif, system-ui, sans-serif';
const NIC_ZONE_RATIO = 0.25;

const RJ45_BEZEL = '#cfd8dc';
const RJ45_BODY = '#455a64';
const RJ45_PINS = '#fdd835';

/** Same LibreICONS RJ45 as `Rj45Port` on device nodes. */
const MiniJack = ({
  x,
  y,
  size,
  isConnected = false
}: {
  x: number;
  y: number;
  size: number;
  isConnected?: boolean;
}) => (
  <svg
    x={x}
    y={y}
    width={size}
    height={size}
    viewBox="0 0 14 14"
    role="img"
    aria-hidden
  >
    <path
      fill={RJ45_BEZEL}
      d="M13 11.6667c0 .7363-.597 1.3333-1.3333 1.3333H2.3333C1.597 13 1 12.403 1 11.6667V2.3333C1 1.597 1.597 1 2.3333 1h9.3334C12.403 1 13 1.597 13 2.3333v9.3334z"
    />
    <g fill={RJ45_BODY}>
      <path d="M2.6667 3.3333h8.6666v5.3334H2.6667z" />
      <path d="M4 7.3333h6v2.3334H4z" />
      <path d="M5.3333 8.6667h3.3334v2H5.3333z" />
    </g>
    <path
      fill={RJ45_PINS}
      d="M3.6667 4h.6666v2.3333H3.6667zm1 0h.6666v2.3333H4.6667zm1 0h.6666v2.3333H5.6667zm1 0h.6666v2.3333H6.6667zm1 0h.6666v2.3333H7.6667zm1 0h.6666v2.3333H8.6667zm1 0h.6666v2.3333H9.6667z"
    />
    {isConnected && (
      <g opacity={0.58}>
        <rect
          x={3.15}
          y={3.55}
          width={7.7}
          height={4.35}
          rx={0.25}
          fill="rgba(241, 245, 249, 0.88)"
          stroke="rgba(71, 85, 105, 0.4)"
          strokeWidth={0.35}
        />
        <path
          d="M4.15 7.85h5.7v2.05H4.15z"
          fill="rgba(203, 213, 225, 0.9)"
          stroke="rgba(71, 85, 105, 0.35)"
          strokeWidth={0.3}
        />
        <path
          d="M5.45 9.75h3.1l0.45 1.55H5z"
          fill="rgba(148, 163, 184, 0.75)"
          stroke="rgba(71, 85, 105, 0.4)"
          strokeWidth={0.25}
          strokeLinejoin="round"
        />
        <rect
          x={5.55}
          y={11.15}
          width={2.9}
          height={0.85}
          rx={0.2}
          fill="rgba(148, 163, 184, 0.55)"
        />
      </g>
    )}
  </svg>
);

const typeLabel = (type?: string) => {
  if (type === 'PASSTHROUGH') return { text: 'Passthrough', color: '#7e22ce' };
  if (type === 'NAT') return { text: 'NAT', color: '#d97706' };
  return { text: 'Bridge', color: '#059669' };
};

/**
 * VM/LXC card: bottom quarter = virtual RJ45 row (one column per NIC).
 */
export const VirtualMachineBlock = ({
  vm,
  x,
  y,
  width,
  height
}: Props) => {
  const headerH = Math.max(16, Math.round(height * 0.28));
  const kind = vm.kind ?? 'VM';
  const running = vm.status !== 'stopped';
  const nicZoneH = Math.max(40, Math.round(height * NIC_ZONE_RATIO));
  const nicZoneY = height - nicZoneH;
  const ifaces = vm.interfaces.length > 0 ? vm.interfaces : [];
  const colW = ifaces.length > 0 ? width / ifaces.length : width;

  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        width={width}
        height={height}
        className={kind === 'LXC' ? 'node-lxc' : 'node-vm'}
        rx={4}
      />
      <rect
        width={width}
        height={headerH}
        className="vm-header"
        rx={4}
        style={vm.color ? { fill: vm.color } : undefined}
      />
      <rect
        y={headerH - 4}
        width={width}
        height={4}
        className="vm-header"
        style={vm.color ? { fill: vm.color } : undefined}
      />
      {width >= 30 && (
        <text
          x={10}
          y={headerH / 2}
          fill="#334155"
          fontFamily={FONT}
          fontWeight="bold"
          dominantBaseline="central"
          fontSize={Math.max(11, Math.min(16, headerH * 0.55, width * 0.12))}
        >
          {width < 48 ? vm.name.substring(0, 4) : vm.name}
        </text>
      )}
      <circle
        cx={width - 12}
        cy={headerH / 2}
        r={Math.min(6, Math.max(3, headerH * 0.15))}
        fill={running ? '#3fb950' : '#8b949e'}
      />

      {width >= 60 && vm.description && (
        <text
          x={10}
          y={headerH + (nicZoneY - headerH) * 0.45}
          fill="#64748b"
          fontFamily={FONT}
          fontSize={Math.max(9, Math.min(12, width * 0.055))}
          fontStyle="italic"
          dominantBaseline="central"
        >
          {vm.description.length * 6 > width * 0.85
            ? `${vm.description.slice(0, Math.max(3, Math.floor((width * 0.85) / 6)))}…`
            : vm.description}
        </text>
      )}

      {/* Recessed groove above NIC band */}
      <rect
        x={5}
        y={nicZoneY - 1}
        width={width - 10}
        height={2}
        rx={1}
        fill="#94a3b8"
        opacity={0.35}
      />
      <rect
        x={5}
        y={nicZoneY}
        width={width - 10}
        height={1}
        fill="#ffffff"
        opacity={0.7}
      />

      <rect
        x={1}
        y={nicZoneY}
        width={width - 2}
        height={nicZoneH - 1}
        fill="#f8fafc"
        opacity={0.85}
      />

      {ifaces.map((iface, i) => {
        const { text, color } = typeLabel(iface.type);
        const cx = colW * i + colW / 2;
        const jackSize = Math.min(22, Math.max(14, colW * 0.4));
        const jackY = height - 6 - jackSize;
        const name = iface.name || `eth${i}`;
        return (
          <g key={iface.id}>
            {i > 0 && (
              <line
                x1={colW * i}
                y1={nicZoneY + 3}
                x2={colW * i}
                y2={height - 3}
                stroke="rgba(148,163,184,0.35)"
                strokeWidth={1}
              />
            )}
            <text
              x={cx}
              y={nicZoneY + 10}
              textAnchor="middle"
              fontFamily={FONT}
              fontSize={Math.min(9, Math.max(7, colW * 0.2))}
              fontWeight={700}
              fill={color}
            >
              {text}
            </text>
            <text
              x={cx}
              y={jackY - 3}
              textAnchor="middle"
              fontFamily={FONT}
              fontSize={8}
              fill="#94a3b8"
            >
              {name.length > 8 ? `${name.slice(0, 7)}…` : name}
            </text>
            <MiniJack
              x={cx - jackSize / 2}
              y={jackY}
              size={jackSize}
              isConnected={Boolean(iface.netId || iface.type)}
            />
          </g>
        );
      })}
    </g>
  );
};
