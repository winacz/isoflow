import React, { useId, useMemo, useSyncExternalStore } from 'react';
import { Box, Typography } from '@mui/material';
import { Icon } from 'src/types';
import type { ModelItem } from 'src/types';
import { TILE_SIZE_2D, CABINET_EAR_TILES } from 'src/config';
import { MIKROTIK_SHAPE_SIZES } from 'src/fixtures/mikrotikIcons';
import {
  MIKROTIK_V2_SHAPE_SIZES,
  isMikrotikV2Icon
} from 'src/fixtures/mikrotikV2Icons';
import {
  getMikrotikPorts,
  getMikrotikPortsVersion,
  subscribeMikrotikPorts
} from 'src/utils/mikrotikPortLayouts';
import { getPortStatusColor, SHAPE_2D_PORT_VISUAL_SIZE_TILES } from 'src/utils';
import { Rj45Port } from 'src/components/Shapes2d/Rj45Port';

interface Props {
  icon: Icon;
  name?: string;
  /** Override footprint in tiles. */
  width?: number;
  height?: number;
  centered?: boolean;
  /** Per-port config from ModelItem — drives VLAN status colors. */
  ports?: ModelItem['ports'];
  connectedPortIds?: ReadonlySet<string> | string[];
  mismatchPortIds?: ReadonlySet<string> | string[];
  focusedPortIds?: ReadonlySet<string> | string[] | null;
  attentionPortId?: string | null;
  attentionToken?: number | null;
  peerHighlightPortIds?: ReadonlySet<string> | string[];
  modelItems?: ModelItem[];
  /** Hide jack overlays (e.g. tiny sidebar preview). */
  showPorts?: boolean;
}

/**
 * Plan (2D) node that renders a Mikrotik SVG asset at its rack footprint.
 * Mikrotik V2: bay width + separate rack ears (cabinet slot model).
 */
