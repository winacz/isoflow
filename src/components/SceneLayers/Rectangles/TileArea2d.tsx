import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { Coords } from 'src/types';
import { TILE_SIZE_2D } from 'src/config';
import { getTilePosition2d } from 'src/utils';
import { useUiStateStore } from 'src/stores/uiStateStore';

interface Props {
  from: Coords;
  to: Coords;
  fill: string;
  opacity?: number;
  kind?: 'area' | 'building';
  strokeColor?: string;
  /** Optional label (defaults to „Budynek”). */
  name?: string;
  locked?: boolean;
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
  strokeColor,
  name,
  locked
}: Props) => {
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });
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
  const label = name?.trim() || 'Budynek';

  // Size from building footprint; counter SceneLayer zoom so it stays readable.
  const invZoom = 1 / Math.max(zoom, 0.12);
  const baseHeaderH = Math.max(
    36,
    Math.min(72, Math.round(Math.min(pxW, pxH) * 0.14))
  );
  const baseFont = Math.max(
    18,
    Math.min(36, Math.round(Math.min(pxW, pxH) * 0.08))
  );
  const headerH = Math.round(baseHeaderH * Math.min(invZoom, 2.2));
  const fontSize = Math.round(baseFont * Math.min(invZoom, 2.2));
  const roofLift = Math.round(headerH * 0.85);
  const titlePad = Math.max(10, Math.round(fontSize * 0.45));

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
          border: `${locked ? 3 : isBuilding ? 2.5 : 1.5}px ${locked ? 'dashed' : 'solid'} ${stroke}`,
          boxSizing: 'border-box',
          boxShadow: locked ? '0 0 0 1px rgba(234, 88, 12, 0.35)' : undefined
        }}
      />
      {isBuilding && (
        <>
          <Box
            sx={{
              position: 'absolute',
              left: '6%',
              right: '6%',
              top: -roofLift,
              height: headerH,
              bgcolor: fill,
              opacity: Math.min(1, alpha + 0.2),
              border: `2.5px solid ${stroke}`,
              borderBottom: 'none',
              borderRadius: '6px 6px 0 0',
              clipPath: 'polygon(0 100%, 6% 0, 94% 0, 100% 100%)',
              boxSizing: 'border-box'
            }}
          />
          <Typography
            sx={{
              position: 'absolute',
              left: titlePad,
              top: titlePad,
              right: titlePad,
              fontSize,
              fontWeight: 800,
              lineHeight: 1.15,
              color: stroke,
              opacity: 0.92,
              letterSpacing: 0.3,
              userSelect: 'none',
              pointerEvents: 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {label}
          </Typography>
        </>
      )}
    </Box>
  );
};
