import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { TILE_SIZE_2D } from 'src/config';

/**
 * 2D marquee rectangle while dragging a selection on empty canvas.
 * Coordinates are in unscaled tile space (SceneLayer applies zoom/scroll).
 */
export const MarqueeSelection = () => {
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });

  const rect = useMemo(() => {
    if (
      projectionMode !== 'TWO_D' ||
      mode.type !== 'CURSOR' ||
      !mode.marquee
    ) {
      return null;
    }

    const { start, end } = mode.marquee;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    return {
      left: minX * TILE_SIZE_2D,
      top: minY * TILE_SIZE_2D,
      width: (maxX - minX + 1) * TILE_SIZE_2D,
      height: (maxY - minY + 1) * TILE_SIZE_2D
    };
  }, [mode, projectionMode]);

  if (!rect) return null;

  return (
    <Box
      sx={{
        position: 'absolute',
        pointerEvents: 'none',
        border: '1.5px solid',
        borderColor: 'primary.main',
        bgcolor: 'rgba(25, 118, 210, 0.12)',
        zIndex: 5
      }}
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      }}
    />
  );
};
