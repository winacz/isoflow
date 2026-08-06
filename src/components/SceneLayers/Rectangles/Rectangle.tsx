import React from 'react';
import { useScene } from 'src/hooks/useScene';
import { IsoTileArea } from 'src/components/IsoTileArea/IsoTileArea';
import { TileArea2d } from 'src/components/SceneLayers/Rectangles/TileArea2d';
import { getColorVariant, isPlan2dCanvas } from 'src/utils';
import { useColor } from 'src/hooks/useColor';
import { useUiStateStore } from 'src/stores/uiStateStore';

type Props = ReturnType<typeof useScene>['rectangles'][0];

const DEFAULT_OPACITY = 0.25;

export const Rectangle = ({
  from,
  to,
  color: colorId,
  kind = 'area',
  opacity,
  name,
  locked
}: Props) => {
  const color = useColor(colorId);
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const isTwoD = isPlan2dCanvas(projectionMode);
  const fillOpacity = opacity ?? DEFAULT_OPACITY;
  const stroke = locked
    ? '#ea580c'
    : getColorVariant(color.value, 'dark', { grade: 2 });

  if (isTwoD) {
    return (
      <TileArea2d
        from={from}
        to={to}
        fill={color.value}
        opacity={fillOpacity}
        kind={kind}
        strokeColor={stroke}
        name={name}
        locked={locked}
      />
    );
  }

  return (
    <IsoTileArea
      from={from}
      to={to}
      fill={color.value}
      opacity={fillOpacity}
      cornerRadius={kind === 'building' ? 12 : 22}
      stroke={{
        color: stroke,
        width: locked ? 3 : kind === 'building' ? 2 : 1
      }}
    />
  );
};
