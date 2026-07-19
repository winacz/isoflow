import React, { useMemo } from 'react';
import { ViewItem } from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useScene } from 'src/hooks/useScene';
import { SHAPE_2D_CABINET_ID } from 'src/config';
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

const connectorUsesPort = (
  connector: { anchors: { ref: { item?: string; port?: string } }[] },
  itemId: string,
  portId: string
) => {
  return connector.anchors.some((anchor) => {
    return anchor.ref.item === itemId && anchor.ref.port === portId;
  });
};

/** Cabinets always paint under devices (mounted switches sit in slots). */
const CABINET_Z_BASE = -100000;
const DEVICE_Z_BASE = 1000;

export const Nodes = ({ nodes }: Props) => {
  const itemControls = useUiStateStore((state) => {
    return state.itemControls;
  });
  const selectedItemIds = useUiStateStore((state) => {
    return state.selectedItemIds;
  });
  const focusedPortIds = useUiStateStore((state) => {
    return state.focusedPortIds;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const { connectors } = useScene();

  const isDragging = mode.type === 'DRAG_ITEMS';
  // Keep the rest of the diagram readable while moving a node.
  const dimmedOpacity = isDragging ? 0.82 : 0.68;

  const iconById = useMemo(() => {
    const map = new Map<string, string | undefined>();
    modelItems.forEach((item) => {
      map.set(item.id, item.icon);
    });
    return map;
  }, [modelItems]);

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

      // Port focus: only the peer(s) on cables attached to those RJ45s.
      if (focusedPortIds.length > 0) {
        connectors.forEach((connector) => {
          const usesFocused = focusedPortIds.some((portId) => {
            return connectorUsesPort(connector, itemControls.id, portId);
          });
          if (!usesFocused) return;
          getEndpointItemIds(connector).forEach((id) => {
            ids.add(id);
          });
        });
        return ids;
      }

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
  }, [
    projectionMode,
    itemControls,
    selectedItemIds,
    connectors,
    focusedPortIds
  ]);

  return (
    <>
      {[...nodes].reverse().map((node) => {
        let selectionTone: 'normal' | 'highlighted' | 'dimmed' = 'normal';

        if (highlightedNodeIds) {
          selectionTone = highlightedNodeIds.has(node.id)
            ? 'highlighted'
            : 'dimmed';
        }

        const isCabinet = iconById.get(node.id) === SHAPE_2D_CABINET_ID;
        const depth = -node.tile.x - node.tile.y;
        const order = isCabinet
          ? CABINET_Z_BASE + depth
          : DEVICE_Z_BASE + depth;

        return (
          <Node
            key={node.id}
            order={order}
            node={node}
            selectionTone={selectionTone}
            dimmedOpacity={dimmedOpacity}
          />
        );
      })}
    </>
  );
};
