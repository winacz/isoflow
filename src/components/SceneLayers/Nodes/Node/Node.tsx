import React, { useMemo } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import {
  PROJECTED_TILE_SIZE,
  DEFAULT_LABEL_HEIGHT,
  MARKDOWN_EMPTY_VALUE,
  TILE_SIZE_2D,
  getModelItemSize,
  isShape2dIcon
} from 'src/config';
import { getTilePosition, getShape2dCenterPosition, getMismatchPortIdsForItem, getPeerHighlightedPortIdsForItem, isPlanProjection, findPlanView } from 'src/utils';
import { useIcon } from 'src/hooks/useIcon';
import { ViewItem } from 'src/types';
import { useModelItem } from 'src/hooks/useModelItem';
import { useScene } from 'src/hooks/useScene';
import { ExpandableLabel } from 'src/components/Label/ExpandableLabel';
import { MarkdownEditor } from 'src/components/MarkdownEditor/MarkdownEditor';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useNodeDragStore } from 'src/stores/nodeDragStore';

interface Props {
  node: ViewItem;
  order: number;
  /** 2D: emphasize endpoints of the selected connector */
  selectionTone?: 'normal' | 'highlighted' | 'dimmed';
  /** Opacity used when selectionTone is dimmed (softer while dragging). */
  dimmedOpacity?: number;
}

export const Node = React.memo(({
  node,
  order,
  selectionTone = 'normal',
  dimmedOpacity = 0.7
}: Props) => {
  const modelItem = useModelItem(node.id);
  const { connectors: sceneConnectors } = useScene();
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const views = useModelStore((state) => {
    return state.views;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });

  // 2Dv2 has no cables of its own — port link state comes from Plan connectors.
  const connectors = useMemo(() => {
    if (projectionMode === 'TWO_D_V2') {
      return findPlanView(views)?.connectors ?? [];
    }
    return sceneConnectors;
  }, [projectionMode, views, sceneConnectors]);

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

  const portAttention = useUiStateStore((state) => {
    return state.portAttention;
  });
  const attentionPortId =
    portAttention?.itemId === node.id ? portAttention.portId : null;
  const attentionToken =
    portAttention?.itemId === node.id ? portAttention.token : null;

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
    peerHighlightPortIds,
    attentionPortId,
    attentionToken
  );
  const liveTile = useNodeDragStore((state) => {
    return state.tiles[node.id];
  });

  const isTwoD = isPlanProjection(projectionMode);
  const isPlanShape = isShape2dIcon(modelItem.icon);
  const shapeSize = getModelItemSize(modelItem);
  const tile = liveTile ?? node.tile;

  const position = useMemo(() => {
    if (isTwoD && shapeSize) {
      return getShape2dCenterPosition(tile, shapeSize);
    }

    if (isTwoD) {
      return getShape2dCenterPosition(tile, { width: 1, height: 1 });
    }

    return getTilePosition({
      tile,
      origin: 'BOTTOM'
    });
  }, [tile, isTwoD, shapeSize]);

  const description = useMemo(() => {
    if (
      modelItem.description === undefined ||
      modelItem.description === MARKDOWN_EMPTY_VALUE
    )
      return null;

    return modelItem.description;
  }, [modelItem.description]);

  // Iso icons: name/description float above the sprite.
  // 2D plan shapes already show the name on the chassis — only float a
  // description card (same ExpandableLabel UX as isometric).
  const showFloatingLabel = isPlanShape
    ? Boolean(description)
    : Boolean(modelItem.name || description);

  const labelAnchorBottom =
    isPlanShape && shapeSize
      ? (shapeSize.height * TILE_SIZE_2D) / 2
      : PROJECTED_TILE_SIZE.height / 2;

  const labelScale = isPlanShape
    ? Math.min(10, Math.max(3, node.labelScale ?? 3))
    : 1;
  const labelMaxWidth = isPlanShape
    ? Math.round(140 * labelScale)
    : 250;
  const labelCollapsedHeight = isPlanShape
    ? Math.round(55 * labelScale)
    : 80;
  const labelStemHeight =
    node.labelHeight ?? (isPlanShape ? 140 : DEFAULT_LABEL_HEIGHT);
  const titleFontSize = isPlanShape
    ? Math.round(5.5 * labelScale + 2)
    : undefined;
  const bodyFontSize = isPlanShape
    ? Math.round(4.5 * labelScale + 2)
    : undefined;

  return (
    <Box
      sx={{
        position: 'absolute',
        zIndex: order,
        opacity: selectionTone === 'dimmed' ? dimmedOpacity : 1,
        filter: node.locked
          ? 'drop-shadow(0 0 5px rgba(234, 88, 12, 0.75))'
          : selectionTone === 'highlighted'
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
              bottom: labelAnchorBottom
            }}
          >
            <ExpandableLabel
              maxWidth={labelMaxWidth}
              expandDirection="BOTTOM"
              stemDirection={isPlanShape ? 'diagonal' : 'vertical'}
              labelHeight={labelStemHeight}
              collapsedMaxHeight={labelCollapsedHeight}
            >
              <Stack spacing={isPlanShape ? 1.25 : 1}>
                {modelItem.name && (
                  <Typography
                    fontWeight={700}
                    sx={
                      titleFontSize
                        ? { fontSize: titleFontSize, lineHeight: 1.25 }
                        : undefined
                    }
                  >
                    {modelItem.name}
                  </Typography>
                )}
                {description && (
                  <MarkdownEditor
                    value={description}
                    readOnly
                    styles={
                      bodyFontSize
                        ? {
                            fontSize: bodyFontSize,
                            lineHeight: 1.4
                          }
                        : undefined
                    }
                  />
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
});
Node.displayName = 'Node';
