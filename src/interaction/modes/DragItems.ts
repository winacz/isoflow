import { produce } from 'immer';
import {
  ModeActions,
  Coords,
  ItemReference,
  Connector,
  Scroll,
  State
} from 'src/types';
import { useScene } from 'src/hooks/useScene';
import { useStackFanStore } from 'src/stores/stackFanStore';
import {
  getItemByIdOrThrow,
  CoordsUtils,
  hasMovedTile,
  getAnchorParent,
  getItemAtTile,
  getShape2dPortAtTile,
  isShape2dPortUnavailable,
  isShape2dPlacementFree,
  resolveShape2dDragOrigin,
  parseWaypointSegmentId,
  moveWaypointSegment,
  levelWaypointTiles,
  untangleAnchorHairpins,
  applyOrthogonalBendAnchors,
  withOrthogonalPath,
  axisLockTile,
  generateId,
  hasTileWaypointAt,
  dedupeTileWaypoints,
  collectTileWaypoints,
  snapTileToWaypointGuides,
  isRackFormFactorItem,
  isFullWidthRackItem,
  isCabinetItem,
  findCabinetAtTile,
  resolveCabinetSnap,
  getMountedChildren,
  getRackSpanUnits,
  screenToTile2dContinuous,
  snapTile2dToGrid,
  getGridSnapStep,
  getPanScrollFromDelta,
  getDragEdgeScrollVelocity,
  isDragEdgeVelocityActive,
  DRAG_EDGE_DELAY_MS
} from 'src/utils';
import { getShape2dSize, getModelItemSize } from 'src/config';
import { useCabinetSnapStore } from 'src/stores/cabinetSnapStore';
import { useNodeDragStore } from 'src/stores/nodeDragStore';

/** Live scroll while edge-auto-panning (keeps drag under the cursor). */
let liveScroll: Scroll | null = null;
/** Fixed world tile under the mouse at drag start (2D free-drag). */
let dragMousedownTile: Coords | null = null;
let edgeRafId = 0;
let edgeHoldSince = 0;
let edgeLastScreen: Coords | null = null;
let edgeDragState: State | null = null;
/** Skip the “mouse must move” gate when edge-scroll re-applies the drag. */
let edgeScrollApplying = false;

const stopDragEdgeScroll = () => {
  if (edgeRafId) {
    cancelAnimationFrame(edgeRafId);
    edgeRafId = 0;
  }
  edgeHoldSince = 0;
  edgeLastScreen = null;
  edgeDragState = null;
};

const clearDragSession = () => {
  stopDragEdgeScroll();
  liveScroll = null;
  dragMousedownTile = null;
  edgeScrollApplying = false;
};

