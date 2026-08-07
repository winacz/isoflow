import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { ViewItem } from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useScene } from 'src/hooks/useScene';
import { SHAPE_2D_CABINET_ID, TILE_SIZE_2D, getModelItemSize } from 'src/config';
import {
  getPortPeerItemIds,
  isPatchPanelItem,
  expandConnectorIdsThroughPatchPanels,
  isPlanProjection
} from 'src/utils';
import { Node } from './Node/Node';

/** Visual scale applied to highlighted (selected / related) nodes. */
const HIGHLIGHT_SCALE = 1.15;
/** Extra gap (tiles) left between scaled AABBs after centroid expand. */
const HIGHLIGHT_REPEL_GAP_TILES = 0.35;

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
    return anchor.ref.item === itemId && (!anchor.ref.port || anchor.ref.port === portId);
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

  const shape2dPortHover = useUiStateStore((state) => {
    return state.shape2dPortHover;
  });

  const highlightedNodeIds = useMemo(() => {
    if (!isPlanProjection(projectionMode)) {
      return null;
    }

    const ids = new Set<string>();

    if (selectedItemIds.length > 0) {
      selectedItemIds.forEach(id => ids.add(id));

      // Selecting a cabinet: keep mounted gear highlighted (not dimmed),
      // otherwise cabinet tint shows through semi-transparent switches.
      selectedItemIds.forEach((selectedId) => {
        if (iconById.get(selectedId) === SHAPE_2D_CABINET_ID) {
          nodes.forEach((node) => {
            if (node.parentId === selectedId) {
              ids.add(node.id);
            }
          });
        }
      });

      // Port focus: peers on those RJ45s + far side through patch-panel bridges.
      if (focusedPortIds.length > 0) {
        const directConnectorIds: string[] = [];
        connectors.forEach((connector) => {
          const usesFocused = focusedPortIds.some((portId) => {
            return selectedItemIds.some((selectedId) => connectorUsesPort(connector, selectedId, portId));
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
      } else {
        connectors.forEach((connector) => {
          const touches = connector.anchors.some((anchor) => {
            return anchor.ref.item && selectedItemIds.includes(anchor.ref.item);
          });

          if (!touches) return;

          getEndpointItemIds(connector).forEach((id) => {
            ids.add(id);
          });
        });
      }
    } else if (itemControls) {
      if (itemControls.type === 'CONNECTOR') {
        const bridgeIds = expandConnectorIdsThroughPatchPanels({
          connectorIds: [itemControls.id],
          connectors,
          modelItems
        });
        let addedReal = false;
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
            addedReal = true;
          });
        });
        // If bridge incomplete, still show whatever endpoints we have (incl. panel).
        if (!addedReal) {
          const connector = connectors.find((con) => {
            return con.id === itemControls.id;
          });
          getEndpointItemIds(connector).forEach(id => ids.add(id));
        }
      }
    }

    if (shape2dPortHover) {
      ids.add(shape2dPortHover.itemId);
      const hoverConnectorIds: string[] = [];
      connectors.forEach((connector) => {
        if (connectorUsesPort(connector, shape2dPortHover.itemId, shape2dPortHover.portId)) {
          hoverConnectorIds.push(connector.id);
        }
      });
      expandConnectorIdsThroughPatchPanels({
        connectorIds: hoverConnectorIds,
        connectors,
        modelItems
      }).forEach((connectorId) => {
        const connector = connectors.find((con) => con.id === connectorId);
        getEndpointItemIds(connector).forEach((id) => {
          if (!isPatchPanelItem(modelItems.find((m) => m.id === id))) {
            ids.add(id);
          }
        });
      });
    }

    return ids.size > 0 ? ids : null;
  }, [
    projectionMode,
    itemControls,
    selectedItemIds,
    connectors,
    focusedPortIds,
    modelItems,
    iconById,
    nodes,
    shape2dPortHover
  ]);

  /**
   * Expand multi-selected nodes from their centroid so scaled footprints
   * do not overlap. Only selected items move (not connector-peer highlights),
   * which keeps a regular grid symmetric.
   */
  const repelOffsets = useMemo(() => {
    const offsets = new Map<string, { x: number; y: number }>();
    if (selectedItemIds.length < 2) return offsets;

    type Entry = {
      id: string;
      cx: number;
      cy: number;
      halfW: number;
      halfH: number;
      parentId?: string;
    };

    const entries: Entry[] = [];
    selectedItemIds.forEach((id) => {
      if (iconById.get(id) === SHAPE_2D_CABINET_ID) return;
      const node = nodes.find((n) => {
        return n.id === id;
      });
      if (!node) return;
      const item = modelItems.find((m) => {
        return m.id === id;
      });
      const size = getModelItemSize(item ?? {}) ?? { width: 1, height: 1 };
      entries.push({
        id,
        cx: node.tile.x + size.width / 2,
        cy: node.tile.y + size.height / 2,
        halfW: (size.width * HIGHLIGHT_SCALE) / 2,
        halfH: (size.height * HIGHLIGHT_SCALE) / 2,
        parentId: node.parentId
      });
    });

    if (entries.length < 2) return offsets;

    const centroid = {
      x: entries.reduce((sum, e) => sum + e.cx, 0) / entries.length,
      y: entries.reduce((sum, e) => sum + e.cy, 0) / entries.length
    };

    let expand = 1;
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        if (a.parentId === b.id || b.parentId === a.id) continue;

        const dx = Math.abs(a.cx - b.cx);
        const dy = Math.abs(a.cy - b.cy);
        const needX = a.halfW + b.halfW + HIGHLIGHT_REPEL_GAP_TILES;
        const needY = a.halfH + b.halfH + HIGHLIGHT_REPEL_GAP_TILES;

        // Already clear at current positions (with scaled sizes).
        if (dx >= needX || dy >= needY) continue;

        // Smallest uniform scale of center offsets that separates this pair.
        let ePair = Number.POSITIVE_INFINITY;
        if (dx > 1e-6) ePair = Math.min(ePair, needX / dx);
        if (dy > 1e-6) ePair = Math.min(ePair, needY / dy);
        if (Number.isFinite(ePair)) {
          expand = Math.max(expand, ePair);
        }
      }
    }

    if (expand <= 1) return offsets;

    entries.forEach((entry) => {
      const ox = (expand - 1) * (entry.cx - centroid.x);
      const oy = (expand - 1) * (entry.cy - centroid.y);
      if (Math.abs(ox) < 1e-6 && Math.abs(oy) < 1e-6) return;
      offsets.set(entry.id, {
        x: ox * TILE_SIZE_2D,
        y: oy * TILE_SIZE_2D
      });
    });

    return offsets;
  }, [selectedItemIds, nodes, modelItems, iconById]);

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
        const baseOrder = isCabinet
          ? CABINET_Z_BASE + depth
          : DEVICE_Z_BASE + depth;
        const order = selectionTone === 'highlighted' ? baseOrder + 10000 : baseOrder;

        return (
          <Node
            key={node.id}
            order={order}
            node={node}
            selectionTone={selectionTone}
            dimmedOpacity={dimmedOpacity}
            repelOffset={repelOffsets.get(node.id)}
          />
        );
      })}
    </>
  );
});
Nodes.displayName = 'Nodes';
