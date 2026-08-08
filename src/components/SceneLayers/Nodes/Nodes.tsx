import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { ViewItem } from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useScene } from 'src/hooks/useScene';
import { SHAPE_2D_CABINET_ID, TILE_SIZE_2D, getModelItemSize, SWITCH_2D_SIZE } from 'src/config';
import {
  getPortPeerItemIds,
  isPatchPanelItem,
  expandConnectorIdsThroughPatchPanels,
  isPlanProjection,
  resolvePortPipPeer
} from 'src/utils';
import { Node } from './Node/Node';

/** Fallback scale when node size is unknown (cabinets skip scale anyway). */
const HIGHLIGHT_SCALE_BASE = 1;
/** Extra gap (tiles) left between scaled AABBs after centroid expand. */
const HIGHLIGHT_REPEL_GAP_TILES = 0.35;

/**
 * Reference area (tiles²) for size boost: switch-sized → no extra,
 * smaller nodes get a bit more enlarge at low zoom.
 */
const SCALE_REF_AREA = SWITCH_2D_SIZE.width * SWITCH_2D_SIZE.height; // ~171

/**
 * Hover/selection enlarge scale:
 *  - at ~10% zoom: clearly larger (≈1.7–2.0×, tiny nodes a bit more)
 *  - at ~40% zoom and above: nearly invisible (≈1.02)
 *  - smaller nodes get a modest extra boost
 *
 * @param areaTiles  node footprint in grid tiles (width × height)
 * @param zoom       current viewport zoom (1 = 100 %, 0.1 = 10 %)
 */
