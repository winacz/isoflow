import React, { useMemo } from 'react';
import { getTextBoxEndTile } from 'src/utils';
import { useTextBox } from 'src/hooks/useTextBox';
import { TransformControls } from './TransformControls';
import { TransformControls2d } from './TransformControls2d';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { isPlanProjection } from 'src/utils/projection';

interface Props {
  id: string;
}

export const TextBoxTransformControls = ({ id }: Props) => {
  const textBox = useTextBox(id);

  const projectionMode = useUiStateStore((state) => state.projectionMode);
  const isTwoD = isPlanProjection(projectionMode);

  const to = useMemo(() => {
    return getTextBoxEndTile(textBox, textBox.size);
  }, [textBox]);

  if (isTwoD) {
    return <TransformControls2d from={textBox.tile} to={to} />;
  }

  return <TransformControls from={textBox.tile} to={to} />;
};
