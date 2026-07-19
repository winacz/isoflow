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

interface Props {
  shapeId: string;
  /** Override pixel size (e.g. menu preview). */
  width?: number;
  height?: number;
  name?: string;
  subtitle?: string;
  /** Per-port config from ModelItem — drives VLAN status colors. */
  ports?: ModelItem['ports'];
  /** Port ids that currently have a cable attached. */
  connectedPortIds?: ReadonlySet<string> | string[];
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
  connectedPortIds,
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
  const portTileSize = cellSize * 1.75;
  const isRack = templateLayout?.formFactor === 'RACK';
  const earW = Math.max(3, Math.round(tileW * 0.35));
  const chassisTint = parseDeviceColor(color);

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
              pointerEvents: 'none'
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
          left: tileW * 0.5,
          top: tileH * 0.35,
          width: pxWidth - tileW,
          height: tileH * 2.1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          px: `${Math.max(2, tileW * 0.15)}px`,
          boxSizing: 'border-box'
        }}
      >
        <Typography
          sx={{
            color: '#1f2937',
            fontSize: Math.max(11, tileH * 0.75),
            fontWeight: 700,
            letterSpacing: 0.2,
            lineHeight: 1.15,
            userSelect: 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {name}
        </Typography>
        {subtitle && (
          <Typography
            sx={{
              color: '#6b7280',
              fontSize: Math.max(8, tileH * 0.4),
              fontWeight: 500,
              lineHeight: 1.2,
              userSelect: 'none'
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          position: 'absolute',
          left: tileW * 0.5,
          top: tileH * 2.55,
          width: pxWidth - tileW,
          height: Math.max(1, Math.round(tileH * 0.05)),
          bgcolor: '#c5cdd8'
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
        const statusColor = getPortStatusColor(config?.vlan, index, {
          isPc: shapeId === SHAPE_2D_PC_ID,
          customColor: config?.vlanColor,
          modelItems
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
              overflow: 'visible'
            }}
          >
            <Rj45Port
              side={port.side}
              tileSize={portTileSize}
              portNumber={index + 1}
              portLabel={iface}
              statusColor={statusColor}
              isConnected={Boolean(connectedSet?.has(port.id))}
              media={port.media ?? 'RJ45'}
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
