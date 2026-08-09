import { ModeActions, Coords, Size, Scroll } from 'src/types';
import { produce } from 'immer';
import {
  generateId,
  setWindowCursor,
  getGridSnapStep,
  screenToTile2dContinuous,
  isPlan2dCanvas,
  getLiveViewport
} from 'src/utils';

/**
 * Snap a continuous tile value to a grid line.
 * At exact midpoints, prefer the lower line so right/bottom edges don't grow
 * past the line the cursor is sitting on.
 */
const snapEdge = (value: number, step: number) => {
  const s = Math.max(1, step);
  const scaled = value / s;
  const floored = Math.floor(scaled);
  const frac = scaled - floored;
  return (frac > 0.5 ? floored + 1 : floored) * s;
};

const sameCorners = (
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

const continuousFromScreen = (
  screen: Coords,
  zoom: number,
  scroll: Scroll,
  rendererSize: Size
) => {
  const live = getLiveViewport();
  return screenToTile2dContinuous({
    mouse: screen,
    zoom: live.zoom || zoom,
    scroll: {
      ...scroll,
      position: live.scroll || scroll.position
    },
    rendererSize
  });
};

/** Convert two snapped grid intersections into inclusive tile corners. */
const inclusiveFromEdges = (
  start: Coords,
  end: Coords,
  step: { x: number; y: number }
): { from: Coords; to: Coords } => {
  const sx = Math.max(1, step.x);
  const sy = Math.max(1, step.y);
  let left = Math.min(start.x, end.x);
  let right = Math.max(start.x, end.x);
  let top = Math.min(start.y, end.y);
  let bottom = Math.max(start.y, end.y);

  if (right < left + sx) right = left + sx;
  if (bottom < top + sy) bottom = top + sy;

  return {
    from: { x: left, y: top },
    to: { x: right - 1, y: bottom - 1 }
  };
};

export const DrawRectangle: ModeActions = {
  entry: () => {
    setWindowCursor('crosshair');
  },
  exit: () => {
    setWindowCursor('default');
  },
  mousemove: ({ uiState, scene, rendererSize }) => {
    if (
      uiState.mode.type !== 'RECTANGLE.DRAW' ||
      !uiState.mode.id ||
      !uiState.mouse.mousedown
    )
      return;

    const rectangleId = uiState.mode.id;
    const isTwoD = isPlan2dCanvas(uiState.projectionMode);
    const step = isTwoD
      ? getGridSnapStep(uiState.gridStyle)
      : { x: 1, y: 1 };

    if (isTwoD) {
      const start = continuousFromScreen(
        uiState.mouse.mousedown.screen,
        uiState.zoom,
        uiState.scroll,
        rendererSize
      );
      const end = continuousFromScreen(
        uiState.mouse.position.screen,
        uiState.zoom,
        uiState.scroll,
        rendererSize
      );
      const next = inclusiveFromEdges(
        { x: snapEdge(start.x, step.x), y: snapEdge(start.y, step.y) },
        { x: snapEdge(end.x, step.x), y: snapEdge(end.y, step.y) },
        step
      );
      const rectangle = scene.rectangles.find((r) => r.id === rectangleId);
      if (rectangle && sameCorners(next, rectangle)) return;
      scene.updateRectangle(rectangleId, next);
      return;
    }

    scene.updateRectangle(rectangleId, {
      to: uiState.mouse.position.tile
    });
  },
  mousedown: ({ uiState, scene, isRendererInteraction, rendererSize }) => {
    if (uiState.mode.type !== 'RECTANGLE.DRAW' || !isRendererInteraction)
      return;

    const newRectangleId = generateId();
    const isTwoD = isPlan2dCanvas(uiState.projectionMode);
    const step = isTwoD
      ? getGridSnapStep(uiState.gridStyle)
      : { x: 1, y: 1 };

    let from: Coords;
    let to: Coords;
    if (isTwoD) {
      const continuous = continuousFromScreen(
        uiState.mouse.position.screen,
        uiState.zoom,
        uiState.scroll,
        rendererSize
      );
      const edge = {
        x: snapEdge(continuous.x, step.x),
        y: snapEdge(continuous.y, step.y)
      };
      ({ from, to } = inclusiveFromEdges(edge, edge, step));
    } else {
      const tile = uiState.mouse.position.tile;
      from = tile;
      to = tile;
    }

    scene.createRectangle({
      id: newRectangleId,
      color: scene.colors[0]?.value ?? '#60a5fa',
      from,
      to,
      kind: uiState.mode.kind ?? 'area',
      opacity: 0.25
    });

    const newMode = produce(uiState.mode, (draft) => {
      draft.id = newRectangleId;
    });

    uiState.actions.setMode(newMode);
  },
  mouseup: ({ uiState, scene, rendererSize }) => {
    if (uiState.mode.type !== 'RECTANGLE.DRAW' || !uiState.mode.id) return;

    const rectangleId = uiState.mode.id;
    const step = getGridSnapStep(uiState.gridStyle);

    // Final edge snap from release position (same math as mousemove).
    if (isPlan2dCanvas(uiState.projectionMode) && uiState.mouse.mousedown) {
      const start = continuousFromScreen(
        uiState.mouse.mousedown.screen,
        uiState.zoom,
        uiState.scroll,
        rendererSize
      );
      const end = continuousFromScreen(
        uiState.mouse.position.screen,
        uiState.zoom,
        uiState.scroll,
        rendererSize
      );
      const next = inclusiveFromEdges(
        { x: snapEdge(start.x, step.x), y: snapEdge(start.y, step.y) },
        { x: snapEdge(end.x, step.x), y: snapEdge(end.y, step.y) },
        step
      );
      const rectangle = scene.rectangles.find((r) => r.id === rectangleId);
      if (!rectangle || !sameCorners(next, rectangle)) {
        scene.updateRectangle(rectangleId, next);
      }
    }

    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};
