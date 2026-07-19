import {
  getItemByIdOrThrow,
  getBoundingBox,
  convertBoundsToNamedAnchors,
  hasMovedTile
} from 'src/utils';
import { ModeActions, AnchorPosition, Coords } from 'src/types';

const normalizeBounds = (from: Coords, to: Coords) => {
  return {
    minX: Math.min(from.x, to.x),
    maxX: Math.max(from.x, to.x),
    minY: Math.min(from.y, to.y),
    maxY: Math.max(from.y, to.y)
  };
};

const clampEdge = (value: number, min: number, max: number) => {
  if (value > max) return max;
  if (value < min) return min;
  return value;
};

/**
 * Mid-edge resize — keeps an axis-aligned rectangle.
 * 2D: screen Y grows down → TOP = minY.
 * Iso: tile Y grows "up" on screen → TOP = maxY.
 */
const applyEdgeResize = (
  from: Coords,
  to: Coords,
  anchor: AnchorPosition,
  mouse: Coords,
  isTwoD: boolean
): { from: Coords; to: Coords } | null => {
  const b = normalizeBounds(from, to);
  let { minX, maxX, minY, maxY } = b;

  if (isTwoD) {
    switch (anchor) {
      case 'TOP':
        minY = clampEdge(mouse.y, Number.NEGATIVE_INFINITY, maxY);
        break;
      case 'BOTTOM':
        maxY = clampEdge(mouse.y, minY, Number.POSITIVE_INFINITY);
        break;
      case 'LEFT':
        minX = clampEdge(mouse.x, Number.NEGATIVE_INFINITY, maxX);
        break;
      case 'RIGHT':
        maxX = clampEdge(mouse.x, minX, Number.POSITIVE_INFINITY);
        break;
      default:
        return null;
    }
  } else {
    // Isometric tile space: highY is the visual top edge.
    switch (anchor) {
      case 'TOP':
        maxY = clampEdge(mouse.y, minY, Number.POSITIVE_INFINITY);
        break;
      case 'BOTTOM':
        minY = clampEdge(mouse.y, Number.NEGATIVE_INFINITY, maxY);
        break;
      case 'LEFT':
        minX = clampEdge(mouse.x, Number.NEGATIVE_INFINITY, maxX);
        break;
      case 'RIGHT':
        maxX = clampEdge(mouse.x, minX, Number.POSITIVE_INFINITY);
        break;
      default:
        return null;
    }
  }

  return {
    from: { x: minX, y: minY },
    to: { x: maxX, y: maxY }
  };
};

/** Corner resize in 2D screen/tile space (minY = top). */
const applyCornerResize2d = (
  from: Coords,
  to: Coords,
  anchor: AnchorPosition,
  mouse: Coords
): { from: Coords; to: Coords } | null => {
  const b = normalizeBounds(from, to);
  let { minX, maxX, minY, maxY } = b;

  switch (anchor) {
    case 'TOP_LEFT':
      minX = mouse.x > maxX ? maxX : mouse.x;
      minY = mouse.y > maxY ? maxY : mouse.y;
      break;
    case 'TOP_RIGHT':
      maxX = mouse.x < minX ? minX : mouse.x;
      minY = mouse.y > maxY ? maxY : mouse.y;
      break;
    case 'BOTTOM_LEFT':
      minX = mouse.x > maxX ? maxX : mouse.x;
      maxY = mouse.y < minY ? minY : mouse.y;
      break;
    case 'BOTTOM_RIGHT':
      maxX = mouse.x < minX ? minX : mouse.x;
      maxY = mouse.y < minY ? minY : mouse.y;
      break;
    default:
      return null;
  }

  return {
    from: { x: minX, y: minY },
    to: { x: maxX, y: maxY }
  };
};

export const TransformRectangle: ModeActions = {
  entry: () => {},
  exit: () => {},
  mousemove: ({ uiState, scene }) => {
    if (
      uiState.mode.type !== 'RECTANGLE.TRANSFORM' ||
      !hasMovedTile(uiState.mouse)
    )
      return;

    if (!uiState.mode.selectedAnchor) return;

    const rectangle = getItemByIdOrThrow(
      scene.rectangles,
      uiState.mode.id
    ).value;
    const anchor = uiState.mode.selectedAnchor;
    const mouse = uiState.mouse.position.tile;
    const isTwoD = uiState.projectionMode === 'TWO_D';

    // Mid-edge drag — axis-aligned rectangle only.
    if (
      anchor === 'TOP' ||
      anchor === 'BOTTOM' ||
      anchor === 'LEFT' ||
      anchor === 'RIGHT'
    ) {
      const next = applyEdgeResize(
        rectangle.from,
        rectangle.to,
        anchor,
        mouse,
        isTwoD
      );
      if (!next) return;
      scene.updateRectangle(uiState.mode.id, next);
      return;
    }

    // 2D corners use screen/tile min/max (not iso named anchors).
    if (isTwoD) {
      const next = applyCornerResize2d(
        rectangle.from,
        rectangle.to,
        anchor,
        mouse
      );
      if (!next) return;
      scene.updateRectangle(uiState.mode.id, next);
      return;
    }

    // Isometric corner drag — opposite corner stays fixed.
    const rectangleBounds = getBoundingBox([rectangle.to, rectangle.from]);
    const namedBounds = convertBoundsToNamedAnchors(rectangleBounds);

    if (anchor === 'BOTTOM_LEFT' || anchor === 'TOP_RIGHT') {
      const nextBounds = getBoundingBox([
        anchor === 'BOTTOM_LEFT'
          ? namedBounds.TOP_RIGHT
          : namedBounds.BOTTOM_LEFT,
        mouse
      ]);
      const nextNamedBounds = convertBoundsToNamedAnchors(nextBounds);

      scene.updateRectangle(uiState.mode.id, {
        from: nextNamedBounds.TOP_RIGHT,
        to: nextNamedBounds.BOTTOM_LEFT
      });
    } else if (anchor === 'BOTTOM_RIGHT' || anchor === 'TOP_LEFT') {
      const nextBounds = getBoundingBox([
        anchor === 'BOTTOM_RIGHT'
          ? namedBounds.TOP_LEFT
          : namedBounds.BOTTOM_RIGHT,
        mouse
      ]);
      const nextNamedBounds = convertBoundsToNamedAnchors(nextBounds);

      scene.updateRectangle(uiState.mode.id, {
        from: nextNamedBounds.TOP_LEFT,
        to: nextNamedBounds.BOTTOM_RIGHT
      });
    }
  },
  mousedown: () => {
    // MOUSE_DOWN is triggered by the anchor itself
  },
  mouseup: ({ uiState }) => {
    if (uiState.mode.type !== 'RECTANGLE.TRANSFORM') return;

    uiState.actions.setMode({
      type: 'CURSOR',
      mousedownItem: null,
      showCursor: true
    });
  }
};
