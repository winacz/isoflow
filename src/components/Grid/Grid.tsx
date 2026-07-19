import React, { useEffect, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import { Size } from 'src/types';
import gridTileSvg from 'src/assets/grid-tile-bg.svg';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { PROJECTED_TILE_SIZE, TILE_SIZE_2D, GRID_2D_VISUAL_STEP } from 'src/config';
import { SizeUtils } from 'src/utils/SizeUtils';
import { useResizeObserver } from 'src/hooks/useResizeObserver';

/** Major (sparse) grid lines */
const GRID_MAJOR_COLOR = 'rgba(0, 0, 0, 0.15)';
/** Fine logical-tile grid — very faint under the major grid */
const GRID_FINE_COLOR = 'rgba(0, 0, 0, 0.045)';

export const Grid = () => {
  const majorRef = useRef<HTMLDivElement>(null);
  const fineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { size } = useResizeObserver(containerRef.current);
  const scroll = useUiStateStore((state) => {
    return state.scroll;
  });
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });

  const isTwoD = projectionMode === 'TWO_D';

  const majorBackgroundImage = useMemo(() => {
    return [
      `linear-gradient(to right, ${GRID_MAJOR_COLOR} 1px, transparent 1px)`,
      `linear-gradient(to bottom, ${GRID_MAJOR_COLOR} 1px, transparent 1px)`
    ].join(', ');
  }, []);

  const fineBackgroundImage = useMemo(() => {
    return [
      `linear-gradient(to right, ${GRID_FINE_COLOR} 1px, transparent 1px)`,
      `linear-gradient(to bottom, ${GRID_FINE_COLOR} 1px, transparent 1px)`
    ].join(', ');
  }, []);

  useEffect(() => {
    if (!isTwoD) {
      if (!majorRef.current) return;

      const elSize = majorRef.current.getBoundingClientRect();
      const tileSize = SizeUtils.multiply(PROJECTED_TILE_SIZE, zoom);
      const backgroundPosition: Size = {
        width: elSize.width / 2 + scroll.position.x + tileSize.width / 2,
        height: elSize.height / 2 + scroll.position.y
      };

      majorRef.current.style.backgroundSize = `${tileSize.width}px ${tileSize.height * 2}px`;
      majorRef.current.style.backgroundPosition = `${backgroundPosition.width}px ${backgroundPosition.height}px`;
      return;
    }

    if (!majorRef.current || !fineRef.current) return;

    const elSize = majorRef.current.getBoundingClientRect();
    const fine = {
      width: TILE_SIZE_2D * zoom,
      height: TILE_SIZE_2D * zoom
    };
    const major = {
      width: TILE_SIZE_2D * GRID_2D_VISUAL_STEP * zoom,
      height: TILE_SIZE_2D * GRID_2D_VISUAL_STEP * zoom
    };
    const backgroundPosition: Size = {
      width: elSize.width / 2 + scroll.position.x,
      height: elSize.height / 2 + scroll.position.y
    };
    const pos = `${backgroundPosition.width}px ${backgroundPosition.height}px`;

    fineRef.current.style.backgroundSize = `${fine.width}px ${fine.height}px`;
    fineRef.current.style.backgroundPosition = pos;
    majorRef.current.style.backgroundSize = `${major.width}px ${major.height}px`;
    majorRef.current.style.backgroundPosition = pos;
  }, [scroll, zoom, size, projectionMode, isTwoD]);

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'none'
      }}
    >
      {isTwoD && (
        <Box
          ref={fineRef}
          sx={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backgroundImage: fineBackgroundImage
          }}
        />
      )}
      <Box
        ref={majorRef}
        sx={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          background: isTwoD ? undefined : `repeat url("${gridTileSvg}")`,
          backgroundImage: isTwoD ? majorBackgroundImage : undefined
        }}
      />
    </Box>
  );
};
