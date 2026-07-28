import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import type {
  ServerV2ComputeNode,
  ServerV2LogicalNetwork,
  ServerV2Pnic,
  ServerV2Vnic,
  UnifiedNetworkModel
} from './types';
import { normalizePnic } from './types';

interface Props {
  model: UnifiedNetworkModel;
  /** Visual scale — also drives SVG layout size so scroll/center work. */
  scale?: number;
}

const FONT =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

/**
 * Universal data-driven SVG layout engine metrics.
 * All coordinates are derived from counts — never hardcoded per diagram.
 */
const PAD = 24;
const HEADER_H = 72;
const Y_COMPUTE_START = PAD + HEADER_H;

const MAX_COLS = 4;
const NODE_W = 240;
const NODE_H = 72;
const NODE_GAP_X = 20;
const NODE_GAP_Y = 18;

const ZONE_GAP = 160;
/** Horizontal bus sits in the open corridor under Zone 1 (not on card edges). */
const BUS_CORRIDOR = 72;

const NAT_H = 48;
const BRIDGE_H = 56;
const LOGIC_GAP_X = 16;
const NAT_BRIDGE_GAP = 100;

const PNIC_H = 92;
const PNIC_GAP = 12;
/** Gap Zone 2 → Zone 3 so hardware never feels clipped against logic. */
const HARDWARE_GAP = 150;
const BOTTOM_MARGIN = 150;
const BYPASS_MARGIN = 28;

type NetRef =
  | { kind: 'passthrough'; target?: string }
  | { kind: 'bridge' | 'nat'; networkId: string; net: ServerV2LogicalNetwork };

type Pt = { x: number; y: number };

const truncate = (value: string, max: number) => {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1))}…`;
};

const vnicMode = (vnic: ServerV2Vnic) =>
  (vnic.mode || vnic.metadata?.Mode || vnic.metadata?.mode || '').toLowerCase();

const vnicIp = (vnic: ServerV2Vnic) =>
  vnic.ip || vnic.metadata?.IP || vnic.metadata?.ip || '';

const vnicVlan = (vnic: ServerV2Vnic) =>
  vnic.vlan || vnic.metadata?.VLAN || vnic.metadata?.vlan || '';

const resolveVnicNet = (
  vnic: ServerV2Vnic,
  networks: ServerV2LogicalNetwork[]
): NetRef => {
  const mode = vnicMode(vnic);
  if (mode === 'passthrough' || vnic.network === 'direct') {
    return { kind: 'passthrough', target: vnic.target };
  }
  const net = networks.find((n) => n.id === vnic.network);
  if (!net) {
    return { kind: 'passthrough', target: vnic.target };
  }
  const type = String(net.type).toLowerCase() === 'nat' ? 'nat' : 'bridge';
  return { kind: type, networkId: net.id, net };
};

const isLxc = (vm: ServerV2ComputeNode) =>
  String(vm.type || '').toLowerCase() === 'lxc';

const isNatNet = (net: ServerV2LogicalNetwork) =>
  String(net.type).toLowerCase() === 'nat';

const wireColor = (opts: {
  kind: 'trunk' | 'passthrough' | 'nat' | 'hw' | 'access';
  vlan?: string;
}) => {
  if (opts.kind === 'trunk') return '#dc2626';
  if (opts.kind === 'passthrough') return '#9333ea';
  if (opts.kind === 'nat') return '#d97706';
  if (opts.kind === 'hw') return '#10b981';
  const v = String(opts.vlan || '').trim();
  if (v === '100') return '#2563eb';
  if (v === '200') return '#0284c7';
  if (v === '30') return '#059669';
  if (v === '40') return '#d97706';
  if (v === '70') return '#7c3aed';
  let h = 0;
  for (let i = 0; i < v.length; i += 1) h = (h * 31 + v.charCodeAt(i)) | 0;
  const palette = ['#2563eb', '#0284c7', '#059669', '#7c3aed', '#db2777', '#0891b2'];
  return palette[Math.abs(h) % palette.length];
};

/** Orthogonal bus only: vertical → shared horizontal channel → vertical. No diagonals/curves. */
const busPath = (from: Pt, to: Pt, busY: number) => {
  const y1 = from.y;
  const y2 = to.y;
  // Always visit the shared channel so stacked layers don't get diagonal shortcuts.
  if (Math.abs(from.x - to.x) < 1.5 && Math.abs(busY - y1) < 1.5) {
    return `M ${from.x} ${y1} L ${to.x} ${y2}`;
  }
  return `M ${from.x} ${y1} L ${from.x} ${busY} L ${to.x} ${busY} L ${to.x} ${y2}`;
};

/**
 * Passthrough bypass: drop to edge rail, run along canvas side,
 * then enter physical zone — never crosses logical NAT/bridge cards.
 */
const bypassPath = (from: Pt, to: Pt, railX: number, midY: number) =>
  `M ${from.x} ${from.y} L ${from.x} ${from.y + 10} L ${railX} ${from.y + 10} L ${railX} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;

