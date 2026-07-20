import { useCallback, useMemo } from 'react';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { Size, Coords } from 'src/types';
import {
  getUnprojectedBounds as getUnprojectedBoundsUtil,
  getFitToViewParams as getFitToViewParamsUtil,
  CoordsUtils
} from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { useResizeObserver } from './useResizeObserver';

export const useDiagramUtils = () => {
  const scene = useScene();
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const rendererEl = useUiStateStore((state) => {
    return state.rendererEl;
  });
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });

  const itemControls = useUiStateStore((state) => {
    return state.itemControls;
  });

  const boundsOptions = useMemo(() => {
    return {
      projectionMode,
      modelItems
    };
  }, [projectionMode, modelItems]);

  const getUnprojectedBounds = useCallback((): Size & Coords => {
    return getUnprojectedBoundsUtil(scene.currentView, boundsOptions);
  }, [scene.currentView, boundsOptions]);

  const getFitToViewParams = useCallback(
    (viewportSize: Size) => {
      return getFitToViewParamsUtil(
        scene.currentView,
        viewportSize,
        boundsOptions
      );
    },
    [scene.currentView, boundsOptions]
  );

  const fitToView = useCallback(async () => {
    // Sidebar covers the right edge in 2D — fit into the free canvas only.
    const sidebarW =
      projectionMode === 'TWO_D' && itemControls
        ? Math.min(340, Math.max(290, Math.round(rendererSize.width * 0.22)))
        : 0;
    const viewport = {
      width: Math.max(120, rendererSize.width - sidebarW),
      height: rendererSize.height
    };
    const { zoom, scroll } = getFitToViewParams(viewport);

    uiStateActions.setScroll({
      position: {
        x: scroll.x - sidebarW * 0.5,
        y: scroll.y
      },
      offset: CoordsUtils.zero()
    });
    uiStateActions.setZoom(zoom);
  }, [
    uiStateActions,
    getFitToViewParams,
    rendererSize,
    projectionMode,
    itemControls
  ]);

  return {
    getUnprojectedBounds,
    fitToView,
    getFitToViewParams
  };
};
