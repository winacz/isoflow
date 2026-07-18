import React, { useMemo } from 'react';
import type { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import {
  findConnectorJumpsById,
  getConnectorGlobalTiles
} from 'src/utils';
import { Connector } from './Connector';
import { Connector2d } from './Connector2d';

interface Props {
  connectors: ReturnType<typeof useScene>['connectors'];
}

const connectorTouchesItem = (
  connector: { anchors: { ref: { item?: string } }[] },
  itemId: string
) => {
  return connector.anchors.some((anchor) => {
    return anchor.ref.item === itemId;
  });
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

  const jumpsByConnectorId = useMemo(() => {
    if (projectionMode !== 'TWO_D') return {};

    return findConnectorJumpsById(
      connectors.map((connector) => {
        return {
          id: connector.id,
          tiles: getConnectorGlobalTiles(connector)
        };
      })
    );
  }, [connectors, projectionMode]);

  return (
    <>
      {[...connectors].reverse().map((connector) => {
        const isSelected = selectedConnectorId === connector.id;
        const isRelatedToItem = Boolean(
          selectedItemId && connectorTouchesItem(connector, selectedItemId)
        );
        const isFocused = isSelected || isRelatedToItem;

        if (projectionMode === 'TWO_D') {
          return (
            <Connector2d
              key={connector.id}
              connector={connector}
              jumps={jumpsByConnectorId[connector.id] ?? []}
              isSelected={isSelected}
              isFocused={isFocused}
              isDimmed={hasSelectionFocus && !isFocused}
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
