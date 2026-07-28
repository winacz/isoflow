import { useMemo } from 'react';
import { TextBox } from 'src/types';
import {
  UNPROJECTED_TILE_SIZE,
  DEFAULT_FONT_FAMILY,
  TEXTBOX_DEFAULTS,
  TEXTBOX_FONT_WEIGHT,
  TEXTBOX_PADDING
} from 'src/config';
import { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { isPlanProjection } from 'src/utils';

export const useTextBoxProps = (textBox: TextBox) => {
  const { colors } = useScene();
  const projectionMode = useUiStateStore((state) => state.projectionMode);
  const isTwoD = isPlanProjection(projectionMode);
  
  const fontProps = useMemo(() => {
    const colorHex = colors.find(c => c.id === textBox.color)?.value ?? TEXTBOX_DEFAULTS.color;
    const scale = isTwoD ? 40 : UNPROJECTED_TILE_SIZE; // Use TILE_SIZE_2D (40) roughly for 2D mode
    return {
      fontSize: scale * (textBox.fontSize ?? TEXTBOX_DEFAULTS.fontSize),
      fontFamily: textBox.fontFamily ?? TEXTBOX_DEFAULTS.fontFamily,
      fontWeight: textBox.fontWeight ?? TEXTBOX_DEFAULTS.fontWeight,
      textAlign: (textBox.textAlign ?? TEXTBOX_DEFAULTS.textAlign) as 'left' | 'center' | 'right',
      color: colorHex
    };
  }, [
    textBox.fontSize,
    textBox.fontFamily,
    textBox.fontWeight,
    textBox.textAlign,
    textBox.color,
    colors
  ]);

  const paddingX = useMemo(() => {
    const scale = isTwoD ? 40 : UNPROJECTED_TILE_SIZE;
    return scale * TEXTBOX_PADDING;
  }, [isTwoD]);

  return { paddingX, fontProps };
};
