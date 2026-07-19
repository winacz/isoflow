import { MIN_ZOOM, MAX_ZOOM } from 'src/config';
import { clamp } from './common';

/** Button zoom: ~10% multiplicative step, no snapping. */
export const incrementZoom = (zoom: number, minZoom = MIN_ZOOM) => {
  return clamp(zoom * 1.1, minZoom, MAX_ZOOM);
};

export const decrementZoom = (zoom: number, minZoom = MIN_ZOOM) => {
  return clamp(zoom / 1.1, minZoom, MAX_ZOOM);
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

/**
 * Smooth zoom controller: wheel updates a target; rAF lerps the displayed zoom.
 * Needed because physical mouse wheels only fire discrete notch events.
 */
export const createSmoothZoomController = () => {
  let target: number | null = null;
  let current = 1;
  let minZoom = MIN_ZOOM;
  let rafId = 0;
  let setZoom: ZoomSetter | null = null;

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

    // Ease toward target — feels continuous even on notch wheels
    current += diff * 0.28;
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

    applyWheel(deltaY: number, deltaMode: number, opts: {
      zoom: number;
      minZoom: number;
      setZoom: ZoomSetter;
    }) {
      setZoom = opts.setZoom;
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
