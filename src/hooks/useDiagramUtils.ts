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
    const { zoom, scroll } = getFitToViewParams(rendererSize);

    uiStateActions.setScroll({
      position: scroll,
      offset: CoordsUtils.zero()
    });
    uiStateActions.setZoom(zoom);
  }, [uiStateActions, getFitToViewParams, rendererSize]);

  return {
    getUnprojectedBounds,
    fitToView,
    getFitToViewParams
  };
};
