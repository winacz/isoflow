import React, { useCallback, useMemo, useRef } from 'react';
import { Box, Link, Typography, Stack } from '@mui/material';
import {
  PROJECTED_TILE_SIZE,
  DEFAULT_LABEL_HEIGHT,
  MARKDOWN_EMPTY_VALUE
} from 'src/config';
import {
  CoordsUtils,
  getPortalDisplayLabel,
  getTilePosition,
  hasNodeDescriptionNotes,
  isPlanProjection,
  planPortalJump,
  projectionModeForKind,
  inferViewKind
} from 'src/utils';
import { ViewItem } from 'src/types';
import { useModelStore, useModelStoreApi } from 'src/stores/modelStore';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useNodeDragStore } from 'src/stores/nodeDragStore';
import { useView } from 'src/hooks/useView';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { ExpandableLabel } from 'src/components/Label/ExpandableLabel';
import { MarkdownEditor } from 'src/components/MarkdownEditor/MarkdownEditor';

interface Props {
  nodes: ViewItem[];
}

/**
 * Isometric floating labels above the interaction overlay (so portal links
 * stay clickable). Classic style: name + portal + markdown description.
 */
export const IsoNodeLabels = ({ nodes }: Props) => {
  const projectionMode = useUiStateStore((state) => state.projectionMode);
  const uiStateActions = useUiStateStore((state) => state.actions);
  const uiStateStoreApi = useUiStateStoreApi();
  const rendererEl = useUiStateStore((state) => state.rendererEl);
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const modelItems = useModelStore((state) => state.items);
  const modelStoreApi = useModelStoreApi();
  const liveTiles = useNodeDragStore((state) => state.tiles);
  const { changeView } = useView();

  const rendererSizeRef = useRef(rendererSize);
  rendererSizeRef.current = rendererSize;

  const entries = useMemo(() => {
    if (isPlanProjection(projectionMode)) return [];

    return nodes.flatMap((node) => {
      const modelItem = modelItems.find((item) => item.id === node.id);
      if (!modelItem) return [];

      const description =
        modelItem.description &&
        modelItem.description !== MARKDOWN_EMPTY_VALUE
          ? modelItem.description
          : null;
      const hasNotes = hasNodeDescriptionNotes(modelItem);
      const portal = modelItem.portal;
      const portalLabel = portal
        ? getPortalDisplayLabel(portal, modelStoreApi.getState())
        : null;

      if (!modelItem.name && !portalLabel && !hasNotes) return [];

      const tile = liveTiles[node.id] ?? node.tile;
      const position = getTilePosition({ tile, origin: 'BOTTOM' });
      const labelStemHeight = node.labelHeight ?? DEFAULT_LABEL_HEIGHT;

      return [
        {
          node,
          modelItem,
          position,
          portalLabel,
          description,
          labelStemHeight
        }
      ];
    });
  }, [projectionMode, nodes, modelItems, liveTiles, modelStoreApi]);

  const onPortalClick = useCallback(
    (nodeId: string) => {
      return (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const modelItem = modelItems.find((item) => item.id === nodeId);
        const portal = modelItem?.portal;
        if (!portal) return;

        uiStateActions.setPortPipHover(null);

        const model = modelStoreApi.getState();
        const jump = planPortalJump({
          portal,
          model,
          rendererSize: rendererSizeRef.current
        });
        if (!jump) return;

        changeView(jump.planViewId, model);
        const targetView = model.views.find(
          (view) => view.id === jump.planViewId
        );
        const mode = targetView
          ? projectionModeForKind(inferViewKind(targetView))
          : 'TWO_D';
        uiStateActions.setProjectionMode(mode);
        uiStateActions.setZoom(jump.zoom);
        uiStateActions.setScroll({
          position: jump.scroll,
          offset: CoordsUtils.zero()
        });
        uiStateActions.setMode({
          type: 'CURSOR',
          showCursor: true,
          mousedownItem: null
        });
        uiStateActions.clearSelectedItemIds();

        if (jump.select?.type === 'ITEM') {
          uiStateActions.setItemControls({ type: 'ITEM', id: jump.select.id });
          uiStateActions.setSelectedItemIds([jump.select.id]);
        } else if (jump.select?.type === 'RECTANGLE') {
          uiStateActions.setItemControls({
            type: 'RECTANGLE',
            id: jump.select.id
          });
        }
      };
    },
    [modelItems, modelStoreApi, changeView, uiStateActions]
  );

  const onPortalMouseEnter = useCallback(
    (nodeId: string, portalLabel: string | null) => {
      return (event: React.MouseEvent) => {
        const modelItem = modelItems.find((item) => item.id === nodeId);
        const portal = modelItem?.portal;
        if (!portal) return;

        uiStateActions.setPortPipHover({
          hostItemId: nodeId,
          hostPortId: null,
          peerItemId: portal.targetType === 'ITEM' ? portal.targetId : null,
          peerPortId: null,
          peerRectangleId:
            portal.targetType === 'RECTANGLE' ? portal.targetId : null,
          title: portalLabel ?? undefined,
          screen: { x: event.clientX, y: event.clientY }
        });
      };
    },
    [modelItems, uiStateActions]
  );

  const onPortalMouseMove = useCallback(
    (nodeId: string) => {
      return (event: React.MouseEvent) => {
        const current = uiStateStoreApi.getState().portPipHover;
        if (!current || current.hostItemId !== nodeId) return;
        uiStateActions.setPortPipHover({
          ...current,
          screen: { x: event.clientX, y: event.clientY }
        });
      };
    },
    [uiStateActions, uiStateStoreApi]
  );

  const onPortalMouseLeave = useCallback(
    (nodeId: string) => {
      return () => {
        const current = uiStateStoreApi.getState().portPipHover;
        if (current?.hostItemId === nodeId && current.hostPortId == null) {
          uiStateActions.setPortPipHover(null);
        }
      };
    },
    [uiStateActions, uiStateStoreApi]
  );

  if (entries.length === 0) return null;

  const labelAnchorBottom = PROJECTED_TILE_SIZE.height / 2;

  return (
    <>
      {entries.map(
        ({
          node,
          modelItem,
          position,
          portalLabel,
          description,
          labelStemHeight
        }) => {
          return (
            <Box
              key={`iso-label-${node.id}`}
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
                  maxWidth={250}
                  expandDirection="BOTTOM"
                  stemDirection="vertical"
                  labelHeight={labelStemHeight}
                  collapsedMaxHeight={80}
                >
                  <Stack spacing={1}>
                    {modelItem.name && (
                      <Typography fontWeight={700}>{modelItem.name}</Typography>
                    )}
                    {portalLabel && (
                      <Link
                        component="button"
                        type="button"
                        underline="hover"
                        onClick={onPortalClick(node.id)}
                        onMouseEnter={onPortalMouseEnter(
                          node.id,
                          portalLabel
                        )}
                        onMouseMove={onPortalMouseMove(node.id)}
                        onMouseLeave={onPortalMouseLeave(node.id)}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                        sx={{
                          pointerEvents: 'auto',
                          alignSelf: 'flex-start',
                          fontSize: 12,
                          fontWeight: 600,
                          lineHeight: 1.2,
                          color: 'primary.main',
                          cursor: 'pointer',
                          textAlign: 'left',
                          border: 0,
                          background: 'none',
                          p: 0
                        }}
                      >
                        → {portalLabel}
                      </Link>
                    )}
                    {description && (
                      <MarkdownEditor value={description} readOnly />
                    )}
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
