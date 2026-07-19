import React, { useCallback, useMemo } from 'react';
import { useUiStateStore } from 'src/stores/uiStateStore';
import {
  getTilePosition,
  getTilePosition2d,
  CoordsUtils,
  getItemByIdOrThrow,
  getConnectorGlobalTiles,
  findOverlappingConnectorIdsAtTile,
  isLockedTileWaypoint,
  lockWaypointAtTile,
  unlockWaypointAtTile,
  stripToEndpointAnchors
} from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { ContextMenu } from './ContextMenu';

interface Props {
  anchorEl?: HTMLElement;
}

export const ContextMenuManager = ({ anchorEl }: Props) => {
  const scene = useScene();
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const contextMenu = useUiStateStore((state) => {
    return state.contextMenu;
  });

  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });

  const onClose = useCallback(() => {
    uiStateActions.setContextMenu(null);
  }, [uiStateActions]);

  const menuItems = useMemo(() => {
    if (!contextMenu) return [];

    if (contextMenu.item.type === 'CONNECTOR') {
      type SceneConnector = (typeof scene.connectors)[number];
      let connector: SceneConnector;
      try {
        connector = getItemByIdOrThrow(
          scene.connectors,
          contextMenu.item.id
        ).value;
      } catch {
        return [];
      }

      const tile = contextMenu.tile;
      const stackedIds = findOverlappingConnectorIdsAtTile(
        scene.connectors.map((con) => {
          return {
            id: con.id,
            tiles: getConnectorGlobalTiles(con)
          };
        }),
        tile,
        connector.id
      );
      const stackedConnectors = stackedIds
        .map((id) => {
          try {
            return getItemByIdOrThrow(scene.connectors, id).value;
          } catch {
            return null;
          }
        })
        .filter((con): con is SceneConnector => {
          return Boolean(con);
        });

      const lockedHere = stackedConnectors.some((con) => {
        return con.anchors.some((anchor) => {
          return (
            isLockedTileWaypoint(anchor) &&
            CoordsUtils.isEqual(anchor.ref.tile!, tile)
          );
        });
      });

      const items: { label: string; onClick: () => void }[] = [];

      if (lockedHere) {
        items.push({
          label:
            stackedConnectors.length > 1
              ? `Odblokuj waypoint (${stackedConnectors.length})`
              : 'Odblokuj waypoint',
          onClick: () => {
            try {
              scene.beginHistoryTransaction();
              stackedConnectors.forEach((con) => {
                const next = unlockWaypointAtTile({
                  anchors: con.anchors,
                  tile
                });
                if (next) {
                  scene.updateConnector(
                    con.id,
                    { anchors: next },
                    { overlapResolve: 'off' }
                  );
                }
              });
              scene.endHistoryTransaction();
            } catch {
              // ignore
            }
            onClose();
          }
        });
      } else {
        items.push({
          label:
            stackedConnectors.length > 1
              ? `Blokuj waypoint (${stackedConnectors.length})`
              : 'Blokuj waypoint',
          onClick: () => {
            try {
              scene.beginHistoryTransaction();
              stackedConnectors.forEach((con) => {
                const next = lockWaypointAtTile({
                  anchors: con.anchors,
                  tile,
                  path: con.path,
                  view: scene.currentView,
                  modelItems
                });
                scene.updateConnector(
                  con.id,
                  { anchors: next },
                  { overlapResolve: 'off' }
                );
              });
              scene.endHistoryTransaction();
            } catch {
              // ignore
            }
            onClose();
          }
        });
      }

      items.push({
        label: 'Resetuj waypointy',
        onClick: () => {
          try {
            if (connector.anchors.length <= 2) {
              onClose();
              return;
            }

            // Keep locked waypoints — only drop free mid WPs.
            const nextAnchors = stripToEndpointAnchors(connector.anchors);

            scene.updateConnector(
              connector.id,
              { anchors: nextAnchors },
              { overlapResolve: 'off' }
            );
          } catch {
            // Connector may have been removed
          }
          onClose();
        }
      });

      return items;
    }

    if (contextMenu.item.type === 'RECTANGLE') {
      return [
        {
          label: 'Send backward',
          onClick: () => {
            scene.changeLayerOrder('SEND_BACKWARD', contextMenu.item);
            onClose();
          }
        },
        {
          label: 'Bring forward',
          onClick: () => {
            scene.changeLayerOrder('BRING_FORWARD', contextMenu.item);
            onClose();
          }
        },
        {
          label: 'Send to back',
          onClick: () => {
            scene.changeLayerOrder('SEND_TO_BACK', contextMenu.item);
            onClose();
          }
        },
        {
          label: 'Bring to front',
          onClick: () => {
            scene.changeLayerOrder('BRING_TO_FRONT', contextMenu.item);
            onClose();
          }
        }
      ];
    }

    return [];
  }, [contextMenu, onClose, scene, modelItems]);

  if (!contextMenu || menuItems.length === 0) {
    return null;
  }

  const tilePos =
    projectionMode === 'TWO_D'
      ? getTilePosition2d({ tile: contextMenu.tile })
      : getTilePosition({ tile: contextMenu.tile });

  return (
    <ContextMenu
      anchorEl={anchorEl}
      onClose={onClose}
      position={CoordsUtils.multiply(tilePos, zoom)}
      menuItems={menuItems}
    />
  );
};
