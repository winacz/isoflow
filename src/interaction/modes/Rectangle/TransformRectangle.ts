import {
  getItemByIdOrThrow,
  isPlan2dCanvas,
  getGridSnapStep,
  screenToTile2dContinuous,
  screenToIso,
  getLiveViewport
} from 'src/utils';
import { ModeActions, Coords, Size, Scroll } from 'src/types';
import {
  applyCornerResize,
  sameRectCorners
} from './rectangleResize';

const continuousFromScreen = (
  screen: Coords,
  zoom: number,
  scroll: Scroll,
  rendererSize: Size,
  isTwoD: boolean
): Coords => {
  const live = getLiveViewport();
  const nextZoom = live.zoom || zoom;
  const nextScroll = {
    ...scroll,
    position: live.scroll || scroll.position
  };

  if (isTwoD) {
    return screenToTile2dContinuous({
      mouse: screen,
      zoom: nextZoom,
      scroll: nextScroll,
      rendererSize
    });
  }

  // Iso: screenToIso returns integer tiles — use as continuous for snap.
  return screenToIso({
    mouse: screen,
    zoom: nextZoom,
    scroll: nextScroll,
    rendererSize
  });
};

export const TransformRectangle: ModeActions = {
  entry: () => {},
  exit: () => {},
  mousemove: ({ uiState, scene, rendererSize }) => {
    if (uiState.mode.type !== 'RECTANGLE.TRANSFORM') return;
    if (!uiState.mode.selectedAnchor) return;

    const rectangle = getItemByIdOrThrow(
      scene.rectangles,
      uiState.mode.id
    ).value;
    const isTwoD = isPlan2dCanvas(uiState.projectionMode);
    const mouse = continuousFromScreen(
      uiState.mouse.position.screen,
      uiState.zoom,
      uiState.scroll,
      rendererSize,
      isTwoD
    );
    const next = applyCornerResize(
      rectangle.from,
      rectangle.to,
      uiState.mode.selectedAnchor,
      mouse,
      isTwoD ? getGridSnapStep(uiState.gridStyle) : { x: 1, y: 1 },
      { iso: !isTwoD }
    );
    if (!next || sameRectCorners(next, rectangle)) return;
    scene.updateRectangle(uiState.mode.id, next);
  },
  mousedown: () => {
    // MOUSE_DOWN is triggered by the anchor itself (pointer capture).
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
