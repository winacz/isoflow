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

const GAP_X = 28;
const GAP_Y = 40;
const MAX_COLUMNS = 3;
const START_X = 28;
const START_Y = 56;
const VM_MIN_W = 220;
const VM_HEADER_H = 28;
const VM_BODY_MIN = 36;
/** Bottom quarter reserved for virtual RJ45 NICs. */
const NIC_ZONE_RATIO = 0.25;
const NIC_ZONE_MIN = 52;
const NET_H = 44;
/** Min height for host physical-NIC band (bottom quarter). */
const HOST_PNIC_ZONE_MIN = 72;
/** Vertical corridor between VMs and physical ports (bridges / NAT live here). */
const MID_GAP = 36;
/** Clearance around mid-layer blocks when routing cables around them. */
const ROUTE_PAD = 12;

type Obstacle = { x: number; y: number; width: number; height: number };

const xCrossesObstacle = (
  x: number,
  y0: number,
  y1: number,
  obstacles: Obstacle[]
) => {
  const top = Math.min(y0, y1);
  const bot = Math.max(y0, y1);
  return obstacles.some((o) => {
    if (x < o.x - 1 || x > o.x + o.width + 1) return false;
    return !(bot < o.y || top > o.y + o.height);
  });
};

/** Prefer a vertical channel that does not cut through mid-layer cards. */
const findClearChannelX = (
  preferred: number[],
  obstacles: Obstacle[],
  y0: number,
  y1: number,
  minX: number,
  maxX: number
) => {
  for (const x of preferred) {
    if (
      x >= minX &&
      x <= maxX &&
      !xCrossesObstacle(x, y0, y1, obstacles)
    ) {
      return x;
    }
  }
  // Gaps between obstacles (sorted by x)
  const sorted = [...obstacles].sort((a, b) => a.x - b.x);
  const candidates: number[] = [minX, maxX];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const left = sorted[i].x + sorted[i].width;
    const right = sorted[i + 1].x;
    if (right - left > ROUTE_PAD * 2) {
      candidates.push((left + right) / 2);
    }
  }
  if (sorted.length > 0) {
    candidates.push(sorted[0].x - ROUTE_PAD);
    candidates.push(sorted[sorted.length - 1].x + sorted[sorted.length - 1].width + ROUTE_PAD);
  }
  for (const x of candidates) {
    const clamped = Math.max(minX, Math.min(maxX, x));
    if (!xCrossesObstacle(clamped, y0, y1, obstacles)) return clamped;
  }
  return preferred[0] ?? minX;
};

/**
 * Orthogonal cable that stays clear of mid-layer bridge/NAT cards.
 * Prefer a clean vertical drop; otherwise go around via a free channel.
 */
