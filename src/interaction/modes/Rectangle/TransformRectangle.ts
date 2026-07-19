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

/** Keep at least a 1×1 tile rectangle. */
const applyEdgeResize = (
  from: Coords,
  to: Coords,
  anchor: AnchorPosition,
  mouse: Coords
): { from: Coords; to: Coords } | null => {
  const b = normalizeBounds(from, to);
  let { minX, maxX, minY, maxY } = b;

  switch (anchor) {
    case 'TOP':
      minY = mouse.y > maxY ? maxY : mouse.y;
      break;
    case 'BOTTOM':
      maxY = mouse.y < minY ? minY : mouse.y;
      break;
    case 'LEFT':
      minX = mouse.x > maxX ? maxX : mouse.x;
      break;
    case 'RIGHT':
      maxX = mouse.x < minX ? minX : mouse.x;
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

    // Mid-edge drag — axis-aligned rectangle only.
    if (
      anchor === 'TOP' ||
      anchor === 'BOTTOM' ||
      anchor === 'LEFT' ||
      anchor === 'RIGHT'
    ) {
      const next = applyEdgeResize(rectangle.from, rectangle.to, anchor, mouse);
      if (!next) return;
      scene.updateRectangle(uiState.mode.id, next);
      return;
    }

    // Corner drag (existing iso / 2D opposite-corner resize).
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
