import React from 'react';
import { useScene } from 'src/hooks/useScene';
import { IsoTileArea } from 'src/components/IsoTileArea/IsoTileArea';
import { TileArea2d } from 'src/components/SceneLayers/Rectangles/TileArea2d';
import { getColorVariant } from 'src/utils';
import { useColor } from 'src/hooks/useColor';
import { useUiStateStore } from 'src/stores/uiStateStore';

type Props = ReturnType<typeof useScene>['rectangles'][0];

const DEFAULT_OPACITY = 0.25;

export const Rectangle = ({
  from,
  to,
  color: colorId,
  kind = 'area',
  opacity
}: Props) => {
  const color = useColor(colorId);
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const isTwoD = projectionMode === 'TWO_D';
  const fillOpacity = opacity ?? DEFAULT_OPACITY;
  const stroke = getColorVariant(color.value, 'dark', { grade: 2 });

  if (isTwoD) {
    return (
      <TileArea2d
        from={from}
        to={to}
        fill={color.value}
        opacity={fillOpacity}
        kind={kind}
        strokeColor={stroke}
      />
    );
  }

  return (
    <IsoTileArea
      from={from}
      to={to}
      fill={color.value}
      cornerRadius={kind === 'building' ? 12 : 22}
      stroke={{
        color: stroke,
        width: kind === 'building' ? 2 : 1
      }}
    />
  );
};
