import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { Coords, ModelItem } from 'src/types';
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
  /** Duplicate preview — mirrors source ports / color / name. */
  draftModelItem?: ModelItem | null;
}

export const DragAndDrop = ({ iconId, tile, draftModelItem }: Props) => {
  const { iconComponent } = useIcon(
    iconId,
    draftModelItem?.name,
    draftModelItem?.ports,
    undefined,
    draftModelItem?.color,
    undefined,
    undefined,
    draftModelItem?.svis,
    draftModelItem?.rackUnits ??
      (iconId === SHAPE_2D_BLANKING_ID ? BLANKING_DEFAULT_UNITS : undefined),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    Boolean(draftModelItem?.poweredByPoe)
  );
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });

  const tilePosition = useMemo(() => {
    if (projectionMode === 'TWO_D') {
      const size =
        (draftModelItem
          ? getModelItemSize(draftModelItem)
          : iconId === SHAPE_2D_BLANKING_ID || iconId === SHAPE_2D_PATCH_PANEL_ID
            ? getModelItemSize({
                icon: iconId,
                rackUnits: BLANKING_DEFAULT_UNITS
              })
            : getShape2dSize(iconId)) ?? { width: 1, height: 1 };
      const origin = getShape2dPlacementTile(tile, size);

      return getShape2dCenterPosition(origin, size);
    }

    return getTilePosition({ tile, origin: 'BOTTOM' });
  }, [tile, projectionMode, iconId, draftModelItem]);

  return (
    <Box
      sx={{
        position: 'absolute',
        opacity: 0.92,
        filter: 'drop-shadow(0 4px 10px rgba(15,23,42,0.28))',
        pointerEvents: 'none'
      }}
      style={{ left: tilePosition.x, top: tilePosition.y }}
    >
      {iconComponent}
    </Box>
  );
};
