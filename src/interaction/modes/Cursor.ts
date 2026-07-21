import { produce } from 'immer';
import {
  ConnectorAnchor,
  SceneConnector,
  ModeActions,
  ModeActionsAction,
  Coords,
  View,
  ModelItem,
  Connector as ConnectorI
} from 'src/types';
import {
  getItemAtTile,
  getShape2dItemAtTile,
  getShape2dPortAtTile,
  hasMovedTile,
  getAnchorAtTile,
  getItemByIdOrThrow,
  generateId,
  CoordsUtils,
  getAnchorTile,
  connectorPathTileToGlobal,
  isTileInShape2dBounds,
  findWaypointSegmentAtTile,
  encodeWaypointSegmentId,
  parseWaypointSegmentId,
  prepareWaypointSegmentDrag,
  doShape2dFootprintsOverlap,
  isShape2dPortInUse,
  BLACK_CROSSHAIR_CURSOR,
  setWindowCursor,
  screenToTile2dContinuous,
  isPlanProjection
} from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { isShape2dIcon, getShape2dSize } from 'src/config';
import { useStackFanStore } from 'src/stores/stackFanStore';

/** Waypoint just created by dblclick — survives stale scene until first drag/click-away. */
let armedWaypoint: {
  anchorId: string;
  connectorId: string;
  tile: Coords;
} | null = null;

const getItemsInMarquee = ({
  start,
  end,
  scene,
  modelItems
}: {
  start: Coords;
  end: Coords;
  scene: ReturnType<typeof useScene>;
  modelItems: ModelItem[];
}): string[] => {
  const marquee = {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x) + 1,
    height: Math.abs(end.y - start.y) + 1
  };

  return scene.items
    .filter((viewItem) => {
      const modelItem = modelItems.find((item) => {
        return item.id === viewItem.id;
      });
      if (!modelItem || !isShape2dIcon(modelItem.icon)) return false;

      const size = getShape2dSize(modelItem.icon ?? '') ?? {
        width: 1,
        height: 1
      };

      return doShape2dFootprintsOverlap(
        {
          x: viewItem.tile.x,
          y: viewItem.tile.y,
          width: size.width,
          height: size.height
        },
        marquee
      );
    })
    .map((viewItem) => {
      return viewItem.id;
    });
};

const getWaypointsInMarquee = ({
  start,
  end,
  scene
}: {
  start: Coords;
  end: Coords;
  scene: ReturnType<typeof useScene>;
  model?: unknown;
}): string[] => {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  const ids: string[] = [];

  scene.connectors.forEach((connector) => {
    connector.anchors.forEach((anchor) => {
      const tile = anchor.ref.tile;
      if (!tile) return;
      if (tile.x < minX || tile.x > maxX || tile.y < minY || tile.y > maxY) {
        return;
      }
      ids.push(anchor.id);
    });
  });

  return ids;
};

const applyItemSelection = (
  uiState: {
    actions: {
      setSelectedItemIds: (ids: string[]) => void;
      toggleSelectedItemId: (id: string) => void;
      setItemControls: (controls: { type: 'ITEM'; id: string } | null) => void;
      clearSelectedItemIds: () => void;
    };
    selectedItemIds: string[];
    mouse: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean };
    projectionMode: string;
  },
  itemId: string
) => {
  if (!isPlanProjection(uiState.projectionMode)) {
    uiState.actions.setItemControls({ type: 'ITEM', id: itemId });
    return;
  }

  const additive = uiState.mouse.shiftKey;
  const toggle = uiState.mouse.ctrlKey || uiState.mouse.metaKey;

  if (toggle) {
    uiState.actions.toggleSelectedItemId(itemId);
    return;
  }

  if (additive) {
    if (!uiState.selectedItemIds.includes(itemId)) {
      uiState.actions.setSelectedItemIds([...uiState.selectedItemIds, itemId]);
    }
    return;
  }

  uiState.actions.setSelectedItemIds([itemId]);
};

