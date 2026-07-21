import React, { useRef } from 'react';
import { Box, SxProps } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { isPlanProjection } from 'src/utils';

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
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const isTwoD = isPlanProjection(projectionMode);

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
        overflow: 'visible',
        // Iso: GPU composite (original). Plan: avoid willChange — large cabinets
        // get clipped after zoom jumps on Chromium.
        ...(isTwoD ? null : { willChange: 'transform' }),
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
