import React, { useId, useMemo } from 'react';
import { Box } from '@mui/material';
import { TILE_SIZE_2D, CABINET_EAR_TILES, type Shape2dPort } from 'src/config';
import type { Size } from 'src/types';
import type { ServerConfig } from './types';
import { computeProxmoxLayout, bezierBetween } from './layout';
import { VirtualMachineBlock } from './VirtualMachineBlock';
import { NetworkLogicBlock } from './NetworkLogicBlock';
import { PhysicalPort } from './PhysicalPort';

interface Props {
  itemId?: string;
  config: ServerConfig;
  /** Tile footprint from layoutDeviceTemplate — drives chassis + port snap. */
  size: Size;
  /** Same Shape2dPort[] the connector engine uses for magnetic snap. */
  layoutPorts: Shape2dPort[];
  name?: string;
  /** Management / host IP from model item settings. */
  ip?: string;
  width?: number;
  height?: number;
  centered?: boolean;
  showShadow?: boolean;
  connectedPortIds?: ReadonlySet<string> | string[];
  focusedPortIds?: ReadonlySet<string> | string[] | null;
  peerHighlightPortIds?: ReadonlySet<string> | string[];
  attentionPortId?: string | null;
  attentionToken?: number | null;
}

/**
 * Server node: VMs → vSwitch/NAT → physical NICs.
 * White chassis + rack ears (switch-like); physical ports in tile space.
 */
