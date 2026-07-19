import React, { useRef } from 'react';
import { Box, SxProps } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';

interface Props {
  children?: React.ReactNode;
  order?: number;
  sx?: SxProps;
  disableAnimation?: boolean;
}

export const SceneLayer = ({ children, order = 0, sx }: Props) => {
  const elementRef = useRef<HTMLDivElement>(null);

  const scroll = useUiStateStore((state) => {
    return state.scroll;
  });
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });

  return (
    <Box
      ref={elementRef}
      sx={{
        position: 'absolute',
        zIndex: order,
        top: '50%',
        left: '50%',
        width: 0,
        height: 0,
        userSelect: 'none',
        transformOrigin: '0 0',
        // Composite the layer on the GPU — zoom/pan scales a cached texture
        // instead of re-rasterizing the whole SVG scene every frame.
        willChange: 'transform',
        ...sx
      }}
      style={{
        // Scale around the layer anchor (viewport center via left/top 50%)
        transform: `translate(${scroll.position.x}px, ${scroll.position.y}px) scale(${zoom})`
      }}
    >
      {children}
    </Box>
  );
};
