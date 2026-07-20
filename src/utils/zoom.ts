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
 * SceneLayer sits at the viewport center, so focal is mouse/screen offset
 * from that center (0,0 = zoom around the middle of the canvas).
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
      x:
        focalFromCenter.x -
        (focalFromCenter.x - scroll.position.x) * ratio,
      y:
        focalFromCenter.y -
        (focalFromCenter.y - scroll.position.y) * ratio
    },
    offset: scroll.offset
  };
};

/**
 * Apply one wheel event to a zoom value (instant — no smoothing).
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

/**
 * Pinch-zoom (ctrl/meta + wheel) or discrete mouse-wheel notches → zoom.
 * Continuous trackpad two-finger scroll → pan instead (2D only).
 */
export const isWheelZoomGesture = (e: {
  ctrlKey: boolean;
  metaKey: boolean;
  deltaX: number;
  deltaY: number;
}): boolean => {
  // Safari / Chrome report trackpad pinch as wheel + ctrlKey
  if (e.ctrlKey || e.metaKey) return true;
  // Classic mouse wheel: large vertical steps, no horizontal
  if (Math.abs(e.deltaX) < 0.5 && Math.abs(e.deltaY) >= 40) return true;
  return false;
};
