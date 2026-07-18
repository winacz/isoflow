import { produce } from 'immer';
import {
  ConnectorAnchor,
  SceneConnector,
  ModeActions,
  ModeActionsAction,
  Coords,
  View,
  ModelItem
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
  prepareWaypointSegmentDrag
} from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { isShape2dIcon, getShape2dSize } from 'src/config';

/** Waypoint just created by dblclick — survives stale scene until first drag/click-away. */
let armedWaypoint: {
  anchorId: string;
  connectorId: string;
  tile: Coords;
} | null = null;

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

const findConnectorAtTile = (
  tile: Coords,
  scene: ReturnType<typeof useScene>
) => {
  return scene.connectors.find((con) => {
    return con.path.tiles.some((pathTile) => {
      const globalPathTile = connectorPathTileToGlobal(
        pathTile,
        con.path.rectangle.from
      );
      return CoordsUtils.isEqual(globalPathTile, tile);
    });
  });
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
  isRendererInteraction
}) => {
  if (uiState.mode.type !== 'CURSOR' || !isRendererInteraction) return;

  const tile = uiState.mouse.position.tile;

  let itemAtTile =
    uiState.projectionMode === 'TWO_D'
      ? getShape2dItemAtTile({
          tile,
          scene,
          modelItems: model.items
        })
      : getItemAtTile({
          tile,
          scene
        });

  if (uiState.projectionMode === 'TWO_D') {
    const portHit = getShape2dPortAtTile({
      tile,
      scene,
      modelItems: model.items
    });

    const onDeviceBody = isTileOnDeviceBody(tile, scene, model.items);
    const connectorAtTile = findConnectorAtTile(tile, scene);
    const waypoint = resolveWaypointAtTile(tile, scene);
    const selectedConnectorId =
      uiState.itemControls?.type === 'CONNECTOR'
        ? uiState.itemControls.id
        : null;

    if (waypoint && !portHit) {
      itemAtTile = {
        type: 'CONNECTOR_ANCHOR',
        id: waypoint.id
      };
    } else if (selectedConnectorId && !portHit) {
      // Segment handle wins even when drawn over a device body
      // (otherwise the node steals the drag). Ports still win via portHit.
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
      } else if (connectorAtTile && !portHit) {
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
    } else if (connectorAtTile && !portHit) {
      // Prefer cable over node body (same as when a connector is already selected)
      itemAtTile = {
        type: 'CONNECTOR',
        id: connectorAtTile.id
      };
      armedWaypoint = null;
    } else {
      armedWaypoint = null;
    }
  }

  if (uiState.projectionMode !== 'TWO_D' && itemAtTile?.type === 'ITEM') {
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

      uiState.actions.setItemControls({
        type: 'CONNECTOR',
        id: parent?.id ?? armedWaypoint?.connectorId ?? selected.id
      });
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
    } else {
      uiState.actions.setItemControls(selected);
    }
  } else {
    armedWaypoint = null;
    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        draft.mousedownItem = null;
      })
    );

    uiState.actions.setItemControls(null);
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

    let item = uiState.mode.mousedownItem;

    if (item?.type === 'CONNECTOR' && uiState.mouse.mousedown) {
      if (uiState.projectionMode === 'TWO_D') {
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
      if (item.type === 'CONNECTOR_ANCHOR') {
        armedWaypoint = null;
      }

      const itemOrigins: Record<string, Coords> = {};
      if (item.type === 'ITEM') {
        try {
          const node = getItemByIdOrThrow(scene.items, item.id).value;
          itemOrigins[item.id] = { ...node.tile };
        } catch {
          // ignore — drag will fall back to incremental deltas
        }
      }

      uiState.actions.setMode({
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [item],
        isInitialMovement: true,
        itemOrigins
      });
    }
  },
  mousedown,
  mouseup: ({ uiState, isRendererInteraction }) => {
    if (uiState.mode.type !== 'CURSOR' || !isRendererInteraction) return;

    if (uiState.mode.mousedownItem) {
      if (uiState.mode.mousedownItem.type === 'ITEM') {
        uiState.actions.setItemControls({
          type: 'ITEM',
          id: uiState.mode.mousedownItem.id
        });
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
    } else {
      uiState.actions.setItemControls(null);
    }

    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        draft.mousedownItem = null;
      })
    );
  },
  dblclick: ({ uiState, scene, model, isRendererInteraction }) => {
    if (
      uiState.mode.type !== 'CURSOR' ||
      !isRendererInteraction ||
      uiState.projectionMode !== 'TWO_D'
    ) {
      return;
    }

    const tile = uiState.mouse.position.tile;
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
    const portHit = getShape2dPortAtTile({
      tile,
      scene,
      modelItems: model.items
    });
    if (portHit) return;

    const connector = findConnectorAtTile(tile, scene);
    if (!connector) return;

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