const getAnchorOrdering = (
  anchor: ConnectorAnchor,
  connector: SceneConnector,
  view: View,
  modelItems?: ModelItem[]
) => {
  const anchorTile = getAnchorTile(anchor, view, modelItems);
  const index = connector.path.tiles.findIndex((pathTile) => {
    const globalTile = connectorPathTileToGlobal(
      pathTile,
      connector.path.rectangle.from
    );
    return CoordsUtils.isEqual(globalTile, anchorTile);
  });

  if (index !== -1) {
    return index;
  }

  let bestIndex = Math.floor(connector.path.tiles.length / 2);
  let bestDist = Number.POSITIVE_INFINITY;

  connector.path.tiles.forEach((pathTile, pathIndex) => {
    const globalTile = connectorPathTileToGlobal(
      pathTile,
      connector.path.rectangle.from
    );
    const dist =
      Math.abs(globalTile.x - anchorTile.x) +
      Math.abs(globalTile.y - anchorTile.y);

    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = pathIndex;
    }
  });

  return bestIndex;
};

const getAnchor = (
  connectorId: string,
  tile: Coords,
  scene: ReturnType<typeof useScene>,
  modelItems?: ModelItem[]
) => {
  const connector = getItemByIdOrThrow(scene.connectors, connectorId).value;
  const anchor = getAnchorAtTile(
    tile,
    connector.anchors,
    scene.currentView,
    modelItems
  );

  if (!anchor) {
    // Never place a second tile WP on an occupied cell.
    const tileTaken = connector.anchors.some((candidate) => {
      return (
        Boolean(candidate.ref.tile) &&
        CoordsUtils.isEqual(candidate.ref.tile as Coords, tile)
      );
    });
    if (tileTaken) {
      return (
        connector.anchors.find((candidate) => {
          return (
            Boolean(candidate.ref.tile) &&
            CoordsUtils.isEqual(candidate.ref.tile as Coords, tile)
          );
        }) ?? connector.anchors[0]
      );
    }

    const newAnchor: ConnectorAnchor = {
      id: generateId(),
      ref: { tile }
    };

    const orderedAnchors = [...connector.anchors, newAnchor]
      .map((anch) => {
        return {
          ...anch,
          ordering: getAnchorOrdering(
            anch,
            connector,
            scene.currentView,
            modelItems
          )
        };
      })
      .sort((a, b) => {
        return a.ordering - b.ordering;
      })
      .map(({ ordering: _ordering, ...anch }) => {
        return anch;
      });

    scene.updateConnector(
      connector.id,
      { anchors: orderedAnchors },
      { overlapResolve: 'off' }
    );
    return newAnchor;
  }

  return anchor;
};

const connectorTouchesTile = (
  connector: { path: SceneConnector['path'] },
  tile: Coords
) => {
  return connector.path.tiles.some((pathTile) => {
    const globalPathTile = connectorPathTileToGlobal(
      pathTile,
      connector.path.rectangle.from
    );
    return CoordsUtils.isEqual(globalPathTile, tile);
  });
};

/**
 * Cable under the cursor. Prefers the already-selected connector, otherwise
 * the topmost painted cable (Connectors render `[...].reverse()`, so later
 * entries in `scene.connectors` sit on top).
 */
const findConnectorAtTile = (
  tile: Coords,
  scene: ReturnType<typeof useScene>,
  preferredId?: string | null
) => {
  if (preferredId) {
    const preferred = scene.connectors.find((con) => {
      return con.id === preferredId && connectorTouchesTile(con, tile);
    });
    if (preferred) return preferred;
  }

  for (let i = scene.connectors.length - 1; i >= 0; i -= 1) {
    const con = scene.connectors[i];
    if (connectorTouchesTile(con, tile)) return con;
  }

  return undefined;
};

