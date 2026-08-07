import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { Box, Link, Typography, Stack } from '@mui/material';
import {
  PROJECTED_TILE_SIZE,
  DEFAULT_LABEL_HEIGHT,
  MARKDOWN_EMPTY_VALUE,
  TILE_SIZE_2D,
  getModelItemSize,
  isShape2dIcon,
  clampNodeLabelScale,
  SHAPE_2D_CABINET_ID
} from 'src/config';
import {
  getTilePosition,
  getShape2dCenterPosition,
  getMismatchPortIdsForItem,
  getPeerHighlightedPortIdsForItem,
  isPlanProjection,
  findPlanView,
  getPortalDisplayLabel,
  planPortalJump,
  getSinglePortNodeVlanBorderColor,
  hasPoePowerWarning,
  CoordsUtils
} from 'src/utils';
import { useIcon } from 'src/hooks/useIcon';
import { ViewItem } from 'src/types';
import { useModelItem } from 'src/hooks/useModelItem';
import { useScene } from 'src/hooks/useScene';
import { ExpandableLabel } from 'src/components/Label/ExpandableLabel';
import { MarkdownEditor } from 'src/components/MarkdownEditor/MarkdownEditor';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useNodeDragStore } from 'src/stores/nodeDragStore';
import { useView } from 'src/hooks/useView';
import { useResizeObserver } from 'src/hooks/useResizeObserver';

interface Props {
  node: ViewItem;
  order: number;
  /** 2D: emphasize endpoints of the selected connector */
  selectionTone?: 'normal' | 'highlighted' | 'dimmed';
  /** Opacity used when selectionTone is dimmed (softer while dragging). */
  dimmedOpacity?: number;
  /** Pixel translation so scaled highlighted nodes do not overlap. */
  repelOffset?: { x: number; y: number };
}

