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
import { getShape2dSize } from 'src/config';

interface Props {
  iconId: string;
  tile: Coords;
}

export const DragAndDrop = ({ iconId, tile }: Props) => {
  const { iconComponent } = useIcon(iconId);
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });

  const tilePosition = useMemo(() => {
    if (projectionMode === 'TWO_D') {
      const size = getShape2dSize(iconId) ?? { width: 1, height: 1 };
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
