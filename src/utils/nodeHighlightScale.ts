import { SWITCH_2D_SIZE } from 'src/config';

/** Fallback when node size is unknown (cabinets skip scale anyway). */
export const HIGHLIGHT_SCALE_BASE = 1;

/**
 * Reference area (tiles²) for size boost: switch-sized → no extra,
 * smaller nodes get a bit more enlarge at low zoom.
 */
const SCALE_REF_AREA = SWITCH_2D_SIZE.width * SWITCH_2D_SIZE.height; // ~171

/**
 * Hover / header-click enlarge scale:
 *  - at ~10% zoom: clearly larger (≈1.7–2.0×, tiny nodes a bit more)
 *  - at ~40% zoom and above: nearly invisible (≈1.02)
 *  - smaller nodes get a modest extra boost
 *
 * Shared by Nodes.tsx and PortLoupeOverlay so loupe content matches canvas.
 */
export const computeHighlightScale = (
  areaTiles: number,
  zoom: number
): number => {
  const sizeRatio = Math.min(1, SCALE_REF_AREA / Math.max(areaTiles, 1));
  const sizeBoost = 0.25 * sizeRatio;

  const ZOOM_FULL = 0.1;
  const ZOOM_NONE = 0.4;
  const t = Math.max(
    0,
    Math.min(1, (ZOOM_NONE - zoom) / (ZOOM_NONE - ZOOM_FULL))
  );
  const zoomT = t * t;
  const extra = zoomT * (0.7 + sizeBoost);

  if (extra < 0.02) {
    return 1 + 0.02 * sizeRatio;
  }
  return Math.min(2.2, 1 + extra);
};

/**
 * Softer enlarge for the far-end device while an RJ45/SFP is under the cursor.
 */
const PORT_PEER_SCALE_FACTOR = 0.45;

export const computePortPeerHoverScale = (
  areaTiles: number,
  zoom: number
): number => {
  const full = computeHighlightScale(areaTiles, zoom);
  return 1 + (full - 1) * PORT_PEER_SCALE_FACTOR;
};
