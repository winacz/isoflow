import React, { useMemo } from 'react';
import chroma from 'chroma-js';
import { Box, useTheme } from '@mui/material';
import { IsoTileArea } from 'src/components/IsoTileArea/IsoTileArea';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useScene } from 'src/hooks/useScene';
import {
  getNearestShape2dPort,
  getShape2dCenterPosition,
  getShape2dPlacementTile,
  getTilePosition2d,
  isShape2dPortUnavailable,
  isPlanProjection,
  SHAPE_2D_PORT_SNAP_DISTANCE
} from 'src/utils';
import { TILE_SIZE_2D, getShape2dSize } from 'src/config';

export const Cursor = () => {
  const theme = useTheme();
  // Primitive key — the tile object is recreated on every mouse event,
  // which would re-render the cursor even when it stays on the same tile.
  const tileKey = useUiStateStore((state) => {
    const { tile: t } = state.mouse.position;
    return `${t.x},${t.y}`;
  });
  const tile = useMemo(() => {
    const [x, y] = tileKey.split(',');
    return { x: Number(x), y: Number(y) };
  }, [tileKey]);
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const scene = useScene();
  const modelItems = useModelStore((state) => {
    return state.items;
  });

  const isConnectorMode = mode.type === 'CONNECTOR';
  const cursorColor = isConnectorMode
    ? theme.palette.common.black
    : theme.palette.primary.main;
  const fill = chroma(cursorColor).alpha(isConnectorMode ? 0.2 : 0.35).css();

  const placingShapeId =
    mode.type === 'PLACE_ICON' && mode.id ? mode.id : null;
  const placingSize = placingShapeId
    ? getShape2dSize(placingShapeId)
    : null;

  const snappedPort = useMemo(() => {
    if (!isPlanProjection(projectionMode) || !isConnectorMode || placingSize) {
      return null;
    }

    const excludeConnectorId =
      mode.type === 'CONNECTOR' ? mode.id : null;

    return getNearestShape2dPort({
      tile,
      scene,
      modelItems,
      maxDistance: SHAPE_2D_PORT_SNAP_DISTANCE,
      isPortAvailable: (hit) => {
        return !isShape2dPortUnavailable({
          itemId: hit.itemId,
          portId: hit.portId,
          connectors: scene.currentView.connectors ?? [],
          modelItems,
          viewItems: scene.items,
          excludeConnectorId
        });
      }
    });
  }, [
    projectionMode,
    isConnectorMode,
    placingSize,
    tile,
    scene,
    modelItems,
    mode
  ]);

  const displayTile = snappedPort?.worldTile ?? tile;

  const twoDCursor = useMemo(() => {
    if (placingSize) {
      const origin = getShape2dPlacementTile(tile, placingSize);
      const center = getShape2dCenterPosition(origin, placingSize);

      return {
        left: center.x,
        top: center.y,
        width: placingSize.width * TILE_SIZE_2D,
        height: placingSize.height * TILE_SIZE_2D
      };
    }

    const center = getTilePosition2d({ tile: displayTile, origin: 'CENTER' });

    return {
      left: center.x,
      top: center.y,
      width: TILE_SIZE_2D,
      height: TILE_SIZE_2D
    };
  }, [tile, displayTile, placingSize]);

  if (isPlanProjection(projectionMode)) {
    if (isConnectorMode && !placingSize) {
      const arm = TILE_SIZE_2D * 0.42;
      const gap = TILE_SIZE_2D * 0.12;

      return (
        <Box
          sx={{
            position: 'absolute',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            width: TILE_SIZE_2D,
            height: TILE_SIZE_2D,
            zIndex: 5
          }}
          style={{
            left: twoDCursor.left,
            top: twoDCursor.top
          }}
        >
          {/* Vertical arms */}
          <Box
            sx={{
              position: 'absolute',
              left: '50%',
              top: `calc(50% - ${arm}px)`,
              width: 2,
              height: arm - gap,
              bgcolor: cursorColor,
              transform: 'translateX(-50%)'
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              left: '50%',
              top: `calc(50% + ${gap}px)`,
              width: 2,
              height: arm - gap,
              bgcolor: cursorColor,
              transform: 'translateX(-50%)'
            }}
          />
          {/* Horizontal arms */}
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: `calc(50% - ${arm}px)`,
              height: 2,
              width: arm - gap,
              bgcolor: cursorColor,
              transform: 'translateY(-50%)'
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: `calc(50% + ${gap}px)`,
              height: 2,
              width: arm - gap,
              bgcolor: cursorColor,
              transform: 'translateY(-50%)'
            }}
          />
          {/* Center ring — filled when snapped to a port */}
          <Box
            sx={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: snappedPort ? 12 : 8,
              height: snappedPort ? 12 : 8,
              border: `2px solid ${cursorColor}`,
              borderRadius: '50%',
              bgcolor: snappedPort
                ? chroma(cursorColor).alpha(0.25).css()
                : 'transparent',
              transform: 'translate(-50%, -50%)',
              boxSizing: 'border-box'
            }}
          />
        </Box>
      );
    }

    return (
      <Box
        sx={{
          position: 'absolute',
          bgcolor: fill,
          border: `1px solid ${cursorColor}`,
          borderRadius: placingSize ? 1 : `${4 * zoom}px`,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          boxSizing: 'border-box'
        }}
        style={{
          left: twoDCursor.left,
          top: twoDCursor.top,
          width: twoDCursor.width,
          height: twoDCursor.height
        }}
      />
    );
  }

  return (
    <IsoTileArea
      from={displayTile}
      to={displayTile}
      fill={chroma(cursorColor).alpha(0.5).css()}
      cornerRadius={10 * zoom}
    />
  );
};