const scheduleDragEdgeScroll = (state: State) => {
  if (state.uiState.mode.type !== 'DRAG_ITEMS') return;
  if (state.uiState.projectionMode !== 'TWO_D') return;

  edgeLastScreen = { ...state.uiState.mouse.position.screen };
  edgeDragState = state;

  const velocity = getDragEdgeScrollVelocity(
    edgeLastScreen,
    state.rendererSize
  );

  if (!isDragEdgeVelocityActive(velocity)) {
    edgeHoldSince = 0;
    if (edgeRafId) {
      cancelAnimationFrame(edgeRafId);
      edgeRafId = 0;
    }
    // Manual / store scroll wins when not in the edge zone.
    liveScroll = state.uiState.scroll;
    return;
  }

  if (!edgeHoldSince) {
    edgeHoldSince = performance.now();
  }

  if (edgeRafId) return;

  const tick = () => {
    edgeRafId = 0;
    const active = edgeDragState;
    const screen = edgeLastScreen;
    if (
      !active ||
      !screen ||
      active.uiState.mode.type !== 'DRAG_ITEMS' ||
      !active.uiState.mouse.mousedown
    ) {
      stopDragEdgeScroll();
      return;
    }

    const vel = getDragEdgeScrollVelocity(screen, active.rendererSize);
    if (!isDragEdgeVelocityActive(vel)) {
      edgeHoldSince = 0;
      liveScroll = active.uiState.scroll;
      return;
    }

    if (performance.now() - edgeHoldSince < DRAG_EDGE_DELAY_MS) {
      edgeRafId = requestAnimationFrame(tick);
      return;
    }

    if (!liveScroll) {
      liveScroll = active.uiState.scroll;
    }
    liveScroll = getPanScrollFromDelta(liveScroll, vel);
    active.uiState.actions.setScroll(liveScroll);

    edgeScrollApplying = true;
    try {
      DragItems.mousemove?.({
        ...active,
        uiState: {
          ...active.uiState,
          scroll: liveScroll,
          mouse: {
            ...active.uiState.mouse,
            position: {
              screen,
              tile: screenToTile2dContinuous({
                mouse: screen,
                zoom: active.uiState.zoom,
                scroll: liveScroll,
                rendererSize: active.rendererSize
              })
            }
          }
        }
      });
    } finally {
      edgeScrollApplying = false;
    }

    edgeRafId = requestAnimationFrame(tick);
  };

  edgeRafId = requestAnimationFrame(tick);
};

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
    modelItems?: { id: string; icon?: string; rackUnits?: number }[];
    /** Fresh connectors from the model store (avoids stale scene after dblclick). */
    connectors?: Connector[];
    /** Shift: no diagonal routing / axis-locked waypoint moves */
    orthogonal?: boolean;
    /** Mouse-down tile — with itemOrigins enables absolute 2D node placement. */
    mousedownTile?: Coords;
    itemOrigins?: Record<string, Coords>;
    /** Tile WP positions at drag start (absolute path-drag). */
    anchorOrigins?: Record<string, Coords>;
    /** Snap dragged WPs to axes of other waypoints. */
    waypointSnap?: {
      waypoints: ReturnType<typeof collectTileWaypoints>;
      excludeIds: Set<string>;
    };
    /**
     * Smooth 2D node drag: follow fractional tiles without collision push.
     * Grid snap + placement resolve happen on mouseup.
     */
    freePlacement?: boolean;
  }
) => {
  const modelItems = options?.modelItems ?? [];
  const snapWpTile = (candidate: Coords, selfId?: string) => {
    if (!options?.isTwoD || !options.waypointSnap) return candidate;
    const exclude = new Set(options.waypointSnap.excludeIds);
    if (selfId) exclude.add(selfId);
    return snapTileToWaypointGuides(
      candidate,
      options.waypointSnap.waypoints,
      exclude
    );
  };
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
    const setCabinetHighlight = useCabinetSnapStore.getState().setHighlight;
    const clearCabinetHighlight = useCabinetSnapStore.getState().clear;

    const nextTiles: Record<string, Coords> = {};
    const nextMount: Record<
      string,
      { parentId?: string; rackUnit?: number } | 'clear'
    > = {};
    let anyMoved = false;

    // Expand selection with children of dragged cabinets.
    const moveIds = new Set(draggedNodeIds);
    draggedNodeIds.forEach((id) => {
      const modelItem = modelItems.find((candidate) => {
        return candidate.id === id;
      });
      if (!modelItem || !isCabinetItem(modelItem)) return;
      getMountedChildren(id, scene.items).forEach((child) => {
        moveIds.add(child.id);
      });
    });

    const excludeIds = [...moveIds];
    let highlight: { cabinetId: string; unit: number } | null = null;

    for (const id of draggedNodeIds) {
      const modelItem = modelItems.find((candidate) => {
        return candidate.id === id;
      });
      const size = getModelItemSize(modelItem ?? {}) ??
        getShape2dSize(modelItem?.icon ?? '') ?? { width: 1, height: 1 };

      let current: Coords;
      try {
        current = getItemByIdOrThrow(scene.items, id).value.tile;
      } catch {
        continue;
      }

      const originTile = options.itemOrigins![id];
      if (!originTile) continue;

      const desired = CoordsUtils.add(originTile, totalDelta);

      // RACK switch → snap into cabinet slot
      if (modelItem && isRackFormFactorItem(modelItem)) {
        const cabinet = findCabinetAtTile({
          tile,
          viewItems: scene.items,
          modelItems
        });
        if (cabinet) {
          const snap = resolveCabinetSnap({
            cursorTile: tile,
            cabinetViewItem: cabinet.viewItem,
            cabinetModelItem: cabinet.modelItem,
            viewItems: scene.items,
            modelItems,
            excludeItemIds: excludeIds,
            fullWidth: isFullWidthRackItem(modelItem),
            spanUnits: getRackSpanUnits(modelItem)
          });
          if (snap) {
            nextTiles[id] = snap.tile;
            nextMount[id] = {
              parentId: cabinet.viewItem.id,
              rackUnit: snap.rackUnit
            };
            highlight = {
              cabinetId: cabinet.viewItem.id,
              unit: snap.rackUnit
            };
            if (!CoordsUtils.isEqual(snap.tile, current)) {
              anyMoved = true;
            }
            continue;
          }
        }
        nextMount[id] = 'clear';
      }

      const isCabinet = Boolean(modelItem && isCabinetItem(modelItem));
      const childIds = isCabinet
        ? getMountedChildren(id, scene.items).map((child) => child.id)
        : [];

      let resolved: Coords | null;
      if (options.freePlacement) {
        // Follow the cursor continuously; snap / collide on mouseup.
        resolved = desired;
      } else {
        resolved = resolveShape2dDragOrigin({
          desired,
          current,
          size,
          items: scene.items,
          modelItems,
          excludeItemIds: [...excludeIds, ...childIds],
          ignoreCabinets: !isCabinet
        });
      }

      if (!resolved) continue;

      nextTiles[id] = resolved;
      if (!CoordsUtils.isEqual(resolved, current)) {
        anyMoved = true;
      }

      // Move mounted children with the cabinet
      if (isCabinet) {
        const cabDelta = CoordsUtils.subtract(resolved, current);
        getMountedChildren(id, scene.items).forEach((child) => {
          const childNext = CoordsUtils.add(child.tile, cabDelta);
          nextTiles[child.id] = childNext;
          if (!CoordsUtils.isEqual(childNext, child.tile)) {
            anyMoved = true;
          }
        });
      }
    }

    if (highlight) {
      setCabinetHighlight(highlight.cabinetId, highlight.unit);
    } else {
      clearCabinetHighlight();
    }

    if (options.freePlacement) {
      // Always publish the latest live tiles (even when back at origin) so
      // the transient store cannot keep a stale offset.
      if (
        Object.keys(nextTiles).length > 0 ||
        Object.keys(nextMount).length > 0
      ) {
        useNodeDragStore.getState().setLive(nextTiles, nextMount);
      }
      return;
    }

    if (anyMoved || Object.keys(nextMount).length > 0) {
      Object.entries(nextTiles).forEach(([id, nextTile]) => {
        const current = getItemByIdOrThrow(scene.items, id).value;
        const mount = nextMount[id];
        const patch: {
          tile?: Coords;
          parentId?: string | undefined;
          rackUnit?: number | undefined;
        } = {};

        if (!CoordsUtils.isEqual(nextTile, current.tile)) {
          patch.tile = nextTile;
        }
        if (mount === 'clear') {
          if (current.parentId || current.rackUnit !== undefined) {
            patch.parentId = undefined;
            patch.rackUnit = undefined;
          }
        } else if (mount) {
          patch.parentId = mount.parentId;
          patch.rackUnit = mount.rackUnit;
        }

        if (Object.keys(patch).length > 0) {
          scene.updateViewItem(id, patch);
        }
      });

      // Apply mount clears / updates for items that didn't change tile
      Object.entries(nextMount).forEach(([id, mount]) => {
        if (nextTiles[id]) return;
        const current = getItemByIdOrThrow(scene.items, id).value;
        if (mount === 'clear') {
          if (current.parentId || current.rackUnit !== undefined) {
            scene.updateViewItem(id, {
              parentId: undefined,
              rackUnit: undefined
            });
          }
        } else {
          scene.updateViewItem(id, {
            parentId: mount.parentId,
            rackUnit: mount.rackUnit
          });
        }
      });
    }

    return;
  }

  if (CoordsUtils.isEqual(delta, CoordsUtils.zero())) {
    return;
  }

  // Group waypoint drag (marquee-selected): level along the drag axis so
  // trailing WPs catch up before the pack translates (same as segment handles).
  const anchorItems = items.filter((item) => {
    return item.type === 'CONNECTOR_ANCHOR';
  });

  if (anchorItems.length > 1) {
    const connectors = options?.connectors ?? scene.connectors;
    const origins = options?.anchorOrigins;

    type SelectedWp = {
      anchorId: string;
      connectorId: string;
      tile: Coords;
    };

    const selected: SelectedWp[] = [];
    anchorItems.forEach((anchorItem) => {
      try {
        const parent = getAnchorParent(anchorItem.id, connectors);
        const origin = origins?.[anchorItem.id];
        const live = parent.anchors.find((candidate) => {
          return candidate.id === anchorItem.id;
        })?.ref.tile;
        const tile = origin ?? (live ? { ...live } : null);
        if (!tile) return;
        selected.push({
          anchorId: anchorItem.id,
          connectorId: parent.id,
          tile
        });
      } catch {
        // anchor may have been removed mid-drag
      }
    });

    if (selected.length === 0) return;

    const leveled = levelWaypointTiles(
      selected.map((item) => item.tile),
      delta
    );

    const nextByAnchor = new Map<string, Coords>();
    selected.forEach((item, index) => {
      nextByAnchor.set(item.anchorId, snapWpTile(leveled[index], item.anchorId));
    });

    const byConnector = new Map<string, Set<string>>();
    selected.forEach((item) => {
      const set = byConnector.get(item.connectorId) ?? new Set<string>();
      set.add(item.anchorId);
      byConnector.set(item.connectorId, set);
    });

    byConnector.forEach((anchorIds, connectorId) => {
      const connector = getItemByIdOrThrow(connectors, connectorId).value;

      const nextAnchors = connector.anchors.map((anchor) => {
        if (!anchorIds.has(anchor.id) || !anchor.ref.tile) return anchor;
        if (anchor.locked) return anchor;
        const nextTile = nextByAnchor.get(anchor.id);
        if (!nextTile) return anchor;

        if (
          hasTileWaypointAt(connector.anchors, nextTile, anchor.id) ||
          [...anchorIds].some((otherId) => {
            if (otherId === anchor.id) return false;
            const otherNext = nextByAnchor.get(otherId);
            return otherNext
              ? CoordsUtils.isEqual(otherNext, nextTile)
              : false;
          })
        ) {
          return anchor;
        }

        return {
          ...anchor,
          ref: { tile: nextTile }
        };
      });

      scene.updateConnector(
        connectorId,
        { anchors: dedupeTileWaypoints(nextAnchors) },
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
      if (node.locked) return;

      scene.updateViewItem(item.id, {
        tile: CoordsUtils.add(node.tile, delta)
      });
    } else if (item.type === 'RECTANGLE') {
      const rectangle = getItemByIdOrThrow(scene.rectangles, item.id).value;
      if (rectangle.locked) return;
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
      const startA = connector.anchors.find((a) => {
        return a.id === startAnchorId;
      });
      const endA = connector.anchors.find((a) => {
        return a.id === endAnchorId;
      });
      // Locked waypoints stay fixed; still allow dragging the free end.
      if (startA?.locked && endA?.locked) {
        return;
      }
      if (startAnchorId === endAnchorId && startA?.locked) {
        return;
      }
      const origins = options?.anchorOrigins;
      const originStart = origins?.[startAnchorId];
      const originEnd = origins?.[endAnchorId];

      let moved;
      if (originStart && originEnd) {
        // Absolute delta from drag-start tiles (avoids compounding with snap).
        if (startAnchorId === endAnchorId) {
          const nextTile = CoordsUtils.add(originStart, delta);
          moved = connector.anchors.map((anchor) => {
            if (anchor.id === startAnchorId && anchor.ref.tile) {
              return { ...anchor, ref: { tile: nextTile } };
            }
            return anchor;
          });
        } else {
          const [leveledStart, leveledEnd] = levelWaypointTiles(
            [originStart, originEnd],
            delta
          );
          const nextStart = startA?.locked ? { ...originStart } : leveledStart;
          const nextEnd = endA?.locked ? { ...originEnd } : leveledEnd;
          // Never stack both segment WPs on the same tile.
          if (CoordsUtils.isEqual(nextStart, nextEnd)) {
            return;
          }
          moved = connector.anchors.map((anchor) => {
            if (anchor.id === startAnchorId && anchor.ref.tile) {
              return { ...anchor, ref: { tile: nextStart } };
            }
            if (anchor.id === endAnchorId && anchor.ref.tile) {
              return { ...anchor, ref: { tile: nextEnd } };
            }
            return anchor;
          });
        }
      } else {
        moved = moveWaypointSegment(
          connector.anchors,
          startAnchorId,
          endAnchorId,
          delta
        );
        // Re-pin locked ends after relative move.
        if (startA?.locked || endA?.locked) {
          moved = moved.map((anchor) => {
            if (anchor.id === startAnchorId && startA?.locked && startA.ref.tile) {
              return { ...anchor, ref: { tile: { ...startA.ref.tile } } };
            }
            if (anchor.id === endAnchorId && endA?.locked && endA.ref.tile) {
              return { ...anchor, ref: { tile: { ...endA.ref.tile } } };
            }
            return anchor;
          });
        }
      }

      const snapped = moved.map((anchor) => {
        if (
          (anchor.id !== startAnchorId && anchor.id !== endAnchorId) ||
          !anchor.ref.tile ||
          anchor.locked
        ) {
          return anchor;
        }
        return {
          ...anchor,
          ref: { tile: snapWpTile(anchor.ref.tile, anchor.id) }
        };
      });

      const freeDragId = startA?.locked
        ? endAnchorId
        : endA?.locked
          ? startAnchorId
          : startAnchorId;

      let nextAnchors =
        options?.isTwoD && options.orthogonal
          ? applyOrthogonalBendAnchors({
              anchors: snapped,
              draggedAnchorId: freeDragId,
              hint: tile,
              view: scene.currentView,
              modelItems: options.modelItems
            })
          : snapped;

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
      const target = connector.anchors.find((a) => {
        return a.id === item.id;
      });
      if (target?.locked) {
        return;
      }

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
              return !isShape2dPortUnavailable({
                itemId: hit.itemId,
                portId: hit.portId,
                connectors: viewConnectors,
                modelItems: options.modelItems ?? [],
                viewItems: scene.items,
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
            if (hasTileWaypointAt(draft.anchors, tile)) {
              return;
            }

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

          if (hasTileWaypointAt(draft.anchors, tile, item.id)) {
            return;
          }

          const snappedTile = snapWpTile(tile, item.id);
          if (
            hasTileWaypointAt(draft.anchors, snappedTile, item.id) &&
            !CoordsUtils.isEqual(snappedTile, tile)
          ) {
            return;
          }

          draft.anchors[anchor.index] = {
            ...anchor.value,
            ref: {
              tile: snappedTile
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

    clearDragSession();
    useNodeDragStore.getState().clear();
    scene.beginHistoryTransaction();
    const renderer = rendererRef;
    renderer.style.userSelect = 'none';

    // Ensure item / anchor origins exist (absolute 2D placement vs obstacles)
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

    if (
      !uiState.mode.anchorOrigins ||
      Object.keys(uiState.mode.anchorOrigins).length === 0
    ) {
      const anchorOrigins: Record<string, Coords> = {};
      const record = (anchorId: string) => {
        try {
          const parent = getAnchorParent(anchorId, scene.connectors);
          const anchor = parent.anchors.find((candidate) => {
            return candidate.id === anchorId;
          });
          if (anchor?.ref.tile) {
            anchorOrigins[anchorId] = { ...anchor.ref.tile };
          }
        } catch {
          // ignore
        }
      };

      uiState.mode.items.forEach((item) => {
        if (item.type === 'CONNECTOR_ANCHOR') {
          record(item.id);
          return;
        }
        if (item.type === 'CONNECTOR_SEGMENT') {
          try {
            const parsed = parseWaypointSegmentId(item.id);
            record(parsed.startAnchorId);
            record(parsed.endAnchorId);
          } catch {
            // ignore
          }
        }
      });

      if (Object.keys(anchorOrigins).length > 0) {
        uiState.actions.setMode({
          ...uiState.mode,
          anchorOrigins
        });
      }
    }
  },
  exit: ({ rendererRef, scene }) => {
    clearDragSession();
    useCabinetSnapStore.getState().clear();
    useNodeDragStore.getState().clear();
    scene.endHistoryTransaction();
    const renderer = rendererRef;
    renderer.style.userSelect = 'auto';
  },
  mousemove: (state) => {
    const { uiState, scene, model, rendererSize } = state;
    if (uiState.mode.type !== 'DRAG_ITEMS' || !uiState.mouse.mousedown) return;

    if (!liveScroll) {
      liveScroll = uiState.scroll;
    } else if (!edgeScrollApplying) {
      // Keep in sync with trackpad pan unless edge-scroll owns liveScroll.
      liveScroll = uiState.scroll;
    }

    const mode = uiState.mode;
    const freshModel = model.actions.get();
    const freshView = freshModel.views.find((view) => {
      return view.id === uiState.view;
    });

    const isTwoD = uiState.projectionMode === 'TWO_D';
    const orthogonal =
      isTwoD && uiState.mouse.shiftKey && isConnectorPathDrag(mode.items);

    const isNodeFreeDrag =
      isTwoD &&
      Boolean(mode.itemOrigins) &&
      mode.items.length > 0 &&
      mode.items.every((item) => {
        return item.type === 'ITEM';
      });

    const excludeIds = new Set<string>();
    const isSegmentDrag = mode.items.some((item) => {
      return item.type === 'CONNECTOR_SEGMENT';
    });
    if (isConnectorPathDrag(mode.items)) {
      mode.items.forEach((item) => {
        if (item.type === 'CONNECTOR_ANCHOR') {
          excludeIds.add(item.id);
        }
        if (item.type === 'CONNECTOR_SEGMENT') {
          try {
            const parsed = parseWaypointSegmentId(item.id);
            excludeIds.add(parsed.startAnchorId);
            excludeIds.add(parsed.endAnchorId);
          } catch {
            // ignore
          }
        }
      });
    }

    // Segment handles must move freely (esp. stacked cables sharing an axis).
    // Guide-snap is only for single / multi waypoint drags.
    const waypointSnap =
      isTwoD && excludeIds.size > 0 && !isSegmentDrag
        ? {
            waypoints: collectTileWaypoints(
              freshView?.connectors ?? scene.connectors,
              scene.currentView,
              freshModel.items
            ),
            excludeIds
          }
        : undefined;

    const scroll = liveScroll ?? uiState.scroll;
    const continuousOpts = isNodeFreeDrag
      ? {
          mouse: uiState.mouse.position.screen,
          zoom: uiState.zoom,
          scroll,
          rendererSize
        }
      : null;

    if (isNodeFreeDrag && uiState.mouse.mousedown && !dragMousedownTile) {
      dragMousedownTile = screenToTile2dContinuous({
        mouse: uiState.mouse.mousedown.screen,
        zoom: uiState.zoom,
        scroll,
        rendererSize
      });
    }

    const continuousMousedown =
      isNodeFreeDrag && dragMousedownTile
        ? dragMousedownTile
        : continuousOpts
          ? screenToTile2dContinuous({
              ...continuousOpts,
              mouse: uiState.mouse.mousedown.screen
            })
          : null;

    const dragOpts = {
      isTwoD,
      modelItems: freshModel.items,
      connectors: freshView?.connectors ?? scene.connectors,
      orthogonal,
      mousedownTile: continuousMousedown ?? uiState.mouse.mousedown.tile,
      itemOrigins: mode.itemOrigins,
      anchorOrigins: mode.anchorOrigins,
      waypointSnap,
      freePlacement: isNodeFreeDrag
    };

    const useAbsolutePathDelta =
      Boolean(mode.anchorOrigins) &&
      Object.keys(mode.anchorOrigins ?? {}).length > 0;

    const runDrag = (rawTile: Coords, rawDelta: Coords) => {
      let tile = rawTile;
      let delta = rawDelta;

      if (waypointSnap) {
        // Snap the drag cursor to nearby WP axes.
        tile = snapTileToWaypointGuides(
          rawTile,
          waypointSnap.waypoints,
          waypointSnap.excludeIds
        );
      }

      // Path drag with origins: always absolute from mousedown (snap-safe).
      // Without origins, keep the caller delta (per-frame) — never compound
      // absolute deltas onto already-moved anchors.
      if (useAbsolutePathDelta && uiState.mouse.mousedown) {
        delta = CoordsUtils.subtract(tile, uiState.mouse.mousedown.tile);
        if (orthogonal) {
          delta = axisLockDelta(delta);
          tile = CoordsUtils.add(uiState.mouse.mousedown.tile, delta);
        }
      } else if (orthogonal && uiState.mouse.mousedown) {
        delta = axisLockDelta(
          CoordsUtils.subtract(tile, uiState.mouse.mousedown.tile)
        );
        tile = CoordsUtils.add(uiState.mouse.mousedown.tile, delta);
      }

      const apply = () => {
        dragItems(mode.items, tile, delta, scene, dragOpts);
      };

      if (orthogonal) {
        withOrthogonalPath(apply, tile);
      } else {
        apply();
      }
    };

    const origin = continuousMousedown ?? uiState.mouse.mousedown.tile;
    const rawTile = continuousOpts
      ? screenToTile2dContinuous(continuousOpts)
      : uiState.mouse.position.tile;

    if (mode.isInitialMovement) {
      const tile = orthogonal ? axisLockTile(rawTile, origin) : rawTile;
      const delta = CoordsUtils.subtract(tile, origin);

      runDrag(tile, delta);

      uiState.actions.setMode(
        produce(mode, (draft) => {
          draft.isInitialMovement = false;
        })
      );

      if (!edgeScrollApplying) {
        scheduleDragEdgeScroll(state);
      }
      return;
    }

    // Node free-drag tracks pixels; path drag still waits for tile steps.
    // Edge-scroll re-applies while the cursor is still — skip the move gate.
    if (!edgeScrollApplying) {
      if (isNodeFreeDrag) {
        if (
          !uiState.mouse.delta?.screen ||
          CoordsUtils.isEqual(uiState.mouse.delta.screen, CoordsUtils.zero())
        ) {
          scheduleDragEdgeScroll(state);
          return;
        }
      } else if (!hasMovedTile(uiState.mouse) || !uiState.mouse.delta?.tile) {
        scheduleDragEdgeScroll(state);
        return;
      }
    }

    const tile = orthogonal ? axisLockTile(rawTile, origin) : rawTile;
    const delta = orthogonal
      ? axisLockDelta(CoordsUtils.subtract(tile, origin))
      : isNodeFreeDrag
        ? CoordsUtils.subtract(tile, origin)
        : uiState.mouse.delta!.tile;

    runDrag(tile, delta);

    if (!edgeScrollApplying) {
      scheduleDragEdgeScroll(state);
    }
  },
  mouseup: ({ uiState, scene, model }) => {
    clearDragSession();
    useCabinetSnapStore.getState().clear();
    if (
      uiState.mode.type === 'DRAG_ITEMS' &&
      uiState.projectionMode === 'TWO_D'
    ) {
      const mode = uiState.mode;
      const freshModel = model.actions.get();
      const live = useNodeDragStore.getState();

      // Commit transient free-drag tiles / mounts into the model, then snap.
      const isNodeDrag =
        Boolean(mode.itemOrigins) &&
        mode.items.length > 0 &&
        mode.items.every((item) => {
          return item.type === 'ITEM';
        });

      if (isNodeDrag) {
        const draggedIds = mode.items.map((item) => item.id);
        const moveIds = new Set([
          ...draggedIds,
          ...Object.keys(live.tiles)
        ]);
        draggedIds.forEach((id) => {
          const modelItem = freshModel.items.find((candidate) => {
            return candidate.id === id;
          });
          if (!modelItem || !isCabinetItem(modelItem)) return;
          getMountedChildren(id, scene.items).forEach((child) => {
            moveIds.add(child.id);
          });
        });
        const excludeIds = [...moveIds];
        const gridStep = getGridSnapStep(uiState.gridStyle);

        const finalTiles: Record<string, Coords> = { ...live.tiles };
        const patches: Record<
          string,
          {
            tile?: Coords;
            parentId?: string | undefined;
            rackUnit?: number | undefined;
          }
        > = {};

        draggedIds.forEach((id) => {
          let sceneItem;
          try {
            sceneItem = getItemByIdOrThrow(scene.items, id).value;
          } catch {
            return;
          }

          const liveTile = finalTiles[id] ?? sceneItem.tile;
          const mount = live.mounts[id];

          let parentId = sceneItem.parentId;
          let rackUnit = sceneItem.rackUnit;
          if (mount === 'clear') {
            parentId = undefined;
            rackUnit = undefined;
          } else if (mount) {
            parentId = mount.parentId;
            rackUnit = mount.rackUnit;
          }

          const modelItem = freshModel.items.find((candidate) => {
            return candidate.id === id;
          });
          const isCabinet = Boolean(modelItem && isCabinetItem(modelItem));
          const willBeMounted =
            parentId !== undefined && rackUnit !== undefined;

          let resolvedTile: Coords;
          if (willBeMounted) {
            // Cabinet slots are exact 1U positions — never apply RACK floor grid.
            resolvedTile = snapTile2dToGrid(liveTile, { x: 1, y: 1 });
          } else {
            const size = getModelItemSize(modelItem ?? {}) ??
              getShape2dSize(modelItem?.icon ?? '') ?? {
                width: 1,
                height: 1
              };
            const childIds = isCabinet
              ? getMountedChildren(id, scene.items).map((child) => child.id)
              : [];
            const desired = snapTile2dToGrid(liveTile, gridStep);
            const itemsForCollision = scene.items.map((item) => {
              return {
                ...item,
                tile: finalTiles[item.id] ?? item.tile
              };
            });
            resolvedTile =
              resolveShape2dDragOrigin({
                desired,
                current: liveTile,
                size,
                items: itemsForCollision,
                modelItems: freshModel.items,
                excludeItemIds: [...excludeIds, ...childIds],
                ignoreCabinets: !isCabinet
              }) ?? desired;

            if (isCabinet) {
              const cabDelta = CoordsUtils.subtract(resolvedTile, liveTile);
              if (!CoordsUtils.isEqual(cabDelta, CoordsUtils.zero())) {
                getMountedChildren(id, scene.items).forEach((child) => {
                  const childLive = finalTiles[child.id] ?? child.tile;
                  finalTiles[child.id] = CoordsUtils.add(childLive, cabDelta);
                });
              }
            }
          }

          finalTiles[id] = resolvedTile;

          const patch: {
            tile?: Coords;
            parentId?: string | undefined;
            rackUnit?: number | undefined;
          } = {};

          if (!CoordsUtils.isEqual(resolvedTile, sceneItem.tile)) {
            patch.tile = resolvedTile;
          }
          if (mount === 'clear') {
            if (sceneItem.parentId || sceneItem.rackUnit !== undefined) {
              patch.parentId = undefined;
              patch.rackUnit = undefined;
            }
          } else if (mount) {
            if (
              sceneItem.parentId !== mount.parentId ||
              sceneItem.rackUnit !== mount.rackUnit
            ) {
              patch.parentId = mount.parentId;
              patch.rackUnit = mount.rackUnit;
            }
          }

          if (Object.keys(patch).length > 0) {
            patches[id] = patch;
          }
        });

        // Cabinet children / other live tiles not in the primary drag list.
        Object.entries(finalTiles).forEach(([id, tile]) => {
          if (patches[id]?.tile) return;
          let sceneItem;
          try {
            sceneItem = getItemByIdOrThrow(scene.items, id).value;
          } catch {
            return;
          }
          if (!CoordsUtils.isEqual(tile, sceneItem.tile)) {
            patches[id] = { ...patches[id], tile };
          }
        });

        Object.entries(patches).forEach(([id, patch]) => {
          scene.updateViewItem(id, patch);
        });

        useNodeDragStore.getState().clear();

        const didMove = draggedIds.some((id) => {
          const origin = mode.itemOrigins?.[id];
          if (!origin) return false;
          const next = finalTiles[id];
          if (!next) return false;
          return !CoordsUtils.isEqual(origin, next);
        });

        // Same as the "Test" button: Porządkuj + Mój algorytm after a move.
        // Then finalize every touched cable so leftover fastPath previews
        // (e.g. trunks skipped by an older hub filter) become real routes.
        if (didMove && !uiState.simplePaths) {
          scene.runTestLayoutForItems(draggedIds);
        }

        {
          const freshView = model.actions.get().views.find((candidate) => {
            return candidate.id === uiState.view;
          });
          const freshConnectors = freshView?.connectors ?? scene.connectors;
          const touched = new Set<string>();
          draggedIds.forEach((id) => {
            freshConnectors.forEach((connector) => {
              if (
                connector.anchors.some((anchor) => {
                  return anchor.ref.item === id;
                })
              ) {
                touched.add(connector.id);
              }
            });
          });
          touched.forEach((connectorId) => {
            const connector = freshConnectors.find((candidate) => {
              return candidate.id === connectorId;
            });
            if (!connector) return;
            scene.updateConnector(
              connectorId,
              { anchors: connector.anchors },
              { overlapResolve: 'off' }
            );
          });
        }
      } else {
        const touched = new Set<string>();

        mode.items.forEach((item) => {
          if (item.type === 'ITEM') {
            scene.connectors.forEach((connector) => {
              if (
                connector.anchors.some((anchor) => {
                  return anchor.ref.item === item.id;
                })
              ) {
                touched.add(connector.id);
              }
            });
            return;
          }

          if (item.type === 'CONNECTOR_SEGMENT') {
            try {
              touched.add(parseWaypointSegmentId(item.id).connectorId);
            } catch {
              // ignore
            }
            return;
          }

          if (item.type === 'CONNECTOR_ANCHOR') {
            try {
              touched.add(getAnchorParent(item.id, scene.connectors).id);
            } catch {
              // ignore
            }
          }
        });

        touched.forEach((connectorId) => {
          // Rebuild final A* from current anchors. Do NOT strip waypoints /
          // rematerialize — that would rewrite the route past locked vias.
          const connector = scene.connectors.find((candidate) => {
            return candidate.id === connectorId;
          });
          if (!connector) return;
          scene.updateConnector(
            connectorId,
            { anchors: connector.anchors },
            { overlapResolve: 'off' }
          );
        });
      }
    }

    scene.endHistoryTransaction();
    useStackFanStore.getState().setHighlightedConnectorId(null);
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};
