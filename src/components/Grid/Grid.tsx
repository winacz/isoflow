import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import gsap from 'gsap';
import { Size } from 'src/types';
import gridTileSvg from 'src/assets/grid-tile-bg.svg';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { PROJECTED_TILE_SIZE, TILE_SIZE_2D } from 'src/config';
import { SizeUtils } from 'src/utils/SizeUtils';
import { useResizeObserver } from 'src/hooks/useResizeObserver';

const GRID_LINE_COLOR_LIGHT = 'rgba(0, 0, 0, 0.15)';
const GRID_LINE_COLOR_DARK = 'rgba(0, 0, 0, 0.15)';

export const Grid = () => {
  const elementRef = useRef<HTMLDivElement>(null);
  const { size } = useResizeObserver(elementRef.current);
  const [isFirstRender, setIsFirstRender] = useState(true);
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

  const twoDBackgroundImage = useMemo(() => {
    const color = isTwoD ? GRID_LINE_COLOR_DARK : GRID_LINE_COLOR_LIGHT;

    return [
      `linear-gradient(to right, ${color} 1px, transparent 1px)`,
      `linear-gradient(to bottom, ${color} 1px, transparent 1px)`
    ].join(', ');
  }, [isTwoD]);

  useEffect(() => {
    if (!elementRef.current) return;

    const elSize = elementRef.current.getBoundingClientRect();
    const tileSize = isTwoD
      ? {
          width: TILE_SIZE_2D * zoom,
          height: TILE_SIZE_2D * zoom
        }
      : SizeUtils.multiply(PROJECTED_TILE_SIZE, zoom);

    const backgroundPosition: Size = {
      width:
        elSize.width / 2 + scroll.position.x + (isTwoD ? 0 : tileSize.width / 2),
      height: elSize.height / 2 + scroll.position.y
    };

    gsap.to(elementRef.current, {
      duration: isFirstRender ? 0 : 0.25,
      backgroundSize: isTwoD
        ? `${tileSize.width}px ${tileSize.height}px`
        : `${tileSize.width}px ${tileSize.height * 2}px`,
      backgroundPosition: `${backgroundPosition.width}px ${backgroundPosition.height}px`
    });

    if (isFirstRender) {
      setIsFirstRender(false);
    }
  }, [scroll, zoom, isFirstRender, size, projectionMode, isTwoD]);

  return (
    <Box
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
      <Box
        ref={elementRef}
        sx={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          background: isTwoD ? undefined : `repeat url("${gridTileSvg}")`,
          backgroundImage: isTwoD ? twoDBackgroundImage : undefined
        }}
      />
    </Box>
  );
};
