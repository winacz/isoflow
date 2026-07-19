import { produce } from 'immer';
import {
  ModeActions,
  Coords,
  ItemReference,
  Connector
} from 'src/types';
import { useScene } from 'src/hooks/useScene';
import {
  getItemByIdOrThrow,
  CoordsUtils,
  hasMovedTile,
  getAnchorParent,
  getItemAtTile,
  getShape2dPortAtTile,
  isShape2dPortInUse,
  isShape2dPlacementFree,
  resolveShape2dDragOrigin,
  parseWaypointSegmentId,
  moveWaypointSegment,
  untangleAnchorHairpins,
  applyOrthogonalBendAnchors,
  withOrthogonalPath,
  axisLockTile,
  generateId
} from 'src/utils';
import { getShape2dSize } from 'src/config';

const isConnectorPathDrag = (items: ItemReference[]) => {
  return items.some((item) => {
    return item.type === 'CONNECTOR_ANCHOR' || item.type === 'CONNECTOR_SEGMENT';
  });
};

/** Keep only the dominant axis of a per-frame delta (Shift+drag). */
const axisLockDelta = (delta: Coords): Coords => {
  if (Math.abs(delta.x) >= Math.abs(delta.y)) {
    return { x: delta.x, y: 0 };
  }

  return { x: 0, y: delta.y };
};

