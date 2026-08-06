import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useScene } from 'src/hooks/useScene';
import { TILE_SIZE_2D } from 'src/config';
import { resolvePortEnd } from 'src/v3/routing';

/**
 * §1 The simplified drag preview.
 *
 * One straight SVG line from the origin jack to the cursor — no pathfinding,
 * no obstacle checks, no model writes. The real route is computed once, on
 * mouseup, by the ConnectorV3 mode.
 */
export const ConnectorV3Preview = () => {
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const { items } = useScene();

  const line = useMemo(() => {
    if (mode.type !== 'CONNECTOR_V3' || !mode.start || !mode.preview) {
      return null;
    }

    const origin = resolvePortEnd({
      end: { itemId: mode.start.item, portId: mode.start.port },
      items,
      modelItems
    });
    if (!origin) return null;

    const half = TILE_SIZE_2D / 2;

    return {
      x1: origin.tile.x * TILE_SIZE_2D + half,
      y1: origin.tile.y * TILE_SIZE_2D + half,
      x2: mode.preview.x * TILE_SIZE_2D + half,
      y2: mode.preview.y * TILE_SIZE_2D + half
    };
  }, [mode, items, modelItems]);

  if (!line) return null;

  const minX = Math.min(line.x1, line.x2);
  const minY = Math.min(line.y1, line.y2);
  const width = Math.max(1, Math.abs(line.x2 - line.x1));
  const height = Math.max(1, Math.abs(line.y2 - line.y1));

  return (
    <Box
      sx={{ position: 'absolute', pointerEvents: 'none' }}
      style={{ left: minX, top: minY, width, height }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ overflow: 'visible' }}
      >
        <line
          x1={line.x1 - minX}
          y1={line.y1 - minY}
          x2={line.x2 - minX}
          y2={line.y2 - minY}
          stroke="#0ea5e9"
          strokeWidth={3}
          strokeDasharray="8 6"
          strokeLinecap="round"
          opacity={0.9}
        />
      </svg>
    </Box>
  );
};
