import React, { useCallback, useMemo } from 'react';
import { Box } from '@mui/material';
import {
  TILE_SIZE_2D,
  getModelItemSize,
  isShape2dIcon,
  SHAPE_2D_CABINET_ID
} from 'src/config';
import {
  getTilePosition,
  getShape2dCenterPosition,
  getMismatchPortIdsForItem,
  getPeerHighlightedPortIdsForItem,
  isPlanProjection,
  findPlanView,
  getSinglePortNodeVlanBorderColor,
  hasPoePowerWarning,
  getShape2dHeaderFraction
} from 'src/utils';
import { useIcon } from 'src/hooks/useIcon';
import { ViewItem } from 'src/types';
import { useModelItem } from 'src/hooks/useModelItem';
import { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useNodeDragStore } from 'src/stores/nodeDragStore';

interface Props {
  node: ViewItem;
  order: number;
  /**
   * 2D selection styling:
   * - highlighted = selected (glow); enlarge is separate (header click)
   * - related = cable peer (glow only)
   * - dimmed = everything else while a selection is active
   */
  selectionTone?: 'normal' | 'highlighted' | 'related' | 'dimmed';
  /** Opacity used when selectionTone is dimmed (softer while dragging). */
  dimmedOpacity?: number;
  /** Pixel translation so scaled highlighted nodes do not overlap. */
  repelOffset?: { x: number; y: number };
  /**
   * CSS scale magnitude (zoom-aware). Applied only when shouldEnlarge is true.
   */
  highlightScale?: number;
  /**
   * When true, apply highlightScale (header-click enlarge only).
   * Header mouse-hover only accents the name band — it does not set this.
   */
  shouldEnlarge?: boolean;
  /** Blue outline while the cursor is over this device (relation preview). */
  showHoverRing?: boolean;
}