/** Evenly distribute fixed-size cards across a band width. */
const distributeHorizontally = (
  count: number,
  bandLeft: number,
  bandWidth: number,
  itemW: number,
  gap: number
): number[] => {
  if (count <= 0) return [];
  const total = count * itemW + Math.max(0, count - 1) * gap;
  const start = bandLeft + Math.max(0, (bandWidth - total) / 2);
  return Array.from({ length: count }, (_, i) => start + i * (itemW + gap));
};

/**
 * Port-based anchoring on the bottom edge of a compute node.
 * X_i = X_node + Width / (N+1) * i  (i = 1..N)
 */
const vnicAnchor = (
  nodeX: number,
  nodeY: number,
  nodeW: number,
  nodeH: number,
  index1Based: number,
  n: number
): Pt => ({
  x: nodeX + (nodeW / (n + 1)) * index1Based,
  y: nodeY + nodeH
});

const PortDot = ({
  cx,
  cy,
  fill,
  r = 4
}: {
  cx: number;
  cy: number;
  fill: string;
  r?: number;
}) => (
  <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#fff" strokeWidth={1.5} />
);

/** Same LibreICONS RJ45 paths as `Rj45Port` on device nodes / switches. */
const RJ45_BEZEL = '#cfd8dc';
const RJ45_BODY = '#455a64';
const RJ45_PINS = '#fdd835';