const computeHighlightScale = (areaTiles: number, zoom: number): number => {
  const sizeRatio = Math.min(1, SCALE_REF_AREA / Math.max(areaTiles, 1));
  // Extra for tiny nodes vs switch-sized: 0 → ~0.25
  const sizeBoost = 0.25 * sizeRatio;

  // Full boost at 10%, none at 40%+. Quadratic falloff so 40% feels almost flat.
  const ZOOM_FULL = 0.1;
  const ZOOM_NONE = 0.4;
  const t = Math.max(
    0,
    Math.min(1, (ZOOM_NONE - zoom) / (ZOOM_NONE - ZOOM_FULL))
  );
  const zoomT = t * t;
  const extra = zoomT * (0.7 + sizeBoost); // 0.70–0.95 at 10%

  if (extra < 0.02) {
    return 1 + 0.02 * sizeRatio; // 1.00–1.02 above ~40%
  }
  return Math.min(2.2, 1 + extra);
};

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
  const zoom = useUiStateStore((state) => state.zoom);
  const shape2dEnlargedItemId = useUiStateStore(
    (state) => state.shape2dEnlargedItemId
  );
  const shape2dNodeHoverItemId = useUiStateStore(
    (state) => state.shape2dNodeHoverItemId
  );
  const itemControls = useUiStateStore((state) => {
    return state.itemControls;
  });
  const selectedItemIds = useUiStateStore((state) => {
    return state.selectedItemIds;
  });
  const focusedPortIds = useUiStateStore((state) => {
    return state.focusedPortIds;
  });
  const shape2dPortHover = useUiStateStore((state) => {
    return state.shape2dPortHover;
  });
  const showLoupe = useUiStateStore((state) => {
    return state.showLoupe;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  /** Node currently under the loupe — must not CSS-scale or the glass drifts. */
  const loupeItemId =
    showLoupe && isPlanProjection(projectionMode)
      ? shape2dPortHover?.itemId ?? null
      : null;
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
    if (!isPlanProjection(projectionMode)) {
      return null;
    }

    const ids = new Set<string>();

    const addCablePeersForItem = (itemId: string) => {
      connectors.forEach((connector) => {
        const touches = connector.anchors.some((anchor) => {
          return anchor.ref.item === itemId;
        });
        if (!touches) return;
        getEndpointItemIds(connector).forEach((id) => {
          ids.add(id);
        });
      });
    };

    if (selectedItemIds.length > 0) {
      selectedItemIds.forEach((id) => ids.add(id));

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
            return selectedItemIds.some((selectedId) =>
              connectorUsesPort(connector, selectedId, portId)
            );
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
        selectedItemIds.forEach((id) => addCablePeersForItem(id));
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
          getEndpointItemIds(connector).forEach((id) => ids.add(id));
        }
      }
    } else if (shape2dNodeHoverItemId) {
      // Preview relations while hovering a device (no selection yet).
      ids.add(shape2dNodeHoverItemId);
      if (iconById.get(shape2dNodeHoverItemId) === SHAPE_2D_CABINET_ID) {
        nodes.forEach((node) => {
          if (node.parentId === shape2dNodeHoverItemId) {
            ids.add(node.id);
          }
        });
      }
      addCablePeersForItem(shape2dNodeHoverItemId);
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
    shape2dNodeHoverItemId
  ]);

  /**
   * Far endpoint of the cable on the RJ45 under the cursor (patch panels are
   * transparent). Emphasized clearly so the peer device is easy to spot.
   */
  const portHoverPeerId = useMemo(() => {
    if (!isPlanProjection(projectionMode)) return null;
    if (!shape2dPortHover?.portId) return null;

    const peer = resolvePortPipPeer({
      connectors,
      modelItems,
      itemId: shape2dPortHover.itemId,
      portId: shape2dPortHover.portId
    });
    if (!peer?.itemId || peer.itemId === shape2dPortHover.itemId) return null;
    if (isPatchPanelItem(modelItems.find((item) => item.id === peer.itemId))) {
      return null;
    }
    return peer.itemId;
  }, [projectionMode, shape2dPortHover, connectors, modelItems]);

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
      const nodeArea = size.width * size.height;
      const nodeScale = computeHighlightScale(nodeArea, zoom);
      entries.push({
        id,
        cx: node.tile.x + size.width / 2,
        cy: node.tile.y + size.height / 2,
        halfW: (size.width * nodeScale) / 2,
        halfH: (size.height * nodeScale) / 2,
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
  }, [selectedItemIds, nodes, modelItems, iconById, zoom]);

  return (
    <>
      {[...nodes].reverse().map((node) => {
        let selectionTone: 'normal' | 'highlighted' | 'related' | 'dimmed' =
          'normal';

        if (highlightedNodeIds) {
          if (selectedItemIds.includes(node.id)) {
            // Clicked / multi-selected — glow (enlarge is header-click only).
            selectionTone = 'highlighted';
          } else if (
            node.parentId &&
            ((selectedItemIds.includes(node.parentId) &&
              selectedItemIds.length > 0) ||
              (shape2dNodeHoverItemId === node.parentId &&
                selectedItemIds.length === 0)) &&
            highlightedNodeIds.has(node.id)
          ) {
            // Gear mounted in a selected / hovered cabinet — keep glow.
            selectionTone = 'highlighted';
          } else if (highlightedNodeIds.has(node.id)) {
            // Hovered device + cable peers: glow only, never scale.
            selectionTone = 'related';
          } else {
            selectionTone = 'dimmed';
          }
        }

        // Port hover peer: emphasize with glow only (scale caused flicker while
        // sliding across ports on the source device).
        if (portHoverPeerId === node.id && selectionTone === 'normal') {
          selectionTone = 'related';
        } else if (portHoverPeerId === node.id && selectionTone === 'dimmed') {
          selectionTone = 'related';
        }

        // Loupe on this node: keep glow if selected, but never enlarge —
        // scale shifts the chassis under the glass ("rozjeżdża się").
        const loupeBlocksEnlarge = loupeItemId === node.id;
        if (loupeBlocksEnlarge && selectionTone === 'highlighted') {
          selectionTone = 'related';
        }

        const isCabinet = iconById.get(node.id) === SHAPE_2D_CABINET_ID;
        const depth = -node.tile.x - node.tile.y;
        const baseOrder = isCabinet
          ? CABINET_Z_BASE + depth
          : DEVICE_Z_BASE + depth;
        const order =
          selectionTone === 'highlighted' || selectionTone === 'related'
            ? baseOrder + 10000
            : baseOrder;

        // Compute per-node highlight scale (cabinet always stays 1 / none).
        const item = modelItems.find((m) => m.id === node.id);
        const size = isCabinet
          ? null
          : (getModelItemSize(item ?? {}) ?? null);
        const highlightScale = size
          ? computeHighlightScale(size.width * size.height, zoom)
          : HIGHLIGHT_SCALE_BASE;

        // Enlarge ONLY after an explicit header click — never on hover / port peer.
        const shouldEnlarge =
          !loupeBlocksEnlarge &&
          !isCabinet &&
          shape2dEnlargedItemId === node.id;

        const showHoverRing =
          !isCabinet &&
          shape2dNodeHoverItemId === node.id &&
          !selectedItemIds.includes(node.id) &&
          shape2dEnlargedItemId !== node.id;

        return (
          <Node
            key={node.id}
            order={order}
            node={node}
            selectionTone={selectionTone}
            dimmedOpacity={dimmedOpacity}
            repelOffset={repelOffsets.get(node.id)}
            highlightScale={highlightScale}
            shouldEnlarge={shouldEnlarge}
            showHoverRing={showHoverRing}
          />
        );
      })}
    </>
  );
});
Nodes.displayName = 'Nodes';
