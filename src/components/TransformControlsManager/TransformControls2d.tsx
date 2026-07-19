import React, { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { AnchorPosition, Coords } from 'src/types';
import { TILE_SIZE_2D, TRANSFORM_CONTROLS_COLOR } from 'src/config';
import { getTilePosition2d } from 'src/utils';

interface Props {
  from: Coords;
  to: Coords;
  onAnchorMouseDown?: (anchorPosition: AnchorPosition) => void;
}

const HANDLE_SIZE = 14;

const normalizeBounds = (from: Coords, to: Coords) => {
  return {
    minX: Math.min(from.x, to.x),
    maxX: Math.max(from.x, to.x),
    minY: Math.min(from.y, to.y),
    maxY: Math.max(from.y, to.y)
  };
};

const tileCenter = (tile: Coords) => {
  return getTilePosition2d({ tile, origin: 'CENTER' });
};

/**
 * 2D rectangle edit handles — waypoint-style circles on corners + mid-edges.
 * Resize always stays an axis-aligned rectangle.
 */
export const TransformControls2d = ({
  from,
  to,
  onAnchorMouseDown
}: Props) => {
  const [hovered, setHovered] = useState<AnchorPosition | null>(null);

  const { anchors, frame } = useMemo(() => {
    const b = normalizeBounds(from, to);
    const corners: Record<AnchorPosition, Coords> = {
      TOP_LEFT: { x: b.minX, y: b.minY },
      TOP_RIGHT: { x: b.maxX, y: b.minY },
      BOTTOM_LEFT: { x: b.minX, y: b.maxY },
      BOTTOM_RIGHT: { x: b.maxX, y: b.maxY },
      TOP: { x: Math.round((b.minX + b.maxX) / 2), y: b.minY },
      BOTTOM: { x: Math.round((b.minX + b.maxX) / 2), y: b.maxY },
      LEFT: { x: b.minX, y: Math.round((b.minY + b.maxY) / 2) },
      RIGHT: { x: b.maxX, y: Math.round((b.minY + b.maxY) / 2) }
    };

    const topLeftPx = tileCenter({ x: b.minX, y: b.minY });
    const width = (b.maxX - b.minX + 1) * TILE_SIZE_2D;
    const height = (b.maxY - b.minY + 1) * TILE_SIZE_2D;

    return {
      anchors: corners,
      frame: {
        left: topLeftPx.x - TILE_SIZE_2D / 2,
        top: topLeftPx.y - TILE_SIZE_2D / 2,
        width,
        height
      }
    };
  }, [from, to]);

  const order: AnchorPosition[] = [
    'TOP_LEFT',
    'TOP',
    'TOP_RIGHT',
    'RIGHT',
    'BOTTOM_RIGHT',
    'BOTTOM',
    'BOTTOM_LEFT',
    'LEFT'
  ];

  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          left: frame.left,
          top: frame.top,
          width: frame.width,
          height: frame.height,
          border: `2px dashed ${TRANSFORM_CONTROLS_COLOR}`,
          boxSizing: 'border-box',
          pointerEvents: 'none',
          borderRadius: 0.5
        }}
      />

      {onAnchorMouseDown &&
        order.map((key) => {
          const tile = anchors[key];
          const pos = tileCenter(tile);
          const isEdge =
            key === 'TOP' ||
            key === 'BOTTOM' ||
            key === 'LEFT' ||
            key === 'RIGHT';
          const isHot = hovered === key;

          return (
            <Box
              key={key}
              title={
                isEdge
                  ? 'Przeciągnij krawędź'
                  : 'Przeciągnij róg'
              }
              onMouseEnter={() => {
                setHovered(key);
              }}
              onMouseLeave={() => {
                setHovered(null);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAnchorMouseDown(key);
              }}
              sx={{
                position: 'absolute',
                left: pos.x,
                top: pos.y,
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                bgcolor: isHot ? TRANSFORM_CONTROLS_COLOR : '#fff',
                border: `2.5px solid ${TRANSFORM_CONTROLS_COLOR}`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                cursor:
                  key === 'LEFT' || key === 'RIGHT'
                    ? 'ew-resize'
                    : key === 'TOP' || key === 'BOTTOM'
                      ? 'ns-resize'
                      : 'nwse-resize',
                pointerEvents: 'auto',
                zIndex: 2,
                transition: 'background-color 0.1s ease, transform 0.1s ease',
                ...(isHot
                  ? { transform: 'translate(-50%, -50%) scale(1.15)' }
                  : {})
              }}
            />
          );
        })}
    </>
  );
};