const dragItems = (
  items: ItemReference[],
  tile: Coords,
  delta: Coords,
  scene: ReturnType<typeof useScene>,
  options?: {
    isTwoD?: boolean;
    modelItems?: { id: string; icon?: string }[];
    /** Fresh connectors from the model store (avoids stale scene after dblclick). */
    connectors?: Connector[];
    /** Shift: no diagonal routing / axis-locked waypoint moves */
    orthogonal?: boolean;
    /** Mouse-down tile — with itemOrigins enables absolute 2D node placement. */
    mousedownTile?: Coords;
    itemOrigins?: Record<string, Coords>;
  }
) => {
  const modelItems = options?.modelItems ?? [];
  const draggedNodeIds = items
    .filter((item) => {
      return item.type === 'ITEM';
    })
    .map((item) => {
      return item.id;
    });

  const useAbsoluteNodeDrag =
    Boolean(options?.isTwoD) &&
    Boolean(options?.mousedownTile) &&
    Boolean(options?.itemOrigins) &&
    draggedNodeIds.length > 0 &&
    draggedNodeIds.every((id) => {
      return Boolean(options?.itemOrigins?.[id]);
    });

  if (useAbsoluteNodeDrag && options?.mousedownTile && options.itemOrigins) {
    const totalDelta = CoordsUtils.subtract(tile, options.mousedownTile);

    // Apply axis sliding per node so pressing into a neighbor doesn't freeze
    // the free axis (felt like snap stealing the drag).
    const nextTiles: Record<string, Coords> = {};
    let anyMoved = false;

    for (const id of draggedNodeIds) {
      const size = getShape2dSize(
        modelItems.find((candidate) => {
          return candidate.id === id;
        })?.icon ?? ''
      ) ?? { width: 1, height: 1 };

      let current: Coords;
      try {
        current = getItemByIdOrThrow(scene.items, id).value.tile;
      } catch {
        continue;
      }

      const desired = CoordsUtils.add(options.itemOrigins![id], totalDelta);
      const resolved = resolveShape2dDragOrigin({
        desired,
        current,
        size,
        items: scene.items,
        modelItems,
        excludeItemIds: draggedNodeIds
      });

      if (!resolved) continue;

      nextTiles[id] = resolved;
      if (!CoordsUtils.isEqual(resolved, current)) {
        anyMoved = true;
      }
    }

    if (anyMoved) {
      Object.entries(nextTiles).forEach(([id, nextTile]) => {
        const current = getItemByIdOrThrow(scene.items, id).value.tile;
        if (CoordsUtils.isEqual(nextTile, current)) return;
        scene.updateViewItem(id, { tile: nextTile });
      });
    }

    return;
  }

  if (CoordsUtils.isEqual(delta, CoordsUtils.zero())) {
    return;
  }

  // Group waypoint drag (marquee-selected): move every tile anchor by delta.
  const anchorItems = items.filter((item) => {
    return item.type === 'CONNECTOR_ANCHOR';
  });

  if (anchorItems.length > 1) {
    const connectors = options?.connectors ?? scene.connectors;
    const byConnector = new Map<string, Set<string>>();

    anchorItems.forEach((anchorItem) => {
      try {
        const parent = getAnchorParent(anchorItem.id, connectors);
        const set = byConnector.get(parent.id) ?? new Set<string>();
        set.add(anchorItem.id);
        byConnector.set(parent.id, set);
      } catch {
        // anchor may have been removed mid-drag
      }
    });

    byConnector.forEach((anchorIds, connectorId) => {
      const connector = getItemByIdOrThrow(connectors, connectorId).value;

      const nextAnchors = connector.anchors.map((anchor) => {
        if (!anchorIds.has(anchor.id) || !anchor.ref.tile) return anchor;
        return {
          ...anchor,
          ref: { tile: CoordsUtils.add(anchor.ref.tile, delta) }
        };
      });

      scene.updateConnector(
        connectorId,
        { anchors: nextAnchors },
        { overlapResolve: 'off' }
      );
    });

    return;
  }

  // Block the whole move if any dragged node would overlap another
  if (draggedNodeIds.length > 0) {
    const blocked = draggedNodeIds.some((id) => {
      const node = getItemByIdOrThrow(scene.items, id).value;
      const modelItem = modelItems.find((candidate) => {
        return candidate.id === id;
      });
      const size = getShape2dSize(modelItem?.icon ?? '') ?? {
        width: 1,
        height: 1
      };

      return !isShape2dPlacementFree({
        origin: CoordsUtils.add(node.tile, delta),
        size,
        items: scene.items,
        modelItems,
        excludeItemIds: draggedNodeIds
      });
    });

    if (blocked) {
      return;
    }
  }

  items.forEach((item) => {
    if (item.type === 'ITEM') {
      const node = getItemByIdOrThrow(scene.items, item.id).value;

      scene.updateViewItem(item.id, {
        tile: CoordsUtils.add(node.tile, delta)
      });
    } else if (item.type === 'RECTANGLE') {
      const rectangle = getItemByIdOrThrow(scene.rectangles, item.id).value;
      const newFrom = CoordsUtils.add(rectangle.from, delta);
      const newTo = CoordsUtils.add(rectangle.to, delta);

      scene.updateRectangle(item.id, { from: newFrom, to: newTo });
    } else if (item.type === 'TEXTBOX') {
      const textBox = getItemByIdOrThrow(scene.textBoxes, item.id).value;

      scene.updateTextBox(item.id, {
        tile: CoordsUtils.add(textBox.tile, delta)
      });
    } else if (item.type === 'CONNECTOR_SEGMENT') {
      const { connectorId, startAnchorId, endAnchorId } =
        parseWaypointSegmentId(item.id);
      const connectors = options?.connectors ?? scene.connectors;
      const connector = getItemByIdOrThrow(connectors, connectorId).value;

      const moved = moveWaypointSegment(
        connector.anchors,
        startAnchorId,
        endAnchorId,
        delta
      );

      let nextAnchors =
        options?.isTwoD && options.orthogonal
          ? applyOrthogonalBendAnchors({
              anchors: moved,
              draggedAnchorId: startAnchorId,
              hint: tile,
              view: scene.currentView,
              modelItems: options.modelItems
            })
          : moved;

      if (options?.isTwoD) {
        nextAnchors = untangleAnchorHairpins(
          nextAnchors,
          scene.currentView,
          options.modelItems
        );
      }

      scene.updateConnector(
        connector.id,
        {
          anchors: nextAnchors
        },
        { overlapResolve: 'off' }
      );
    } else if (item.type === 'CONNECTOR_ANCHOR') {
      const connectors = options?.connectors ?? scene.connectors;
      const connector = getAnchorParent(item.id, connectors);

      if (options?.isTwoD && options.orthogonal) {
        let bent = applyOrthogonalBendAnchors({
          anchors: connector.anchors,
          draggedAnchorId: item.id,
          hint: tile,
          view: scene.currentView,
          modelItems: options.modelItems
        });

        bent = untangleAnchorHairpins(
          bent,
          scene.currentView,
          options.modelItems
        );

        scene.updateConnector(
          connector.id,
          {
            anchors: bent
          },
          { overlapResolve: 'off' }
        );
        return;
      }

      const newConnector = produce(connector, (draft) => {
        const anchor = getItemByIdOrThrow(connector.anchors, item.id);

        if (options?.isTwoD) {
          const viewConnectors =
            options.connectors ?? scene.currentView.connectors ?? [];
          const portHit = getShape2dPortAtTile({
            tile,
            scene,
            modelItems: options.modelItems ?? [],
            isPortAvailable: (hit) => {
              return !isShape2dPortInUse({
                itemId: hit.itemId,
                portId: hit.portId,
                connectors: viewConnectors,
                excludeAnchorId: item.id
              });
            }
          });

          const wasPortEndpoint = Boolean(
            anchor.value.ref.item && anchor.value.ref.port
          );

          if (portHit) {
            draft.anchors[anchor.index] = {
              ...anchor.value,
              ref: {
                item: portHit.itemId,
                port: portHit.portId
              }
            };
            return;
          }

          // Dragging a port handle off the jack: keep the port attachment and
          // place/move an exit WP at `tile` (so you can pull a vertical stub up).
          if (wasPortEndpoint) {
            const isFirst = anchor.index === 0;
            const neighborIndex = isFirst
              ? 1
              : Math.max(0, anchor.index - 1);
            const neighbor = draft.anchors[neighborIndex];

            if (
              neighbor &&
              neighbor.id !== anchor.value.id &&
              neighbor.ref.tile
            ) {
              draft.anchors[neighborIndex] = {
                ...neighbor,
                ref: { tile: { ...tile } }
              };
            } else if (isFirst) {
              draft.anchors.splice(1, 0, {
                id: generateId(),
                ref: { tile: { ...tile } }
              });
            } else {
              draft.anchors.splice(anchor.index, 0, {
                id: generateId(),
                ref: { tile: { ...tile } }
              });
            }
            return;
          }

          draft.anchors[anchor.index] = {
            ...anchor.value,
            ref: {
              tile
            }
          };
          return;
        }

        const itemAtTile = getItemAtTile({ tile, scene });

        switch (itemAtTile?.type) {
          case 'ITEM':
            draft.anchors[anchor.index] = {
              ...anchor.value,
              ref: {
                item: itemAtTile.id
              }
            };
            break;
          case 'CONNECTOR_ANCHOR':
            draft.anchors[anchor.index] = {
              ...anchor.value,
              ref: {
                anchor: itemAtTile.id
              }
            };
            break;
          default:
            draft.anchors[anchor.index] = {
              ...anchor.value,
              ref: {
                tile
              }
            };
            break;
        }
      });

      if (options?.isTwoD) {
        const movedAnchor = newConnector.anchors.find((anchor) => {
          return anchor.id === item.id;
        });

        // Overlaps use stack badges — no snap/reject on tile WP drag.
        if (movedAnchor?.ref.tile) {
          scene.updateConnector(
            connector.id,
            {
              anchors: untangleAnchorHairpins(
                newConnector.anchors,
                scene.currentView,
                options.modelItems
              )
            },
            { overlapResolve: 'off' }
          );
          return;
        }
      }

      scene.updateConnector(connector.id, newConnector, {
        overlapResolve: 'off'
      });
    }
  });
};

