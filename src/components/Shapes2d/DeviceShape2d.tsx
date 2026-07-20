import React, { useMemo, useId } from 'react';
import { Box, Typography } from '@mui/material';
import {
  TILE_SIZE_2D,
  SHAPE_2D_PC_ID,
  SHAPE_2D_CAMERA_ID,
  CABINET_EAR_TILES,
  getShape2dSize,
  getShape2dPorts
} from 'src/config';
import { getPortStatusColor, getDeviceTemplateLayout, parseDeviceColor, SHAPE_2D_PORT_VISUAL_SIZE_TILES } from 'src/utils';
import type { ModelItem } from 'src/types';
import type { DeviceTemplateLayout } from 'src/utils/deviceTemplateLayout';
import { Rj45Port } from 'src/components/Shapes2d/Rj45Port';
import { DeviceTypeIcon } from 'src/components/Icons/DeviceTypeIcon';

interface Props {
  shapeId: string;
  /** Override pixel size (e.g. menu preview). */
  width?: number;
  height?: number;
  name?: string;
  subtitle?: string;
  /** Per-port config from ModelItem — drives VLAN status colors. */
  ports?: ModelItem['ports'];
  /** Switch SVIs shown on the chassis body. */
  svis?: ModelItem['svis'];
  /** Port ids that currently have a cable attached. */
  connectedPortIds?: ReadonlySet<string> | string[];
  /** Port ids on a trunk mismatch link (red border). */
  mismatchPortIds?: ReadonlySet<string> | string[];
  /** Currently focused ports (sidebar / Ctrl+click) — gentle highlight. */
  focusedPortIds?: ReadonlySet<string> | string[] | null;
  /** Port currently shaking after a relation-panel jump. */
  attentionPortId?: string | null;
  /** Changes each jump so the shake animation restarts. */
  attentionToken?: number | null;
  /** Peer ports on this device (other end of cables from the selected node). */
  peerHighlightPortIds?: ReadonlySet<string> | string[];
  /** All model items — used to resolve shared VLAN colors. */
  modelItems?: ModelItem[];
  /**
   * Canvas nodes are centered on their tile; menu previews need top-left
   * anchoring inside a fixed box.
   */
  centered?: boolean;
  /** Live-preview / unsaved template layout (bypasses registry). */
  layoutOverride?: DeviceTemplateLayout;
  /** Chassis fill color (hex). */
  color?: string;
  /**
   * Drop shadow under free-standing devices.
   * Off for devices mounted inside a cabinet.
   */
  showShadow?: boolean;
}

/**
 * Topology-card device (Switch / PC): thin frame, header, RJ45/SFP port grid.
 * Each port cell is a connection handle (exact tile center).
 */
