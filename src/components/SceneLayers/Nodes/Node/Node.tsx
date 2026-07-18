import React, { useMemo } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import {
  PROJECTED_TILE_SIZE,
  DEFAULT_LABEL_HEIGHT,
  MARKDOWN_EMPTY_VALUE,
  getShape2dSize,
  isShape2dIcon
} from 'src/config';
import { getTilePosition, getShape2dCenterPosition } from 'src/utils';
import { useIcon } from 'src/hooks/useIcon';
import { ViewItem } from 'src/types';
import { useModelItem } from 'src/hooks/useModelItem';
import { ExpandableLabel } from 'src/components/Label/ExpandableLabel';
import { MarkdownEditor } from 'src/components/MarkdownEditor/MarkdownEditor';
import { useUiStateStore } from 'src/stores/uiStateStore';

interface Props {
  node: ViewItem;
  order: number;
  /** 2D: emphasize endpoints of the selected connector */
  selectionTone?: 'normal' | 'highlighted' | 'dimmed';
}

export const Node = ({ node, order, selectionTone = 'normal' }: Props) => {
  const modelItem = useModelItem(node.id);
  const { iconComponent } = useIcon(modelItem.icon, modelItem.name);
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });

  const isTwoD = projectionMode === 'TWO_D';
  const isPlanShape = isShape2dIcon(modelItem.icon);
  const shapeSize = modelItem.icon ? getShape2dSize(modelItem.icon) : null;

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
        opacity: selectionTone === 'dimmed' ? 0.35 : 1,
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
