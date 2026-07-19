import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { TILE_SIZE_2D } from 'src/config';
import { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import {
  buildWaypointGuides,
  collectTileWaypoints,
  getWaypointGuideSpan
} from 'src/utils';

const GUIDE_COLOR = 'rgba(59, 130, 246, 0.55)';

/**
 * Thin dashed axis guides while dragging waypoints — shown when ≥2 WPs
 * share the same X or Y.
 */
export const WaypointGuides = () => {
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const { connectors, currentView } = useScene();
  const modelItems = useModelStore((state) => {
    return state.items;
  });

  const isWaypointDrag =
    projectionMode === 'TWO_D' &&
    mode.type === 'DRAG_ITEMS' &&
    mode.items.some((item) => {
      return (
        item.type === 'CONNECTOR_ANCHOR' || item.type === 'CONNECTOR_SEGMENT'
      );
    });

  const waypoints = useMemo(() => {
    if (!isWaypointDrag) return [];
    return collectTileWaypoints(connectors, currentView, modelItems);
  }, [isWaypointDrag, connectors, currentView, modelItems]);

  const guides = useMemo(() => {
    if (!isWaypointDrag || waypoints.length < 2) return [];
    // Count all live WP positions (including the one being dragged).
    return buildWaypointGuides(waypoints);
  }, [isWaypointDrag, waypoints]);

  const span = useMemo(() => {
    return getWaypointGuideSpan(waypoints);
  }, [waypoints]);

  if (!isWaypointDrag || guides.length === 0) {
    return null;
  }

  const originX = span.minX * TILE_SIZE_2D;
  const originY = span.minY * TILE_SIZE_2D;
  const width = (span.maxX - span.minX + 1) * TILE_SIZE_2D;
  const height = (span.maxY - span.minY + 1) * TILE_SIZE_2D;

  return (
    <Box
      sx={{
        position: 'absolute',
        left: originX,
        top: originY,
        width,
        height,
        pointerEvents: 'none',
        zIndex: 5
      }}
    >
      <svg
        width={width}
        height={height}
        style={{ overflow: 'visible', display: 'block' }}
      >
        {guides.map((guide) => {
          if (guide.axis === 'y') {
            const y =
              (guide.value - span.minY) * TILE_SIZE_2D + TILE_SIZE_2D / 2;
            return (
              <line
                key={`h-${guide.value}`}
                x1={0}
                y1={y}
                x2={width}
                y2={y}
                stroke={GUIDE_COLOR}
                strokeWidth={1}
                strokeDasharray="6 4"
                strokeLinecap="round"
              />
            );
          }

          const x =
            (guide.value - span.minX) * TILE_SIZE_2D + TILE_SIZE_2D / 2;
          return (
            <line
              key={`v-${guide.value}`}
              x1={x}
              y1={0}
              x2={x}
              y2={height}
              stroke={GUIDE_COLOR}
              strokeWidth={1}
              strokeDasharray="6 4"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </Box>
  );
};