const findTileWaypointAt = (
  tile: Coords,
  scene: ReturnType<typeof useScene>
) => {
  for (const connector of scene.connectors) {
    const anchor = connector.anchors.find((candidate) => {
      if (!candidate.ref.tile) return false;
      return CoordsUtils.isEqual(candidate.ref.tile, tile);
    });

    if (anchor) {
      return { connector, anchor };
    }
  }

  return null;
};

const isTileOnDeviceBody = (
  tile: Coords,
  scene: ReturnType<typeof useScene>,
  modelItems: ModelItem[]
) => {
  return scene.items.some((viewItem) => {
    const modelItem = modelItems.find((candidate) => {
      return candidate.id === viewItem.id;
    });

    if (!modelItem?.icon || !isShape2dIcon(modelItem.icon)) return false;

    const size = getShape2dSize(modelItem.icon);
    if (!size) return false;

    return isTileInShape2dBounds(tile, viewItem.tile, size);
  });
};

const resolveWaypointAtTile = (
  tile: Coords,
  scene: ReturnType<typeof useScene>
) => {
  if (armedWaypoint && CoordsUtils.isEqual(armedWaypoint.tile, tile)) {
    return {
      type: 'CONNECTOR_ANCHOR' as const,
      id: armedWaypoint.anchorId,
      connectorId: armedWaypoint.connectorId
    };
  }

  const found = findTileWaypointAt(tile, scene);
  if (!found) return null;

  return {
    type: 'CONNECTOR_ANCHOR' as const,
    id: found.anchor.id,
    connectorId: found.connector.id
  };
};

