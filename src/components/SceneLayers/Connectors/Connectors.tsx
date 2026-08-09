import React, { useMemo, useRef } from 'react';
import { GlobalStyles } from '@mui/material';
import type { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { getActiveStackKey, useStackFanStore } from 'src/stores/stackFanStore';
import {
  buildConnectorTileIndex,
  findConnectorIdAtTile,
  findConnectorJumpsIncremental,
  findConnectorStackBadges,
  getConnectorGlobalTiles,
  getStackFanOffsetsPx,
  expandConnectorIdsThroughPatchPanels,
  isPlan2dCanvas,
  isSwitchLikeIcon,
  type ConnectorJump
} from 'src/utils';
import { getModelItemPorts, TILE_SIZE_2D } from 'src/config';
import { Connector } from './Connector';
import { Connector2d } from './Connector2d';

interface Props {
  connectors: ReturnType<typeof useScene>['connectors'];
}

const FAN_SPACING_PX = Math.round(TILE_SIZE_2D * 0.55);

const connectorTouchesItem = (
  connector: { anchors: { ref: { item?: string } }[] },
  itemId: string
) => {
  return connector.anchors.some((anchor) => {
    return anchor.ref.item === itemId;
  });
};

const connectorUsesPort = (
  connector: { anchors: { ref: { item?: string; port?: string } }[] },
  itemId: string,
  portId: string
) => {
  return connector.anchors.some((anchor) => {
    return anchor.ref.item === itemId && anchor.ref.port === portId;
  });
};

const stackKey = (tile: { x: number; y: number }) => {
  return `${tile.x},${tile.y}`;
};

type PathInput = { id: string; tiles: { x: number; y: number }[] };

const pathTilesEqual = (
  a: { x: number; y: number }[],
  b: { x: number; y: number }[]
) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
  }
  return true;
};

