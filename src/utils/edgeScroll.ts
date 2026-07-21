import { Coords, Size } from 'src/types';

/** Distance from viewport edge that starts auto-pan while dragging. */
export const DRAG_EDGE_ZONE_PX = 56;

/** Hold near the edge this long before the canvas starts scrolling. */
export const DRAG_EDGE_DELAY_MS = 220;

/** Max pan speed (px/frame) when the cursor is at the very edge. */
export const DRAG_EDGE_MAX_SPEED = 16;

/**
 * Scroll delta while dragging near the viewport edge.
 * Same sign convention as manual pan (`getPanScrollFromDelta`).
 */
export const getDragEdgeScrollVelocity = (
  screen: Coords,
  rendererSize: Size,
  zonePx = DRAG_EDGE_ZONE_PX,
  maxSpeed = DRAG_EDGE_MAX_SPEED
): Coords => {
  let x = 0;
  let y = 0;

  if (rendererSize.width <= zonePx * 2 || rendererSize.height <= zonePx * 2) {
    return { x: 0, y: 0 };
  }

  if (screen.x < zonePx) {
    x = ((zonePx - screen.x) / zonePx) * maxSpeed;
  } else if (screen.x > rendererSize.width - zonePx) {
    x = -((screen.x - (rendererSize.width - zonePx)) / zonePx) * maxSpeed;
  }

  if (screen.y < zonePx) {
    y = ((zonePx - screen.y) / zonePx) * maxSpeed;
  } else if (screen.y > rendererSize.height - zonePx) {
    y = -((screen.y - (rendererSize.height - zonePx)) / zonePx) * maxSpeed;
  }

  return { x, y };
};

export const isDragEdgeVelocityActive = (velocity: Coords) => {
  return Math.abs(velocity.x) > 0.05 || Math.abs(velocity.y) > 0.05;
};
