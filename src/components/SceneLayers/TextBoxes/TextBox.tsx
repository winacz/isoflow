import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { toPx, CoordsUtils } from 'src/utils';
import { useIsoProjection } from 'src/hooks/useIsoProjection';
import { useTextBoxProps } from 'src/hooks/useTextBoxProps';
import { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { isPlanProjection } from 'src/utils/projection';
import { TILE_SIZE_2D } from 'src/config';

interface Props {
  textBox: ReturnType<typeof useScene>['textBoxes'][0];
}

export const TextBox = ({ textBox }: Props) => {
  const { paddingX, fontProps } = useTextBoxProps(textBox);

  const to = useMemo(() => {
    return CoordsUtils.add(textBox.tile, {
      x: textBox.size.width,
      y: 0
    });
  }, [textBox.tile, textBox.size.width]);

  const projectionMode = useUiStateStore((state) => state.projectionMode);
  const isTwoD = isPlanProjection(projectionMode);

  const { css } = useIsoProjection({
    from: textBox.tile,
    to,
    orientation: textBox.orientation
  });

  const css2d = useMemo(() => {
    return {
      position: 'absolute' as const,
      left: textBox.tile.x * TILE_SIZE_2D,
      top: textBox.tile.y * TILE_SIZE_2D,
      width: `${textBox.size.width * TILE_SIZE_2D}px`,
      height: `${TILE_SIZE_2D}px`,
      transform: textBox.orientation === 'Y' ? 'rotate(90deg)' : 'none',
      transformOrigin: 'top left'
    };
  }, [textBox]);

  const activeCss = isTwoD ? css2d : css;

  return (
    <Box style={activeCss}>
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          px: toPx(paddingX)
        }}
      >
        <Typography
          sx={{
            ...fontProps,
            width: '100%'
          }}
        >
          {textBox.content}
        </Typography>
      </Box>
    </Box>
  );
};
