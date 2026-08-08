import React, { useEffect, useRef } from 'react';
import { Box, SxProps } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { isPlanProjection } from 'src/utils';
import {
  subscribeLiveViewport,
  isViewportGestureActive
} from 'src/utils/liveViewport';

interface Props {
  children?: React.ReactNode;
  order?: number;
  sx?: SxProps;
  disableAnimation?: boolean;
  /**
   * When true (default under SceneViewport), do not subscribe to scroll/zoom —
   * parent owns the CSS transform.
   */
  omitTransform?: boolean;
}

const SceneLayerStatic = ({
  children,
  order = 0,
  sx
}: Omit<Props, 'omitTransform' | 'disableAnimation'>) => {
  const elementRef = useRef<HTMLDivElement>(null);

  return (
    <Box
      ref={elementRef}
      sx={{
        position: 'absolute',
        zIndex: order,
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        userSelect: 'none',
        transformOrigin: '0 0',
        overflow: 'visible',
        ...sx
      }}
    >
      {children}
    </Box>
  );
};

/**
 * Own pan/zoom transform for overlays outside SceneViewport.
 * Driven by liveViewport (imperative) so smooth zoom does not React-reconcile.
 */
const SceneLayerTransformed = ({
  children,
  order = 0,
  sx
}: Omit<Props, 'omitTransform' | 'disableAnimation'>) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const projectionMode = useUiStateStore((state) => state.projectionMode);
  const isTwoD = isPlanProjection(projectionMode);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return undefined;

    return subscribeLiveViewport((viewport) => {
      el.style.transform = `translate(${viewport.scroll.x}px, ${viewport.scroll.y}px) scale(${viewport.zoom})`;
      if (isTwoD) {
        el.style.willChange = isViewportGestureActive() ? 'transform' : '';
      }
    });
  }, [isTwoD]);

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
        ...(isTwoD ? null : { willChange: 'transform' }),
        ...sx
      }}
    >
      {children}
    </Box>
  );
};

/**
 * Scene stacking layer. By default `omitTransform` is true — place inside
 * `SceneViewport`. Pass `omitTransform={false}` for overlays outside the
 * viewport that still need their own scroll/zoom transform.
 */
export const SceneLayer = ({
  omitTransform = true,
  ...props
}: Props) => {
  if (omitTransform) {
    return <SceneLayerStatic {...props} />;
  }
  return <SceneLayerTransformed {...props} />;
};
