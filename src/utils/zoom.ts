import { MIN_ZOOM, MAX_ZOOM } from 'src/config';
import type { Coords, Scroll } from 'src/types';
import { clamp } from './common';

/** Button zoom: ~10% multiplicative step, no snapping. */
export const incrementZoom = (zoom: number, minZoom = MIN_ZOOM) => {
  return clamp(zoom * 1.1, minZoom, MAX_ZOOM);
};

export const decrementZoom = (zoom: number, minZoom = MIN_ZOOM) => {
  return clamp(zoom / 1.1, minZoom, MAX_ZOOM);
};

/**
 * Keep the world point under `focalFromCenter` fixed when zoom changes.
 * Kept for callers that need zoom-to-point; default 2D zoom leaves scroll alone
 * so zooming out does not pull the map toward the viewport center.
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

/**
 * Apply one wheel event to a zoom value.
 * Mouse notches (±100/120) are softened; trackpad micro-deltas stay fine-grained.
 */
export const zoomFromWheelDelta = (
  zoom: number,
  deltaY: number,
  deltaMode = 0,
  minZoom = MIN_ZOOM
) => {
  let pixels =
    deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 800 : deltaY;

  // Typical mouse wheel notch — treat as a small, consistent step (~6%)
  if (Math.abs(pixels) >= 40) {
    pixels = Math.sign(pixels) * 40;
  }

  const factor = Math.exp(-pixels * 0.0015);
  return clamp(zoom * factor, minZoom, MAX_ZOOM);
};

type ZoomSetter = (zoom: number) => void;
type ScrollSetter = (updater: (prevScroll: Scroll) => Scroll) => void;

/**
 * Smooth zoom controller: wheel updates a target; rAF lerps the displayed zoom.
 * Avoids discrete notch jumps on physical mouse wheels.
 */
export const createSmoothZoomController = () => {
  let target: number | null = null;
  let current = 1;
  let minZoom = MIN_ZOOM;
  let rafId = 0;
  let setZoom: ZoomSetter | null = null;
  let setScroll: ScrollSetter | null = null;
  let currentFocal: Coords | null = null;

  const stop = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const tick = () => {
    rafId = 0;
    if (target === null || !setZoom) return;

    const diff = target - current;
    if (Math.abs(diff) < 0.0008) {
      current = target;
      setZoom(current);
      target = null;
      return;
    }

    const oldZoom = current;
    current += diff * 0.28;
    
    if (setScroll && currentFocal) {
      const fc = currentFocal; // copy for closure
      setScroll((prevScroll) => getScrollForZoomChange(oldZoom, current, prevScroll, fc));
    }
    
    setZoom(current);
    rafId = requestAnimationFrame(tick);
  };

  return {
    /** Keep controller in sync when zoom is set externally (fit, buttons, etc.). */
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
      }
    ) {
      setZoom = opts.setZoom;
      setScroll = opts.setScroll ?? null;
      currentFocal = opts.focalFromCenter ?? null;
      minZoom = opts.minZoom;
      if (target === null) {
        current = opts.zoom;
        target = opts.zoom;
      }

      target = zoomFromWheelDelta(target, deltaY, deltaMode, minZoom);

      if (!rafId) {
        rafId = requestAnimationFrame(tick);
      }
    },

    dispose: stop
  };
};

/**
 * Pinch-zoom (ctrl/meta + wheel) or discrete mouse-wheel notches → zoom.
 * Continuous trackpad two-finger scroll → pan instead (2D only).
 */
export const isWheelZoomGesture = (e: {
  ctrlKey: boolean;
  metaKey: boolean;
  deltaX: number;
  deltaY: number;
  deltaMode?: number;
}): boolean => {
  // Safari / Chrome report trackpad pinch as wheel + ctrlKey
  if (e.ctrlKey || e.metaKey) return true;

  const deltaMode = e.deltaMode ?? 0;
  // Line/page modes come from mouse wheels / legacy devices
  if (deltaMode === 1 || deltaMode === 2) return true;

  const ax = Math.abs(e.deltaX);
  const ay = Math.abs(e.deltaY);
  // Any horizontal component → trackpad pan, not zoom
  if (ax > 0.5) return false;

  // Pixel-mode mouse wheels report quantized notches (±100 / ±120 / ±150).
  // Trackpad flicks are rarely exact — keep those as pan.
  if (
    Math.abs(ay - 100) < 0.51 ||
    Math.abs(ay - 120) < 0.51 ||
    Math.abs(ay - 150) < 0.51
  ) {
    return true;
  }

  return false;
};
