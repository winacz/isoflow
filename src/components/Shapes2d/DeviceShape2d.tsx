import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import {
  TILE_SIZE_2D,
  SHAPE_2D_PC_ID,
  getShape2dSize,
  getShape2dPorts,
  getShape2dPortIfaceName
} from 'src/config';
import { getPortStatusColor, getDeviceTemplateLayout, parseDeviceColor } from 'src/utils';
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
  /** Currently focused port (sidebar / click) — gentle highlight. */
  focusedPortId?: string | null;
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
  focusedPortId = null,
  peerHighlightPortIds,
  modelItems,
  centered = true,
  layoutOverride,
  color = '#ffffff'
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
  const isPc = shapeId === SHAPE_2D_PC_ID;
  const portTileSize = isPc
    ? cellSize * 5.2
    : cellSize * (isRack ? 2.25 : 2.7);
  const earW = Math.max(3, Math.round(tileW * 0.35));
  const chassisTint = parseDeviceColor(color);
  /** Header band ≈ top third of the chassis (name + icon + divider). */
  const headerBandH = pxHeight / 3;
  const headerIconSize = Math.max(36, Math.round(headerBandH * 0.45));
  const headerNameSize = Math.max(18, Math.round(headerBandH * 0.28));

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
        overflow: 'hidden'
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: '#ffffff',
          border: `${Math.max(1, Math.round(cellSize * 0.05))}px solid #7a8ba3`,
          borderRadius: Math.max(2, Math.round(cellSize * 0.12)),
          boxSizing: 'border-box',
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
          overflow: 'hidden'
        }}
      >
        {chassisTint.alpha > 0.01 && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              bgcolor: chassisTint.css,
              pointerEvents: 'none',
              // Keep chassis tint under ports (ports paint their own glass face).
              zIndex: 0
            }}
          />
        )}
      </Box>

      {isRack && (
        <>
          <Box
            sx={{
              position: 'absolute',
              left: Math.max(1, Math.round(cellSize * 0.05)),
              top: tileH * 0.85,
              width: earW,
              height: pxHeight - tileH * 1.7,
              bgcolor: '#d8dee8',
              borderRadius: '1px',
              border: '1px solid #a8b4c4',
              boxSizing: 'border-box',
              '&::before, &::after': {
                content: '""',
                position: 'absolute',
                left: '50%',
                width: Math.max(2, earW * 0.32),
                height: Math.max(2, earW * 0.32),
                borderRadius: '50%',
                bgcolor: '#8b97a8',
                transform: 'translateX(-50%)'
              },
              '&::before': { top: '16%' },
              '&::after': { bottom: '16%' }
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              right: Math.max(1, Math.round(cellSize * 0.05)),
              top: tileH * 0.85,
              width: earW,
              height: pxHeight - tileH * 1.7,
              bgcolor: '#d8dee8',
              borderRadius: '1px',
              border: '1px solid #a8b4c4',
              boxSizing: 'border-box',
              '&::before, &::after': {
                content: '""',
                position: 'absolute',
                left: '50%',
                width: Math.max(2, earW * 0.32),
                height: Math.max(2, earW * 0.32),
                borderRadius: '50%',
                bgcolor: '#8b97a8',
                transform: 'translateX(-50%)'
              },
              '&::before': { top: '16%' },
              '&::after': { bottom: '16%' }
            }}
          />
        </>
      )}
      <Box
        sx={{
          position: 'absolute',
          left: tileW * 0.4,
          top: 0,
          width: pxWidth - tileW * 0.8,
          height: headerBandH,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: `${Math.max(2, Math.round(headerBandH * 0.06))}px`,
          px: `${Math.max(3, tileW * 0.18)}px`,
          boxSizing: 'border-box',
          zIndex: 1,
          overflow: 'hidden'
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
        {sviRows.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: `${Math.max(1, Math.round(tileH * 0.06))}px`,
              minHeight: 0,
              overflow: 'hidden'
            }}
          >
            {sviRows.map((svi) => {
              return (
                <Box
                  key={svi.id}
                  title={`SVI VLAN ${svi.vlan}${svi.ip ? ` · ${svi.ip}` : ''}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${Math.max(2, Math.round(tileW * 0.08))}px`,
                    px: `${Math.max(2, Math.round(tileW * 0.1))}px`,
                    py: `${Math.max(1, Math.round(tileH * 0.05))}px`,
                    borderRadius: Math.max(2, Math.round(cellSize * 0.08)),
                    bgcolor: svi.color,
                    border: '1px solid rgba(0,0,0,0.12)',
                    minWidth: 0,
                    flexShrink: 0
                  }}
                >
                  <Typography
                    sx={{
                      color: '#fff',
                      fontSize: Math.max(9, tileH * 0.42),
                      fontWeight: 700,
                      lineHeight: 1.1,
                      letterSpacing: 0.2,
                      textShadow: '0 1px 1px rgba(0,0,0,0.35)',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    VLAN {svi.vlan}
                  </Typography>
                  {svi.ip && (
                    <Typography
                      sx={{
                        color: '#fff',
                        fontSize: Math.max(9, tileH * 0.42),
                        fontWeight: 600,
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, monospace',
                        lineHeight: 1.1,
                        textShadow: '0 1px 1px rgba(0,0,0,0.35)',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        minWidth: 0
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
        const iface =
          port.label ?? getShape2dPortIfaceName(shapeId, port.id);
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
            key={port.id}
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
              zIndex: peerHighlightSet?.has(port.id) ? 4 : 2
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
              isFocused={focusedPortId === port.id}
              isPeerHighlight={Boolean(peerHighlightSet?.has(port.id))}
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
