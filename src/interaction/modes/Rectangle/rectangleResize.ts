import { AnchorPosition, Coords } from 'src/types';

export const normalizeRectBounds = (from: Coords, to: Coords) => {
  return {
    minX: Math.min(from.x, to.x),
    maxX: Math.max(from.x, to.x),
    minY: Math.min(from.y, to.y),
    maxY: Math.max(from.y, to.y)
  };
};

export const snapRectEdge = (value: number, step: number) => {
  const s = Math.max(1, step);
  const scaled = value / s;
  const floored = Math.floor(scaled);
  const frac = scaled - floored;
  return (frac > 0.5 ? floored + 1 : floored) * s;
};

export const sameRectCorners = (
  a: { from: Coords; to: Coords },
  b: { from: Coords; to: Coords }
) => {
  return (
    a.from.x === b.from.x &&
    a.from.y === b.from.y &&
    a.to.x === b.to.x &&
    a.to.y === b.to.y
  );
};

const clampInclusive = (value: number, min: number, max: number) => {
  if (value > max) return max;
  if (value < min) return min;
  return value;
};

/**
 * Corner resize for axis-aligned rectangles.
 * 2D: TOP = minY (screen grows down).
 * Iso: TOP = maxY (tile Y grows “up” on screen) — matches convertBoundsToNamedAnchors.
 */
export const applyCornerResize = (
  from: Coords,
  to: Coords,
  anchor: AnchorPosition,
  mouse: Coords,
  step: { x: number; y: number } = { x: 1, y: 1 },
  options: { iso?: boolean } = {}
): { from: Coords; to: Coords } | null => {
  const b = normalizeRectBounds(from, to);
  const sx = Math.max(1, step.x);
  const sy = Math.max(1, step.y);
  const snapX = snapRectEdge(mouse.x, sx);
  const snapY = snapRectEdge(mouse.y, sy);

  if (options.iso) {
    let { minX, maxX, minY, maxY } = b;

    switch (anchor) {
      case 'TOP_LEFT': // {lowX, highY}
        minX = clampInclusive(snapX, Number.NEGATIVE_INFINITY, maxX);
        maxY = clampInclusive(snapY, minY, Number.POSITIVE_INFINITY);
        break;
      case 'TOP_RIGHT': // {highX, highY}
        maxX = clampInclusive(snapX, minX, Number.POSITIVE_INFINITY);
        maxY = clampInclusive(snapY, minY, Number.POSITIVE_INFINITY);
        break;
      case 'BOTTOM_LEFT': // {lowX, lowY}
        minX = clampInclusive(snapX, Number.NEGATIVE_INFINITY, maxX);
        minY = clampInclusive(snapY, Number.NEGATIVE_INFINITY, maxY);
        break;
      case 'BOTTOM_RIGHT': // {highX, lowY}
        maxX = clampInclusive(snapX, minX, Number.POSITIVE_INFINITY);
        minY = clampInclusive(snapY, Number.NEGATIVE_INFINITY, maxY);
        break;
      default:
        return null;
    }

    return {
      from: { x: minX, y: minY },
      to: { x: maxX, y: maxY }
    };
  }

  // 2D exclusive-edge model (snaps to grid lines).
  let left = b.minX;
  let right = b.maxX + 1;
  let top = b.minY;
  let bottom = b.maxY + 1;

  switch (anchor) {
    case 'TOP_LEFT':
      left = Math.min(snapX, right - sx);
      top = Math.min(snapY, bottom - sy);
      break;
    case 'TOP_RIGHT':
      right = Math.max(snapX, left + sx);
      top = Math.min(snapY, bottom - sy);
      break;
    case 'BOTTOM_LEFT':
      left = Math.min(snapX, right - sx);
      bottom = Math.max(snapY, top + sy);
      break;
    case 'BOTTOM_RIGHT':
      right = Math.max(snapX, left + sx);
      bottom = Math.max(snapY, top + sy);
      break;
    default:
      return null;
  }

  return {
    from: { x: left, y: top },
    to: { x: right - 1, y: bottom - 1 }
  };
};
