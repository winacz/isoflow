import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import {
  TILE_SIZE_2D,
  getModelItemSize,
  isShape2dIcon,
  MARKDOWN_EMPTY_VALUE,
  clampNodeLabelScale
} from 'src/config';
import {
  getDescriptionSummary,
  getDescriptionTitle,
  getShape2dCenterPosition,
  hasNodeDescriptionBadge,
  hasNodeDescriptionNotes,
  isPlanProjection
} from 'src/utils';
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

/** Same card width as isometric `IsoNodeLabels`. */
const PLAN_LABEL_MAX_WIDTH = 250;

const defaultStemOffset = (labelHeight: number) => {
  return {
    x: Math.round(labelHeight * 0.85),
    y: -labelHeight
  };
};

interface PlanBadgeProps {
  nodeId: string;
  title: string;
  summary: string;
  description: string | null;
  hasNotes: boolean;
  labelScale: number;
  position: { x: number; y: number };
  labelAnchorBottom: number;
  stemOffset: { x: number; y: number };
  canDrag: boolean;
  onLabelMouseDown: (
    nodeId: string,
    stemOffset: { x: number; y: number }
  ) => (event: React.MouseEvent) => void;
}

/**
 * Plan callout: isometric card style — title + skrót; expand → full markdown.
 * Size follows `labelScale` (default ×10).
 */
const PlanDescriptionBadge = ({
  nodeId,
  title,
  summary,
  description,
  hasNotes,
  labelScale,
  position,
  labelAnchorBottom,
  stemOffset,
  canDrag,
  onLabelMouseDown
}: PlanBadgeProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // World-space sizes for Plan zoom (×10 default). Width matches isometric.
  const titleFontSize = Math.round(5.5 * labelScale + 2);
  const bodyFontSize = Math.round(4.5 * labelScale + 2);
  const labelMaxWidth = PLAN_LABEL_MAX_WIDTH;
  const labelCollapsedHeight = Math.round(55 * labelScale);
  // Match isometric card padding proportions relative to text size.
  const padY = Math.max(8, Math.round(bodyFontSize * 0.55));
  const padX = Math.max(10, Math.round(bodyFontSize * 0.7));

  return (
    <Box
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
          forceExpandControl={hasNotes}
          onToggleExpand={setIsExpanded}
          onMouseDown={onLabelMouseDown(nodeId, stemOffset)}
          sx={{
            py: `${padY}px`,
            px: `${padX}px`
          }}
        >
          <Stack
            spacing={0}
            sx={{
              gap: `${Math.max(6, Math.round(bodyFontSize * 0.35))}px`,
              width: '100%',
              minWidth: 0
            }}
          >
            {title ? (
              <Typography
                fontWeight={700}
                sx={{
                  fontSize: titleFontSize,
                  lineHeight: 1.25,
                  width: '100%',
                  whiteSpace: 'normal',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word'
                }}
              >
                {title}
              </Typography>
            ) : null}
            {isExpanded && description ? (
              <MarkdownEditor
                value={description}
                readOnly
                styles={{
                  fontSize: bodyFontSize,
                  lineHeight: 1.4,
                  width: '100%'
                }}
              />
            ) : summary ? (
              <Typography
                sx={{
                  fontSize: bodyFontSize,
                  lineHeight: 1.4,
                  color: 'text.secondary',
                  width: '100%',
                  whiteSpace: 'normal',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word'
                }}
              >
                {summary}
              </Typography>
            ) : null}
          </Stack>
        </ExpandableLabel>
      </Box>
    </Box>
  );
};

/**
 * Plan-view description callouts above the interaction overlay.
 * Same card style as isometric; body = Skrót until expanded → full Opis.
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
      if (!hasNodeDescriptionBadge(modelItem)) return [];
      if (node.showDescriptionLabel === false) return [];

      const title = getDescriptionTitle(modelItem);
      const summary = getDescriptionSummary(modelItem);
      const hasNotes = hasNodeDescriptionNotes(modelItem);
      const description =
        hasNotes &&
        modelItem.description &&
        modelItem.description !== MARKDOWN_EMPTY_VALUE
          ? modelItem.description
          : null;

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
          title,
          summary,
          description,
          hasNotes,
          labelScale,
          position,
          labelAnchorBottom,
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
          title,
          summary,
          description,
          hasNotes,
          labelScale,
          position,
          labelAnchorBottom,
          stemOffset
        }) => {
          return (
            <PlanDescriptionBadge
              key={`desc-${node.id}`}
              nodeId={node.id}
              title={title}
              summary={summary}
              description={description}
              hasNotes={hasNotes}
              labelScale={labelScale}
              position={position}
              labelAnchorBottom={labelAnchorBottom}
              stemOffset={stemOffset}
              canDrag={canDrag}
              onLabelMouseDown={onLabelMouseDown}
            />
          );
        }
      )}
    </>
  );
};