export const Connectors = ({ connectors }: Props) => {
  const itemControls = useUiStateStore((state) => {
    return state.itemControls;
  });
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const focusedPortIds = useUiStateStore((state) => {
    return state.focusedPortIds;
  });
  const mouseTileX = useUiStateStore((state) => {
    return state.mouse.position.tile.x;
  });
  const mouseTileY = useUiStateStore((state) => {
    return state.mouse.position.tile.y;
  });
  const hasMouseDown = useUiStateStore((state) => {
    return Boolean(state.mouse.mousedown);
  });
  const modelItems = useModelStore((state) => {
    return state.items;
  });

  const activeStackKey = useStackFanStore(getActiveStackKey);
  const highlightedConnectorId = useStackFanStore((state) => {
    return state.highlightedConnectorId;
  });
  const shape2dPortHover = useUiStateStore((state) => {
    return state.shape2dPortHover;
  });
  const shape2dNodeHoverItemId = useUiStateStore((state) => {
    return state.shape2dNodeHoverItemId;
  });

  const selectedConnectorId = useMemo(() => {
    if (mode.type === 'CONNECTOR') {
      return mode.id;
    }
    if (itemControls?.type === 'CONNECTOR') {
      return itemControls.id;
    }

    return null;
  }, [mode, itemControls]);

  const selectedItemId =
    itemControls?.type === 'ITEM' ? itemControls.id : null;

  /** Item whose cables should be emphasized (selection, else hover preview). */
  const relationItemId =
    selectedItemId ??
    (selectedConnectorId ? null : shape2dNodeHoverItemId);

  const softDim = mode.type === 'DRAG_ITEMS';

  /** Directly related cables + their patch-panel bridge siblings (both segments). */
  const focusedConnectorIds = useMemo(() => {
    if (!isPlan2dCanvas(projectionMode)) return null;

    const direct = new Set<string>();
    if (selectedConnectorId) {
      direct.add(selectedConnectorId);
    }

    if (relationItemId) {
      const modelItem = modelItems.find((item) => item.id === relationItemId);
      const portCount = modelItem ? getModelItemPorts(modelItem).length : 0;
      // Whole-node highlight only for simple endpoints (1 port, not a switch).
      // Switches / multi-port devices: only when a specific port is focused.
      const showAllItemCables =
        !isSwitchLikeIcon(modelItem?.icon) && portCount === 1;

      connectors.forEach((connector) => {
        let related = false;
        if (focusedPortIds.length > 0 && selectedItemId === relationItemId) {
          related = focusedPortIds.some((portId) => {
            return connectorUsesPort(connector, relationItemId, portId);
          });
        } else if (showAllItemCables) {
          related = connectorTouchesItem(connector, relationItemId);
        }
        if (related) direct.add(connector.id);
      });
    }

    if (direct.size === 0) return null;

    return expandConnectorIdsThroughPatchPanels({
      connectorIds: direct,
      connectors,
      modelItems
    });
  }, [
    projectionMode,
    selectedConnectorId,
    relationItemId,
    selectedItemId,
    focusedPortIds,
    connectors,
    modelItems
  ]);

  /** Cable attached to the RJ45 currently under the cursor (+ patch-panel bridge). */
  const portHoverConnectorIds = useMemo(() => {
    if (!isPlan2dCanvas(projectionMode)) return null;
    if (!shape2dPortHover?.portId) return null;

    const direct = new Set<string>();
    connectors.forEach((connector) => {
      if (
        connectorUsesPort(
          connector,
          shape2dPortHover.itemId,
          shape2dPortHover.portId as string
        )
      ) {
        direct.add(connector.id);
      }
    });
    if (direct.size === 0) return null;

    return expandConnectorIdsThroughPatchPanels({
      connectorIds: direct,
      connectors,
      modelItems
    });
  }, [projectionMode, shape2dPortHover, connectors, modelItems]);

  // Dim unrelated cables only when something is actually emphasized.
  const hasSelectionFocus = Boolean(
    (focusedConnectorIds && focusedConnectorIds.size > 0) ||
      (portHoverConnectorIds && portHoverConnectorIds.size > 0) ||
      highlightedConnectorId
  );

  const pathInputs = useMemo(() => {
    if (!isPlan2dCanvas(projectionMode)) return [];
    // Jump detection is O(cables²×segments) — skip during drag.
    if (softDim) return [];

    return connectors.map((connector) => {
      return {
        id: connector.id,
        tiles: getConnectorGlobalTiles(connector)
      };
    });
  }, [connectors, projectionMode, softDim]);

  const tileIndex = useMemo(() => {
    return buildConnectorTileIndex(pathInputs);
  }, [pathInputs]);

  const prevPathInputsRef = useRef<PathInput[]>([]);
  const prevJumpsRef = useRef<Record<string, ConnectorJump[]>>({});

  /** Cable under cursor — emphasize before click (idle CURSOR only). */
  const hoveredConnectorId = useMemo(() => {
    if (!isPlan2dCanvas(projectionMode)) return null;
    if (mode.type !== 'CURSOR') return null;
    if (hasMouseDown || softDim) return null;

    const tile = { x: mouseTileX, y: mouseTileY };
    const onTileIds = tileIndex.get(stackKey(tile));

    if (selectedConnectorId && onTileIds?.includes(selectedConnectorId)) {
      return selectedConnectorId;
    }

    return findConnectorIdAtTile(tileIndex, tile);
  }, [
    projectionMode,
    mode.type,
    hasMouseDown,
    softDim,
    mouseTileX,
    mouseTileY,
    selectedConnectorId,
    tileIndex
  ]);

  const jumpsByConnectorId = useMemo(() => {
    if (!isPlan2dCanvas(projectionMode) || softDim) {
      prevPathInputsRef.current = [];
      prevJumpsRef.current = {};
      return {};
    }

    const prevPaths = prevPathInputsRef.current;
    const prevById = new Map(
      prevPaths.map((entry) => {
        return [entry.id, entry] as const;
      })
    );
    const nextById = new Map(
      pathInputs.map((entry) => {
        return [entry.id, entry] as const;
      })
    );

    const changedIds = new Set<string>();
    for (const next of pathInputs) {
      const prev = prevById.get(next.id);
      if (!prev || !pathTilesEqual(prev.tiles, next.tiles)) {
        changedIds.add(next.id);
      }
    }
    for (const prev of prevPaths) {
      if (!nextById.has(prev.id)) {
        changedIds.add(prev.id);
      }
    }

    // Nothing moved — reuse cached jumps (incremental helper would full-recompute on empty).
    if (changedIds.size === 0 && prevPaths.length > 0) {
      return prevJumpsRef.current;
    }

    const jumps = findConnectorJumpsIncremental(
      prevJumpsRef.current,
      prevPaths,
      pathInputs,
      changedIds
    );

    prevPathInputsRef.current = pathInputs;
    prevJumpsRef.current = jumps;
    return jumps;
  }, [pathInputs, projectionMode, softDim]);

  const fanOffsets = useMemo(() => {
    if (!isPlan2dCanvas(projectionMode) || !activeStackKey) return {};

    const badges = findConnectorStackBadges(pathInputs);
    const badge = badges.find((candidate) => {
      return stackKey(candidate.tile) === activeStackKey;
    });
    if (!badge) return {};

    return getStackFanOffsetsPx(
      badge.connectorIds,
      badge.along,
      FAN_SPACING_PX
    );
  }, [activeStackKey, pathInputs, projectionMode]);

  const animateConnectors = useUiStateStore((state) => {
    return state.animateConnectors;
  });

  return (
    <>
      {animateConnectors && (
        <GlobalStyles
          styles={{
            '@keyframes connectorFlow': {
              from: { strokeDashoffset: 40 },
              to: { strokeDashoffset: 0 }
            }
          }}
        />
      )}
      {[...connectors].reverse().map((connector) => {
        const isSelected = selectedConnectorId === connector.id;
        const isHovered = hoveredConnectorId === connector.id;
        const isRelatedToItem = Boolean(
          focusedConnectorIds?.has(connector.id)
        );
        const offset = fanOffsets[connector.id];
        const isHandleTarget = highlightedConnectorId === connector.id;
        const isPortHoverCable = Boolean(
          portHoverConnectorIds?.has(connector.id)
        );
        const isFocused =
          isSelected ||
          isHovered ||
          isRelatedToItem ||
          Boolean(offset) ||
          isHandleTarget ||
          isPortHoverCable;
        const isDimmed =
          (hasSelectionFocus && !isFocused) ||
          (highlightedConnectorId !== null && !isHandleTarget);

        if (isPlan2dCanvas(projectionMode)) {
          return (
            <Connector2d
              key={connector.id}
              connector={connector}
              jumps={jumpsByConnectorId[connector.id] ?? []}
              isSelected={isSelected}
              isFocused={isFocused}
              isHighlighted={
                isHandleTarget ||
                (isHovered && !isSelected) ||
                isPortHoverCable
              }
              isDimmed={isDimmed}
              softDim={softDim}
              visualOffset={offset}
            />
          );
        }

        return (
          <Connector
            key={connector.id}
            connector={connector}
            isSelected={isSelected}
          />
        );
      })}
    </>
  );
};