export const SvgShape2d = ({
  icon,
  name,
  width,
  height,
  centered = true,
  ports: portConfigs,
  connectedPortIds,
  mismatchPortIds,
  focusedPortIds = null,
  attentionPortId = null,
  attentionToken = null,
  peerHighlightPortIds,
  modelItems,
  showPorts = true
}: Props) => {
  const portsVersion = useSyncExternalStore(
    subscribeMikrotikPorts,
    getMikrotikPortsVersion
  );
  const earMaskUid = useId().replace(/:/g, '');
  const withRackEars = isMikrotikV2Icon(icon.id);

  const size =
    MIKROTIK_SHAPE_SIZES[icon.id] ??
    MIKROTIK_V2_SHAPE_SIZES[icon.id] ?? { width: 60, height: 9 };
  const pxW = (width ?? size.width) * TILE_SIZE_2D;
  const pxH = (height ?? size.height) * TILE_SIZE_2D;
  const tileW = TILE_SIZE_2D;
  const tileH = TILE_SIZE_2D;
  const portTileSize = Math.min(tileW, tileH) * SHAPE_2D_PORT_VISUAL_SIZE_TILES;
  const label = (name || icon.name || '').trim();
  const earW = CABINET_EAR_TILES * tileW;
  const mountHoleW = Math.max(12, Math.round(earW * 0.72));
  const mountHoleH = Math.max(6, Math.round(mountHoleW * 0.42));
  const earRadius = Math.max(4, Math.round(earW * 0.28));

  const ports = useMemo(() => {
    return getMikrotikPorts(icon.id);
  }, [icon.id, portsVersion]);

  const connectedSet = useMemo(() => {
    if (!connectedPortIds) return null;
    return connectedPortIds instanceof Set
      ? connectedPortIds
      : new Set(connectedPortIds);
  }, [connectedPortIds]);

  const mismatchSet = useMemo(() => {
    if (!mismatchPortIds) return null;
    return mismatchPortIds instanceof Set
      ? mismatchPortIds
      : new Set(mismatchPortIds);
  }, [mismatchPortIds]);

  const peerHighlightSet = useMemo(() => {
    if (!peerHighlightPortIds) return null;
    return peerHighlightPortIds instanceof Set
      ? peerHighlightPortIds
      : new Set(peerHighlightPortIds);
  }, [peerHighlightPortIds]);

  const focusedSet = useMemo(() => {
    if (!focusedPortIds) return null;
    return focusedPortIds instanceof Set
      ? focusedPortIds
      : new Set(focusedPortIds);
  }, [focusedPortIds]);

  return (
    <Box
      sx={{
        position: 'absolute',
        left: centered ? -pxW / 2 : 0,
        top: centered ? -pxH / 2 : 0,
        width: pxW,
        height: pxH,
        pointerEvents: 'none',
        boxSizing: 'border-box',
        overflow: withRackEars ? 'visible' : 'hidden'
      }}
    >
      {withRackEars &&
        (['left', 'right'] as const).map((side) => {
          const cx = earW / 2;
          const hw = mountHoleW / 2;
          const hh = mountHoleH / 2;
          const fracs = [0.25, 0.75];
          const maskId = `mtik-ear-mask-${side}-${earMaskUid}`;
          const gradId = `mtik-ear-grad-${side}-${earMaskUid}`;
          const joinOverlap = 1;
          const rx = earRadius;

          return (
            <Box
              key={side}
              component="svg"
              width={earW + joinOverlap}
              height={pxH}
              viewBox={`0 0 ${earW + joinOverlap} ${pxH}`}
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
                    height={pxH}
                    fill="white"
                  />
                  {fracs.map((frac) => {
                    const cy = pxH * frac;
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
                        `L 0 ${pxH - rx}`,
                        `Q 0 ${pxH} ${rx} ${pxH}`,
                        `L ${earW + joinOverlap} ${pxH}`,
                        'Z'
                      ].join(' ')
                    : [
                        `M 0 0`,
                        `L ${earW + joinOverlap - rx} 0`,
                        `Q ${earW + joinOverlap} 0 ${earW + joinOverlap} ${rx}`,
                        `L ${earW + joinOverlap} ${pxH - rx}`,
                        `Q ${earW + joinOverlap} ${pxH} ${earW + joinOverlap - rx} ${pxH}`,
                        `L 0 ${pxH}`,
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
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: 'transparent',
          overflow: 'hidden',
          display: 'block',
          zIndex: 1
        }}
      >
        {icon.url ? (
          <Box
            component="img"
            src={icon.url}
            alt={label || icon.id}
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              objectPosition: 'center',
              display: 'block',
              userSelect: 'none',
              backgroundColor: 'transparent'
            }}
          />
        ) : (
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
            Brak SVG
          </Typography>
        )}
      </Box>

      {showPorts &&
        ports.map((port, index) => {
          const iface = port.label ?? String(index + 1);
          const config = portConfigs?.[port.id];
          const statusColor = getPortStatusColor(config?.vlan, index, {
            customColor: config?.vlanColor,
            modelItems,
            portType: config?.type === 'trunk' ? 'trunk' : 'access'
          });

          return (
            <Box
              key={
                attentionPortId === port.id && attentionToken
                  ? `${port.id}-attn-${attentionToken}`
                  : port.id
              }
              data-port-id={port.id}
              data-port-handle-root
              sx={{
                position: 'absolute',
                left: port.tile.x * tileW,
                top: port.tile.y * tileH,
                width: tileW,
                height: tileH,
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Rj45Port
                side={port.side}
                tileSize={portTileSize}
                portNumber={index + 1}
                portLabel={iface}
                statusColor={statusColor}
                isTrunk={config?.type === 'trunk'}
                hasMismatch={Boolean(mismatchSet?.has(port.id))}
                isFocused={Boolean(focusedSet?.has(port.id))}
                isPeerHighlight={Boolean(peerHighlightSet?.has(port.id))}
                isAttentionPulse={attentionPortId === port.id}
                isConnected={Boolean(connectedSet?.has(port.id))}
                media={port.media ?? 'RJ45'}
                compactLabel
              />
            </Box>
          );
        })}

      {Boolean(label) && (
        <Typography
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: -18,
            fontSize: 10,
            fontWeight: 700,
            textAlign: 'center',
            color: 'rgba(15, 23, 42, 0.78)',
            letterSpacing: 0.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            pointerEvents: 'none',
            zIndex: 2
          }}
        >
          {label}
        </Typography>
      )}
    </Box>
  );
};
