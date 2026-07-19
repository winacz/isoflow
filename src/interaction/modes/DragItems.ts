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
  isCabinetItem,
  findCabinetAtTile,
  resolveCabinetSnap,
  getMountedChildren
} from 'src/utils';
import { getShape2dSize, getModelItemSize } from 'src/config';
import { useCabinetSnapStore } from 'src/stores/cabinetSnapStore';

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
            excludeItemIds: excludeIds
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

      const resolved = resolveShape2dDragOrigin({
        desired,
        current,
        size,
        items: scene.items,
        modelItems,
        excludeItemIds: [...excludeIds, ...childIds],
        ignoreCabinets: !isCabinet
      });

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
          const [nextStart, nextEnd] = levelWaypointTiles(
            [originStart, originEnd],
            delta
          );
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
      }

      const snapped = moved.map((anchor) => {
        if (
          (anchor.id !== startAnchorId && anchor.id !== endAnchorId) ||
          !anchor.ref.tile
        ) {
          return anchor;
        }
        return {
          ...anchor,
          ref: { tile: snapWpTile(anchor.ref.tile, anchor.id) }
        };
      });

      let nextAnchors =
        options?.isTwoD && options.orthogonal
          ? applyOrthogonalBendAnchors({
              anchors: snapped,
              draggedAnchorId: startAnchorId,
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
    useCabinetSnapStore.getState().clear();
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

    const dragOpts = {
      isTwoD,
      modelItems: freshModel.items,
      connectors: freshView?.connectors ?? scene.connectors,
      orthogonal,
      mousedownTile: uiState.mouse.mousedown.tile,
      itemOrigins: mode.itemOrigins,
      anchorOrigins: mode.anchorOrigins,
      waypointSnap
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
    useCabinetSnapStore.getState().clear();
    if (
      uiState.mode.type === 'DRAG_ITEMS' &&
      uiState.projectionMode === 'TWO_D'
    ) {
      const nodeIds = uiState.mode.items
        .filter((item) => {
          return item.type === 'ITEM';
        })
        .map((item) => {
          return item.id;
        });

      if (nodeIds.length > 0) {
        const touched = new Set<string>();
        nodeIds.forEach((nodeId) => {
          scene.connectors.forEach((connector) => {
            if (
              connector.anchors.some((anchor) => {
                return anchor.ref.item === nodeId;
              })
            ) {
              touched.add(connector.id);
            }
          });
        });

        touched.forEach((connectorId) => {
          scene.updateConnector(
            connectorId,
            {},
            {
              overlapResolve: 'off',
              ignoreWaypoints: true,
              materializeBends: true
            }
          );
        });
      }
    }

    scene.endHistoryTransaction();
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};
