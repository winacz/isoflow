import React, { useCallback } from 'react';
import { useRectangle } from 'src/hooks/useRectangle';
import { AnchorPosition } from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { isPlan2dCanvas } from 'src/utils';
import { TransformControls } from './TransformControls';
import { TransformControls2d } from './TransformControls2d';

interface Props {
  id: string;
}

export const RectangleTransformControls = ({ id }: Props) => {
  const rectangle = useRectangle(id);
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const isTwoD = isPlan2dCanvas(projectionMode);

  const onAnchorMouseDown = useCallback(
    (key: AnchorPosition) => {
      uiStateActions.setMode({
        type: 'RECTANGLE.TRANSFORM',
        id: rectangle.id,
        selectedAnchor: key,
        showCursor: true
      });
    },
    [rectangle.id, uiStateActions]
  );

  if (rectangle.locked) {
    return null;
  }

  if (isTwoD) {
    return (
      <TransformControls2d
        from={rectangle.from}
        to={rectangle.to}
        onAnchorMouseDown={onAnchorMouseDown}
      />
    );
  }

  return (
    <TransformControls
      from={rectangle.from}
      to={rectangle.to}
      onAnchorMouseDown={onAnchorMouseDown}
    />
  );
};
