import React, { useMemo } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import {
  PROJECTED_TILE_SIZE,
  DEFAULT_LABEL_HEIGHT,
  MARKDOWN_EMPTY_VALUE,
  getModelItemSize,
  isShape2dIcon
} from 'src/config';
import { getTilePosition, getShape2dCenterPosition, getMismatchPortIdsForItem, getPeerHighlightedPortIdsForItem } from 'src/utils';
import { useIcon } from 'src/hooks/useIcon';
import { ViewItem } from 'src/types';
import { useModelItem } from 'src/hooks/useModelItem';
import { useScene } from 'src/hooks/useScene';
import { ExpandableLabel } from 'src/components/Label/ExpandableLabel';
import { MarkdownEditor } from 'src/components/MarkdownEditor/MarkdownEditor';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';

interface Props {
  node: ViewItem;
  order: number;
  /** 2D: emphasize endpoints of the selected connector */
  selectionTone?: 'normal' | 'highlighted' | 'dimmed';
  /** Opacity used when selectionTone is dimmed (softer while dragging). */
  dimmedOpacity?: number;
}

export const Node = ({
  node,
  order,
  selectionTone = 'normal',
  dimmedOpacity = 0.7
}: Props) => {
  const modelItem = useModelItem(node.id);
  const { connectors } = useScene();
  const modelItems = useModelStore((state) => {
    return state.items;
  });

  const connectedPortIds = useMemo(() => {
    const ids = new Set<string>();

    connectors.forEach((connector) => {
      connector.anchors.forEach((anchor) => {
        if (anchor.ref.item === node.id && anchor.ref.port) {
          ids.add(anchor.ref.port);
        }
      });
    });

    return ids;
  }, [connectors, node.id]);

  const mismatchPortIds = useMemo(() => {
    return getMismatchPortIdsForItem({
      itemId: node.id,
      connectors,
      modelItems
    });
  }, [connectors, modelItems, node.id]);

  const focusedPortIds = useUiStateStore((state) => {
    return state.focusedPortIds;
  });
  const itemControls = useUiStateStore((state) => {
    return state.itemControls;
  });
  const selectedItemId =
    itemControls?.type === 'ITEM' ? itemControls.id : null;
  const nodeFocusedPortIds =
    selectedItemId === node.id ? focusedPortIds : null;

  const peerHighlightPortIds = useMemo(() => {
    return getPeerHighlightedPortIdsForItem({
      itemId: node.id,
      selectedItemId,
      focusedPortIds: selectedItemId ? focusedPortIds : null,
      connectors
    });
  }, [node.id, selectedItemId, focusedPortIds, connectors]);

  const { iconComponent } = useIcon(
    modelItem.icon,
    modelItem.name,
    modelItem.ports,
    connectedPortIds,
    modelItem.color,
    mismatchPortIds,
    nodeFocusedPortIds,
    modelItem.svis,
    modelItem.rackUnits,
    node.id,
    peerHighlightPortIds
  );
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });

  const isTwoD = projectionMode === 'TWO_D';
  const isPlanShape = isShape2dIcon(modelItem.icon);
  const shapeSize = getModelItemSize(modelItem);

  const position = useMemo(() => {
    if (isTwoD && shapeSize) {
      return getShape2dCenterPosition(node.tile, shapeSize);
    }

    if (isTwoD) {
      return getShape2dCenterPosition(node.tile, { width: 1, height: 1 });
    }

    return getTilePosition({
      tile: node.tile,
      origin: 'BOTTOM'
    });
  }, [node.tile, isTwoD, shapeSize]);

  const description = useMemo(() => {
    if (
      modelItem.description === undefined ||
      modelItem.description === MARKDOWN_EMPTY_VALUE
    )
      return null;

    return modelItem.description;
  }, [modelItem.description]);

  const showFloatingLabel = !isPlanShape && (modelItem.name || description);

  return (
    <Box
      sx={{
        position: 'absolute',
        zIndex: order,
        opacity: selectionTone === 'dimmed' ? dimmedOpacity : 1,
        filter:
          selectionTone === 'highlighted'
            ? 'drop-shadow(0 0 6px rgba(37, 99, 235, 0.65)) drop-shadow(0 2px 6px rgba(37, 99, 235, 0.4))'
            : undefined,
        transition: 'opacity 0.15s ease, filter 0.15s ease'
      }}
    >
      <Box
        sx={{ position: 'absolute' }}
        style={{
          left: position.x,
          top: position.y
        }}
      >
        {showFloatingLabel && (
          <Box
            sx={{ position: 'absolute' }}
            style={{
              bottom: PROJECTED_TILE_SIZE.height / 2
            }}
          >
            <ExpandableLabel
              maxWidth={250}
              expandDirection="BOTTOM"
              labelHeight={node.labelHeight ?? DEFAULT_LABEL_HEIGHT}
            >
              <Stack spacing={1}>
                {modelItem.name && (
                  <Typography fontWeight={600}>{modelItem.name}</Typography>
                )}
                {modelItem.description &&
                  modelItem.description !== MARKDOWN_EMPTY_VALUE && (
                    <MarkdownEditor value={modelItem.description} readOnly />
                  )}
              </Stack>
            </ExpandableLabel>
          </Box>
        )}
        {iconComponent && (
          <Box
            sx={{
              position: 'absolute',
              pointerEvents: 'none'
            }}
          >
            {iconComponent}
          </Box>
        )}
      </Box>
    </Box>
  );
};