const MiniJack = ({
  x,
  y,
  size = 22
}: {
  x: number;
  y: number;
  size?: number;
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
  </svg>
);

const ComputeCard = ({
  vm,
  x,
  y,
  width,
  height,
  networks,
  anchors
}: {
  vm: ServerV2ComputeNode;
  x: number;
  y: number;
  width: number;
  height: number;
  networks: ServerV2LogicalNetwork[];
  anchors: Pt[];
}) => {
  const lxc = isLxc(vm);
  const title = vm.name?.trim() || vm.id;
  const nics = vm.vNICs.length > 0 ? vm.vNICs : [];
  const metaParts = nics.map((v, i) => {
    const ref = resolveVnicNet(v, networks);
    if (ref.kind === 'passthrough') {
      return `${v.id || `eth${i}`}: PT → ${v.target || '?'}`;
    }
    const ip = vnicIp(v);
    const vlan = vnicVlan(v);
    const mode = vnicMode(v);
    const bits = [
      ip && `IP ${ip}`,
      vlan && `VLAN ${vlan}`,
      mode === 'trunk' && 'Trunk'
    ].filter(Boolean);
    return bits.length ? bits.join(' · ') : ref.net.name || ref.networkId;
  });

  return (
    <g transform={`translate(${x}, ${y})`} filter="url(#rail-shadow)">
      <rect
        width={width}
        height={height}
        rx={6}
        fill={lxc ? '#f0fdf4' : '#ffffff'}
        stroke={lxc ? '#a7f3d0' : '#cbd5e1'}
        strokeWidth={1.5}
      />
      <text
        x={12}
        y={22}
        fontFamily={FONT}
        fontSize={12}
        fontWeight={700}
        fill="#0f172a"
      >
        {truncate(title, 26)}
        <tspan
          dx={6}
          fontSize={9}
          fontWeight={600}
          fill={lxc ? '#047857' : '#64748b'}
        >
          {lxc ? 'LXC' : 'VM'}
        </tspan>
      </text>
      <text x={12} y={40} fontFamily={MONO} fontSize={9} fill="#334155">
        {truncate(metaParts.join('  ·  ') || '—', 36)}
      </text>
      {/* Port dots sit on absolute anchors; drawn by wire layer */}
      {anchors.map((_, i) => (
        <circle
          key={`slot-${i}`}
          cx={anchors[i].x - x}
          cy={height}
          r={3}
          fill="#94a3b8"
        />
      ))}
    </g>
  );
};

const LogicCard = ({
  net,
  x,
  y,
  width,
  height
}: {
  net: ServerV2LogicalNetwork;
  x: number;
  y: number;
  width: number;
  height: number;
}) => {
  const nat = isNatNet(net);
  const title = net.name?.trim() || net.id;
  const sub = nat
    ? net.gateway_ip
      ? `GW: ${net.gateway_ip}`
      : 'NAT'
    : net.uplink
      ? `Uplink: ${net.uplink}`
      : 'Internal only';

  return (
    <g transform={`translate(${x}, ${y})`} filter="url(#rail-shadow)">
      <rect
        width={width}
        height={height}
        rx={6}
        fill={nat ? '#fffbeb' : '#eff6ff'}
        stroke={nat ? '#fde68a' : '#bfdbfe'}
        strokeWidth={1.5}
      />
      <text
        x={12}
        y={nat ? 18 : 20}
        fontFamily={FONT}
        fontSize={11}
        fontWeight={700}
        fill="#0f172a"
      >
        {truncate(
          nat ? `NAT · ${title}` : `${title} (Bridge)`,
          Math.max(14, Math.floor(width / 7))
        )}
      </text>
      <text
        x={12}
        y={nat ? 34 : 38}
        fontFamily={FONT}
        fontSize={9}
        fill="#64748b"
      >
        {truncate(sub, Math.max(16, Math.floor(width / 6)))}
      </text>
    </g>
  );
};

const PnicCard = ({
  pnic,
  x,
  y,
  width,
  height
}: {
  pnic: ServerV2Pnic & { badges: string[] };
  x: number;
  y: number;
  width: number;
  height: number;
}) => {
  const label = pnic.label || pnic.name || '';
  const isMgmt = pnic.badges.some((b) => /idrac|mgmt|dell/i.test(b));
  const jackSize = Math.min(26, Math.max(18, Math.min(width * 0.28, 26)));
  const jackY = height - 6 - jackSize;
  const jackX = width / 2 - jackSize / 2;
  const badge = pnic.badges[0];

  return (
    <g transform={`translate(${x}, ${y})`} filter="url(#rail-shadow)">
      <rect
        width={width}
        height={height}
        rx={6}
        fill={isMgmt ? '#f8fafc' : '#f1f5f9'}
        stroke={isMgmt ? '#94a3b8' : '#cbd5e1'}
        strokeWidth={1.5}
        strokeDasharray={isMgmt ? '4 3' : undefined}
      />
      <text
        x={width / 2}
        y={18}
        textAnchor="middle"
        fontFamily={FONT}
        fontSize={12}
        fontWeight={700}
        fill="#0f172a"
      >
        {truncate(pnic.id, Math.max(8, Math.floor(width / 8)))}
      </text>
      {label && label !== pnic.id && (
        <text
          x={width / 2}
          y={34}
          textAnchor="middle"
          fontFamily={FONT}
          fontSize={10}
          fill="#64748b"
        >
          {truncate(label, Math.max(10, Math.floor(width / 6.5)))}
        </text>
      )}
      {badge && (
        <text
          x={width / 2}
          y={jackY - 4}
          textAnchor="middle"
          fontFamily={FONT}
          fontSize={9}
          fill="#94a3b8"
        >
          {truncate(
            pnic.badges.slice(0, 2).join(' · '),
            Math.max(8, Math.floor(width / 7))
          )}
        </text>
      )}
      <MiniJack x={jackX} y={jackY} size={jackSize} />
    </g>
  );
};

/**
 * Universal SVG network layout engine:
 * Zone 1 Compute (grid) → Zone 2 NAT then Bridge → Zone 3 Physical.
 * Orthogonal bus routing; passthrough bypasses logical zone on the edge rail.
 */
export const ServerV2LogicalDiagram = ({ model, scale = 1 }: Props) => {
  const layout = useMemo(() => {
    const pnics = model.host.pNICs.map((p) => ({
      ...normalizePnic(p),
      badges: normalizePnic(p).badges || []
    }));
    const nats = model.logicalNetworks.filter(isNatNet);
    const bridges = model.logicalNetworks.filter((n) => !isNatNet(n));
    const vms = model.computeNodes;

    const computeRows = Math.max(1, Math.ceil(vms.length / MAX_COLS));
    const colsUsed = Math.min(MAX_COLS, Math.max(1, vms.length));

    const computeBandW =
      colsUsed * NODE_W + Math.max(0, colsUsed - 1) * NODE_GAP_X;
    const contentInnerW = Math.max(
      computeBandW,
      720,
      pnics.length * 120 + Math.max(0, pnics.length - 1) * PNIC_GAP
    );
    const chassisW = PAD * 2 + BYPASS_MARGIN * 2 + contentInnerW;
    const contentLeft = PAD + BYPASS_MARGIN;
    const contentRight = chassisW - PAD - BYPASS_MARGIN;
    const contentW = contentRight - contentLeft;

    // —— Zone 1: Compute grid ——
    const gridLeft =
      contentLeft + Math.max(0, (contentW - computeBandW) / 2);
    const computePositions = vms.map((vm, index) => {
      const row = Math.floor(index / MAX_COLS);
      const col = index % MAX_COLS;
      const x = gridLeft + col * (NODE_W + NODE_GAP_X);
      const y = Y_COMPUTE_START + row * (NODE_H + NODE_GAP_Y);
      const nics = vm.vNICs.length > 0 ? vm.vNICs : [];
      const n = Math.max(1, nics.length);
      const anchors = (nics.length ? nics : [null]).map((_, i) =>
        vnicAnchor(x, y, NODE_W, NODE_H, i + 1, n)
      );
      return {
        ...vm,
        x,
        y,
        width: NODE_W,
        height: NODE_H,
        anchors
      };
    });

    const yComputeEnd =
      Y_COMPUTE_START +
      computeRows * NODE_H +
      Math.max(0, computeRows - 1) * NODE_GAP_Y;

    // —— Zone 2: Logical (NAT band, then Bridge band) ——
    const yLogicStart = yComputeEnd + ZONE_GAP;
    const busY = yComputeEnd + BUS_CORRIDOR;

    const natItemW = Math.min(
      220,
      Math.max(
        140,
        (contentW - Math.max(0, nats.length - 1) * LOGIC_GAP_X) /
          Math.max(1, nats.length)
      )
    );
    const natXs = distributeHorizontally(
      nats.length,
      contentLeft,
      contentW,
      natItemW,
      LOGIC_GAP_X
    );
    const natPositions = nats.map((net, index) => {
      const x = natXs[index] ?? contentLeft;
      const y = yLogicStart;
      return {
        ...net,
        x,
        y,
        width: natItemW,
        height: NAT_H,
        topIn: { x: x + natItemW / 2, y },
        bottomOut: { x: x + natItemW / 2, y: y + NAT_H },
        rightOut: { x: x + natItemW, y: y + NAT_H / 2 }
      };
    });

    const yBridgeStart =
      yLogicStart + (nats.length ? NAT_H + NAT_BRIDGE_GAP : 0);
    const bridgeItemW = Math.min(
      240,
      Math.max(
        150,
        (contentW - Math.max(0, bridges.length - 1) * LOGIC_GAP_X) /
          Math.max(1, bridges.length)
      )
    );
    const bridgeXs = distributeHorizontally(
      bridges.length,
      contentLeft,
      contentW,
      bridgeItemW,
      LOGIC_GAP_X
    );
    const bridgePositions = bridges.map((net, index) => {
      const x = bridgeXs[index] ?? contentLeft;
      const y = yBridgeStart;
      return {
        ...net,
        x,
        y,
        width: bridgeItemW,
        height: BRIDGE_H,
        topIn: { x: x + bridgeItemW / 2, y },
        bottomOut: { x: x + bridgeItemW / 2, y: y + BRIDGE_H },
        leftIn: { x, y: y + BRIDGE_H / 2 }
      };
    });

    const yLogicEnd =
      bridges.length > 0
        ? yBridgeStart + BRIDGE_H
        : nats.length > 0
          ? yLogicStart + NAT_H
          : yLogicStart;

    const natBridgeBusY =
      nats.length && bridges.length
        ? yLogicStart + NAT_H + NAT_BRIDGE_GAP / 2
        : busY;

    // —— Zone 3: Physical pNICs ——
    const yHardware = yLogicEnd + HARDWARE_GAP;
    const pnicCount = Math.max(1, pnics.length);
    const pnicW = Math.max(
      110,
      (contentW - Math.max(0, pnicCount - 1) * PNIC_GAP) / pnicCount
    );
    const pnicStartX =
      contentLeft +
      Math.max(
        0,
        (contentW - (pnicCount * pnicW + (pnicCount - 1) * PNIC_GAP)) / 2
      );
    const pnicPositions = pnics.map((pnic, index) => {
      const x = pnicStartX + index * (pnicW + PNIC_GAP);
      return {
        ...pnic,
        x,
        y: yHardware,
        width: pnicW,
        height: PNIC_H,
        topIn: { x: x + pnicW / 2, y: yHardware }
      };
    });

    const chassisH = yHardware + PNIC_H + BOTTOM_MARGIN;
    const bypassRailX = chassisW - PAD - BYPASS_MARGIN / 2;
    const bypassMidY = yLogicStart + (yLogicEnd - yLogicStart) / 2;

    return {
      chassisW,
      chassisH,
      computePositions,
      natPositions,
      bridgePositions,
      pnicPositions,
      busY,
      natBridgeBusY,
      bypassRailX,
      bypassMidY,
      yHardware,
      hostTitle: model.host.name || model.host.id,
      contentLeft
    };
  }, [model]);

  const {
    chassisW,
    chassisH,
    computePositions,
    natPositions,
    bridgePositions,
    pnicPositions,
    busY,
    natBridgeBusY,
    bypassRailX,
    bypassMidY,
    yHardware,
    hostTitle,
    contentLeft
  } = layout;

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${chassisW} ${chassisH}`}
      width={chassisW * scale}
      height={chassisH * scale}
      sx={{
        overflow: 'visible',
        display: 'block',
        flex: 'none',
        m: '0 auto'
      }}
    >
      <defs>
        <filter id="rail-shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.05" />
        </filter>
        <linearGradient id="pnic-rail-groove" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0.8)" />
          <stop offset="50%" stopColor="rgba(15,23,42,0.18)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.8)" />
        </linearGradient>
        <style>
          {`
            .wire { stroke-width: 2; fill: none; }
            .wire-pass { stroke-width: 2.5; stroke-dasharray: 6 4; }
            .wire-nat { stroke-dasharray: 4 4; }
            .wire-hw { stroke-width: 2.5; }
          `}
        </style>
      </defs>

      <rect
        x={PAD / 2}
        y={PAD / 2}
        width={chassisW - PAD}
        height={chassisH - PAD}
        rx={12}
        fill="#f8fafc"
        stroke="#e2e8f0"
        strokeWidth={2}
      />

      <text
        x={PAD + 16}
        y={PAD + 26}
        fontFamily={FONT}
        fontSize={16}
        fontWeight={700}
        fill="#0f172a"
      >
        {truncate(hostTitle, 48)}
      </text>
      <text
        x={PAD + 16}
        y={PAD + 46}
        fontFamily={FONT}
        fontSize={11}
        fill="#64748b"
      >
        Compute → NAT → Bridge → Physical · orthogonal bus
      </text>

      <text
        x={contentLeft}
        y={Y_COMPUTE_START - 14}
        fontFamily={FONT}
        fontSize={11}
        fontWeight={700}
        letterSpacing={0.5}
        fill="#64748b"
      >
        1 · COMPUTE (grid ≤{MAX_COLS})
      </text>
      {natPositions.length > 0 && (
        <text
          x={contentLeft}
          y={natPositions[0].y - 12}
          fontFamily={FONT}
          fontSize={11}
          fontWeight={700}
          letterSpacing={0.5}
          fill="#64748b"
        >
          2a · NAT
        </text>
      )}
      {bridgePositions.length > 0 && (
        <text
          x={contentLeft}
          y={bridgePositions[0].y - 12}
          fontFamily={FONT}
          fontSize={11}
          fontWeight={700}
          letterSpacing={0.5}
          fill="#64748b"
        >
          2b · BRIDGE / vSwitch
        </text>
      )}
      {pnicPositions.length > 0 && (
        <text
          x={contentLeft}
          y={yHardware - 12}
          fontFamily={FONT}
          fontSize={11}
          fontWeight={700}
          letterSpacing={0.5}
          fill="#64748b"
        >
          3 · PHYSICAL (pNICs)
        </text>
      )}

      <g className="wires">
        {computePositions.map((vm) =>
          (vm.vNICs.length ? vm.vNICs : []).map((vnic, i) => {
            const ref = resolveVnicNet(vnic, model.logicalNetworks);
            const anchor = vm.anchors[i];
            if (!anchor) return null;

            if (ref.kind === 'passthrough') {
              const target = pnicPositions.find((p) => p.id === vnic.target);
              if (!target) return null;
              const color = wireColor({ kind: 'passthrough' });
              return (
                <g key={`pt-${vm.id}-${i}`}>
                  <path
                    d={bypassPath(
                      anchor,
                      target.topIn,
                      bypassRailX,
                      bypassMidY
                    )}
                    className="wire wire-pass"
                    stroke={color}
                  />
                  <PortDot cx={anchor.x} cy={anchor.y} fill={color} />
                  <PortDot
                    cx={target.topIn.x}
                    cy={target.topIn.y}
                    fill={color}
                  />
                </g>
              );
            }

            const mode = vnicMode(vnic);
            const vlan = vnicVlan(vnic);
            const color = wireColor({
              kind: mode === 'trunk' ? 'trunk' : 'access',
              vlan
            });

            if (ref.kind === 'nat') {
              const target = natPositions.find((n) => n.id === ref.networkId);
              if (!target) return null;
              return (
                <g key={`net-${vm.id}-${i}`}>
                  <path
                    d={busPath(anchor, target.topIn, busY)}
                    className="wire wire-nat"
                    stroke={color}
                  />
                  <PortDot cx={anchor.x} cy={anchor.y} fill={color} />
                  <PortDot
                    cx={target.topIn.x}
                    cy={target.topIn.y}
                    fill={color}
                  />
                </g>
              );
            }

            const target = bridgePositions.find((n) => n.id === ref.networkId);
            if (!target) return null;
            return (
              <g key={`net-${vm.id}-${i}`}>
                <path
                  d={busPath(anchor, target.topIn, busY)}
                  className="wire"
                  stroke={color}
                />
                <PortDot cx={anchor.x} cy={anchor.y} fill={color} />
                <PortDot
                  cx={target.topIn.x}
                  cy={target.topIn.y}
                  fill={color}
                />
              </g>
            );
          })
        )}

        {natPositions.map((nat) => {
          if (!nat.connectsTo) return null;
          const bridge = bridgePositions.find((b) => b.id === nat.connectsTo);
          if (!bridge) return null;
          const color = wireColor({ kind: 'nat' });
          return (
            <g key={`nat-up-${nat.id}`}>
              <path
                d={busPath(nat.bottomOut, bridge.topIn, natBridgeBusY)}
                className="wire wire-nat"
                stroke={color}
              />
              <PortDot cx={nat.bottomOut.x} cy={nat.bottomOut.y} fill={color} />
              <PortDot
                cx={bridge.topIn.x}
                cy={bridge.topIn.y}
                fill={color}
              />
            </g>
          );
        })}

        {bridgePositions.map((br) => {
          if (!br.uplink) return null;
          const pnic = pnicPositions.find((p) => p.id === br.uplink);
          if (!pnic) return null;
          const color = wireColor({ kind: 'hw' });
          const hwBusY = br.bottomOut.y + (yHardware - br.bottomOut.y) / 2;
          return (
            <g key={`uplink-${br.id}`}>
              <path
                d={busPath(br.bottomOut, pnic.topIn, hwBusY)}
                className="wire wire-hw"
                stroke={color}
              />
              <PortDot cx={br.bottomOut.x} cy={br.bottomOut.y} fill={color} />
              <PortDot cx={pnic.topIn.x} cy={pnic.topIn.y} fill={color} />
            </g>
          );
        })}
      </g>

      {computePositions.map((vm) => (
        <ComputeCard
          key={vm.id}
          vm={vm}
          x={vm.x}
          y={vm.y}
          width={vm.width}
          height={vm.height}
          networks={model.logicalNetworks}
          anchors={vm.anchors}
        />
      ))}

      {natPositions.map((net) => (
        <LogicCard
          key={net.id}
          net={net}
          x={net.x}
          y={net.y}
          width={net.width}
          height={net.height}
        />
      ))}

      {bridgePositions.map((net) => (
        <LogicCard
          key={net.id}
          net={net}
          x={net.x}
          y={net.y}
          width={net.width}
          height={net.height}
        />
      ))}

      {pnicPositions.map((pnic, i) => (
        <g key={pnic.id}>
          {i > 0 && (
            <g aria-hidden>
              <rect
                x={pnic.x - PNIC_GAP / 2 - 1.5}
                y={pnic.y + 8}
                width={3}
                height={PNIC_H - 16}
                rx={1}
                fill="url(#pnic-rail-groove)"
              />
            </g>
          )}
          <PnicCard
            pnic={pnic}
            x={pnic.x}
            y={pnic.y}
            width={pnic.width}
            height={pnic.height}
          />
        </g>
      ))}
    </Box>
  );
};
