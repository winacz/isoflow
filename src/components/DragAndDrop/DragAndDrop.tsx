import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { Coords } from 'src/types';
import {
  getTilePosition,
  getShape2dCenterPosition,
  getShape2dPlacementTile
} from 'src/utils';
import { useIcon } from 'src/hooks/useIcon';
import { useUiStateStore } from 'src/stores/uiStateStore';
import {
  getModelItemSize,
  getShape2dSize,
  SHAPE_2D_BLANKING_ID,
  SHAPE_2D_PATCH_PANEL_ID,
  BLANKING_DEFAULT_UNITS
} from 'src/config';

interface Props {
  iconId: string;
  tile: Coords;
}

export const DragAndDrop = ({ iconId, tile }: Props) => {
  const { iconComponent } = useIcon(
    iconId,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    iconId === SHAPE_2D_BLANKING_ID ? BLANKING_DEFAULT_UNITS : undefined
  );
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });

  const tilePosition = useMemo(() => {
    if (projectionMode === 'TWO_D') {
      const size =
        (iconId === SHAPE_2D_BLANKING_ID || iconId === SHAPE_2D_PATCH_PANEL_ID
          ? getModelItemSize({
              icon: iconId,
              rackUnits: BLANKING_DEFAULT_UNITS
            })
          : getShape2dSize(iconId)) ?? { width: 1, height: 1 };
      const origin = getShape2dPlacementTile(tile, size);

      return getShape2dCenterPosition(origin, size);
    }

    return getTilePosition({ tile, origin: 'BOTTOM' });
  }, [tile, projectionMode, iconId]);

  return (
    <Box
      sx={{
        position: 'absolute'
      }}
      style={{ left: tilePosition.x, top: tilePosition.y }}
    >
      {iconComponent}
    </Box>
  );
};