export const ProxmoxNode = ({
  itemId,
  config,
  size,
  layoutPorts,
  name,
  ip,
  width,
  height,
  centered = true,
  showShadow = true,
  connectedPortIds,
  focusedPortIds = null,
  peerHighlightPortIds,
  attentionPortId = null,
  attentionToken = null
}: Props) => {
  const uid = useId().replace(/:/g, '');
  const layout = useMemo(() => {
    return computeProxmoxLayout({ config, size, layoutPorts });
  }, [config, size, layoutPorts]);

  const pxWidth = width ?? layout.pxWidth;
  const pxHeight = height ?? layout.pxHeight;
  const scaleX = pxWidth / layout.pxWidth;
  const scaleY = pxHeight / layout.pxHeight;
  const tileW = TILE_SIZE_2D * scaleX;
  const tileH = TILE_SIZE_2D * scaleY;

  const earW = Math.round(CABINET_EAR_TILES * tileW);
  const mountHoleW = Math.max(12, Math.round(earW * 0.72));
  const mountHoleH = Math.max(6, Math.round(mountHoleW * 0.42));
  const earRadius = Math.max(4, Math.round(earW * 0.28));

  const connectedSet = useMemo(() => {
    if (!connectedPortIds) return null;
    return connectedPortIds instanceof Set
      ? connectedPortIds
      : new Set(connectedPortIds);
  }, [connectedPortIds]);

  const focusedSet = useMemo(() => {
    if (!focusedPortIds) return null;
    return focusedPortIds instanceof Set
      ? focusedPortIds
      : new Set(focusedPortIds);
  }, [focusedPortIds]);

  const peerSet = useMemo(() => {
    if (!peerHighlightPortIds) return null;
    return peerHighlightPortIds instanceof Set
      ? peerHighlightPortIds
      : new Set(peerHighlightPortIds);
  }, [peerHighlightPortIds]);

  const title = name?.trim() || config.name || 'Server';
  /** Top strip before VM grid (matches layout START_Y). Title fills ~78% of it. */
  const headerBandH = 80;
  const titleFontSize = Math.max(16, Math.round(headerBandH * 0.78));
  const titleY = headerBandH / 2;

  const nameByPortId = useMemo(() => {
    const map = new Map<string, string>();
    config.physicalInterfaces.forEach((iface) => {
      map.set(iface.id, iface.name);
    });
    return map;
  }, [config.physicalInterfaces]);

  const cables = useMemo(() => {
    const paths: React.ReactNode[] = [];

    config.virtualMachines.forEach((vm) => {
      const start = layout.vmPositions.get(vm.id);
      if (!start) return;
      vm.interfaces.forEach((iface) => {
        const anchor = layout.vnicAnchors.get(iface.id);
        if (!anchor) return;
        
        if (iface.type === 'PASSTHROUGH') {
          if (!iface.physicalTargetId) return;
          const end = layout.portAnchors.get(iface.physicalTargetId);
          if (!end) return;
          paths.push(
            <path
              key={`vm-${vm.id}-iface-${iface.id}-pt`}
              d={bezierBetween(anchor.x, anchor.y, end.x, end.y)}
              className="line-passthrough"
            />
          );
        } else {
          const end = layout.netPositions.get(iface.netId);
          if (!end) return;
          const net = config.virtualNetworks.find((n) => n.id === iface.netId);
          const isBridge = net?.type === 'BRIDGE';
          paths.push(
            <path
              key={`vm-${vm.id}-iface-${iface.id}`}
              d={bezierBetween(anchor.x, anchor.y, end.x + end.width / 2, end.y)}
              className={iface.isTrunk ? 'line-trunk' : (isBridge ? 'line-bridge' : 'line-nat')}
            />
          );
        }
      });
    });

    config.virtualNetworks.forEach((net) => {
      if (!net.physicalTargetId) return;
      const start = layout.netPositions.get(net.id);
      const end = layout.portAnchors.get(net.physicalTargetId);
      if (!start || !end) return;
      const isBridge = net.type === 'BRIDGE';
      paths.push(
        <path
          key={`net-${net.id}-port-${net.physicalTargetId}`}
          d={bezierBetween(
            start.x + start.width / 2,
            start.y + start.height,
            end.x,
            end.y
          )}
          className={isBridge ? 'line-bridge' : 'line-nat'}
        />
      );
    });

    return paths;
  }, [config, layout]);

  return (
    <Box
      sx={{
        position: centered ? 'absolute' : 'relative',
        width: pxWidth,
        height: pxHeight,
        left: centered ? -pxWidth / 2 : 0,
        top: centered ? -pxHeight / 2 : 0,
        pointerEvents: 'none',
        boxSizing: 'border-box',
        overflow: 'visible',
        filter: showShadow
          ? 'drop-shadow(0 3px 5px rgba(15,23,42,0.28)) drop-shadow(0 1px 2px rgba(15,23,42,0.14))'
          : undefined
      }}
    >
      {/* Rack ears — outside chassis, flush to sides (like DeviceShape2d). */}
      {(['left', 'right'] as const).map((side) => {
        const cx = earW / 2;
        const hw = mountHoleW / 2;
        const hh = mountHoleH / 2;
        const fracs = [0.25, 0.75];
        const maskId = `rack-ear-mask-${side}-${uid}`;
        const gradId = `rack-ear-grad-${side}-${uid}`;
        const joinOverlap = 1;
        const rx = earRadius;

        return (
          <Box
            key={side}
            component="svg"
            width={earW + joinOverlap}
            height={pxHeight}
            viewBox={`0 0 ${earW + joinOverlap} ${pxHeight}`}
            sx={{
              position: 'absolute',
              left: side === 'left' ? -earW : undefined,
              right: side === 'right' ? -earW : undefined,
              top: 0,
              zIndex: 0,
              pointerEvents: 'none',
              display: 'block',
              overflow: 'visible'
            }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#4a5560" />
                <stop offset="50%" stopColor="#3a424c" />
                <stop offset="100%" stopColor="#2d343c" />
              </linearGradient>
              <mask id={maskId}>
                <rect
                  width={earW + joinOverlap}
                  height={pxHeight}
                  fill="white"
                />
                {fracs.map((frac) => {
                  const cy = pxHeight * frac;
                  const holeCx = side === 'left' ? cx : joinOverlap + cx;
                  return (
                    <rect
                      key={frac}
                      x={holeCx - hw}
                      y={cy - hh}
                      width={mountHoleW}
                      height={mountHoleH}
                      rx={hh}
                      ry={hh}
                      fill="black"
                    />
                  );
                })}
              </mask>
            </defs>
            <path
              d={
                side === 'left'
                  ? [
                      `M ${earW + joinOverlap} 0`,
                      `L ${rx} 0`,
                      `Q 0 0 0 ${rx}`,
                      `L 0 ${pxHeight - rx}`,
                      `Q 0 ${pxHeight} ${rx} ${pxHeight}`,
                      `L ${earW + joinOverlap} ${pxHeight}`,
                      'Z'
                    ].join(' ')
                  : [
                      `M 0 0`,
                      `L ${earW + joinOverlap - rx} 0`,
                      `Q ${earW + joinOverlap} 0 ${earW + joinOverlap} ${rx}`,
                      `L ${earW + joinOverlap} ${pxHeight - rx}`,
                      `Q ${earW + joinOverlap} ${pxHeight} ${earW + joinOverlap - rx} ${pxHeight}`,
                      `L 0 ${pxHeight}`,
                      'Z'
                    ].join(' ')
              }
              fill={`url(#${gradId})`}
              stroke="#1e293b"
              strokeWidth={1}
              mask={`url(#${maskId})`}
            />
          </Box>
        );
      })}

      <Box
        component="svg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${layout.pxWidth} ${layout.pxHeight}`}
        width={pxWidth}
        height={pxHeight}
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          display: 'block',
          overflow: 'visible',
          zIndex: 1
        }}
      >
        <defs>
          <style>
            {`
              .px-chassis-${uid} { fill: #ffffff; stroke: #cbd5e1; stroke-width: 2; }
              .host-bg { fill: #ffffff; stroke: #cbd5e1; stroke-width: 2; }
              .node-vm { fill: #ffffff; stroke: #94a3b8; stroke-width: 1; }
              .node-lxc { fill: #ffffff; stroke: #94a3b8; stroke-width: 1; stroke-dasharray: 4 4; }
              .vm-box { fill: #ffffff; stroke: #94a3b8; stroke-width: 1; }
              .px-title-${uid} { fill: #0f172a; font-family: ui-sans-serif, system-ui, sans-serif; font-size: ${titleFontSize}px; font-weight: 700; }
              .text-sub { fill: #64748b; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 10px; }
              .text-bold { fill: #334155; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; font-weight: 700; }
              .vm-box { fill: #f1f5f9; stroke: #94a3b8; stroke-width: 1.5; }
              .vm-header { fill: #e2e8f0; }
              .net-bridge { fill: #ecfdf5; stroke: #10b981; stroke-width: 1; }
              .net-nat { fill: #fffbeb; stroke: #f59e0b; stroke-width: 1; }
              .line-bridge { stroke: #10b981; stroke-width: 2; fill: none; opacity: 0.75; }
              .line-nat { stroke: #f59e0b; stroke-width: 2; fill: none; stroke-dasharray: 4 4; opacity: 0.85; }
              .line-trunk { stroke: #8b5cf6; stroke-width: 2.5; fill: none; opacity: 0.9; }
              .line-passthrough { stroke: #a855f7; stroke-width: 3; fill: none; stroke-dasharray: 8 4; opacity: 0.95; }
            `}
          </style>
        </defs>

        <rect
          x={2}
          y={2}
          width={layout.internalWidth - 4}
          height={layout.internalHeight - 4}
          rx={8}
          className={`px-chassis-${uid} host-bg`}
        />
        <text
          x={20}
          y={titleY}
          dominantBaseline="middle"
          className={`px-title-${uid}`}
        >
          {title}
        </text>
        {Boolean(ip?.trim()) && (
          <text
            x={layout.internalWidth - 24}
            y={titleY}
            textAnchor="end"
            dominantBaseline="middle"
            fill="#64748b"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize={Math.max(12, Math.round(headerBandH * 0.22))}
            fontWeight={700}
          >
            <tspan
              fill="#94a3b8"
              fontSize={Math.max(10, Math.round(headerBandH * 0.16))}
              fontWeight={800}
              letterSpacing={1.2}
            >
              IP{' '}
            </tspan>
            <tspan
              fill="#0f172a"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            >
              {ip!.trim()}
            </tspan>
          </text>
        )}

        <g id={`cables-${uid}`}>{cables}</g>

        {config.virtualMachines.map((vm) => {
          const pos = layout.vmPositions.get(vm.id);
          if (!pos) return null;
          return (
            <VirtualMachineBlock
              key={vm.id}
              vm={vm}
              x={pos.x}
              y={pos.y}
              width={pos.width}
              height={pos.height}
            />
          );
        })}

        {config.virtualNetworks.map((net) => {
          const pos = layout.netPositions.get(net.id);
          if (!pos) return null;
          return (
            <NetworkLogicBlock
              key={net.id}
              network={net}
              x={pos.x}
              y={pos.y}
              width={pos.width}
              height={pos.height}
            />
          );
        })}
      </Box>

      {layoutPorts.map((port) => {
        return (
          <PhysicalPort
            itemId={itemId}
            key={port.id}
            port={port}
            name={nameByPortId.get(port.id) ?? port.label ?? port.id}
            tileW={tileW}
            tileH={tileH}
            isConnected={connectedSet?.has(port.id) ?? false}
            isFocused={focusedSet?.has(port.id) ?? false}
            isPeerHighlight={peerSet?.has(port.id) ?? false}
            attentionPortId={attentionPortId}
            attentionToken={attentionToken}
            isMgmt={port.sectionId === 'mgmt'}
          />
        );
      })}
    </Box>
  );
};
