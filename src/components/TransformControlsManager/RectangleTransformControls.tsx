import React, { useCallback, useRef } from 'react';
import { useRectangle } from 'src/hooks/useRectangle';
import { AnchorPosition, Coords } from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import {
  isPlan2dCanvas,
  getGridSnapStep,
  getLiveViewport,
  screenToTile2dContinuous,
  screenToIso
} from 'src/utils';
import { TransformControls } from './TransformControls';
import { TransformControls2d } from './TransformControls2d';
import {
  applyCornerResize,
  sameRectCorners
} from 'src/interaction/modes/Rectangle/rectangleResize';

interface Props {
  id: string;
}

const screenToTile = (
  screen: Coords,
  isTwoD: boolean,
  zoom: number,
  scroll: { position: Coords; offset: Coords },
  rendererSize: { width: number; height: number }
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

  return screenToIso({
    mouse: screen,
    zoom: nextZoom,
    scroll: nextScroll,
    rendererSize
  });
};

export const RectangleTransformControls = ({ id }: Props) => {
  const rectangle = useRectangle(id);
  const { updateRectangle } = useScene();
  const uiStateActions = useUiStateStore((state) => state.actions);
  const projectionMode = useUiStateStore((state) => state.projectionMode);
  const zoom = useUiStateStore((state) => state.zoom);
  const scroll = useUiStateStore((state) => state.scroll);
  const gridStyle = useUiStateStore((state) => state.gridStyle);
  const rendererEl = useUiStateStore((state) => state.rendererEl);
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const isTwoD = isPlan2dCanvas(projectionMode);
  const dragAnchorRef = useRef<AnchorPosition | null>(null);
  const rectangleRef = useRef(rectangle);
  rectangleRef.current = rectangle;

  const toScreen = useCallback(
    (event: React.PointerEvent | React.MouseEvent): Coords => {
      const rect = rendererEl?.getBoundingClientRect();
      if (!rect) {
        return uiStateActions.getMouse().position.screen;
      }
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    },
    [rendererEl, uiStateActions]
  );

  const applyDrag = useCallback(
    (anchor: AnchorPosition, screen: Coords) => {
      const current = rectangleRef.current;
      const tile = screenToTile(screen, isTwoD, zoom, scroll, rendererSize);
      // Iso floor is always 1×1 tiles; RACK step is plan-2D only.
      const step = isTwoD ? getGridSnapStep(gridStyle) : { x: 1, y: 1 };
      const next = applyCornerResize(
        current.from,
        current.to,
        anchor,
        tile,
        step,
        { iso: !isTwoD }
      );
      if (!next || sameRectCorners(next, current)) return;
      updateRectangle(current.id, next);
    },
    [isTwoD, zoom, scroll, rendererSize, gridStyle, updateRectangle]
  );

  const onAnchorPointerDown = useCallback(
    (key: AnchorPosition, event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget as HTMLElement;
      target.setPointerCapture(event.pointerId);
      dragAnchorRef.current = key;

      const screen = toScreen(event);
      const tile = screenToTile(screen, isTwoD, zoom, scroll, rendererSize);
      const mouse = uiStateActions.getMouse();
      uiStateActions.setMouse({
        ...mouse,
        mousedown: { screen, tile },
        position: { screen, tile },
        delta: null
      });
      uiStateActions.setMode({
        type: 'RECTANGLE.TRANSFORM',
        id: rectangle.id,
        selectedAnchor: key,
        showCursor: true
      });
    },
    [
      toScreen,
      isTwoD,
      zoom,
      scroll,
      rendererSize,
      uiStateActions,
      rectangle.id
    ]
  );

  const onAnchorPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const anchor = dragAnchorRef.current;
      if (!anchor) return;
      const target = event.currentTarget as HTMLElement;
      if (!target.hasPointerCapture(event.pointerId)) return;
      applyDrag(anchor, toScreen(event));
    },
    [applyDrag, toScreen]
  );

  const onAnchorPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const target = event.currentTarget as HTMLElement;
      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
      if (!dragAnchorRef.current) return;
      dragAnchorRef.current = null;
      uiStateActions.setMode({
        type: 'CURSOR',
        mousedownItem: null,
        showCursor: true
      });
    },
    [uiStateActions]
  );

  if (rectangle.locked) {
    return null;
  }

  if (isTwoD) {
    return (
      <TransformControls2d
        from={rectangle.from}
        to={rectangle.to}
        cornersOnly
        onAnchorPointerDown={onAnchorPointerDown}
        onAnchorPointerMove={onAnchorPointerMove}
        onAnchorPointerUp={onAnchorPointerUp}
      />
    );
  }

  return (
    <TransformControls
      from={rectangle.from}
      to={rectangle.to}
      cornersOnly
      onAnchorPointerDown={onAnchorPointerDown}
      onAnchorPointerMove={onAnchorPointerMove}
      onAnchorPointerUp={onAnchorPointerUp}
    />
  );
};
