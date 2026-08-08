import { TILE_SIZE_2D } from 'src/config';
import type { Coords, Size } from 'src/types';

/** Below this zoom, DeviceShape2d skips RJ45 port DOM (unless selected/hovered/enlarged). */
export const DEVICE_LOD_ZOOM_THRESHOLD = 0.35;

export type PlanViewportTileBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

/**
 * Visible tile AABB in plan/2D space, matching screenToTile2dContinuous:
 * screen center is 50%/50%, scroll.position is the scene translate, and
 * tile size on screen is TILE_SIZE_2D * zoom.
 */
export const getPlanViewportTileBounds = ({
  scroll,
  zoom,
  rendererSize,
  marginTiles = 0
}: {
  scroll: { position: Coords };
  zoom: number;
  rendererSize: Size;
  marginTiles?: number;
}): PlanViewportTileBounds => {
  const tileSize = TILE_SIZE_2D * Math.max(zoom, 1e-6);
  const margin = Math.max(0, marginTiles);

  // Corners of the renderer in continuous tile coords (same formula as
  // screenToTile2dContinuous with mouse at (0,0) and (width, height)).
  const minX =
    (-rendererSize.width * 0.5 - scroll.position.x) / tileSize - margin;
  const maxX =
    (rendererSize.width * 0.5 - scroll.position.x) / tileSize + margin;
  const minY =
    (-rendererSize.height * 0.5 - scroll.position.y) / tileSize - margin;
  const maxY =
    (rendererSize.height * 0.5 - scroll.position.y) / tileSize + margin;

  return { minX, maxX, minY, maxY };
};

/** True when the node's tile footprint overlaps the viewport AABB. */
export const isNodeInViewport = (
  origin: Coords,
  size: Size,
  bounds: PlanViewportTileBounds
): boolean => {
  const width = Math.max(0, size.width);
  const height = Math.max(0, size.height);
  const nodeMaxX = origin.x + width;
  const nodeMaxY = origin.y + height;

  return !(
    nodeMaxX <= bounds.minX ||
    origin.x >= bounds.maxX ||
    nodeMaxY <= bounds.minY ||
    origin.y >= bounds.maxY
  );
};
