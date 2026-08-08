import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { isPlanProjection } from 'src/utils';
import {
  subscribeLiveViewport,
  syncLiveViewportFromStore,
  getLiveViewport,
  isViewportGestureActive
} from 'src/utils/liveViewport';

interface Props {
  children?: React.ReactNode;
}

/**
 * Single pan/zoom transform parent for scene content layers.
 * Reads liveViewport during gestures (no React re-render per zoom frame).
 */
export const SceneViewport = ({ children }: Props) => {
  const elRef = useRef<HTMLDivElement>(null);
  const store = useUiStateStoreApi();
  const projectionMode = useUiStateStore((state) => state.projectionMode);
  const isTwoD = isPlanProjection(projectionMode);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return undefined;

    const apply = (zoom: number, x: number, y: number) => {
      el.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
      // Temporary compositor hint only while gesturing (permanent willChange
      // clips large cabinets after zoom jumps on Chromium plan view).
      if (isTwoD) {
        el.style.willChange = isViewportGestureActive() ? 'transform' : '';
      }
      el.classList.toggle(
        'isoflow-viewport-gesturing',
        isViewportGestureActive()
      );
    };

    const state = store.getState();
    syncLiveViewportFromStore({
      zoom: state.zoom,
      scroll: state.scroll.position
    });
    const live = getLiveViewport();
    apply(live.zoom, live.scroll.x, live.scroll.y);

    const unsubLive = subscribeLiveViewport((viewport) => {
      apply(viewport.zoom, viewport.scroll.x, viewport.scroll.y);
    });

    // Button zoom / fit / projection switch still write the store.
    // Skip while smooth-zoom owns live (store lags until settle).
    const unsubStore = store.subscribe((next, prev) => {
      if (isViewportGestureActive()) return;
      if (next.zoom === prev.zoom && next.scroll === prev.scroll) return;
      syncLiveViewportFromStore({
        zoom: next.zoom,
        scroll: next.scroll.position
      });
    });

    return () => {
      unsubLive();
      unsubStore();
    };
  }, [store, isTwoD]);

  return (
    <Box
      ref={elRef}
      className="isoflow-scene-viewport"
      sx={{
        position: 'absolute',
        zIndex: 0,
        top: '50%',
        left: '50%',
        width: 0,
        height: 0,
        userSelect: 'none',
        transformOrigin: '0 0',
        overflow: 'visible',
        ...(isTwoD
          ? {
              // Drop expensive backdrop blurs while the viewport is CSS-scaled.
              '&.isoflow-viewport-gesturing *': {
                backdropFilter: 'none !important',
                WebkitBackdropFilter: 'none !important'
              }
            }
          : { willChange: 'transform' })
      }}
    >
      {children}
    </Box>
  );
};