const mousedown: ModeActionsAction = ({
  uiState,
  scene,
  model,
  isRendererInteraction,
  rendererSize
}) => {
  if (uiState.mode.type !== 'CURSOR' || !isRendererInteraction) return;

  const tile = uiState.mouse.position.tile;
  const tilePoint =
    isPlanProjection(uiState.projectionMode)
      ? screenToTile2dContinuous({
          mouse: uiState.mouse.position.screen,
          zoom: uiState.zoom,
          scroll: uiState.scroll,
          rendererSize
        })
      : { x: tile.x + 0.5, y: tile.y + 0.5 };

  let itemAtTile =
    isPlanProjection(uiState.projectionMode)
      ? getShape2dItemAtTile({
          tile,
          scene,
          modelItems: model.items
        })
      : getItemAtTile({
          tile,
          scene
        });

  let clickedPortId: string | null = null;

  if (isPlanProjection(uiState.projectionMode)) {
    const selectedConnectorId =
      uiState.itemControls?.type === 'CONNECTOR'
        ? uiState.itemControls.id
        : null;

    const portHit = getShape2dPortAtTile({
      tile,
      point: tilePoint,
      scene,
      modelItems: model.items
    });

    const onDeviceBody = isTileOnDeviceBody(tile, scene, model.items);
    const connectorAtTile = findConnectorAtTile(
      tile,
      scene,
      selectedConnectorId
    );
    const waypoint = resolveWaypointAtTile(tile, scene);
    const togglePort =
      Boolean(portHit) &&
      (uiState.mouse.ctrlKey || uiState.mouse.metaKey);
    // Port settings win when there is no cable on this tile, or when Ctrl/Cmd
    // multi-selects ports (including already-connected ones).
    // Plain click on a cable+port tile still selects the cable.
    const portBlocksCable = Boolean(
      portHit && (!connectorAtTile || togglePort)
    );

    if (portBlocksCable && portHit) {
      // Clicking a port opens the device panel on that port's settings.
      // Ctrl/Cmd toggles multi-port selection on the same device (free or used).
      clickedPortId = portHit.portId;
      itemAtTile = {
        type: 'ITEM',
        id: portHit.itemId
      };
      const sameDevice =
        uiState.itemControls?.type === 'ITEM' &&
        uiState.itemControls.id === portHit.itemId;

      if (togglePort && sameDevice) {
        uiState.actions.toggleFocusedPortId(portHit.portId);
      } else {
        uiState.actions.setFocusedPortId(portHit.portId);
      }
    } else {
      uiState.actions.setFocusedPortId(null);
    }

    if (waypoint && !portBlocksCable) {
      itemAtTile = {
        type: 'CONNECTOR_ANCHOR',
        id: waypoint.id
      };
    } else if (selectedConnectorId && !portBlocksCable) {
      // Segment handle wins even when drawn over a device body
      // (otherwise the node steals the drag).
      const sceneConnector = scene.connectors.find((con) => {
        return con.id === selectedConnectorId;
      });
      const freshConnector = model.actions
        .get()
        .views.find((view) => {
          return view.id === uiState.view;
        })
        ?.connectors?.find((con) => {
          return con.id === selectedConnectorId;
        });

      const segment =
        sceneConnector &&
        !sceneConnector.locked &&
        !freshConnector?.locked &&
        findWaypointSegmentAtTile({
          connectorId: selectedConnectorId,
          anchors: freshConnector?.anchors ?? sceneConnector.anchors,
          path: sceneConnector.path,
          tile
        });

      if (segment) {
        const prepared = prepareWaypointSegmentDrag({
          anchors: freshConnector?.anchors ?? sceneConnector.anchors,
          path: sceneConnector.path,
          hit: segment,
          view: scene.currentView,
          modelItems: model.items
        });

        if (segment.materializeAtPort || segment.materializeBothPorts) {
          scene.updateConnector(
            selectedConnectorId,
            {
              anchors: prepared.anchors
            },
            { overlapResolve: 'off' }
          );
        }

        itemAtTile = {
          type: 'CONNECTOR_SEGMENT',
          id: encodeWaypointSegmentId(
            selectedConnectorId,
            prepared.startAnchorId,
            prepared.endAnchorId
          )
        };
      } else if (connectorAtTile) {
        // Cable wins over device body so dblclick can create waypoints
        // on segments that cross a node.
        itemAtTile = {
          type: 'CONNECTOR',
          id: connectorAtTile.id
        };
        armedWaypoint = null;
      } else if (!onDeviceBody) {
        armedWaypoint = null;
      }
      // else: leave ITEM from getShape2dItemAtTile (device body, no cable)
    } else if (connectorAtTile && !portBlocksCable) {
      // Prefer cable over node body / connected port tile
      itemAtTile = {
        type: 'CONNECTOR',
        id: connectorAtTile.id
      };
      armedWaypoint = null;
    } else {
      armedWaypoint = null;
    }
  }

  if (!isPlanProjection(uiState.projectionMode) && itemAtTile?.type === 'ITEM') {
    const modelItem = model.items.find((item) => {
      return item.id === itemAtTile?.id;
    });

    if (modelItem && isShape2dIcon(modelItem.icon)) {
      itemAtTile = null;
    }
  }

  if (itemAtTile) {
    const selected = itemAtTile;

    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        draft.mousedownItem = selected;
        draft.marquee = null;
      })
    );

    if (selected.type === 'CONNECTOR_ANCHOR') {
      const parent =
        scene.connectors.find((con) => {
          return con.anchors.some((anchor) => {
            return anchor.id === selected.id;
          });
        }) ??
        (armedWaypoint
          ? scene.connectors.find((con) => {
              return con.id === armedWaypoint?.connectorId;
            })
          : undefined);

      // Keep waypoint multi-selection when pressing a selected waypoint.
      const keepWaypointMulti =
        isPlanProjection(uiState.projectionMode) &&
        uiState.selectedWaypointIds.length > 1 &&
        uiState.selectedWaypointIds.includes(selected.id);

      if (!keepWaypointMulti) {
        uiState.actions.setSelectedWaypointIds([]);
        uiState.actions.setItemControls({
          type: 'CONNECTOR',
          id: parent?.id ?? armedWaypoint?.connectorId ?? selected.id
        });
      }
    } else if (selected.type === 'CONNECTOR_SEGMENT') {
      try {
        const { connectorId } = parseWaypointSegmentId(selected.id);
        uiState.actions.setItemControls({
          type: 'CONNECTOR',
          id: connectorId
        });
      } catch {
        uiState.actions.setItemControls(null);
      }
    } else if (selected.type === 'ITEM') {
      // Keep multi-selection when pressing an already-selected node (group drag).
      const keepMulti =
        isPlanProjection(uiState.projectionMode) &&
        !uiState.mouse.shiftKey &&
        !uiState.mouse.ctrlKey &&
        !uiState.mouse.metaKey &&
        uiState.selectedItemIds.length > 1 &&
        uiState.selectedItemIds.includes(selected.id);

      if (clickedPortId) {
        // Port click always focuses a single device (Ctrl only multi-selects ports).
        uiState.actions.setSelectedItemIds([selected.id]);
      } else if (!keepMulti) {
        applyItemSelection(uiState, selected.id);
      }
    } else {
      uiState.actions.setItemControls(selected);
    }
  } else {
    armedWaypoint = null;
    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        draft.mousedownItem = null;
        draft.marquee =
          isPlanProjection(uiState.projectionMode)
            ? {
                start: { ...tile },
                end: { ...tile }
              }
            : null;
      })
    );

    uiState.actions.setFocusedPortId(null);
    if (
      !isPlanProjection(uiState.projectionMode) ||
      (!uiState.mouse.shiftKey &&
        !uiState.mouse.ctrlKey &&
        !uiState.mouse.metaKey)
    ) {
      uiState.actions.clearSelectedItemIds();
      uiState.actions.setSelectedWaypointIds([]);
      // Plan: also drop connector/item sidebar focus so dimming does not stick
      // after untangling stacked cables.
      if (isPlanProjection(uiState.projectionMode)) {
        uiState.actions.setItemControls(null);
        useStackFanStore.getState().clearPinned();
      }
    }
  }
};

