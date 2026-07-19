import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { Coords } from 'src/types';
import { TILE_SIZE_2D } from 'src/config';
import { getTilePosition2d } from 'src/utils';

interface Props {
  from: Coords;
  to: Coords;
  fill: string;
  opacity?: number;
  kind?: 'area' | 'building';
  strokeColor?: string;
}

const normalizeBounds = (from: Coords, to: Coords) => {
  return {
    minX: Math.min(from.x, to.x),
    maxX: Math.max(from.x, to.x),
    minY: Math.min(from.y, to.y),
    maxY: Math.max(from.y, to.y)
  };
};

/**
 * Axis-aligned tile rectangle for 2D plan — sits under devices.
 */
export const TileArea2d = ({
  from,
  to,
  fill,
  opacity = 0.25,
  kind = 'area',
  strokeColor
}: Props) => {
  const bounds = useMemo(() => {
    return normalizeBounds(from, to);
  }, [from, to]);

  const widthTiles = bounds.maxX - bounds.minX + 1;
  const heightTiles = bounds.maxY - bounds.minY + 1;
  const pxW = widthTiles * TILE_SIZE_2D;
  const pxH = heightTiles * TILE_SIZE_2D;
  const topLeft = getTilePosition2d({
    tile: { x: bounds.minX, y: bounds.minY },
    origin: 'CENTER'
  });
  // Position box so its top-left tile center maps correctly: offset by half tile
  const left = topLeft.x - TILE_SIZE_2D / 2;
  const top = topLeft.y - TILE_SIZE_2D / 2;
  const isBuilding = kind === 'building';
  const stroke = strokeColor ?? (isBuilding ? '#475569' : '#64748b');
  const alpha = Math.min(1, Math.max(0, opacity));

  return (
    <Box
      sx={{
        position: 'absolute',
        left,
        top,
        width: pxW,
        height: pxH,
        pointerEvents: 'none',
        boxSizing: 'border-box'
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: fill,
          opacity: alpha,
          borderRadius: isBuilding ? 1 : 0.5,
          border: `${isBuilding ? 2.5 : 1.5}px solid ${stroke}`,
          boxSizing: 'border-box'
        }}
      />
      {isBuilding && (
        <>
          <Box
            sx={{
              position: 'absolute',
              left: '8%',
              right: '8%',
              top: -Math.max(6, Math.round(TILE_SIZE_2D * 0.22)),
              height: Math.max(8, Math.round(TILE_SIZE_2D * 0.28)),
              bgcolor: fill,
              opacity: Math.min(1, alpha + 0.15),
              border: `2px solid ${stroke}`,
              borderBottom: 'none',
              borderRadius: '4px 4px 0 0',
              clipPath: 'polygon(0 100%, 8% 0, 92% 0, 100% 100%)',
              boxSizing: 'border-box'
            }}
          />
          <Typography
            sx={{
              position: 'absolute',
              left: 8,
              top: 6,
              fontSize: Math.max(10, Math.round(TILE_SIZE_2D * 0.35)),
              fontWeight: 700,
              color: stroke,
              opacity: 0.85,
              letterSpacing: 0.4,
              userSelect: 'none',
              pointerEvents: 'none'
            }}
          >
            Budynek
          </Typography>
        </>
      )}
    </Box>
  );
};