export const Node = React.memo(({
  node,
  order,
  selectionTone = 'normal',
  dimmedOpacity = 0.7,
  repelOffset,
  highlightScale = 1.15,
  shouldEnlarge = false,
  showHoverRing = false
}: Props) => {
  const isHeaderHovered = useUiStateStore(
    useCallback(
      (state) => state.shape2dHeaderHoverItemId === node.id,
      [node.id]
    )
  );
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
  const selectedItemIds = useUiStateStore((state) => {
    return state.selectedItemIds;
  });
  const nodeFocusedPortIds =
    selectedItemIds.includes(node.id) ? focusedPortIds : null;

  // Port hover visuals are applied imperatively (Shape2dPortHoverController)
  // so sliding along a 48-port row does not re-render DeviceShape2d.
  const peerHighlightPortIds = useMemo(() => {
    return getPeerHighlightedPortIdsForItem({
      itemId: node.id,
      selectedItemIds,
      focusedPortIds:
        selectedItemIds.length > 0 && selectedItemIds.includes(node.id)
          ? focusedPortIds
          : null,
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

  // LOD that stripped RJ45 DOM at zoom < 0.35 is off — common plan zooms
  // (fit-to-view) sit under that threshold and looked like "no ports".
  const lodSimplified = false;

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
    null,
    lodSimplified
  );
  const liveTile = useNodeDragStore((state) => {
    return state.tiles[node.id];
  });

  const isTwoD = isPlanProjection(projectionMode);
  const isPlanShape = isShape2dIcon(modelItem.icon);
  const shapeSize = getModelItemSize(modelItem);
  const tile = liveTile ?? node.tile;

  /**
   * Header hit-area: positioned at the top of the node, same height as the
   * header band used in DeviceShape2d (isPc → 30%, switch → 33%).
   * Only computed for 2D plan shapes that are not cabinets.
   */
  const headerHitArea = useMemo(() => {
    if (!isPlanShape || !shapeSize || modelItem.icon === SHAPE_2D_CABINET_ID) return null;
    const pxW = shapeSize.width * TILE_SIZE_2D;
    const pxH = shapeSize.height * TILE_SIZE_2D;
    const headerH = pxH * getShape2dHeaderFraction(modelItem.icon);
    return { left: -pxW / 2, top: -pxH / 2, width: pxW, height: headerH };
  }, [isPlanShape, shapeSize, modelItem.icon]);

  const hoverRingBox = useMemo(() => {
    if (!isPlanShape || !shapeSize || modelItem.icon === SHAPE_2D_CABINET_ID) {
      return null;
    }
    const pxW = shapeSize.width * TILE_SIZE_2D;
    const pxH = shapeSize.height * TILE_SIZE_2D;
    return { left: -pxW / 2, top: -pxH / 2, width: pxW, height: pxH };
  }, [isPlanShape, shapeSize, modelItem.icon]);

  const showLoupe = useUiStateStore((state) => state.showLoupe);
  /**
   * Enlarge only after header click — not on node / header hover.
   * Loupe reveal also sets enlarge; skip CSS transition so hit-tests stay aligned.
   */
  const activeScale = shouldEnlarge ? highlightScale : 1;
  const isScaled =
    activeScale > 1.01 && modelItem.icon !== SHAPE_2D_CABINET_ID;

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

  return (
    <Box
      className={`isoflow-node ${
        selectionTone === 'highlighted' || selectionTone === 'related'
          ? 'isoflow-node-highlighted'
          : ''
      }`}
      data-node-id={node.id}
      sx={{
        position: 'absolute',
        zIndex: order,
        opacity: selectionTone === 'dimmed' ? dimmedOpacity : 1,
        filter: node.locked
          ? 'drop-shadow(0 0 5px rgba(234, 88, 12, 0.75))'
          : selectionTone === 'highlighted'
            ? 'drop-shadow(0 0 6px rgba(37, 99, 235, 0.65)) drop-shadow(0 2px 6px rgba(37, 99, 235, 0.4))'
            : selectionTone === 'related'
              ? 'drop-shadow(0 0 5px rgba(37, 99, 235, 0.45)) drop-shadow(0 1px 4px rgba(37, 99, 235, 0.28))'
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
          transform: isScaled
            ? `translate(${repelOffset?.x ?? 0}px, ${repelOffset?.y ?? 0}px) scale(${activeScale})`
            : repelOffset
              ? `translate(${repelOffset.x}px, ${repelOffset.y}px)`
              : 'none',
          transformOrigin: '0 0',
          // Loupe reveal snaps enlarge + pans in the same frame — no tween.
          transition: showLoupe ? 'none' : 'transform 0.18s ease'
        }}
        style={{
          left: position.x,
          top: position.y
        }}
      >
        {/* Blue ring — cursor is over this device (no scale). */}
        {hoverRingBox && showHoverRing && (
          <Box
            sx={{
              position: 'absolute',
              left: hoverRingBox.left,
              top: hoverRingBox.top,
              width: hoverRingBox.width,
              height: hoverRingBox.height,
              pointerEvents: 'none',
              zIndex: 19,
              borderRadius: '6px',
              boxSizing: 'border-box',
              boxShadow:
                '0 0 0 2.5px rgba(37, 99, 235, 0.85), 0 0 0 5px rgba(37, 99, 235, 0.2)',
              transition: 'box-shadow 0.12s ease'
            }}
          />
        )}
        {/* Header band accent — only while cursor is on the name header */}
        {headerHitArea && (
          <Box
            sx={{
              position: 'absolute',
              left: headerHitArea.left,
              top: headerHitArea.top,
              width: headerHitArea.width,
              height: headerHitArea.height,
              pointerEvents: 'none',
              zIndex: 20,
              borderRadius: '6px 6px 0 0',
              boxSizing: 'border-box',
              background: isHeaderHovered
                ? 'rgba(37, 99, 235, 0.28)'
                : 'transparent',
              boxShadow: isHeaderHovered
                ? 'inset 0 -3px 0 rgba(37, 99, 235, 0.95), inset 0 0 0 1.5px rgba(37, 99, 235, 0.55)'
                : 'none',
              transition:
                'background 0.12s ease, box-shadow 0.12s ease'
            }}
          />
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
