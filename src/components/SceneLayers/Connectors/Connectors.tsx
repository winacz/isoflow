import React, { useMemo } from 'react';
import type { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { getActiveStackKey, useStackFanStore } from 'src/stores/stackFanStore';
import {
  findConnectorJumpsById,
  findConnectorStackBadges,
  getConnectorGlobalTiles,
  getStackFanOffsetsPx,
  expandConnectorIdsThroughPatchPanels
} from 'src/utils';
import { TILE_SIZE_2D } from 'src/config';
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

  const hasSelectionFocus = Boolean(
    selectedConnectorId || (projectionMode === 'TWO_D' && selectedItemId)
  );
  const softDim = mode.type === 'DRAG_ITEMS';

  /** Directly related cables + their patch-panel bridge siblings (both segments). */
  const focusedConnectorIds = useMemo(() => {
    if (projectionMode !== 'TWO_D') return null;

    const direct = new Set<string>();
    if (selectedConnectorId) {
      direct.add(selectedConnectorId);
    }

    if (selectedItemId) {
      connectors.forEach((connector) => {
        const related =
          focusedPortIds.length > 0
            ? focusedPortIds.some((portId) => {
                return connectorUsesPort(
                  connector,
                  selectedItemId,
                  portId
                );
              })
            : connectorTouchesItem(connector, selectedItemId);
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
    selectedItemId,
    focusedPortIds,
    connectors,
    modelItems
  ]);

  const pathInputs = useMemo(() => {
    if (projectionMode !== 'TWO_D') return [];
    // Jump detection is O(cables²×segments) — skip during drag.
    if (softDim) return [];

    return connectors.map((connector) => {
      return {
        id: connector.id,
        tiles: getConnectorGlobalTiles(connector)
      };
    });
  }, [connectors, projectionMode, softDim]);

  /** Cable under cursor — emphasize before click (idle CURSOR only). */
  const hoveredConnectorId = useMemo(() => {
    if (projectionMode !== 'TWO_D') return null;
    if (mode.type !== 'CURSOR') return null;
    if (hasMouseDown || softDim) return null;

    const tile = { x: mouseTileX, y: mouseTileY };
    const onTile = (tiles: { x: number; y: number }[]) => {
      return tiles.some((pathTile) => {
        return pathTile.x === tile.x && pathTile.y === tile.y;
      });
    };

    if (selectedConnectorId) {
      const selected = pathInputs.find((entry) => {
        return entry.id === selectedConnectorId;
      });
      if (selected && onTile(selected.tiles)) {
        return selectedConnectorId;
      }
    }

    for (let i = pathInputs.length - 1; i >= 0; i -= 1) {
      if (onTile(pathInputs[i].tiles)) {
        return pathInputs[i].id;
      }
    }

    return null;
  }, [
    projectionMode,
    mode.type,
    hasMouseDown,
    softDim,
    mouseTileX,
    mouseTileY,
    selectedConnectorId,
    pathInputs
  ]);

  const jumpsByConnectorId = useMemo(() => {
    if (projectionMode !== 'TWO_D' || softDim) return {};

    return findConnectorJumpsById(pathInputs);
  }, [pathInputs, projectionMode, softDim]);

  const fanOffsets = useMemo(() => {
    if (projectionMode !== 'TWO_D' || !activeStackKey) return {};

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

  return (
    <>
      {[...connectors].reverse().map((connector) => {
        const isSelected = selectedConnectorId === connector.id;
        const isHovered = hoveredConnectorId === connector.id;
        const isRelatedToItem = Boolean(
          focusedConnectorIds?.has(connector.id)
        );
        const offset = fanOffsets[connector.id];
        const isHandleTarget = highlightedConnectorId === connector.id;
        const isFocused =
          isSelected ||
          isHovered ||
          isRelatedToItem ||
          Boolean(offset) ||
          isHandleTarget;
        const isDimmed =
          (hasSelectionFocus && !isFocused) ||
          (highlightedConnectorId !== null && !isHandleTarget);

        if (projectionMode === 'TWO_D') {
          return (
            <Connector2d
              key={connector.id}
              connector={connector}
              jumps={jumpsByConnectorId[connector.id] ?? []}
              isSelected={isSelected}
              isFocused={isFocused}
              isHighlighted={isHandleTarget || (isHovered && !isSelected)}
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
