import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import {
  MARKDOWN_EMPTY_VALUE,
  TILE_SIZE_2D,
  getModelItemSize,
  isShape2dIcon,
  clampNodeLabelScale
} from 'src/config';
import { getShape2dCenterPosition, isPlanProjection } from 'src/utils';
import { ViewItem } from 'src/types';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useNodeDragStore } from 'src/stores/nodeDragStore';
import { useScene } from 'src/hooks/useScene';
import { ExpandableLabel } from 'src/components/Label/ExpandableLabel';
import { MarkdownEditor } from 'src/components/MarkdownEditor/MarkdownEditor';

interface Props {
  nodes: ViewItem[];
}

const defaultStemOffset = (labelHeight: number) => {
  return {
    x: Math.round(labelHeight * 0.85),
    y: -labelHeight
  };
};

/**
 * Plan-view description callouts rendered above the interaction overlay
 * so they stay visible and can be dragged.
 */
export const NodeDescriptionLabels = ({ nodes }: Props) => {
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });
  const editorMode = useUiStateStore((state) => {
    return state.editorMode;
  });
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const { updateViewItem } = useScene();
  const liveTiles = useNodeDragStore((state) => {
    return state.tiles;
  });

  const [liveOffsets, setLiveOffsets] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const dragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    origin: { x: number; y: number };
  } | null>(null);
  const liveDragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const canDrag = editorMode === 'EDITABLE';

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = {
        x: drag.origin.x + (event.clientX - drag.startClientX) / zoom,
        y: drag.origin.y + (event.clientY - drag.startClientY) / zoom
      };
      liveDragOffsetRef.current = next;
      setLiveOffsets((prev) => {
        return { ...prev, [drag.id]: next };
      });
    };

    const onUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      const finalOffset = liveDragOffsetRef.current ?? drag.origin;
      dragRef.current = null;
      liveDragOffsetRef.current = null;
      updateViewItem(drag.id, { labelOffset: finalOffset });
      setLiveOffsets((prev) => {
        const { [drag.id]: _removed, ...rest } = prev;
        return rest;
      });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [zoom, updateViewItem]);

  const entries = useMemo(() => {
    if (!isPlanProjection(projectionMode)) return [];

    return nodes.flatMap((node) => {
      const modelItem = modelItems.find((item) => {
        return item.id === node.id;
      });
      if (!modelItem || !isShape2dIcon(modelItem.icon)) return [];

      const description =
        modelItem.description &&
        modelItem.description !== MARKDOWN_EMPTY_VALUE
          ? modelItem.description
          : null;
      if (!description) return [];
      if (node.showDescriptionLabel === false) return [];

      const shapeSize = getModelItemSize(modelItem);
      const tile = liveTiles[node.id] ?? node.tile;
      const position = getShape2dCenterPosition(
        tile,
        shapeSize ?? { width: 1, height: 1 }
      );
      const labelAnchorBottom = shapeSize
        ? (shapeSize.height * TILE_SIZE_2D) / 2
        : TILE_SIZE_2D / 2;
      const labelScale = clampNodeLabelScale(node.labelScale);
      const labelStemHeight = node.labelHeight ?? 140;
      const stemOffset =
        liveOffsets[node.id] ??
        node.labelOffset ??
        defaultStemOffset(labelStemHeight);

      return [
        {
          node,
          modelItem,
          description,
          position,
          labelAnchorBottom,
          labelScale,
          stemOffset
        }
      ];
    });
  }, [projectionMode, nodes, modelItems, liveTiles, liveOffsets]);

  const onLabelMouseDown = useCallback(
    (nodeId: string, stemOffset: { x: number; y: number }) => {
      return (event: React.MouseEvent) => {
        if (!canDrag) return;
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        dragRef.current = {
          id: nodeId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          origin: stemOffset
        };
        liveDragOffsetRef.current = stemOffset;
        setLiveOffsets((prev) => {
          return { ...prev, [nodeId]: stemOffset };
        });
      };
    },
    [canDrag]
  );

  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(
        ({
          node,
          modelItem,
          description,
          position,
          labelAnchorBottom,
          labelScale,
          stemOffset
        }) => {
          const titleFontSize = Math.round(5.5 * labelScale + 2);
          const bodyFontSize = Math.round(4.5 * labelScale + 2);
          const labelMaxWidth = Math.round(140 * labelScale);
          const labelCollapsedHeight = Math.round(55 * labelScale);

          return (
            <Box
              key={`desc-${node.id}`}
              sx={{
                position: 'absolute',
                left: position.x,
                top: position.y,
                zIndex: 1,
                pointerEvents: 'none'
              }}
            >
              <Box sx={{ position: 'absolute', bottom: labelAnchorBottom }}>
                <ExpandableLabel
                  maxWidth={labelMaxWidth}
                  expandDirection="BOTTOM"
                  stemDirection="diagonal"
                  stemOffset={stemOffset}
                  labelHeight={Math.max(
                    1,
                    Math.round(Math.hypot(stemOffset.x, stemOffset.y))
                  )}
                  collapsedMaxHeight={labelCollapsedHeight}
                  interactive={canDrag}
                  onMouseDown={onLabelMouseDown(node.id, stemOffset)}
                >
                  <Stack spacing={1.25}>
                    {modelItem.name && (
                      <Typography
                        fontWeight={700}
                        sx={{ fontSize: titleFontSize, lineHeight: 1.25 }}
                      >
                        {modelItem.name}
                      </Typography>
                    )}
                    <MarkdownEditor
                      value={description}
                      readOnly
                      styles={{
                        fontSize: bodyFontSize,
                        lineHeight: 1.4
                      }}
                    />
                  </Stack>
                </ExpandableLabel>
              </Box>
            </Box>
          );
        }
      )}
    </>
  );
};
