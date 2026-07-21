import React, { useEffect, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import { Size, GridStyle } from 'src/types';
import gridTileSvg from 'src/assets/grid-tile-bg.svg';
import { useUiStateStore } from 'src/stores/uiStateStore';
import {
  PROJECTED_TILE_SIZE,
  TILE_SIZE_2D,
  RACK_1U_HEIGHT_TILES,
  GRID_COLOR_DARK
} from 'src/config';
import { SizeUtils } from 'src/utils/SizeUtils';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { isPlanProjection } from 'src/utils';

type GridVisualConfig = {
  majorStepX: number;
  majorStepY: number;
  showFine: boolean;
  majorColor: string;
  fineColor: string;
};

const GRID_STYLES: Record<GridStyle, GridVisualConfig> = {
  fine: {
    majorStepX: 1,
    majorStepY: 1,
    showFine: false,
    majorColor: 'rgba(0, 0, 0, 0.09)',
    fineColor: 'rgba(0, 0, 0, 0)'
  },
  standard: {
    majorStepX: 5,
    majorStepY: 5,
    showFine: true,
    majorColor: 'rgba(0, 0, 0, 0.15)',
    fineColor: 'rgba(0, 0, 0, 0.045)'
  },
  dense: {
    majorStepX: 2,
    majorStepY: 2,
    showFine: true,
    majorColor: 'rgba(0, 0, 0, 0.18)',
    fineColor: 'rgba(0, 0, 0, 0.07)'
  },
  sparse: {
    majorStepX: 10,
    majorStepY: 10,
    showFine: false,
    majorColor: 'rgba(0, 0, 0, 0.14)',
    fineColor: 'rgba(0, 0, 0, 0)'
  },
  rack: {
    // Square cells: side = RACK switch 1U height
    majorStepX: RACK_1U_HEIGHT_TILES,
    majorStepY: RACK_1U_HEIGHT_TILES,
    showFine: false,
    majorColor: 'rgba(15, 23, 42, 0.22)',
    fineColor: 'rgba(0, 0, 0, 0)'
  }
};

const lineBackground = (color: string) => {
  return [
    `linear-gradient(to right, ${color} 1px, transparent 1px)`,
    `linear-gradient(to bottom, ${color} 1px, transparent 1px)`
  ].join(', ');
};

const hexToRgba = (hex: string, alpha: number): string | null => {
  const raw = hex.trim();
  let r = 0;
  let g = 0;
  let b = 0;
  if (/^#([0-9a-fA-F]{6})$/.test(raw)) {
    r = parseInt(raw.slice(1, 3), 16);
    g = parseInt(raw.slice(3, 5), 16);
    b = parseInt(raw.slice(5, 7), 16);
  } else if (/^#([0-9a-fA-F]{3})$/.test(raw)) {
    r = parseInt(raw[1] + raw[1], 16);
    g = parseInt(raw[2] + raw[2], 16);
    b = parseInt(raw[3] + raw[3], 16);
  } else {
    return null;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

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
  const gridStyle = useUiStateStore((state) => {
    return state.gridStyle;
  });
  const gridColor = useUiStateStore((state) => {
    return state.canvasByMode.TWO_D.gridColor;
  });
  const canvasTheme = useUiStateStore((state) => {
    return state.canvasByMode.TWO_D.theme;
  });

  const isTwoD = isPlanProjection(projectionMode);
  const style = GRID_STYLES[gridStyle] ?? GRID_STYLES.standard;

  const majorColor = useMemo(() => {
    const tint = gridColor ?? (canvasTheme === 'dark' ? GRID_COLOR_DARK : null);
    if (!tint) return style.majorColor;
    return hexToRgba(tint, canvasTheme === 'dark' ? 0.55 : 0.45) ?? style.majorColor;
  }, [gridColor, canvasTheme, style.majorColor]);

  const fineColor = useMemo(() => {
    if (!style.showFine) return style.fineColor;
    const tint = gridColor ?? (canvasTheme === 'dark' ? GRID_COLOR_DARK : null);
    if (!tint) return style.fineColor;
    return hexToRgba(tint, canvasTheme === 'dark' ? 0.28 : 0.18) ?? style.fineColor;
  }, [gridColor, canvasTheme, style.fineColor, style.showFine]);

  const majorBackgroundImage = useMemo(() => {
    return lineBackground(majorColor);
  }, [majorColor]);

  const fineBackgroundImage = useMemo(() => {
    return lineBackground(fineColor);
  }, [fineColor]);

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

    if (!majorRef.current) return;

    const elSize = majorRef.current.getBoundingClientRect();
    const fine = {
      width: TILE_SIZE_2D * zoom,
      height: TILE_SIZE_2D * zoom
    };
    const major = {
      width: TILE_SIZE_2D * style.majorStepX * zoom,
      height: TILE_SIZE_2D * style.majorStepY * zoom
    };
    const backgroundPosition: Size = {
      width: elSize.width / 2 + scroll.position.x,
      height: elSize.height / 2 + scroll.position.y
    };
    const pos = `${backgroundPosition.width}px ${backgroundPosition.height}px`;

    if (fineRef.current) {
      fineRef.current.style.backgroundSize = `${fine.width}px ${fine.height}px`;
      fineRef.current.style.backgroundPosition = pos;
    }
    majorRef.current.style.backgroundSize = `${major.width}px ${major.height}px`;
    majorRef.current.style.backgroundPosition = pos;
  }, [
    scroll,
    zoom,
    size,
    projectionMode,
    isTwoD,
    style.majorStepX,
    style.majorStepY
  ]);

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
      {isTwoD && style.showFine && (
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
