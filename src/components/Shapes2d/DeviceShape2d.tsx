import React, { useMemo, useId } from 'react';
import { Box, Typography } from '@mui/material';
import {
  TILE_SIZE_2D,
  SHAPE_2D_PC_ID,
  SHAPE_2D_CAMERA_ID,
  SHAPE_2D_CAMERA_V2_ID,
  SHAPE_2D_PRINTER_ID,
  SHAPE_2D_VOIP_ID,
  SHAPE_2D_SMARTPHONE_ID,
  SHAPE_2D_IOT_ID,
  SHAPE_2D_AP_ID,
  SHAPE_2D_NAS_ID,
  SHAPE_2D_TABLET_ID,
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
  itemId?: string;
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
  /** VLAN-tinted chassis border (single-port hosts when cabled). */
  vlanBorderColor?: string | null;
  /** Endpoint marked as PoE-powered — green bolt on jacks. */
  poweredByPoe?: boolean;
  /** poweredByPoe but not linked to a PoE OUT port — yellow warning. */
  poePowerWarning?: boolean;
}

/**
 * Topology-card device (Switch / PC): thin frame, header, RJ45/SFP port grid.
 * Each port cell is a connection handle (exact tile center).
 */
export const DeviceShape2d = ({
  itemId,
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
  showShadow = true,
  vlanBorderColor = null,
  poweredByPoe = false,
  poePowerWarning = false
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
  const switchRole = templateLayout?.switchRole;
  const roleIconKind =
    switchRole === 'ROUTER'
      ? 'router'
      : switchRole === 'OTHER'
        ? 'other'
        : switchRole === 'SW'
          ? 'switch'
          : undefined;
  const roleLabel =
    switchRole === 'SW'
      ? 'SW'
      : switchRole === 'ROUTER'
        ? 'Router'
        : switchRole === 'OTHER'
          ? 'Other'
          : null;
  const isCamera = shapeId === SHAPE_2D_CAMERA_ID;
  const isCameraV2 = shapeId === SHAPE_2D_CAMERA_V2_ID;
  const isPrinter = shapeId === SHAPE_2D_PRINTER_ID;
  const isVoip = shapeId === SHAPE_2D_VOIP_ID;
  const isSmartphone = shapeId === SHAPE_2D_SMARTPHONE_ID;
  const isIot = shapeId === SHAPE_2D_IOT_ID;
  const isAp = shapeId === SHAPE_2D_AP_ID;
  const isNas = shapeId === SHAPE_2D_NAS_ID;
  const isTablet = shapeId === SHAPE_2D_TABLET_ID;
  const isPc = shapeId === SHAPE_2D_PC_ID || isCamera || isCameraV2 || isPrinter || isVoip || isSmartphone || isIot || isAp || isNas || isTablet;
  /** Compact numbers on switch faces; PC/stations also compact so labels fit above the bottom jack. */
  const compactPortLabels = true;
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
  // Rack 1U: keep labels inside the band. Free devices keep larger chrome.
  const headerIconSize = isRack
    ? Math.max(16, Math.min(26, Math.round(headerBandH * 0.4)))
    : Math.max(36, Math.round(headerBandH * 0.45));
  const headerNameSize = isRack
    ? Math.max(11, Math.min(15, Math.round(headerBandH * 0.26)))
    : Math.max(18, Math.round(headerBandH * 0.28));
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

  const chassisBorderWidth = vlanBorderColor
    ? Math.max(5, Math.round(cellSize * 0.16))
    : Math.max(1, Math.round(cellSize * 0.05));
  const chassisBorderColor = vlanBorderColor ?? '#7a8ba3';

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
          overflow: 'visible',
          borderRadius: Math.round(cellSize * 0.2),
          outline: vlanBorderColor
            ? `${chassisBorderWidth}px solid ${vlanBorderColor}`
            : undefined,
          outlineOffset: vlanBorderColor ? 2 : undefined
        }}
      >
        {poePowerWarning && (
          <Box
            title="Urządzenie zasilane PoE nie jest podłączone do portu PoE Out"
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: Math.max(16, Math.round(cellSize * 0.55)),
              height: Math.max(16, Math.round(cellSize * 0.55)),
              zIndex: 8,
              pointerEvents: 'auto',
              cursor: 'help'
            }}
          >
            <Box
              component="svg"
              viewBox="0 0 16 14"
              sx={{ width: '100%', height: '100%', display: 'block' }}
            >
              <path
                d="M8 1.2L14.8 13H1.2L8 1.2z"
                fill="#facc15"
                stroke="#ca8a04"
                strokeWidth={0.9}
                strokeLinejoin="round"
              />
              <path
                d="M8 5v4.2"
                stroke="#78350f"
                strokeWidth={1.3}
                strokeLinecap="round"
              />
              <circle cx={8} cy={11} r={0.7} fill="#78350f" />
            </Box>
          </Box>
        )}
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
                itemId={itemId}
                portId={port.id}
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
                compactLabel={compactPortLabels}
                poe={port.poe ?? null}
                poweredByPoe={poweredByPoe}
                labelPosition="above"
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
        overflow: 'visible',
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
          border: `${chassisBorderWidth}px solid ${chassisBorderColor}`,
          borderRadius: isRack
            ? `0`
            : chassisRadius,
          boxSizing: 'border-box',
          overflow: 'hidden',
          zIndex: 1,
          boxShadow: vlanBorderColor
            ? `0 0 0 1px ${chassisBorderColor}55`
            : undefined
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

        {/* Camera V2 Lens Graphic */}
        {isCameraV2 && (
          <Box
            sx={{
              position: 'absolute',
              left: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              right: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              top: `${headerBandH + 4}px`,
              bottom: `${Math.round(tileH * 2.15) + 6}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 1,
              overflow: 'hidden'
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              style={{ display: 'block', overflow: 'hidden' }}
            >
              <defs>
                <radialGradient id="camv2-lens-grad" cx="45%" cy="40%" r="55%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="25%" stopColor="#0284c7" />
                  <stop offset="65%" stopColor="#0f172a" />
                  <stop offset="100%" stopColor="#020617" />
                </radialGradient>
                <linearGradient id="camv2-ring-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#475569" />
                  <stop offset="50%" stopColor="#1e293b" />
                  <stop offset="100%" stopColor="#0f172a" />
                </linearGradient>
                <linearGradient id="camv2-outer-ring" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#cbd5e1" />
                  <stop offset="100%" stopColor="#64748b" />
                </linearGradient>
              </defs>

              {/* Outer Metallic Bezel / Ring */}
              <circle cx="50" cy="50" r="44" fill="url(#camv2-outer-ring)" stroke="#334155" strokeWidth="1.5" />
              <circle cx="50" cy="50" r="40" fill="url(#camv2-ring-grad)" stroke="#0f172a" strokeWidth="1" />
              
              {/* Grooves / Ticks on Lens Ring */}
              {Array.from({ length: 12 }).map((_, i) => {
                const angle = (i * 30 * Math.PI) / 180;
                const x1 = 50 + 37 * Math.cos(angle);
                const y1 = 50 + 37 * Math.sin(angle);
                const x2 = 50 + 39.5 * Math.cos(angle);
                const y2 = 50 + 39.5 * Math.sin(angle);
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#94a3b8"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                );
              })}

              {/* Inner Lens Barrel Step */}
              <circle cx="50" cy="50" r="33" fill="#1e293b" stroke="#0f172a" strokeWidth="1.5" />
              <circle cx="50" cy="50" r="28" fill="#090d16" stroke="#020617" strokeWidth="1" />

              {/* Aperture Blades / Iris lines */}
              {Array.from({ length: 6 }).map((_, i) => {
                const angle = (i * 60 * Math.PI) / 180;
                const x1 = 50 + 14 * Math.cos(angle);
                const y1 = 50 + 14 * Math.sin(angle);
                const x2 = 50 + 27 * Math.cos(angle + 0.5);
                const y2 = 50 + 27 * Math.sin(angle + 0.5);
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#334155"
                    strokeWidth="0.8"
                    opacity="0.6"
                  />
                );
              })}

              {/* Main Glass Lens */}
              <circle cx="50" cy="50" r="25" fill="url(#camv2-lens-grad)" stroke="#0f172a" strokeWidth="1" />

              {/* Lens Reflection Curved Glare */}
              <path
                d="M 30 38 A 20 20 0 0 1 70 38 A 18 18 0 0 0 34 43 Z"
                fill="#ffffff"
                opacity="0.38"
              />
              <circle cx="38" cy="36" r="2.5" fill="#ffffff" opacity="0.45" />

              {/* Sensor Core / Red AR Coating Dot */}
              <circle cx="50" cy="50" r="7" fill="#020617" />
              <circle cx="50" cy="50" r="3.5" fill="#0284c7" opacity="0.8" />
              <circle cx="51" cy="49" r="1.2" fill="#f43f5e" opacity="0.85" />
            </svg>
          </Box>
        )}

        {/* Drukarka (Printer) Graphic */}
        {isPrinter && (
          <Box
            sx={{
              position: 'absolute',
              left: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              right: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              top: `${headerBandH + 4}px`,
              bottom: `${Math.round(tileH * 2.15) + 6}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 1,
              overflow: 'hidden'
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              style={{ display: 'block', overflow: 'hidden' }}
            >
              {/* Paper Tray Top */}
              <rect x="25" y="10" width="50" height="22" rx="3" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
              <line x1="32" y1="17" x2="68" y2="17" stroke="#cbd5e1" strokeWidth="1.5" />
              <line x1="32" y1="22" x2="68" y2="22" stroke="#cbd5e1" strokeWidth="1.5" />

              {/* Printer Body */}
              <rect x="15" y="28" width="70" height="40" rx="6" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
              <rect x="18" y="31" width="64" height="11" rx="3" fill="#334155" />
              
              {/* Control Panel Screen */}
              <rect x="22" y="34" width="20" height="5" rx="1.5" fill="#0284c7" opacity="0.9" />
              <circle cx="48" cy="36.5" r="1.8" fill="#22c55e" />
              <circle cx="54" cy="36.5" r="1.8" fill="#38bdf8" />
              <circle cx="60" cy="36.5" r="1.8" fill="#f59e0b" />

              {/* Exit Slot */}
              <rect x="24" y="49" width="52" height="4" rx="2" fill="#090d16" />

              {/* Printed Paper Coming Out */}
              <rect x="28" y="51" width="44" height="34" rx="2" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
              <line x1="34" y1="59" x2="62" y2="59" stroke="#0284c7" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="34" y1="65" x2="58" y2="65" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="34" y1="71" x2="62" y2="71" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="34" y1="77" x2="52" y2="77" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </Box>
        )}

        {/* Telefon VoIP Graphic */}
        {isVoip && (
          <Box
            sx={{
              position: 'absolute',
              left: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              right: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              top: `${headerBandH + 4}px`,
              bottom: `${Math.round(tileH * 2.15) + 6}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 1,
              overflow: 'hidden'
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              style={{ display: 'block', overflow: 'hidden' }}
            >
              {/* Desk Base */}
              <rect x="18" y="15" width="64" height="70" rx="8" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
              <rect x="21" y="18" width="58" height="24" rx="4" fill="#0f172a" />
              
              {/* LCD Display */}
              <rect x="25" y="21" width="50" height="18" rx="2" fill="#0369a1" stroke="#38bdf8" strokeWidth="1" />
              <text x="29" y="32" fill="#f0f9ff" fontSize="7" fontWeight="bold" fontFamily="monospace">EXT: 104 [ONLINE]</text>
              <circle cx="69" cy="30" r="2" fill="#22c55e" />

              {/* Handset Rest */}
              <rect x="23" y="48" width="16" height="32" rx="4" fill="#090d16" />
              
              {/* Handset */}
              <path d="M 25 43 C 25 39 37 39 37 43 L 37 85 C 37 89 25 89 25 85 Z" fill="#334155" stroke="#0f172a" strokeWidth="1.5" />
              <rect x="27" y="45" width="8" height="9" rx="2" fill="#1e293b" />
              <rect x="27" y="73" width="8" height="9" rx="2" fill="#1e293b" />

              {/* Keypad Buttons */}
              {[0, 1, 2].map(col =>
                [0, 1, 2, 3].map(row => (
                  <rect
                    key={`${col}-${row}`}
                    x={45 + col * 10}
                    y={48 + row * 8}
                    width="8"
                    height="6"
                    rx="1.5"
                    fill="#475569"
                    stroke="#1e293b"
                    strokeWidth="0.8"
                  />
                ))
              )}
            </svg>
          </Box>
        )}

        {/* Smartfon Graphic */}
        {isSmartphone && (
          <Box
            sx={{
              position: 'absolute',
              left: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              right: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              top: `${headerBandH + 4}px`,
              bottom: `${Math.round(tileH * 2.15) + 6}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 1,
              overflow: 'hidden'
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              style={{ display: 'block', overflow: 'hidden' }}
            >
              <defs>
                <linearGradient id="phone-screen" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0f172a" />
                  <stop offset="50%" stopColor="#1e1b4b" />
                  <stop offset="100%" stopColor="#311b92" />
                </linearGradient>
              </defs>

              {/* Phone Body */}
              <rect x="30" y="10" width="40" height="80" rx="9" fill="#1e293b" stroke="#0f172a" strokeWidth="2.5" />
              <rect x="33" y="13" width="34" height="74" rx="7" fill="url(#phone-screen)" />
              
              {/* Screen Notch / Speaker */}
              <rect x="45" y="15" width="10" height="3" rx="1.5" fill="#020617" />
              <circle cx="42" cy="16.5" r="1" fill="#0284c7" />

              {/* App UI Widgets on Screen */}
              <rect x="37" y="24" width="26" height="12" rx="3" fill="#38bdf8" opacity="0.85" />
              <rect x="37" y="40" width="11" height="11" rx="3" fill="#818cf8" opacity="0.9" />
              <rect x="52" y="40" width="11" height="11" rx="3" fill="#34d399" opacity="0.9" />
              <rect x="37" y="56" width="11" height="11" rx="3" fill="#fbbf24" opacity="0.9" />
              <rect x="52" y="56" width="11" height="11" rx="3" fill="#f43f5e" opacity="0.9" />

              {/* Glass Glare */}
              <path d="M 33 13 L 67 13 L 33 65 Z" fill="#ffffff" opacity="0.12" />
              <line x1="43" y1="83" x2="57" y2="83" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </Box>
        )}

        {/* Urządzenie IoT Graphic */}
        {isIot && (
          <Box
            sx={{
              position: 'absolute',
              left: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              right: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              top: `${headerBandH + 4}px`,
              bottom: `${Math.round(tileH * 2.15) + 6}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 1,
              overflow: 'hidden'
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              style={{ display: 'block', overflow: 'hidden' }}
            >
              {/* Antenna Waves */}
              <path d="M 36 18 A 20 20 0 0 1 64 18" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
              <path d="M 42 23 A 12 12 0 0 1 58 23" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
              <circle cx="50" cy="28" r="2.5" fill="#38bdf8" />

              {/* Antenna Pole */}
              <line x1="50" y1="28" x2="50" y2="40" stroke="#475569" strokeWidth="3" />

              {/* Sensor Box */}
              <rect x="22" y="40" width="56" height="48" rx="6" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
              <circle cx="50" cy="64" r="14" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
              
              {/* Sensor LED Indicator Arc */}
              <path d="M 41 64 A 9 9 0 0 1 59 64" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
              <circle cx="50" cy="64" r="4" fill="#38bdf8" />

              {/* Pins on sides */}
              <rect x="17" y="50" width="5" height="4" fill="#94a3b8" />
              <rect x="17" y="60" width="5" height="4" fill="#94a3b8" />
              <rect x="17" y="70" width="5" height="4" fill="#94a3b8" />
              <rect x="78" y="50" width="5" height="4" fill="#94a3b8" />
              <rect x="78" y="60" width="5" height="4" fill="#94a3b8" />
              <rect x="78" y="70" width="5" height="4" fill="#94a3b8" />
            </svg>
          </Box>
        )}

        {/* Access Point Graphic */}
        {isAp && (
          <Box
            sx={{
              position: 'absolute',
              left: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              right: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              top: `${headerBandH + 4}px`,
              bottom: `${Math.round(tileH * 2.15) + 6}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 1,
              overflow: 'hidden'
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              style={{ display: 'block', overflow: 'hidden' }}
            >
              {/* Ceiling AP Dome */}
              <circle cx="50" cy="50" r="42" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
              <circle cx="50" cy="50" r="34" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />
              
              {/* Concentric Wi-Fi Signal Rings */}
              <circle cx="50" cy="50" r="25" fill="none" stroke="#e0f2fe" strokeWidth="3" />
              <circle cx="50" cy="50" r="16" fill="none" stroke="#bae6fd" strokeWidth="2.5" />
              
              {/* Central Glowing LED Halo Ring */}
              <circle cx="50" cy="50" r="7" fill="#0284c7" />
              <circle cx="50" cy="50" r="4.5" fill="#38bdf8" />
              <circle cx="50" cy="50" r="2" fill="#ffffff" />
            </svg>
          </Box>
        )}

        {/* Magazyn NAS Graphic */}
        {isNas && (
          <Box
            sx={{
              position: 'absolute',
              left: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              right: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              top: `${headerBandH + 4}px`,
              bottom: `${Math.round(tileH * 2.15) + 6}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 1,
              overflow: 'hidden'
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              style={{ display: 'block', overflow: 'hidden' }}
            >
              {/* NAS Tower Enclosure */}
              <rect x="22" y="12" width="56" height="76" rx="6" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
              
              {/* 4 Drive Bay Drawers */}
              {[0, 1, 2, 3].map(i => (
                <g key={i}>
                  <rect x="27" y={18 + i * 15} width="46" height="12" rx="2" fill="#334155" stroke="#0f172a" strokeWidth="1" />
                  <rect x="31" y={21 + i * 15} width="10" height="6" rx="1" fill="#1e293b" />
                  <circle cx="67" cy={24 + i * 15} r="1.8" fill="#22c55e" />
                </g>
              ))}

              {/* Power Button & Master Status */}
              <circle cx="32" cy="80" r="3" fill="#0284c7" />
              <circle cx="40" cy="80" r="2" fill="#38bdf8" />
            </svg>
          </Box>
        )}

        {/* Terminal / Tablet Graphic */}
        {isTablet && (
          <Box
            sx={{
              position: 'absolute',
              left: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              right: `${Math.max(4, Math.round(tileW * 0.15))}px`,
              top: `${headerBandH + 4}px`,
              bottom: `${Math.round(tileH * 2.15) + 6}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 1,
              overflow: 'hidden'
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
              style={{ display: 'block', overflow: 'hidden' }}
            >
              {/* Stand */}
              <path d="M 42 66 L 58 66 L 62 84 L 38 84 Z" fill="#475569" stroke="#1e293b" strokeWidth="1.5" />
              <rect x="32" y="82" width="36" height="4" rx="2" fill="#334155" />

              {/* Tablet Screen Body */}
              <rect x="16" y="16" width="68" height="50" rx="5" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
              <rect x="19" y="19" width="62" height="44" rx="3" fill="#0f172a" />
              
              {/* Dashboard Chart UI */}
              <rect x="23" y="24" width="24" height="18" rx="2" fill="#0284c7" opacity="0.85" />
              <rect x="51" y="24" width="25" height="33" rx="2" fill="#1e293b" stroke="#334155" strokeWidth="1" />
              
              {/* Bar Chart Lines */}
              <line x1="56" y1="50" x2="56" y2="35" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
              <line x1="63.5" y1="50" x2="63.5" y2="29" stroke="#34d399" strokeWidth="3" strokeLinecap="round" />
              <line x1="71" y1="50" x2="71" y2="40" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />

              {/* Lower UI Card */}
              <rect x="23" y="46" width="24" height="11" rx="2" fill="#334155" />
            </svg>
          </Box>
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
              flexShrink: 1,
              maxWidth: '100%'
            }}
          >
            <DeviceTypeIcon
              iconId={shapeId}
              kind={roleIconKind}
              sx={{
                fontSize: headerIconSize,
                width: headerIconSize,
                height: headerIconSize,
                color: '#334155',
                flexShrink: 0
              }}
            />
            {roleLabel && (
              <Box
                sx={{
                  flexShrink: 0,
                  px: 0.6,
                  py: 0.2,
                  borderRadius: 0.5,
                  bgcolor: '#e2e8f0',
                  border: '1px solid #cbd5e1',
                  color: '#334155',
                  fontSize: Math.max(9, Math.round(headerNameSize * 0.72)),
                  fontWeight: 800,
                  letterSpacing: 0.4,
                  lineHeight: 1.1,
                  userSelect: 'none'
                }}
              >
                {roleLabel}
              </Box>
            )}
            {poePowerWarning && (
              <Box
                title="Urządzenie zasilane PoE nie jest podłączone do portu PoE Out"
                sx={{
                  flexShrink: 0,
                  width: Math.max(14, Math.round(headerIconSize * 0.7)),
                  height: Math.max(14, Math.round(headerIconSize * 0.7)),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'auto',
                  cursor: 'help'
                }}
              >
                <Box
                  component="svg"
                  viewBox="0 0 16 14"
                  sx={{ width: '100%', height: '100%', display: 'block' }}
                >
                  <path
                    d="M8 1.2L14.8 13H1.2L8 1.2z"
                    fill="#facc15"
                    stroke="#ca8a04"
                    strokeWidth={0.9}
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 5v4.2"
                    stroke="#78350f"
                    strokeWidth={1.3}
                    strokeLinecap="round"
                  />
                  <circle cx={8} cy={11} r={0.7} fill="#78350f" />
                </Box>
              </Box>
            )}
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
                minWidth: 0,
                flex: '1 1 auto'
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
                userSelect: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%'
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Horizontal divider under header */}
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

      {/* Horizontal divider above bottom ports (for stations/PCs) */}
      {isPc && (
        <Box
          sx={{
            position: 'absolute',
            left: tileW * 0.5,
            // Sit just above the port number (port near bottom, label above jack).
            bottom: Math.round(tileH * 2.05),
            width: pxWidth - tileW,
            height: Math.max(1, Math.round(tileH * 0.06)),
            bgcolor: '#c5cdd8',
            zIndex: 1
          }}
        />
      )}

      {/* SVI section — sits in top-right of header, own pointer-events layer */}
      {sviRows.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            right: tileW * 0.5,
            height: headerBandH,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 0,
            zIndex: 3,
            pointerEvents: 'auto',
            overflow: 'visible',
            maxWidth: '60%'
          }}
        >
          {/* Vertical separator */}
          <Box
            sx={{
              width: '1.5px',
              height: '55%',
              bgcolor: '#cbd5e1',
              flexShrink: 0,
              mr: 1.5,
              borderRadius: 1
            }}
          />

          {/* SVI label */}
          <Typography
            sx={{
              color: '#94a3b8',
              fontSize: Math.max(14, Math.round(headerBandH * 0.24)),
              fontWeight: 800,
              userSelect: 'none',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              flexShrink: 0,
              mr: 1.5
            }}
          >
            SVI
          </Typography>

          {/* VLAN chips */}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: `${Math.max(5, Math.round(tileW * 0.1))}px`,
              alignItems: 'center',
              overflow: 'visible'
            }}
          >
            {sviRows.map((svi) => (
              <Box
                key={svi.id}
                className="svi-hoverable"
                data-svi-tooltip={JSON.stringify({ vlan: svi.vlan, ip: svi.ip, color: svi.color })}
                sx={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: `${Math.max(7, Math.round(tileW * 0.18))}px`,
                  height: `${Math.max(20, Math.round(headerBandH * 0.4))}px`,
                  borderRadius: '10px',
                  bgcolor: svi.color,
                  border: '1.5px solid rgba(255,255,255,0.5)',
                  boxShadow: `0 0 8px ${svi.color}55, 0 1px 3px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.18)`,
                  cursor: 'default',
                  transition: 'box-shadow 0.15s ease, transform 0.1s ease',
                  '&:hover': {
                    boxShadow: `0 0 16px ${svi.color}88, 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.22)`,
                    transform: 'translateY(-1px)'
                  }
                }}
              >
                <Typography
                  sx={{
                    color: '#fff',
                    fontSize: Math.max(10, Math.round(headerBandH * 0.19)),
                    fontWeight: 800,
                    lineHeight: 1,
                    letterSpacing: 0.3,
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                    userSelect: 'none',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {svi.vlan}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}

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

      {/* Recessed groove between upper / lower RJ45 rows */}
      {!isPc &&
        ports.some((p) => p.side === 'TOP') &&
        ports.some((p) => p.side === 'BOTTOM') && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              left: tileW * 0.55,
              width: pxWidth - tileW * 1.1,
              top: tileH * 6 - Math.max(1, Math.round(tileH * 0.04)),
              height: Math.max(2, Math.round(tileH * 0.08)),
              borderRadius: 1,
              pointerEvents: 'none',
              zIndex: 1,
              background:
                'linear-gradient(to bottom, rgba(15,23,42,0.16) 0%, rgba(15,23,42,0.06) 45%, rgba(255,255,255,0.55) 100%)',
              boxShadow:
                'inset 0 1px 1px rgba(15,23,42,0.22), inset 0 -1px 0 rgba(255,255,255,0.65), 0 1px 0 rgba(255,255,255,0.35)'
            }}
          />
        )}

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
              itemId={itemId}
              portId={port.id}
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
              compactLabel={compactPortLabels}
              hideStatusBar={isPc}
              poe={isPc ? null : port.poe ?? null}
              poweredByPoe={isPc ? poweredByPoe : false}
              labelPosition="above"
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