export const Node = React.memo(({
  node,
  order,
  selectionTone = 'normal',
  dimmedOpacity = 0.7,
  repelOffset
}: Props) => {
  const modelItem = useModelItem(node.id);
  const { connectors: sceneConnectors } = useScene();
  const model = useModelStore((state) => {
    return state;
  });
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const views = useModelStore((state) => {
    return state.views;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const uiStateStoreApi = useUiStateStoreApi();
  const rendererEl = useUiStateStore((state) => {
    return state.rendererEl;
  });
  const { size: rendererSize } = useResizeObserver(rendererEl);
  
  // Keep rendererSize in a ref so the subscription doesn't need to rebind or call getBoundingClientRect
  const rendererSizeRef = useRef(rendererSize);
  useEffect(() => {
    rendererSizeRef.current = rendererSize;
  }, [rendererSize]);

  const { changeView } = useView();

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
  const selectedItemIds = useUiStateStore((state) => {
    return state.selectedItemIds;
  });
  const nodeFocusedPortIds =
    selectedItemIds.includes(node.id) ? focusedPortIds : null;

  const peerHighlightPortIds = useMemo(() => {
    return getPeerHighlightedPortIdsForItem({
      itemId: node.id,
      selectedItemIds,
      focusedPortIds: selectedItemIds.length > 0 && selectedItemIds.includes(node.id) ? focusedPortIds : null,
      connectors
    });
  }, [node.id, selectedItemIds, focusedPortIds, connectors]);

  const vlanBorderColor = useMemo(() => {
    return getSinglePortNodeVlanBorderColor({
      itemId: node.id,
      icon: modelItem.icon,
      connectors,
      modelItems
    });
  }, [node.id, modelItem.icon, connectors, modelItems]);

  const poePowerWarning = useMemo(() => {
    return hasPoePowerWarning({
      item: modelItem,
      connectors,
      modelItems
    });
  }, [modelItem, connectors, modelItems]);

  const attentionPortId = useUiStateStore(
    useCallback(
      (state) => (state.portAttention?.itemId === node.id ? state.portAttention.portId : null),
      [node.id]
    )
  );
  
  const attentionToken = useUiStateStore(
    useCallback(
      (state) => (state.portAttention?.itemId === node.id ? state.portAttention.token : null),
      [node.id]
    )
  );

  const hoveredPortId = useUiStateStore(
    useCallback(
      (state) => {
        const hover = state.shape2dPortHover;
        if (!hover) return null;
        if (hover.itemId === node.id) return hover.portId;

        if (hover.portId) {
          const peerPorts = getPeerHighlightedPortIdsForItem({
            itemId: node.id,
            selectedItemIds: [hover.itemId],
            focusedPortIds: [hover.portId],
            connectors
          });

          if (peerPorts.size > 0) {
            return Array.from(peerPorts)[0];
          }
        }
        return null;
      },
      [node.id, connectors]
    )
  );

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
    attentionToken,
    vlanBorderColor,
    Boolean(modelItem.poweredByPoe),
    poePowerWarning,
    hoveredPortId
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

  // Iso icons: name/description/portal float above the sprite.
  // 2D plan descriptions render in NodeDescriptionLabels (above overlay).
  const showFloatingLabel = isPlanShape
    ? false
    : Boolean(modelItem.name || description || modelItem.portal);

  const portalLabel = useMemo(() => {
    if (isTwoD || !modelItem.portal) return null;
    return getPortalDisplayLabel(modelItem.portal, model);
  }, [isTwoD, modelItem.portal, model]);

  const onPortalClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const portal = modelItem.portal;
      if (!portal) return;

      uiStateActions.setPortPipHover(null);

      const jump = planPortalJump({
        portal,
        model,
        rendererSize: rendererSizeRef.current
      });
      if (!jump) return;

      changeView(jump.planViewId, model);
      uiStateActions.setProjectionMode('TWO_D');
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

      if (jump.select.type === 'ITEM') {
        uiStateActions.setItemControls({ type: 'ITEM', id: jump.select.id });
        uiStateActions.setSelectedItemIds([jump.select.id]);
      } else {
        uiStateActions.setItemControls({
          type: 'RECTANGLE',
          id: jump.select.id
        });
      }
    },
    [modelItem.portal, model, rendererSize, changeView, uiStateActions]
  );

  const onPortalMouseEnter = useCallback(
    (event: React.MouseEvent) => {
      const portal = modelItem.portal;
      if (!portal || isTwoD) return;

      uiStateActions.setPortPipHover({
        hostItemId: node.id,
        hostPortId: null,
        peerItemId: portal.targetType === 'ITEM' ? portal.targetId : null,
        peerPortId: null,
        peerRectangleId:
          portal.targetType === 'RECTANGLE' ? portal.targetId : null,
        title: portalLabel ?? undefined,
        screen: { x: event.clientX, y: event.clientY }
      });
    },
    [modelItem.portal, isTwoD, node.id, portalLabel, uiStateActions]
  );

  const onPortalMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!modelItem.portal || isTwoD) return;
      const current = uiStateStoreApi.getState().portPipHover;
      if (!current || current.hostItemId !== node.id) return;
      uiStateActions.setPortPipHover({
        ...current,
        screen: { x: event.clientX, y: event.clientY }
      });
    },
    [modelItem.portal, isTwoD, node.id, uiStateActions, uiStateStoreApi]
  );

  const onPortalMouseLeave = useCallback(() => {
    const current = uiStateStoreApi.getState().portPipHover;
    if (current?.hostItemId === node.id && current.hostPortId == null) {
      uiStateActions.setPortPipHover(null);
    }
  }, [node.id, uiStateActions, uiStateStoreApi]);

  const labelAnchorBottom =
    isPlanShape && shapeSize
      ? (shapeSize.height * TILE_SIZE_2D) / 2
      : PROJECTED_TILE_SIZE.height / 2;

  const labelScale = isPlanShape ? clampNodeLabelScale(node.labelScale) : 1;
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
      className={`isoflow-node ${selectionTone === 'highlighted' ? 'isoflow-node-highlighted' : ''}`}
      data-node-id={node.id}
      sx={{
        position: 'absolute',
        zIndex: order,
        opacity: selectionTone === 'dimmed' ? dimmedOpacity : 1,
        filter: node.locked
          ? 'drop-shadow(0 0 5px rgba(234, 88, 12, 0.75))'
          : selectionTone === 'highlighted'
            ? 'drop-shadow(0 0 6px rgba(37, 99, 235, 0.65)) drop-shadow(0 2px 6px rgba(37, 99, 235, 0.4))'
            : undefined,
        transition: 'opacity 0.15s ease, filter 0.15s ease, z-index 0s',
        '&:hover': {
          zIndex: order + 20000
        }
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          transform:
            selectionTone === 'highlighted' &&
            modelItem.icon !== SHAPE_2D_CABINET_ID
              ? `translate(${repelOffset?.x ?? 0}px, ${repelOffset?.y ?? 0}px) scale(1.15)`
              : 'none',
          transformOrigin: '0 0',
          transition: 'transform 0.15s ease'
        }}
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
                {portalLabel && (
                  <Link
                    component="button"
                    type="button"
                    underline="hover"
                    onClick={onPortalClick}
                    onMouseEnter={onPortalMouseEnter}
                    onMouseMove={onPortalMouseMove}
                    onMouseLeave={onPortalMouseLeave}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                    }}
                    sx={{
                      pointerEvents: 'auto',
                      alignSelf: 'flex-start',
                      fontSize: titleFontSize
                        ? Math.max(10, titleFontSize - 1)
                        : 12,
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
              position: 'absolute'
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