export const Cursor: ModeActions = {
  entry: (state) => {
    const { uiState } = state;

    if (uiState.mode.type !== 'CURSOR') return;

    if (uiState.mode.mousedownItem) {
      mousedown(state);
    }
  },
  mousemove: ({ scene, uiState, model }) => {
    if (uiState.mode.type !== 'CURSOR' || !hasMovedTile(uiState.mouse)) return;

    // 2D: drag from an empty port → start connector tool from that port
    if (
      isPlanProjection(uiState.projectionMode) &&
      uiState.mode.mousedownItem?.type === 'ITEM' &&
      uiState.mouse.mousedown
    ) {
      const portHit = getShape2dPortAtTile({
        tile: uiState.mouse.mousedown.tile,
        scene,
        modelItems: model.items
      });

      if (
        portHit &&
        portHit.itemId === uiState.mode.mousedownItem.id &&
        !isShape2dPortInUse({
          itemId: portHit.itemId,
          portId: portHit.portId,
          connectors: scene.currentView.connectors ?? []
        })
      ) {
        const startRef = {
          item: portHit.itemId,
          port: portHit.portId
        };
        const endRef = {
          tile: uiState.mouse.position.tile
        };
        const newConnector: ConnectorI = {
          id: generateId(),
          color: scene.colors[0].id,
          anchors: [
            { id: generateId(), ref: startRef },
            { id: generateId(), ref: endRef }
          ]
        };

        scene.beginHistoryTransaction();
        scene.createConnector(newConnector);
        uiState.actions.setFocusedPortId(portHit.portId);
        uiState.actions.setMode({
          type: 'CONNECTOR',
          showCursor: true,
          id: newConnector.id
        });
        setWindowCursor(BLACK_CROSSHAIR_CURSOR);
        return;
      }
    }

    // 2D marquee on empty canvas
    if (
      isPlanProjection(uiState.projectionMode) &&
      !uiState.mode.mousedownItem &&
      uiState.mode.marquee &&
      uiState.mouse.mousedown
    ) {
      uiState.actions.setMode(
        produce(uiState.mode, (draft) => {
          draft.marquee = {
            start: draft.marquee?.start ?? uiState.mouse.mousedown!.tile,
            end: { ...uiState.mouse.position.tile }
          };
        })
      );
      return;
    }

    let item = uiState.mode.mousedownItem;

    if (item?.type === 'CONNECTOR' && uiState.mouse.mousedown) {
      if (isPlanProjection(uiState.projectionMode)) {
        // Prefer armed / existing waypoint at the press tile — never native-drag the cable
        const waypoint = resolveWaypointAtTile(
          uiState.mouse.mousedown.tile,
          scene
        );

        if (waypoint) {
          item = {
            type: 'CONNECTOR_ANCHOR',
            id: waypoint.id
          };
        } else {
          return;
        }
      } else {
        const anchor = getAnchor(
          item.id,
          uiState.mouse.mousedown.tile,
          scene,
          model.items
        );

        item = {
          type: 'CONNECTOR_ANCHOR',
          id: anchor.id
        };
      }
    }

    if (item) {
      const activeItem = item;

      if (activeItem.type === 'CONNECTOR_ANCHOR') {
        armedWaypoint = null;
      }

      // Locked nodes / shapes / cables cannot be dragged.
      if (activeItem.type === 'ITEM') {
        const node = scene.items.find((candidate) => {
          return candidate.id === activeItem.id;
        });
        if (node?.locked) return;
      }
      if (activeItem.type === 'RECTANGLE') {
        const rectangle = scene.rectangles.find((candidate) => {
          return candidate.id === activeItem.id;
        });
        if (rectangle?.locked) return;
      }
      if (activeItem.type === 'CONNECTOR') {
        const connector = scene.connectors.find((candidate) => {
          return candidate.id === activeItem.id;
        });
        if (connector?.locked) return;
      }
      if (activeItem.type === 'CONNECTOR_ANCHOR' || activeItem.type === 'CONNECTOR_SEGMENT') {
        const connectorId =
          activeItem.type === 'CONNECTOR_SEGMENT'
            ? (() => {
                try {
                  return parseWaypointSegmentId(activeItem.id).connectorId;
                } catch {
                  return null;
                }
              })()
            : scene.connectors.find((con) => {
                return con.anchors.some((anchor) => {
                  return anchor.id === activeItem.id;
                });
              })?.id;
        if (connectorId) {
          const connector = scene.connectors.find((candidate) => {
            return candidate.id === connectorId;
          });
          if (connector?.locked) return;
        }
      }

      const itemOrigins: Record<string, Coords> = {};
      const anchorOrigins: Record<string, Coords> = {};
      let dragItems =
        item.type === 'ITEM' &&
        isPlanProjection(uiState.projectionMode) &&
        uiState.selectedItemIds.length > 1 &&
        uiState.selectedItemIds.includes(item.id)
          ? uiState.selectedItemIds.map((id) => {
              return { type: 'ITEM' as const, id };
            })
          : [item];

      // Group-drag all marquee-selected waypoints together.
      if (
        item.type === 'CONNECTOR_ANCHOR' &&
        isPlanProjection(uiState.projectionMode) &&
        uiState.selectedWaypointIds.length > 1 &&
        uiState.selectedWaypointIds.includes(item.id)
      ) {
        dragItems = uiState.selectedWaypointIds.map((id) => {
          return { type: 'CONNECTOR_ANCHOR' as const, id };
        });
      }

      dragItems = dragItems.filter((dragItem) => {
        if (dragItem.type === 'ITEM') {
          return !scene.items.find((candidate) => {
            return candidate.id === dragItem.id;
          })?.locked;
        }
        if (dragItem.type === 'RECTANGLE') {
          return !scene.rectangles.find((candidate) => {
            return candidate.id === dragItem.id;
          })?.locked;
        }
        if (dragItem.type === 'CONNECTOR') {
          return !scene.connectors.find((candidate) => {
            return candidate.id === dragItem.id;
          })?.locked;
        }
        if (
          dragItem.type === 'CONNECTOR_ANCHOR' ||
          dragItem.type === 'CONNECTOR_SEGMENT'
        ) {
          const connectorId =
            dragItem.type === 'CONNECTOR_SEGMENT'
              ? (() => {
                  try {
                    return parseWaypointSegmentId(dragItem.id).connectorId;
                  } catch {
                    return null;
                  }
                })()
              : scene.connectors.find((con) => {
                  return con.anchors.some((anchor) => {
                    return anchor.id === dragItem.id;
                  });
                })?.id;
          if (!connectorId) return true;
          return !scene.connectors.find((candidate) => {
            return candidate.id === connectorId;
          })?.locked;
        }
        return true;
      });

      if (dragItems.length === 0) return;

      const recordAnchorTile = (anchorId: string) => {
        const parent = scene.connectors.find((con) => {
          return con.anchors.some((anchor) => {
            return anchor.id === anchorId;
          });
        });
        const anchor = parent?.anchors.find((candidate) => {
          return candidate.id === anchorId;
        });
        if (anchor?.ref.tile) {
          anchorOrigins[anchorId] = { ...anchor.ref.tile };
        }
      };

      dragItems.forEach((dragItem) => {
        if (dragItem.type === 'ITEM') {
          try {
            const node = getItemByIdOrThrow(scene.items, dragItem.id).value;
            itemOrigins[dragItem.id] = { ...node.tile };
          } catch {
            // ignore
          }
          return;
        }

        if (dragItem.type === 'CONNECTOR_ANCHOR') {
          recordAnchorTile(dragItem.id);
          return;
        }

        if (dragItem.type === 'CONNECTOR_SEGMENT') {
          try {
            const parsed = parseWaypointSegmentId(dragItem.id);
            recordAnchorTile(parsed.startAnchorId);
            recordAnchorTile(parsed.endAnchorId);
          } catch {
            // ignore
          }
        }
      });

      uiState.actions.setMode({
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: dragItems,
        isInitialMovement: true,
        itemOrigins,
        anchorOrigins
      });
    }
  },
  mousedown,
  mouseup: ({ uiState, scene, model, isRendererInteraction }) => {
    if (uiState.mode.type !== 'CURSOR' || !isRendererInteraction) return;

    if (
      isPlanProjection(uiState.projectionMode) &&
      uiState.mode.marquee &&
      uiState.mouse.mousedown
    ) {
      const ids = getItemsInMarquee({
        start: uiState.mode.marquee.start,
        end: uiState.mode.marquee.end,
        scene,
        modelItems: model.items
      });

      if (ids.length === 0) {
        // Cables only under the marquee → select their waypoints.
        const waypointIds = getWaypointsInMarquee({
          start: uiState.mode.marquee.start,
          end: uiState.mode.marquee.end,
          scene,
          model
        });

        uiState.actions.clearSelectedItemIds();
        uiState.actions.setSelectedWaypointIds(waypointIds);
      } else if (
        uiState.mouse.shiftKey ||
        uiState.mouse.ctrlKey ||
        uiState.mouse.metaKey
      ) {
        const merged = [...new Set([...uiState.selectedItemIds, ...ids])];
        uiState.actions.setSelectedItemIds(merged);
      } else {
        uiState.actions.setSelectedItemIds(ids);
      }

      uiState.actions.setMode(
        produce(uiState.mode, (draft) => {
          draft.mousedownItem = null;
          draft.marquee = null;
        })
      );
      return;
    }

    if (uiState.mode.mousedownItem) {
      if (uiState.mode.mousedownItem.type === 'ITEM') {
        // Selection already applied on mousedown (unless keep-multi).
        if (uiState.selectedItemIds.length <= 1) {
          uiState.actions.setItemControls({
            type: 'ITEM',
            id: uiState.mode.mousedownItem.id
          });
        }
      } else if (uiState.mode.mousedownItem.type === 'RECTANGLE') {
        uiState.actions.setItemControls({
          type: 'RECTANGLE',
          id: uiState.mode.mousedownItem.id
        });
      } else if (uiState.mode.mousedownItem.type === 'CONNECTOR') {
        uiState.actions.setItemControls({
          type: 'CONNECTOR',
          id: uiState.mode.mousedownItem.id
        });
      } else if (uiState.mode.mousedownItem.type === 'TEXTBOX') {
        uiState.actions.setItemControls({
          type: 'TEXTBOX',
          id: uiState.mode.mousedownItem.id
        });
      }
    } else if (!isPlanProjection(uiState.projectionMode)) {
      uiState.actions.setItemControls(null);
    }

    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        draft.mousedownItem = null;
        draft.marquee = null;
      })
    );
  },
  dblclick: ({ uiState, scene, model, isRendererInteraction, rendererSize }) => {
    if (
      uiState.mode.type !== 'CURSOR' ||
      !isRendererInteraction ||
      !isPlanProjection(uiState.projectionMode)
    ) {
      return;
    }

    const tile = uiState.mouse.position.tile;
    const tilePoint = screenToTile2dContinuous({
      mouse: uiState.mouse.position.screen,
      zoom: uiState.zoom,
      scroll: uiState.scroll,
      rendererSize
    });
    const existingWaypoint = resolveWaypointAtTile(tile, scene);

    // Double-click on an existing tile waypoint → remove it
    // (including when the WP sits on a device body / port cell)
    if (existingWaypoint) {
      const freshView = model.actions.get().views.find((view) => {
        return view.id === uiState.view;
      });
      const freshConnector =
        freshView?.connectors?.find((con) => {
          return con.id === existingWaypoint.connectorId;
        }) ??
        scene.connectors.find((con) => {
          return con.id === existingWaypoint.connectorId;
        });

      if (!freshConnector) return;

      const target = freshConnector.anchors.find((anchor) => {
        return anchor.id === existingWaypoint.id;
      });
      // Locked waypoints stay until unlocked via context menu.
      if (target?.locked) {
        uiState.actions.setItemControls({
          type: 'CONNECTOR',
          id: freshConnector.id
        });
        return;
      }

      const nextAnchors = freshConnector.anchors.filter((anchor) => {
        return anchor.id !== existingWaypoint.id;
      });

      // Keep at least two anchors (ports / ends)
      if (nextAnchors.length < 2) {
        return;
      }

      // Just drop the WP — path rebuilds between remaining neighbours (A*).
      // No orthogonalDetour: that rewrote the whole cable to L/U.
      scene.updateConnector(
        freshConnector.id,
        { anchors: nextAnchors },
        { overlapResolve: 'off' }
      );
      armedWaypoint = null;

      uiState.actions.setItemControls({
        type: 'CONNECTOR',
        id: freshConnector.id
      });
      return;
    }

    // Double-click on cable tile (including over a device body) → add waypoint.
    // Skip pure port handles — those stay as port attachments.
    if (uiState.simplePaths) return;

    const portHit = getShape2dPortAtTile({
      tile,
      point: tilePoint,
      scene,
      modelItems: model.items
    });
    if (portHit) return;

    const connector = findConnectorAtTile(tile, scene);
    if (!connector || connector.locked) return;

    const anchor = getAnchor(connector.id, tile, scene, model.items);

    armedWaypoint = {
      anchorId: anchor.id,
      connectorId: connector.id,
      tile: { ...tile }
    };

    uiState.actions.setItemControls({
      type: 'CONNECTOR',
      id: connector.id
    });
  }
};