const routeCable = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  obstacles: Obstacle[],
  bounds: { minX: number; maxX: number }
) => {
  const goingDown = y2 >= y1;
  if (obstacles.length === 0 || Math.abs(x1 - x2) < 2) {
    if (!xCrossesObstacle(x1, y1, y2, obstacles)) {
      return `M ${x1} ${y1} L ${x1} ${y2}`;
    }
  }

  // Direct vertical at x1 then horizontal, if clear
  if (!xCrossesObstacle(x1, y1, y2, obstacles)) {
    return `M ${x1} ${y1} L ${x1} ${y2} L ${x2} ${y2}`;
  }
  if (!xCrossesObstacle(x2, y1, y2, obstacles)) {
    return `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2}`;
  }

  const bandTop = Math.min(...obstacles.map((o) => o.y)) - ROUTE_PAD;
  const bandBot = Math.max(...obstacles.map((o) => o.y + o.height)) + ROUTE_PAD;
  const approachY = goingDown
    ? Math.min(bandTop, (y1 + y2) / 2)
    : Math.max(bandBot, (y1 + y2) / 2);
  const exitY = goingDown
    ? Math.max(bandBot, approachY + 1)
    : Math.min(bandTop, approachY - 1);

  const channel = findClearChannelX(
    [x1, x2, (x1 + x2) / 2],
    obstacles,
    approachY,
    exitY,
    bounds.minX,
    bounds.maxX
  );

  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${approachY}`,
    `L ${channel} ${approachY}`,
    `L ${channel} ${exitY}`,
    `L ${x2} ${exitY}`,
    `L ${x2} ${y2}`
  ].join(' ');
};

/** Horizontal elbow between two mid-layer nets (NAT ↔ bridge). */
const routeSideLink = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
) => {
  if (Math.abs(y1 - y2) < 2) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
};

const PortDot = ({
  cx,
  cy,
  fill
}: {
  cx: number;
  cy: number;
  fill: string;
}) => (
  <circle cx={cx} cy={cy} r={4.5} fill={fill} stroke="#fff" strokeWidth={1.5} />
);

type NetRef =
  | { kind: 'passthrough'; target?: string }
  | { kind: 'bridge' | 'nat'; networkId: string; net: ServerV2LogicalNetwork };

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

/** How many VMs attach to each logical network id. */
const countNetworkUsage = (model: UnifiedNetworkModel): Map<string, number> => {
  const counts = new Map<string, number>();
  model.computeNodes.forEach((vm) => {
    const seen = new Set<string>();
    vm.vNICs.forEach((vnic) => {
      const ref = resolveVnicNet(vnic, model.logicalNetworks);
      if (ref.kind === 'passthrough') return;
      if (seen.has(ref.networkId)) return;
      seen.add(ref.networkId);
      counts.set(ref.networkId, (counts.get(ref.networkId) || 0) + 1);
    });
  });
  return counts;
};

/** Shared = used by 2+ VMs → drawn below. Local = only this VM / passthrough. */
const isSharedNetwork = (
  networkId: string,
  usage: Map<string, number>
): boolean => (usage.get(networkId) || 0) >= 2;

const vmCardMetrics = (vm: ServerV2ComputeNode) => {
  const nicCount = Math.max(1, vm.vNICs.length);
  const bodyH = VM_BODY_MIN;
  // Choose height so the NIC band is exactly the bottom 25% and still roomy.
  let height = Math.ceil((VM_HEADER_H + bodyH) / (1 - NIC_ZONE_RATIO));
  let nicZoneH = Math.round(height * NIC_ZONE_RATIO);
  if (nicZoneH < NIC_ZONE_MIN) {
    nicZoneH = NIC_ZONE_MIN;
    height = Math.ceil((VM_HEADER_H + bodyH + nicZoneH) / 1);
    // Re-fit so band ≈ 25%: grow total if needed
    const target = Math.ceil(nicZoneH / NIC_ZONE_RATIO);
    if (target > height) height = target;
    nicZoneH = Math.round(height * NIC_ZONE_RATIO);
  }
  // Wider cards when many NICs sit in one row
  const width = Math.max(VM_MIN_W, 56 + nicCount * 44);
  return { height, width, nicZoneH, nicZoneY: height - nicZoneH };
};

/** Same LibreICONS RJ45 paths as `Rj45Port` (node faceplate jacks). */
const RJ45_BEZEL = '#cfd8dc';
const RJ45_BODY = '#455a64';
const RJ45_PINS = '#fdd835';

const MiniJack = ({
  x,
  y,
  size = 16,
  isConnected = false
}: {
  x: number;
  y: number;
  size?: number;
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

const KindPill = ({
  label,
  x,
  y
}: {
  label: string;
  x: number;
  y: number;
}) => (
  <g transform={`translate(${x}, ${y})`}>
    <rect width={34} height={16} rx={3} fill="#334155" />
    <text
      x={17}
      y={8.5}
      textAnchor="middle"
      dominantBaseline="central"
      fill="#f8fafc"
      fontFamily={FONT}
      fontSize={9}
      fontWeight={700}
      letterSpacing={0.3}
    >
      {label}
    </text>
  </g>
);

const netTone = (kind: string) => {
  if (kind === 'nat') return { fill: '#fffbeb', stroke: '#f59e0b', text: '#d97706' };
  if (kind === 'passthrough')
    return { fill: '#f5f3ff', stroke: '#a855f7', text: '#7e22ce' };
  return { fill: '#ecfdf5', stroke: '#10b981', text: '#059669' };
};

const slotLabel = (ref: NetRef): { title: string; tone: string } => {
  if (ref.kind === 'passthrough') {
    return {
      title: ref.target ? `PT · ${ref.target}` : 'Passthrough',
      tone: 'passthrough'
    };
  }
  const name = ref.net.name || ref.net.id;
  if (ref.kind === 'nat') return { title: `NAT · ${name}`, tone: 'nat' };
  return { title: `Bridge · ${name}`, tone: 'bridge' };
};

const VmBlock = ({
  vm,
  x,
  y,
  width,
  height,
  nicZoneY,
  nicZoneH,
  networks,
  usage
}: {
  vm: ServerV2ComputeNode;
  x: number;
  y: number;
  width: number;
  height: number;
  nicZoneY: number;
  nicZoneH: number;
  networks: ServerV2LogicalNetwork[];
  usage: Map<string, number>;
}) => {
  const kind = String(vm.type || 'vm').toUpperCase();
  const isLxc = kind === 'LXC';
  const title = vm.name?.trim() || vm.id;
  const nics = vm.vNICs.length > 0 ? vm.vNICs : [{ network: 'direct' } as ServerV2Vnic];
  const colW = width / nics.length;

  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        width={width}
        height={height}
        rx={5}
        fill="#ffffff"
        stroke={isLxc ? '#64748b' : '#94a3b8'}
        strokeWidth={1}
        strokeDasharray={isLxc ? '4 3' : undefined}
      />
      <rect width={width} height={VM_HEADER_H} rx={5} fill="#e2e8f0" />
      <rect y={VM_HEADER_H - 5} width={width} height={5} fill="#e2e8f0" />

      <KindPill label={kind === 'LXC' ? 'LXC' : 'VM'} x={8} y={6} />
      <text
        x={48}
        y={VM_HEADER_H / 2}
        dominantBaseline="central"
        fontFamily={FONT}
        fontSize={12}
        fontWeight={700}
        fill="#1e293b"
      >
        {truncate(title, Math.max(8, Math.floor((width - 56) / 7)))}
      </text>

      {/* Optional body meta (first NIC IP / VLAN summary) */}
      {nics.slice(0, 2).map((vnic, i) => {
        const ip = vnicIp(vnic);
        const vlan = vnicVlan(vnic);
        if (!ip && !vlan) return null;
        return (
          <text
            key={`meta-${i}`}
            x={12}
            y={VM_HEADER_H + 14 + i * 12}
            fontFamily={FONT}
            fontSize={10}
            fill="#64748b"
          >
            {truncate(
              [ip && `IP ${ip}`, vlan && `VLAN ${vlan}`].filter(Boolean).join(' · '),
              Math.max(12, Math.floor((width - 20) / 6.2))
            )}
          </text>
        );
      })}

      {/* Recessed groove — top of bottom-25% NIC band */}
      <rect
        x={6}
        y={nicZoneY - 1}
        width={width - 12}
        height={2}
        rx={1}
        fill="url(#vm-groove)"
      />

      {/* Bottom NIC band — vertical columns, one RJ45 each */}
      <rect
        x={1}
        y={nicZoneY}
        width={width - 2}
        height={nicZoneH - 1}
        fill="#f8fafc"
        opacity={0.9}
      />

      {nics.map((vnic, i) => {
        const ref = resolveVnicNet(vnic, networks);
        const { title: label, tone } = slotLabel(ref);
        const colors = netTone(tone);
        const cx = colW * i + colW / 2;
        const jackSize = Math.min(22, Math.max(14, colW * 0.4));
        const jackY = height - 6 - jackSize;
        const ifaceName = vnic.id || `eth${i}`;
        const wired =
          ref.kind === 'passthrough' ? true : Boolean(ref.networkId);

        return (
          <g key={`${vm.id}-nic-${i}`}>
            {i > 0 && (
              <line
                x1={colW * i}
                y1={nicZoneY + 4}
                x2={colW * i}
                y2={height - 4}
                stroke="rgba(148,163,184,0.35)"
                strokeWidth={1}
              />
            )}
            <text
              x={cx}
              y={nicZoneY + 11}
              textAnchor="middle"
              fontFamily={FONT}
              fontSize={Math.min(9, Math.max(7, colW * 0.18))}
              fontWeight={700}
              fill={colors.text}
            >
              {truncate(label, Math.max(6, Math.floor(colW / 6.5)))}
            </text>
            {ref.kind !== 'passthrough' &&
              isSharedNetwork(ref.networkId, usage) && (
              <text
                x={cx}
                y={nicZoneY + 21}
                textAnchor="middle"
                fontFamily={FONT}
                fontSize={7.5}
                fill="#94a3b8"
              >
                shared
              </text>
            )}
            <text
              x={cx}
              y={jackY - 3}
              textAnchor="middle"
              fontFamily={FONT}
              fontSize={8}
              fill="#94a3b8"
            >
              {truncate(ifaceName, Math.max(4, Math.floor(colW / 7)))}
            </text>
            <MiniJack
              x={cx - jackSize / 2}
              y={jackY}
              size={jackSize}
              isConnected={wired}
            />
          </g>
        );
      })}
    </g>
  );
};

const NetBlock = ({
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
  const isNat = String(net.type).toLowerCase() === 'nat';
  const title = net.name?.trim() || net.id;
  const subtitle = net.name ? net.id : String(net.type);
  const colors = netTone(isNat ? 'nat' : 'bridge');

  return (
    <g transform={`translate(${x}, ${y})`} filter="url(#card-shadow)">
      <rect
        width={width}
        height={height}
        rx={8}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={2}
      />
      <text
        x={width / 2}
        y={height / 2 - (net.gateway_ip || net.name ? 6 : 0)}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={FONT}
        fontSize={12}
        fontWeight={700}
        fill={colors.text}
      >
        {truncate(
          `${isNat ? 'NAT' : 'Bridge'} · ${title}`,
          Math.max(8, Math.floor(width / 7.5))
        )}
      </text>
      {(net.name || net.gateway_ip) && (
        <text
          x={width / 2}
          y={height / 2 + 10}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={FONT}
          fontSize={9.5}
          fill="#64748b"
        >
          {truncate(
            net.gateway_ip ? `${subtitle} · gw ${net.gateway_ip}` : subtitle,
            Math.max(10, Math.floor(width / 6.5))
          )}
        </text>
      )}
    </g>
  );
};

/**
 * Host physical NICs — bottom band of the host chassis (not a separate card).
 * Same column layout as VM vNIC zone: labels above, RJ45 flush to the bottom.
 */
const HostPnicBand = ({
  pnics,
  x,
  y,
  width,
  height
}: {
  pnics: Array<ServerV2Pnic & { badges: string[] }>;
  x: number;
  y: number;
  width: number;
  height: number;
}) => {
  const list = pnics.length > 0 ? pnics : [];
  const colW = list.length > 0 ? width / list.length : width;

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Groove separator — content above touches this band */}
      <rect
        x={8}
        y={0}
        width={width - 16}
        height={2}
        rx={1}
        fill="url(#vm-groove)"
      />
      <rect
        x={0}
        y={3}
        width={width}
        height={height - 3}
        fill="#f1f5f9"
        opacity={0.95}
      />

      {list.map((pnic, i) => {
        const label = pnic.label || pnic.name || pnic.id;
        const cx = colW * i + colW / 2;
        const jackSize = Math.min(26, Math.max(16, colW * 0.28));
        const jackY = height - 4 - jackSize;
        const badge = pnic.badges[0];

        return (
          <g key={pnic.id || `pnic-${i}`}>
            {i > 0 && (
              <line
                x1={colW * i}
                y1={6}
                x2={colW * i}
                y2={height - 2}
                stroke="rgba(148,163,184,0.4)"
                strokeWidth={1}
              />
            )}
            <text
              x={cx}
              y={18}
              textAnchor="middle"
              fontFamily={FONT}
              fontSize={Math.min(11, Math.max(8, colW * 0.12))}
              fontWeight={700}
              fill="#1e293b"
            >
              {truncate(pnic.id, Math.max(5, Math.floor(colW / 7)))}
            </text>
            {label && label !== pnic.id && (
              <text
                x={cx}
                y={30}
                textAnchor="middle"
                fontFamily={FONT}
                fontSize={8}
                fill="#64748b"
              >
                {truncate(label, Math.max(5, Math.floor(colW / 6.5)))}
              </text>
            )}
            {badge && (
              <text
                x={cx}
                y={jackY - 3}
                textAnchor="middle"
                fontFamily={FONT}
                fontSize={7.5}
                fill="#94a3b8"
              >
                {truncate(badge, Math.max(4, Math.floor(colW / 7)))}
              </text>
            )}
            <MiniJack x={cx - jackSize / 2} y={jackY} size={jackSize} />
          </g>
        );
      })}
    </g>
  );
};

/**
 * Logical topology — one host chassis:
 * VMs on top → gap with bridges/NAT → physical RJ45 band at the bottom.
 * Cables: VM→bridge/NAT, passthrough/uplink→pNIC.
 */
export const ServerV2LogicalDiagram = ({ model, scale = 1 }: Props) => {
  const layout = useMemo(() => {
    const usage = countNetworkUsage(model);
    // All bridge / NAT instances sit in the mid corridor (between VMs and pNICs).
    const midNets = model.logicalNetworks;

    const totalVms = model.computeNodes.length;
    const cols = Math.max(1, Math.min(MAX_COLUMNS, totalVms || 1));
    const rows = Math.max(1, Math.ceil((totalVms || 1) / MAX_COLUMNS));

    const metrics = model.computeNodes.map(vmCardMetrics);
    const nodeW = Math.max(VM_MIN_W, ...metrics.map((m) => m.width));

    const rowHeights: number[] = [];
    for (let r = 0; r < rows; r += 1) {
      const slice = metrics.slice(r * cols, r * cols + cols);
      rowHeights.push(Math.max(...slice.map((m) => m.height), 120));
    }

    const vmsBlockH = rowHeights.reduce(
      (sum, h, i) => sum + h + (i < rowHeights.length - 1 ? GAP_Y : 0),
      0
    );

    const spanW =
      Math.min(Math.max(totalVms, 1), cols) * nodeW +
      Math.max(0, Math.min(Math.max(totalVms, 1), cols) - 1) * GAP_X;

    const hasMidNets = midNets.length > 0;
    const pnics = model.host.pNICs.map((p) => ({
      ...normalizePnic(p),
      badges: normalizePnic(p).badges || []
    }));
    const pnicCount = Math.max(1, pnics.length || 1);

    // VMs → gap → [bridges/NAT] → gap → physical band
    const headerH = START_Y;
    const gapAboveMid = MID_GAP;
    const gapBelowMid = MID_GAP;
    const midBlockH = hasMidNets ? NET_H : 0;
    const upperInner =
      headerH + vmsBlockH + gapAboveMid + midBlockH + gapBelowMid;

    const pnicZoneH = Math.max(
      HOST_PNIC_ZONE_MIN,
      Math.round(upperInner * (NIC_ZONE_RATIO / (1 - NIC_ZONE_RATIO))),
      56 + Math.min(24, pnicCount * 2)
    );

    const chassisPad = 12;
    const chassisX = chassisPad;
    const chassisY = chassisPad;
    const bandW = Math.max(
      spanW,
      pnicCount * 56,
      hasMidNets
        ? midNets.length * 130 + Math.max(0, midNets.length - 1) * GAP_X
        : 0
    );
    const chassisW = Math.max(bandW, spanW) + START_X * 2;
    const chassisH = upperInner + pnicZoneH;
    const calc_width = chassisX * 2 + chassisW;
    const calc_height = chassisY * 2 + chassisH;

    const contentOriginX = chassisX + START_X;
    const pnicBand = {
      x: chassisX,
      y: chassisY + upperInner,
      width: chassisW,
      height: pnicZoneH
    };

    const vmPositions = model.computeNodes.map((vm, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const m = metrics[index];
      const y =
        chassisY +
        headerH +
        rowHeights.slice(0, row).reduce((sum, h) => sum + h + GAP_Y, 0);
      const x = contentOriginX + col * (nodeW + GAP_X);
      return {
        ...vm,
        x,
        y,
        width: nodeW,
        height: m.height,
        nicZoneY: m.nicZoneY,
        nicZoneH: m.nicZoneH,
        nicAnchors: (vm.vNICs.length ? vm.vNICs : [{ network: 'direct' }]).map(
          (_v, i, arr) => {
            const colW = nodeW / arr.length;
            return {
              x: x + colW * i + colW / 2,
              y: y + m.height
            };
          }
        )
      };
    });

    const vmsBottom = chassisY + headerH + vmsBlockH;
    const netsY = vmsBottom + gapAboveMid;

    // Prefer mid-layer cards under columns that use bridge/NAT — leave
    // passthrough-only columns empty so PT cables can drop vertically.
    const passthroughCols = new Set<number>();
    model.computeNodes.forEach((vm, index) => {
      const col = index % cols;
      const vnics = vm.vNICs.length ? vm.vNICs : [];
      if (
        vnics.length > 0 &&
        vnics.every((v) => resolveVnicNet(v, midNets).kind === 'passthrough')
      ) {
        passthroughCols.add(col);
      }
    });

    const bridgeCols = Array.from({ length: cols }, (_, c) => c).filter(
      (c) => !passthroughCols.has(c)
    );
    const midSlots =
      bridgeCols.length > 0
        ? bridgeCols
        : Array.from({ length: cols }, (_, c) => c);

    const netW = Math.max(
      130,
      Math.min(
        nodeW,
        hasMidNets
          ? (bandW - Math.max(0, midNets.length - 1) * GAP_X) /
              Math.max(1, midNets.length)
          : bandW
      )
    );

    const netPositions = midNets.map((net, index) => {
      let slotCol = midSlots[index % midSlots.length];
      const attachedCol = model.computeNodes.findIndex((vm) =>
        vm.vNICs.some((v) => {
          const ref = resolveVnicNet(v, midNets);
          return ref.kind !== 'passthrough' && ref.networkId === net.id;
        })
      );
      if (attachedCol >= 0) {
        const col = attachedCol % cols;
        if (!passthroughCols.has(col) || midSlots.includes(col)) {
          slotCol = col;
        }
      }
      const colX = contentOriginX + slotCol * (nodeW + GAP_X);
      return {
        ...net,
        x: colX + Math.max(0, (nodeW - netW) / 2),
        y: netsY,
        width: netW,
        height: NET_H
      };
    });

    // De-overlap nets that landed on the same column
    const netsByCol = new Map<number, typeof netPositions>();
    netPositions.forEach((net) => {
      const col = Math.round((net.x - contentOriginX) / Math.max(1, nodeW + GAP_X));
      const list = netsByCol.get(col) ?? [];
      list.push(net);
      netsByCol.set(col, list);
    });
    netsByCol.forEach((list) => {
      if (list.length <= 1) return;
      const totalW = list.length * netW + (list.length - 1) * 12;
      const start = list[0].x + netW / 2 - totalW / 2;
      list.forEach((net, i) => {
        net.x = start + i * (netW + 12);
      });
    });

    const pnicPositions = pnics.map((pnic, index) => {
      const colW = pnicBand.width / Math.max(1, pnics.length);
      const jackSize = Math.min(26, Math.max(16, colW * 0.28));
      let jackCx = pnicBand.x + colW * index + colW / 2;
      const ptVm = model.computeNodes.find((vm) =>
        vm.vNICs.some((v) => {
          const ref = resolveVnicNet(v, midNets);
          return ref.kind === 'passthrough' && v.target === pnic.id;
        })
      );
      if (ptVm) {
        const vmIdx = model.computeNodes.indexOf(ptVm);
        const col = vmIdx % cols;
        jackCx = contentOriginX + col * (nodeW + GAP_X) + nodeW / 2;
      } else {
        const uplinkNet = midNets.find((n) => n.uplink === pnic.id);
        if (uplinkNet) {
          const placed = netPositions.find((n) => n.id === uplinkNet.id);
          if (placed) jackCx = placed.x + placed.width / 2;
        }
      }
      return {
        ...pnic,
        x: pnicBand.x + colW * index,
        y: pnicBand.y,
        width: colW,
        height: pnicBand.height,
        jackCx,
        jackTop: pnicBand.y + pnicBand.height - 4 - jackSize
      };
    });

    const midObstacles: Obstacle[] = netPositions.map((n) => ({
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height
    }));

    const routeBounds = {
      minX: chassisX + 16,
      maxX: chassisX + chassisW - 16
    };

    return {
      calc_width,
      calc_height,
      chassis: { x: chassisX, y: chassisY, width: chassisW, height: chassisH },
      vmPositions,
      netPositions,
      pnicPositions,
      pnicBand,
      pnics,
      midObstacles,
      routeBounds,
      usage
    };
  }, [model]);

  const {
    calc_width,
    calc_height,
    chassis,
    vmPositions,
    netPositions,
    pnicPositions,
    pnicBand,
    pnics,
    midObstacles,
    routeBounds,
    usage
  } = layout;

  const hostTitle = model.host.name || model.host.id;

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${calc_width} ${calc_height}`}
      width={calc_width * scale}
      height={calc_height * scale}
      sx={{
        overflow: 'visible',
        display: 'block',
        flex: 'none',
        m: '0 auto'
      }}
    >
      <defs>
        <linearGradient id="vm-groove" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(15,23,42,0.18)" />
          <stop offset="55%" stopColor="rgba(15,23,42,0.06)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.7)" />
        </linearGradient>
        <filter id="card-shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.08" />
        </filter>
        <style>
          {`
            .path-standard { stroke: #22c55e; stroke-width: 2.5; fill: none; }
            .path-trunk { stroke: #ef4444; stroke-width: 2; fill: none; }
            .path-access { stroke: #3b82f6; stroke-width: 2; fill: none; }
            .path-nat { stroke: #f59e0b; stroke-width: 2; fill: none; stroke-dasharray: 6 4; }
            .path-passthrough { stroke: #a855f7; stroke-width: 3; fill: none; stroke-dasharray: 6 4; }
          `}
        </style>
      </defs>

      <rect
        x={chassis.x}
        y={chassis.y}
        width={chassis.width}
        height={chassis.height}
        rx={12}
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeWidth={2}
      />

      <text
        x={chassis.x + START_X}
        y={chassis.y + 28}
        fontFamily={FONT}
        fontSize={15}
        fontWeight={700}
        fill="#0f172a"
      >
        Host: {truncate(hostTitle, 42)}
      </text>
      <text
        x={chassis.x + START_X}
        y={chassis.y + 46}
        fontFamily={FONT}
        fontSize={11}
        fill="#64748b"
      >
        Logical Network Diagram
      </text>

      <g className="cables">
        {vmPositions.map((vm) =>
          vm.vNICs.map((vnic, i) => {
            const ref = resolveVnicNet(vnic, model.logicalNetworks);
            const anchor = vm.nicAnchors[i];
            if (!anchor) return null;
            const mode = vnicMode(vnic);

            if (ref.kind === 'passthrough') {
              const target = pnicPositions.find((p) => p.id === vnic.target);
              if (!target) return null;
              return (
                <g key={`pt-${vm.id}-${i}`}>
                  <path
                    d={routeCable(
                      anchor.x,
                      anchor.y,
                      target.jackCx,
                      target.jackTop,
                      midObstacles,
                      routeBounds
                    )}
                    className="path-passthrough"
                  />
                  <PortDot cx={anchor.x} cy={anchor.y} fill="#a855f7" />
                  <PortDot
                    cx={target.jackCx}
                    cy={target.jackTop}
                    fill="#a855f7"
                  />
                </g>
              );
            }

            const targetNet = netPositions.find((n) => n.id === ref.networkId);
            if (!targetNet) return null;
            const className =
              mode === 'trunk'
                ? 'path-trunk'
                : ref.kind === 'nat'
                  ? 'path-nat'
                  : 'path-access';
            const endX = targetNet.x + targetNet.width / 2;
            const endY = targetNet.y;
            const stroke =
              mode === 'trunk'
                ? '#ef4444'
                : ref.kind === 'nat'
                  ? '#f59e0b'
                  : '#3b82f6';
            return (
              <g key={`net-${vm.id}-${i}`}>
                <path
                  d={routeCable(
                    anchor.x,
                    anchor.y,
                    endX,
                    endY,
                    [],
                    routeBounds
                  )}
                  className={className}
                />
                <PortDot cx={anchor.x} cy={anchor.y} fill={stroke} />
                <PortDot cx={endX} cy={endY} fill={stroke} />
              </g>
            );
          })
        )}

        {netPositions.map((net) => {
          const nodes: React.ReactNode[] = [];
          if (net.uplink) {
            const pnic = pnicPositions.find((p) => p.id === net.uplink);
            if (pnic) {
              const startX = net.x + net.width / 2;
              const startY = net.y + net.height;
              nodes.push(
                <g key={`uplink-${net.id}`}>
                  <path
                    d={routeCable(
                      startX,
                      startY,
                      pnic.jackCx,
                      pnic.jackTop,
                      [],
                      routeBounds
                    )}
                    className="path-standard"
                  />
                  <PortDot cx={startX} cy={startY} fill="#22c55e" />
                  <PortDot
                    cx={pnic.jackCx}
                    cy={pnic.jackTop}
                    fill="#22c55e"
                  />
                </g>
              );
            }
          }
          if (net.connectsTo) {
            const target = netPositions.find((n) => n.id === net.connectsTo);
            if (target) {
              const fromRight = net.x < target.x;
              const x1 = fromRight ? net.x + net.width : net.x;
              const x2 = fromRight ? target.x : target.x + target.width;
              const y1 = net.y + net.height / 2;
              const y2 = target.y + target.height / 2;
              nodes.push(
                <g key={`connect-${net.id}`}>
                  <path
                    d={routeSideLink(x1, y1, x2, y2)}
                    className="path-nat"
                  />
                  <PortDot cx={x1} cy={y1} fill="#f59e0b" />
                  <PortDot cx={x2} cy={y2} fill="#f59e0b" />
                </g>
              );
            }
          }
          return nodes;
        })}
      </g>

      {netPositions.map((net) => (
        <NetBlock
          key={net.id}
          net={net}
          x={net.x}
          y={net.y}
          width={net.width}
          height={net.height}
        />
      ))}

      {pnics.length > 0 && (
        <HostPnicBand
          pnics={pnics}
          x={pnicBand.x}
          y={pnicBand.y}
          width={pnicBand.width}
          height={pnicBand.height}
        />
      )}

      {vmPositions.map((vm) => (
        <VmBlock
          key={vm.id}
          vm={vm}
          x={vm.x}
          y={vm.y}
          width={vm.width}
          height={vm.height}
          nicZoneY={vm.nicZoneY}
          nicZoneH={vm.nicZoneH}
          networks={model.logicalNetworks}
          usage={usage}
        />
      ))}
    </Box>
  );
};