export const DeviceShape2d = ({
  shapeId,
  width,
  height,
  name = 'DEVICE',
  subtitle,
  ports: portConfigs,
  svis,
  connectedPortIds,
  mismatchPortIds,
  focusedPortIds = null,
  attentionPortId = null,
  attentionToken = null,
  peerHighlightPortIds,
  modelItems,
  centered = true,
  layoutOverride,
  color = '#ffffff',
  showShadow = true
}: Props) => {
  const templateLayout = layoutOverride ?? getDeviceTemplateLayout(shapeId);
  const footprint =
    layoutOverride?.size ?? getShape2dSize(shapeId) ?? { width: 8, height: 7 };
  const pxWidth = width ?? footprint.width * TILE_SIZE_2D;
  const pxHeight = height ?? footprint.height * TILE_SIZE_2D;
  const scaleX = pxWidth / (footprint.width * TILE_SIZE_2D);
  const scaleY = pxHeight / (footprint.height * TILE_SIZE_2D);
  const tileW = TILE_SIZE_2D * scaleX;
  const tileH = TILE_SIZE_2D * scaleY;
  const cellSize = Math.min(tileW, tileH);
  const isRack = templateLayout?.formFactor === 'RACK';
  const isCamera = shapeId === SHAPE_2D_CAMERA_ID;
  const isPc = shapeId === SHAPE_2D_PC_ID || isCamera;
  const portTileSize = cellSize * SHAPE_2D_PORT_VISUAL_SIZE_TILES;
  /** Overlay cabinet rails; join flush to chassis sides. */
  const earW = isRack
    ? Math.round(CABINET_EAR_TILES * tileW)
    : Math.max(3, Math.round(tileW * 0.35));
  const mountHoleW = Math.max(12, Math.round(earW * 0.72));
  const mountHoleH = Math.max(6, Math.round(mountHoleW * 0.42));
  const earRadius = Math.max(4, Math.round(earW * 0.28));
  const earMaskUid = useId().replace(/:/g, '');
  const chassisTint = parseDeviceColor(color);
  /** Header band ≈ top third of the chassis (name + icon + divider). */
  const headerBandH = pxHeight / 3;
  const headerIconSize = Math.max(36, Math.round(headerBandH * 0.45));
  const headerNameSize = Math.max(18, Math.round(headerBandH * 0.28));
  const chassisRadius = Math.max(2, Math.round(cellSize * 0.12));

  const ports = useMemo(() => {
    if (layoutOverride) return layoutOverride.ports;
    return getShape2dPorts(shapeId);
  }, [shapeId, layoutOverride]);

  const sectionDividers = templateLayout?.sectionDividers ?? [];

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

  const sviRows = useMemo(() => {
    if (isPc || !svis?.length) return [];
    return svis.map((svi) => {
      const vlan = svi.vlan?.trim() || '1';
      const color = getPortStatusColor(vlan, 0, {
        customColor: svi.vlanColor,
        modelItems
      });
      return {
        id: svi.id,
        vlan,
        ip: svi.ip?.trim() || '',
        color
      };
    });
  }, [isPc, svis, modelItems]);

  if (isCamera) {
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
          overflow: 'visible'
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 240 240"
          style={{ overflow: 'visible', display: 'block' }}
        >
          <defs>
            <linearGradient id="metal-dark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <linearGradient id="metal-light" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="50%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#64748b" />
            </linearGradient>
            <linearGradient id="body-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="70%" stopColor="#f1f5f9" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
            <radialGradient id="lens-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="60%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#020617" />
            </radialGradient>
          </defs>
          <style>{`
            @keyframes camBlink {
              0%, 100% { opacity: 0.3; }
              50% { opacity: 1; filter: drop-shadow(0 0 4px #ef4444); }
            }
          `}</style>
          
          {/* Mount Wall Plate */}
          <rect x="0" y="60" width="12" height="120" rx="4" fill="url(#metal-dark)" stroke="#0f172a" strokeWidth="2" />
          
          {/* Mount Arm */}
          <path d="M 12,120 C 60,120 70,80 100,80" stroke="url(#metal-light)" strokeWidth="18" fill="none" strokeLinecap="round" />
          <path d="M 12,120 C 60,120 70,80 100,80" stroke="#0f172a" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.15" />
          
          {/* Joint Lock */}
          <circle cx="100" cy="80" r="14" fill="#334155" stroke="#0f172a" strokeWidth="2" />
          
          {/* Camera Head Group (angled slightly down by 15 deg) */}
          <g transform="translate(100, 80) rotate(15)">
            {/* Body */}
            <rect x="0" y="-35" width="105" height="70" rx="8" fill="url(#body-grad)" stroke="#64748b" strokeWidth="2" />
            
            {/* Dark Sunshield / Visor */}
            <path d="M -10,-42 L 115,-42 L 105,-35 L -8,-35 Z" fill="#1e293b" stroke="#0f172a" strokeWidth="1.5" />
            
            {/* Visor highlight/shadow on body */}
            <rect x="0" y="-35" width="103" height="8" fill="#cbd5e1" opacity="0.4" />
            
            {/* Bezel / Front Face */}
            <ellipse cx="105" cy="0" rx="8" ry="34" fill="#0f172a" stroke="#020617" strokeWidth="2" />
            
            {/* Inner Lens */}
            <ellipse cx="103" cy="0" rx="4" ry="26" fill="url(#lens-grad)" />
            
            {/* Lens Reflection */}
            <path d="M 102,-15 Q 104,0 102,15 Q 101,0 102,-15 Z" fill="#ffffff" opacity="0.35" />
            
            {/* Recording LED */}
            <circle cx="98" cy="-12" r="3" fill="#ef4444" style={{ animation: 'camBlink 1.5s infinite' }} />
          </g>
        </svg>

        {/* Render ports absolute on top */}
        {ports.map((port, index) => {
          const iface = String(index + 1);
          const config = portConfigs?.[port.id];
          const isTrunk = false;
          const statusColor = getPortStatusColor(config?.vlan, index, {
            isPc,
            customColor: config?.vlanColor,
            modelItems,
            portType: 'access'
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
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'visible',
                zIndex:
                  attentionPortId === port.id
                    ? 6
                    : peerHighlightSet?.has(port.id)
                      ? 4
                      : 2
              }}
            >
              <Rj45Port
                side={port.side}
                tileSize={portTileSize}
                portNumber={index + 1}
                portLabel={iface}
                statusColor={statusColor}
                isTrunk={isTrunk}
                hasMismatch={Boolean(mismatchSet?.has(port.id))}
                isFocused={Boolean(focusedSet?.has(port.id))}
                isPeerHighlight={Boolean(peerHighlightSet?.has(port.id))}
                isAttentionPulse={attentionPortId === port.id}
                isConnected={Boolean(connectedSet?.has(port.id))}
                media={port.media ?? 'RJ45'}
                compactLabel={isRack}
              />
            </Box>
          );
        })}
      </Box>
    );
  }

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
        overflow: isRack ? 'visible' : 'hidden',
        filter: showShadow
          ? 'drop-shadow(0 3px 5px rgba(15,23,42,0.22)) drop-shadow(0 1px 2px rgba(15,23,42,0.12))'
          : undefined
      }}
    >
      {/* Chassis — square left/right edges when rack so ears join flush */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: '#ffffff',
          border: `${Math.max(1, Math.round(cellSize * 0.05))}px solid #7a8ba3`,
          borderRadius: isRack
            ? `0`
            : chassisRadius,
          boxSizing: 'border-box',
          overflow: 'hidden',
          zIndex: 1
        }}
      >
        {chassisTint.alpha > 0.01 && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              bgcolor: chassisTint.css,
              pointerEvents: 'none',
              zIndex: 0
            }}
          />
        )}
      </Box>

      {/* Rack ears — joined to chassis, rounded outer corners, 2 holes/ear */}
      {isRack &&
        (['left', 'right'] as const).map((side) => {
          const cx = earW / 2;
          const hw = mountHoleW / 2;
          const hh = mountHoleH / 2;
          const fracs = [0.25, 0.75];
          const maskId = `rack-ear-mask-${side}-${earMaskUid}`;
          const gradId = `rack-ear-grad-${side}-${earMaskUid}`;
          // Overlap chassis by 1px so there is no seam gap
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
                left: side === 'left' ? -(earW) : undefined,
                right: side === 'right' ? -(earW) : undefined,
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
                    // Center holes in the visible ear (not the overlap strip)
                    const holeCx =
                      side === 'left'
                        ? cx
                        : joinOverlap + cx;
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
              {/* Rounded only on the outer edge; inner edge flush with chassis */}
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
        sx={{
          position: 'absolute',
          left: tileW * 0.4,
          top: 0,
          width: pxWidth - tileW * 0.8,
          height: headerBandH,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: `${Math.max(6, Math.round(tileW * 0.15))}px`,
          px: `${Math.max(3, tileW * 0.18)}px`,
          boxSizing: 'border-box',
          zIndex: 1,
          overflow: 'hidden'
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: `${Math.max(2, Math.round(headerBandH * 0.06))}px`,
            minWidth: 0,
            flexShrink: 1
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: `${Math.max(8, Math.round(headerIconSize * 0.28))}px`,
              minWidth: 0,
              flexShrink: 0
            }}
          >
            <DeviceTypeIcon
              iconId={shapeId}
              sx={{
                fontSize: headerIconSize,
                width: headerIconSize,
                height: headerIconSize,
                color: '#334155',
                flexShrink: 0
              }}
            />
            <Typography
              sx={{
                color: '#1f2937',
                fontSize: headerNameSize,
                fontWeight: 700,
                letterSpacing: 0.2,
                lineHeight: 1.15,
                userSelect: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0
              }}
            >
              {name}
            </Typography>
          </Box>
          {subtitle && (
            <Typography
              sx={{
                color: '#6b7280',
                fontSize: Math.max(11, Math.round(headerBandH * 0.12)),
                fontWeight: 500,
                lineHeight: 1.2,
                userSelect: 'none'
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>

        {/* SVIs: 2 rows, fill column-by-column to the right */}
        {sviRows.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateRows: 'auto auto',
              gridAutoFlow: 'column',
              gridAutoColumns: 'max-content',
              columnGap: `${Math.max(4, Math.round(tileW * 0.1))}px`,
              rowGap: `${Math.max(2, Math.round(tileH * 0.08))}px`,
              alignItems: 'center',
              justifyItems: 'stretch',
              flexShrink: 0,
              maxWidth: '62%',
              overflow: 'hidden',
              py: `${Math.max(1, Math.round(tileH * 0.04))}px`
            }}
          >
            {sviRows.map((svi) => {
              return (
                <Box
                  key={svi.id}
                  title={`SVI VLAN ${svi.vlan}${svi.ip ? ` · ${svi.ip}` : ''}`}
                  sx={{
                    display: 'flex',
                    flexDirection: svi.ip ? 'column' : 'row',
                    alignItems: svi.ip ? 'flex-start' : 'center',
                    gap: svi.ip
                      ? 0
                      : `${Math.max(2, Math.round(tileW * 0.06))}px`,
                    px: `${Math.max(5, Math.round(tileW * 0.12))}px`,
                    py: `${Math.max(2, Math.round(tileH * 0.06))}px`,
                    borderRadius: 9999,
                    bgcolor: svi.color,
                    border: '1px solid rgba(0,0,0,0.12)',
                    boxShadow: '0 1px 2px rgba(15,23,42,0.12)',
                    minWidth: 0,
                    maxWidth: Math.max(72, Math.round(tileW * 2.8))
                  }}
                >
                  <Typography
                    sx={{
                      color: '#fff',
                      fontSize: Math.max(8, tileH * 0.32),
                      fontWeight: 700,
                      lineHeight: 1.15,
                      letterSpacing: 0.2,
                      userSelect: 'none',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    VLAN {svi.vlan}
                  </Typography>
                  {svi.ip && (
                    <Typography
                      sx={{
                        color: '#fff',
                        fontSize: Math.max(7, tileH * 0.26),
                        fontWeight: 600,
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, monospace',
                        lineHeight: 1.1,
                        opacity: 0.92,
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%'
                      }}
                    >
                      {svi.ip}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      <Box
        sx={{
          position: 'absolute',
          left: tileW * 0.5,
          top: headerBandH,
          width: pxWidth - tileW,
          height: Math.max(1, Math.round(tileH * 0.06)),
          bgcolor: '#c5cdd8',
          zIndex: 1
        }}
      />

      {sectionDividers.map((x) => {
        return (
          <Box
            key={`div-${x}`}
            sx={{
              position: 'absolute',
              left: x * tileW + tileW * 0.35,
              top: tileH * 3.6,
              width: Math.max(1, Math.round(tileW * 0.08)),
              height: tileH * 4.2,
              bgcolor: '#d0d7e2',
              borderRadius: 1,
              opacity: 0.9
            }}
          />
        );
      })}

      {ports.map((port, index) => {
        const iface = String(index + 1);
        const config = portConfigs?.[port.id];
        const isTrunk = !isPc && config?.type === 'trunk';
        const statusColor = getPortStatusColor(config?.vlan, index, {
          isPc,
          customColor: config?.vlanColor,
          modelItems,
          portType: isTrunk ? 'trunk' : 'access'
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'visible',
              zIndex:
                attentionPortId === port.id
                  ? 6
                  : peerHighlightSet?.has(port.id)
                    ? 4
                    : 2
            }}
          >
            <Rj45Port
              side={port.side}
              tileSize={portTileSize}
              portNumber={index + 1}
              portLabel={iface}
              statusColor={statusColor}
              isTrunk={isTrunk}
              hasMismatch={Boolean(mismatchSet?.has(port.id))}
              isFocused={Boolean(focusedSet?.has(port.id))}
              isPeerHighlight={Boolean(peerHighlightSet?.has(port.id))}
              isAttentionPulse={attentionPortId === port.id}
              isConnected={Boolean(connectedSet?.has(port.id))}
              media={port.media ?? 'RJ45'}
              compactLabel={isRack}
            />
          </Box>
        );
      })}
    </Box>
  );
};

/** @deprecated use DeviceShape2d — kept as alias for Switch */
export const SwitchShape = (
  props: Omit<Props, 'shapeId'> & { shapeId?: string }
) => {
  return <DeviceShape2d shapeId={props.shapeId ?? 'SWITCH'} {...props} />;
};
