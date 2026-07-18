import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import {
  TILE_SIZE_2D,
  getShape2dSize,
  getShape2dPorts,
  Shape2dPort
} from 'src/config';
import { Rj45Port } from 'src/components/Shapes2d/Rj45Port';

interface Props {
  shapeId: string;
  /** Override pixel size (e.g. menu preview). */
  width?: number;
  height?: number;
  name?: string;
  subtitle?: string;
}

/**
 * Topology-card device (Switch / PC): thin frame, header, RJ45 port grid.
 * Each port cell is a connection handle (exact tile center).
 */
export const DeviceShape2d = ({
  shapeId,
  width,
  height,
  name = 'DEVICE',
  subtitle
}: Props) => {
  const footprint = getShape2dSize(shapeId) ?? { width: 8, height: 7 };
  const pxWidth = width ?? footprint.width * TILE_SIZE_2D;
  const pxHeight = height ?? footprint.height * TILE_SIZE_2D;
  const scaleX = pxWidth / (footprint.width * TILE_SIZE_2D);
  const scaleY = pxHeight / (footprint.height * TILE_SIZE_2D);
  const tileW = TILE_SIZE_2D * scaleX;
  const tileH = TILE_SIZE_2D * scaleY;
  const cellSize = Math.min(tileW, tileH);
  // Ports sit on every-other tile — draw them larger than one cell
  const portTileSize = cellSize * 1.75;

  const ports = useMemo(() => {
    return getShape2dPorts(shapeId);
  }, [shapeId]);

  const portNumber = (port: Shape2dPort, index: number) => {
    if (port.id.startsWith('port-top-')) {
      return Number(port.id.replace('port-top-', ''));
    }

    if (port.id.startsWith('port-bottom-')) {
      return 8 + Number(port.id.replace('port-bottom-', ''));
    }

    return index + 1;
  };

  return (
    <Box
      sx={{
        position: 'absolute',
        width: pxWidth,
        height: pxHeight,
        left: -pxWidth / 2,
        top: -pxHeight / 2,
        pointerEvents: 'none',
        boxSizing: 'border-box'
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
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
        }}
      />

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

      {ports.map((port, index) => {
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
              portNumber={portNumber(port, index)}
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
