import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { AnchorPosition, Coords } from 'src/types';
import { TILE_SIZE_2D, TRANSFORM_CONTROLS_COLOR } from 'src/config';
import { TransformAnchor } from './TransformAnchor';

interface Props {
  from: Coords;
  to: Coords;
  /** When true, only the four corner handles (default for rectangles). */
  cornersOnly?: boolean;
  onAnchorPointerDown?: (
    anchorPosition: AnchorPosition,
    event: React.PointerEvent
  ) => void;
  onAnchorPointerMove?: (event: React.PointerEvent) => void;
  onAnchorPointerUp?: (event: React.PointerEvent) => void;
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
 * 2D rectangle edit handles — shared circular anchors on outer corners.
 */
export const TransformControls2d = ({
  from,
  to,
  cornersOnly = false,
  onAnchorPointerDown,
  onAnchorPointerMove,
  onAnchorPointerUp
}: Props) => {
  const { anchors, frame } = useMemo(() => {
    const b = normalizeBounds(from, to);
    const left = b.minX * TILE_SIZE_2D;
    const right = (b.maxX + 1) * TILE_SIZE_2D;
    const top = b.minY * TILE_SIZE_2D;
    const bottom = (b.maxY + 1) * TILE_SIZE_2D;
    const midX = (left + right) / 2;
    const midY = (top + bottom) / 2;

    const corners: Record<AnchorPosition, Coords> = {
      TOP_LEFT: { x: left, y: top },
      TOP_RIGHT: { x: right, y: top },
      BOTTOM_LEFT: { x: left, y: bottom },
      BOTTOM_RIGHT: { x: right, y: bottom },
      TOP: { x: midX, y: top },
      BOTTOM: { x: midX, y: bottom },
      LEFT: { x: left, y: midY },
      RIGHT: { x: right, y: midY }
    };

    return {
      anchors: corners,
      frame: {
        left,
        top,
        width: right - left,
        height: bottom - top
      }
    };
  }, [from, to]);

  const order: AnchorPosition[] = cornersOnly
    ? ['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_RIGHT', 'BOTTOM_LEFT']
    : [
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
          borderRadius: 0
        }}
      />

      {onAnchorPointerDown &&
        order.map((key) => {
          return (
            <TransformAnchor
              key={key}
              anchor={key}
              position={anchors[key]}
              onPointerDown={(event) => {
                onAnchorPointerDown(key, event);
              }}
              onPointerMove={onAnchorPointerMove}
              onPointerUp={onAnchorPointerUp}
            />
          );
        })}
    </>
  );
};
