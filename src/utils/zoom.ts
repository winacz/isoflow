import { MIN_ZOOM, MAX_ZOOM } from 'src/config';
import type { Coords, Scroll } from 'src/types';
import { clamp } from './common';
import {
  setLiveViewport,
  setViewportGestureActive,
  getLiveViewport
} from './liveViewport';

/** Button zoom: ~10% multiplicative step, no snapping. */
export const incrementZoom = (zoom: number, minZoom = MIN_ZOOM) => {
  return clamp(zoom * 1.1, minZoom, MAX_ZOOM);
};

export const decrementZoom = (zoom: number, minZoom = MIN_ZOOM) => {
  return clamp(zoom / 1.1, minZoom, MAX_ZOOM);
};

/**
 * Keep the world point under `focalFromCenter` fixed when zoom changes.
 */
export const getScrollForZoomChange = (
  oldZoom: number,
  newZoom: number,
  scroll: Scroll,
  focalFromCenter: Coords = { x: 0, y: 0 }
): Scroll => {
  if (oldZoom === newZoom || oldZoom === 0) return scroll;

  const ratio = newZoom / oldZoom;
  return {
    position: {
      x: focalFromCenter.x - (focalFromCenter.x - scroll.position.x) * ratio,
      y: focalFromCenter.y - (focalFromCenter.y - scroll.position.y) * ratio
    },
    offset: scroll.offset
  };
};

export const zoomFromWheelDelta = (
  zoom: number,
  deltaY: number,
  deltaMode = 0,
  minZoom = MIN_ZOOM
) => {
  let pixels =
    deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 800 : deltaY;

  const abs = Math.abs(pixels);

  if (abs >= 40) {
    pixels = Math.sign(pixels) * 40;
    const factor = Math.exp(-pixels * 0.002);
    return clamp(zoom * factor, minZoom, MAX_ZOOM);
  }

  const factor = Math.exp(-pixels * 0.0045);
  return clamp(zoom * factor, minZoom, MAX_ZOOM);
};

type ZoomSetter = (zoom: number) => void;
type ScrollSetter = (scroll: Scroll) => void;

/**
 * Smooth zoom: every rAF updates live CSS transform only.
 * Zustand commits once on settle — so Nodes / Connectors do not
 * React-reconcile every zoom frame.
 */
export const createSmoothZoomController = () => {
  let target: number | null = null;
  let current = 1;
  let minZoom = MIN_ZOOM;
  let rafId = 0;
  let setZoom: ZoomSetter | null = null;
  let setScroll: ScrollSetter | null = null;
  let currentFocal: Coords | null = null;
  let scrollOffset: Coords = { x: 0, y: 0 };
  const stop = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    setViewportGestureActive(false);
  };

  const publishLive = (zoom: number, scrollPos: Coords) => {
    setLiveViewport({
      zoom,
      scroll: scrollPos
    });
  };

  /** Zustand only on settle — mid-gesture React would re-layout the whole scene. */
  const commitStore = (zoom: number, scrollPos: Coords) => {
    setZoom?.(zoom);
    setScroll?.({
      position: { x: scrollPos.x, y: scrollPos.y },
      offset: scrollOffset
    });
  };

  const tick = () => {
    rafId = 0;
    if (target === null || !setZoom) return;

    const diff = target - current;
    let scrollPos = { ...getLiveViewport().scroll };

    if (Math.abs(diff) < 0.0008) {
      current = target;
      publishLive(current, scrollPos);
      commitStore(current, scrollPos);
      target = null;
      setViewportGestureActive(false);
      return;
    }

    const oldZoom = current;
    current += diff * 0.38;

    if (currentFocal) {
      const nextScroll = getScrollForZoomChange(
        oldZoom,
        current,
        { position: scrollPos, offset: scrollOffset },
        currentFocal
      );
      scrollPos = nextScroll.position;
    }

    setViewportGestureActive(true);
    publishLive(current, scrollPos);

    rafId = requestAnimationFrame(tick);
  };

  return {
    sync(zoom: number) {
      current = zoom;
      if (target === null) return;
      target = zoom;
    },

    applyWheel(
      deltaY: number,
      deltaMode: number,
      opts: {
        zoom: number;
        minZoom: number;
        setZoom: ZoomSetter;
        setScroll?: ScrollSetter;
        focalFromCenter?: Coords;
        scroll?: Scroll;
      }
    ) {
      setZoom = opts.setZoom;
      setScroll = opts.setScroll ?? null;
      currentFocal = opts.focalFromCenter ?? null;
      minZoom = opts.minZoom;

      if (opts.scroll) {
        scrollOffset = opts.scroll.offset ?? { x: 0, y: 0 };
        if (target === null) {
          current = opts.zoom;
          target = opts.zoom;
          setLiveViewport(
            {
              zoom: opts.zoom,
              scroll: opts.scroll.position
            },
            { notify: false }
          );
        }
      } else if (target === null) {
        current = opts.zoom;
        target = opts.zoom;
      }

      target = zoomFromWheelDelta(target!, deltaY, deltaMode, minZoom);
      setViewportGestureActive(true);

      if (!rafId) {
        rafId = requestAnimationFrame(tick);
      }
    },

    dispose: stop
  };
};

export const isWheelZoomGesture = (e: {
  ctrlKey: boolean;
  metaKey: boolean;
  deltaX: number;
  deltaY: number;
  deltaMode?: number;
}): boolean => {
  if (e.ctrlKey || e.metaKey) return true;

  const deltaMode = e.deltaMode ?? 0;
  if (deltaMode === 1 || deltaMode === 2) return true;

  const ax = Math.abs(e.deltaX);
  const ay = Math.abs(e.deltaY);
  if (ax > 0.5) return false;

  if (
    Math.abs(ay - 100) < 0.51 ||
    Math.abs(ay - 120) < 0.51 ||
    Math.abs(ay - 150) < 0.51
  ) {
    return true;
  }

  return false;
};
