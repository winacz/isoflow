import React, { useMemo } from 'react';
import { ViewItem } from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import { Node } from './Node/Node';

interface Props {
  nodes: ViewItem[];
}

const getEndpointItemIds = (
  connector: { anchors: { ref: { item?: string } }[] } | undefined
) => {
  if (!connector) return new Set<string>();

  return new Set(
    connector.anchors
      .map((anchor) => {
        return anchor.ref.item;
      })
      .filter((id): id is string => {
        return Boolean(id);
      })
  );
};

export const Nodes = ({ nodes }: Props) => {
  const itemControls = useUiStateStore((state) => {
    return state.itemControls;
  });
  const selectedItemIds = useUiStateStore((state) => {
    return state.selectedItemIds;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const { connectors } = useScene();

  const isDragging = mode.type === 'DRAG_ITEMS';
  // Keep the rest of the diagram readable while moving a node.
  const dimmedOpacity = isDragging ? 0.82 : 0.68;

  const highlightedNodeIds = useMemo(() => {
    if (projectionMode !== 'TWO_D') {
      return null;
    }

    if (selectedItemIds.length > 0) {
      return new Set(selectedItemIds);
    }

    if (!itemControls) {
      return null;
    }

    if (itemControls.type === 'CONNECTOR') {
      const connector = connectors.find((con) => {
        return con.id === itemControls.id;
      });

      return getEndpointItemIds(connector);
    }

    if (itemControls.type === 'ITEM') {
      const ids = new Set<string>([itemControls.id]);

      connectors.forEach((connector) => {
        const touches = connector.anchors.some((anchor) => {
          return anchor.ref.item === itemControls.id;
        });

        if (!touches) return;

        getEndpointItemIds(connector).forEach((id) => {
          ids.add(id);
        });
      });

      return ids;
    }

    return null;
  }, [projectionMode, itemControls, selectedItemIds, connectors]);

  return (
    <>
      {[...nodes].reverse().map((node) => {
        let selectionTone: 'normal' | 'highlighted' | 'dimmed' = 'normal';

        if (highlightedNodeIds) {
          selectionTone = highlightedNodeIds.has(node.id)
            ? 'highlighted'
            : 'dimmed';
        }

        return (
          <Node
            key={node.id}
            order={-node.tile.x - node.tile.y}
            node={node}
            selectionTone={selectionTone}
            dimmedOpacity={dimmedOpacity}
          />
        );
      })}
    </>
  );
};
