import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { TILE_SIZE_2D } from 'src/config';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { computeDensityGroups } from 'src/v3/densityGroups';
import { useDensityGroupsDebugStore } from 'src/v3/densityGroupsStore';

const GROUP_COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#ca8a04',
  '#9333ea',
  '#0891b2',
  '#ea580c',
  '#db2777'
];

/**
 * Test overlay: draws a ring around each density group on the 2D v3 canvas.
 */
export const V3DensityGroupsOverlay = () => {
  const visible = useDensityGroupsDebugStore((state) => {
    return state.visible;
  });
  const { items } = useScene();
  const modelItems = useModelStore((state) => {
    return state.items;
  });

  const groups = useMemo(() => {
    if (!visible) return [];
    return computeDensityGroups({ items, modelItems });
  }, [visible, items, modelItems]);

  if (!visible || groups.length === 0) return null;

  return (
    <>
      {groups.map((group, index) => {
        const color = GROUP_COLORS[index % GROUP_COLORS.length];
        const cx = group.circle.cx * TILE_SIZE_2D;
        const cy = group.circle.cy * TILE_SIZE_2D;
        const r = group.circle.r * TILE_SIZE_2D;
        const size = r * 2;

        return (
          <Box
            key={group.id}
            sx={{
              position: 'absolute',
              pointerEvents: 'none',
              borderRadius: '50%',
              border: `3px solid ${color}`,
              bgcolor: `${color}22`,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              pt: 0.5
            }}
            style={{
              left: cx - r,
              top: cy - r,
              width: size,
              height: size
            }}
          >
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 700,
                color,
                bgcolor: 'rgba(255,255,255,0.85)',
                px: 0.6,
                py: 0.15,
                borderRadius: 1,
                lineHeight: 1.2,
                whiteSpace: 'nowrap'
              }}
            >
              G{index + 1} · {group.memberIds.length}
            </Typography>
          </Box>
        );
      })}
    </>
  );
};
