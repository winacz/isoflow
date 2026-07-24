import React, { useMemo } from 'react';
import { ViewItem } from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useScene } from 'src/hooks/useScene';
import { SHAPE_2D_CABINET_ID } from 'src/config';
import {
  getPortPeerItemIds,
  isPatchPanelItem,
  expandConnectorIdsThroughPatchPanels
} from 'src/utils';
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

export const Nodes = React.memo(({ nodes }: Props) => {
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
      const bridgeIds = expandConnectorIdsThroughPatchPanels({
        connectorIds: [itemControls.id],
        connectors,
        modelItems
      });
      const ids = new Set<string>();
      bridgeIds.forEach((connectorId) => {
        const connector = connectors.find((con) => {
          return con.id === connectorId;
        });
        getEndpointItemIds(connector).forEach((id) => {
          // Prefer real endpoints — skip dimming the panel itself when bridged.
          if (isPatchPanelItem(modelItems.find((m) => m.id === id))) {
            return;
          }
          ids.add(id);
        });
      });
      // If bridge incomplete, still show whatever endpoints we have (incl. panel).
      if (ids.size === 0) {
        const connector = connectors.find((con) => {
          return con.id === itemControls.id;
        });
        return getEndpointItemIds(connector);
      }
      return ids;
    }

    if (itemControls.type === 'ITEM') {
      const modelItem = modelItems.find((item) => {
        return item.id === itemControls.id;
      });
      const isPanel = isPatchPanelItem(modelItem);

      // Patch panel port focus: highlight only the bridged endpoints (not the panel).
      if (isPanel && focusedPortIds.length > 0) {
        return getPortPeerItemIds({
          itemId: itemControls.id,
          portIds: focusedPortIds,
          connectors
        });
      }

      const ids = new Set<string>([itemControls.id]);

      // Selecting a cabinet: keep mounted gear highlighted (not dimmed),
      // otherwise cabinet tint shows through semi-transparent switches.
      if (iconById.get(itemControls.id) === SHAPE_2D_CABINET_ID) {
        nodes.forEach((node) => {
          if (node.parentId === itemControls.id) {
            ids.add(node.id);
          }
        });
      }

      // Port focus: peers on those RJ45s + far side through patch-panel bridges.
      if (focusedPortIds.length > 0) {
        const directConnectorIds: string[] = [];
        connectors.forEach((connector) => {
          const usesFocused = focusedPortIds.some((portId) => {
            return connectorUsesPort(connector, itemControls.id, portId);
          });
          if (!usesFocused) return;
          directConnectorIds.push(connector.id);
        });

        expandConnectorIdsThroughPatchPanels({
          connectorIds: directConnectorIds,
          connectors,
          modelItems
        }).forEach((connectorId) => {
          const connector = connectors.find((con) => {
            return con.id === connectorId;
          });
          getEndpointItemIds(connector).forEach((id) => {
            if (isPatchPanelItem(modelItems.find((m) => m.id === id))) {
              return;
            }
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
    focusedPortIds,
    modelItems,
    iconById,
    nodes
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
});
Nodes.displayName = 'Nodes';
