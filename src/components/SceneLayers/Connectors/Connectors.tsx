import React, { useMemo } from 'react';
import type { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { getActiveStackKey, useStackFanStore } from 'src/stores/stackFanStore';
import {
  findConnectorJumpsById,
  findConnectorStackBadges,
  getConnectorGlobalTiles,
  getStackFanOffsetsPx
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
        const isRelatedToItem = Boolean(
          selectedItemId &&
            (focusedPortIds.length > 0
              ? focusedPortIds.some((portId) => {
                  return connectorUsesPort(
                    connector,
                    selectedItemId,
                    portId
                  );
                })
              : connectorTouchesItem(connector, selectedItemId))
        );
        const offset = fanOffsets[connector.id];
        const isHandleTarget = highlightedConnectorId === connector.id;
        const isFocused =
          isSelected ||
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
              isHighlighted={isHandleTarget}
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
