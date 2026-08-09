import React, { useMemo } from 'react';
import { useScene } from 'src/hooks/useScene';
import { IsoTileArea } from 'src/components/IsoTileArea/IsoTileArea';
import { TileArea2d } from 'src/components/SceneLayers/Rectangles/TileArea2d';
import { getColorVariant, isPlan2dCanvas, parseDeviceColor } from 'src/utils';
import { useUiStateStore } from 'src/stores/uiStateStore';

type Props = ReturnType<typeof useScene>['rectangles'][0];

const DEFAULT_OPACITY = 0.25;
const DEFAULT_FILL = '#60a5fa';

const isCssColor = (value: string) => {
  return (
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ||
    /^(rgb|hsl)a?\(/i.test(value)
  );
};

export const Rectangle = ({
  from,
  to,
  color: colorRef,
  kind = 'area',
  opacity,
  name,
  locked
}: Props) => {
  const { colors } = useScene();
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const isTwoD = isPlan2dCanvas(projectionMode);

  const fillHex = useMemo(() => {
    const raw = colorRef?.trim();
    if (raw && isCssColor(raw)) {
      return parseDeviceColor(raw).hex;
    }
    if (raw) {
      const fromPalette = colors.find((c) => c.id === raw);
      if (fromPalette) return parseDeviceColor(fromPalette.value).hex;
    }
    if (colors[0]?.value) return parseDeviceColor(colors[0].value).hex;
    return DEFAULT_FILL;
  }, [colorRef, colors]);

  const fillOpacity = opacity ?? DEFAULT_OPACITY;
  const stroke = locked
    ? '#ea580c'
    : getColorVariant(fillHex, 'dark', { grade: 2 });

  if (isTwoD) {
    return (
      <TileArea2d
        from={from}
        to={to}
        fill={fillHex}
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
      fill={fillHex}
      opacity={fillOpacity}
      cornerRadius={kind === 'building' ? 12 : 22}
      stroke={{
        color: stroke,
        width: locked ? 3 : kind === 'building' ? 2 : 1
      }}
    />
  );
};
