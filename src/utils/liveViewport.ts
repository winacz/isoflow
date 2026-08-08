import type { Coords } from 'src/types';

/**
 * Live pan/zoom applied imperatively during gestures.
 * Avoids Zustand → React commits on every smooth-zoom / pan rAF tick.
 */
export type LiveViewport = {
  zoom: number;
  scroll: Coords;
};

type Listener = (viewport: LiveViewport) => void;

let live: LiveViewport = {
  zoom: 1,
  scroll: { x: 0, y: 0 }
};

/** True while smooth-zoom rAF is running (store may lag behind live). */
let gestureActive = false;

const listeners = new Set<Listener>();

export const getLiveViewport = (): LiveViewport => live;

export const isViewportGestureActive = () => gestureActive;

export const setViewportGestureActive = (active: boolean) => {
  if (gestureActive === active) return;
  gestureActive = active;
  // Notify so SceneViewport can toggle willChange / blur-kill class.
  listeners.forEach((listener) => {
    listener(live);
  });
};

export const setLiveViewport = (
  next: Partial<LiveViewport>,
  options?: { notify?: boolean }
) => {
  const notify = options?.notify !== false;
  live = {
    zoom: next.zoom ?? live.zoom,
    scroll: next.scroll
      ? { x: next.scroll.x, y: next.scroll.y }
      : live.scroll
  };
  if (!notify) return;
  listeners.forEach((listener) => {
    listener(live);
  });
};

/** Sync from Zustand after fit / button zoom / projection switch. */
export const syncLiveViewportFromStore = (viewport: LiveViewport) => {
  live = {
    zoom: viewport.zoom,
    scroll: { x: viewport.scroll.x, y: viewport.scroll.y }
  };
  listeners.forEach((listener) => {
    listener(live);
  });
};

export const subscribeLiveViewport = (listener: Listener): (() => void) => {
  listeners.add(listener);
  listener(live);
  return () => {
    listeners.delete(listener);
  };
};