export const DragItems: ModeActions = {
  entry: ({ uiState, rendererRef, scene }) => {
    if (uiState.mode.type !== 'DRAG_ITEMS' || !uiState.mouse.mousedown) return;

    scene.beginHistoryTransaction();
    const renderer = rendererRef;
    renderer.style.userSelect = 'none';

    // Ensure item origins exist (absolute 2D placement vs obstacles)
    if (!uiState.mode.itemOrigins || Object.keys(uiState.mode.itemOrigins).length === 0) {
      const itemOrigins: Record<string, Coords> = {};
      uiState.mode.items.forEach((item) => {
        if (item.type !== 'ITEM') return;
        try {
          itemOrigins[item.id] = {
            ...getItemByIdOrThrow(scene.items, item.id).value.tile
          };
        } catch {
          // ignore
        }
      });

      if (Object.keys(itemOrigins).length > 0) {
        uiState.actions.setMode({
          ...uiState.mode,
          itemOrigins
        });
      }
    }
  },
  exit: ({ rendererRef, scene }) => {
    scene.endHistoryTransaction();
    const renderer = rendererRef;
    renderer.style.userSelect = 'auto';
  },
  mousemove: ({ uiState, scene, model }) => {
    if (uiState.mode.type !== 'DRAG_ITEMS' || !uiState.mouse.mousedown) return;

    const mode = uiState.mode;
    const freshModel = model.actions.get();
    const freshView = freshModel.views.find((view) => {
      return view.id === uiState.view;
    });

    const isTwoD = uiState.projectionMode === 'TWO_D';
    const orthogonal =
      isTwoD && uiState.mouse.shiftKey && isConnectorPathDrag(mode.items);

    const dragOpts = {
      isTwoD,
      modelItems: freshModel.items,
      connectors: freshView?.connectors ?? scene.connectors,
      orthogonal,
      mousedownTile: uiState.mouse.mousedown.tile,
      itemOrigins: mode.itemOrigins
    };

    const runDrag = (tile: Coords, delta: Coords) => {
      const apply = () => {
        dragItems(mode.items, tile, delta, scene, dragOpts);
      };

      if (orthogonal) {
        withOrthogonalPath(apply, tile);
      } else {
        apply();
      }
    };

    if (mode.isInitialMovement) {
      const origin = uiState.mouse.mousedown.tile;
      const rawTile = uiState.mouse.position.tile;
      const tile = orthogonal ? axisLockTile(rawTile, origin) : rawTile;
      const delta = CoordsUtils.subtract(tile, origin);

      runDrag(tile, delta);

      uiState.actions.setMode(
        produce(mode, (draft) => {
          draft.isInitialMovement = false;
        })
      );

      return;
    }

    if (!hasMovedTile(uiState.mouse) || !uiState.mouse.delta?.tile) return;

    const origin = uiState.mouse.mousedown.tile;
    const rawTile = uiState.mouse.position.tile;
    const tile = orthogonal ? axisLockTile(rawTile, origin) : rawTile;
    const delta = orthogonal
      ? axisLockDelta(uiState.mouse.delta.tile)
      : uiState.mouse.delta.tile;

    runDrag(tile, delta);
  },
  mouseup: ({ uiState, scene }) => {
    scene.endHistoryTransaction();
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};
