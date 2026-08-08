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
  stripToEndpointAnchors,
  isPlanProjection,
  cloneModelItemForDuplicate,
  supportsConnectorTools
} from 'src/utils';
import type { PlacementMode, RouteStyle } from 'src/utils/autoLayout';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { computeDensityGroups } from 'src/v3/densityGroups';
import { useDensityGroupsDebugStore } from 'src/v3/densityGroupsStore';
import type { DensityBusExitStyle } from 'src/v3/densityGroupBuses';
import { ContextMenu, ContextMenuEntry } from './ContextMenu';

interface Props {
  anchorEl?: HTMLElement;
}

const ROUTE_STYLES: { value: RouteStyle; label: string }[] = [
  { value: 'ORTHOGONAL', label: 'Orto' },
  { value: 'DIAGONAL', label: 'Skos' },
  { value: 'BUS', label: 'Wiązka' },
  { value: 'STRAIGHT', label: 'Prosty' }
];

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
  const selectedItemIds = useUiStateStore((state) => {
    return state.selectedItemIds;
  });
  const routingStyle = useUiStateStore((state) => {
    return state.routingStyle;
  });
  const setRoutingStyle = useUiStateStore((state) => {
    return state.actions.setRoutingStyle;
  });

  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });

  const {
    runAutoLayoutForItems,
    runAutoRouteForItems,
    runDensityGroupBuses,
    runArrangeDensityGroups,
    runTestLayoutForDensityGroups,
    runSortByVlanLayout,
    runLayoutByVlanGroups,
    runLayoutByVlanGroupsV2
  } = scene;

  const densityVisible = useDensityGroupsDebugStore((state) => {
    return state.visible;
  });
  const toggleDensity = useDensityGroupsDebugStore((state) => {
    return state.toggle;
  });
  const setDensityVisible = useDensityGroupsDebugStore((state) => {
    return state.setVisible;
  });

  const onClose = useCallback(() => {
    uiStateActions.setContextMenu(null);
  }, [uiStateActions]);

  const groupCount = useMemo(() => {
    if (projectionMode !== 'TWO_D_V3') return 0;
    return computeDensityGroups({ items: scene.items, modelItems }).length;
  }, [projectionMode, scene.items, modelItems]);

  const buildAutoLayoutItems = useCallback((): ContextMenuEntry[] => {
    if (!supportsConnectorTools(projectionMode)) return [];

    const style = routingStyle as RouteStyle;
    const count = selectedItemIds.length;
    const scopeLabel = count === 0 ? 'cały widok' : `${count} zazn.`;

    const run = (placement: PlacementMode) => {
      // Defer so the menu can close before the sync solver blocks the UI.
      setTimeout(() => {
        if (placement === 'none') {
          runAutoRouteForItems(selectedItemIds, { style });
        } else {
          runAutoLayoutForItems(selectedItemIds, { style, placement });
        }
      }, 0);
      onClose();
    };

    const items: ContextMenuEntry[] = [
      {
        label: `Auto-Układ · ${scopeLabel}`,
        isHeader: true,
        dividerBefore: true
      }
    ];

    ROUTE_STYLES.forEach((option) => {
      items.push({
        label: `${style === option.value ? '✓ ' : ''}${option.label}`,
        onClick: () => {
          setRoutingStyle(option.value);
          // Keep menu open so the user can pick an action next — close after style.
          onClose();
        }
      });
    });

    items.push(
      {
        label: 'Ułóż wszystko',
        dividerBefore: true,
        onClick: () => {
          run('full');
        }
      },
      {
        label: 'Porządkuj w miejscu + kable',
        onClick: () => {
          run('swap');
        }
      },
      {
        label: 'Tylko kable',
        onClick: () => {
          run('none');
        }
      }
    );

    return items;
  }, [
    projectionMode,
    routingStyle,
    selectedItemIds,
    runAutoLayoutForItems,
    runAutoRouteForItems,
    setRoutingStyle,
    onClose
  ]);

  /** Classic 2D "Test" (tidy + diagonal fan), applied per density group. */
  const buildV3TestLayoutItems = useCallback((): ContextMenuEntry[] => {
    if (projectionMode !== 'TWO_D_V3') return [];

    return [
      {
        label: 'Porządkowanie',
        isHeader: true,
        dividerBefore: true
      },
      {
        label: 'Test',
        disabled: groupCount === 0,
        onClick: () => {
          setDensityVisible(true);
          setTimeout(() => {
            runTestLayoutForDensityGroups();
          }, 0);
          onClose();
        }
      },
      {
        label: 'Sortuj via VLAN',
        onClick: () => {
          setDensityVisible(true);
          setTimeout(() => {
            runSortByVlanLayout();
          }, 0);
          onClose();
        }
      },
      {
        label: 'Układanie VLAN (1v)',
        onClick: () => {
          setDensityVisible(true);
          setTimeout(() => {
            runLayoutByVlanGroups();
          }, 0);
          onClose();
        }
      },
      {
        label: 'Układanie VLAN (2v)',
        onClick: () => {
          setDensityVisible(true);
          setTimeout(() => {
            runLayoutByVlanGroupsV2();
          }, 0);
          onClose();
        }
      }
    ];
  }, [
    projectionMode,
    groupCount,
    setDensityVisible,
    runTestLayoutForDensityGroups,
    runSortByVlanLayout,
    runLayoutByVlanGroups,
    runLayoutByVlanGroupsV2,
    onClose
  ]);

  const buildDensityGroupItems = useCallback((): ContextMenuEntry[] => {
    if (projectionMode !== 'TWO_D_V3') return [];

    const runBus = (exitStyle: DensityBusExitStyle) => {
      setDensityVisible(true);
      setTimeout(() => {
        runDensityGroupBuses({ exitStyle });
      }, 0);
      onClose();
    };

    const runArrange = (mode?: 'magistrala') => {
      setDensityVisible(true);
      setTimeout(() => {
        runArrangeDensityGroups(mode ? { mode } : undefined);
      }, 0);
      onClose();
    };

    let groupWord = 'grup';
    if (groupCount === 1) groupWord = 'grupa';
    else if (groupCount < 5) groupWord = 'grupy';

    return [
      {
        label: `Gęstość · ${groupCount} ${groupWord}`,
        isHeader: true,
        dividerBefore: true
      },
      {
        label: densityVisible ? 'Ukryj grupy' : 'Pokaż grupy',
        onClick: () => {
          toggleDensity();
          onClose();
        }
      },
      {
        label: 'Ułóż grupy',
        disabled: groupCount === 0,
        onClick: () => {
          runArrange();
        }
      },
      {
        label: 'Ułóż grupy (magistrale)',
        disabled: groupCount === 0,
        onClick: () => {
          runArrange('magistrala');
        }
      },
      {
        label: 'Prosty z grup',
        disabled: groupCount === 0,
        onClick: () => {
          runBus('simple');
        }
      },
      {
        label: 'Magistrala z grup',
        disabled: groupCount === 0,
        onClick: () => {
          runBus('orthogonal');
        }
      },
      {
        label: 'Diagonalny z grup',
        disabled: groupCount === 0,
        onClick: () => {
          runBus('oneBend');
        }
      }
    ];
  }, [
    projectionMode,
    groupCount,
    densityVisible,
    toggleDensity,
    setDensityVisible,
    runDensityGroupBuses,
    runArrangeDensityGroups,
    onClose
  ]);

  const menuItems = useMemo(() => {
    if (!contextMenu) return [];

    const layoutItems = [
      ...buildAutoLayoutItems(),
      ...buildV3TestLayoutItems(),
      ...buildDensityGroupItems()
    ];

    if (contextMenu.item.type === 'EMPTY') {
      return layoutItems;
    }

    if (contextMenu.item.type === 'ITEM') {
      let viewItem: (typeof scene.items)[number];
      try {
        viewItem = getItemByIdOrThrow(scene.items, contextMenu.item.id).value;
      } catch {
        return layoutItems;
      }

      const itemId = viewItem.id;
      const linkedConnectors = scene.connectors.filter((con) => {
        return con.anchors.some((anchor) => {
          return anchor.ref.item === itemId;
        });
      });

      if (viewItem.locked) {
        return [
          {
            label:
              linkedConnectors.length > 0
                ? `Odblokuj węzeł (+ ${linkedConnectors.length} poł.)`
                : 'Odblokuj węzeł',
            onClick: () => {
              try {
                scene.beginHistoryTransaction();
                scene.updateViewItem(itemId, { locked: false });
                linkedConnectors.forEach((con) => {
                  scene.updateConnector(
                    con.id,
                    { locked: false },
                    { overlapResolve: 'off' }
                  );
                });
                scene.endHistoryTransaction();
              } catch {
                // ignore
              }
              onClose();
            }
          },
          ...layoutItems
        ];
      }

      return [
        {
          label: 'Duplikuj',
          onClick: () => {
            try {
              const modelItem = modelItems.find((item) => {
                return item.id === itemId;
              });
              if (!modelItem?.icon) {
                onClose();
                return;
              }
              const draft = cloneModelItemForDuplicate(modelItem);
              uiStateActions.setMode({
                type: 'PLACE_ICON',
                id: modelItem.icon,
                showCursor: true,
                draftModelItem: draft
              });
              uiStateActions.setItemControls(null);
              uiStateActions.setSelectedItemIds([]);
            } catch {
              // ignore
            }
            onClose();
          }
        },
        {
          label:
            linkedConnectors.length > 0
              ? `Blokuj węzeł (+ ${linkedConnectors.length} poł.)`
              : 'Blokuj węzeł',
          onClick: () => {
            try {
              scene.beginHistoryTransaction();
              scene.updateViewItem(itemId, { locked: true });
              linkedConnectors.forEach((con) => {
                scene.updateConnector(
                  con.id,
                  { locked: true },
                  { overlapResolve: 'off' }
                );
              });
              scene.endHistoryTransaction();
            } catch {
              // ignore
            }
            onClose();
          }
        },
        ...layoutItems
      ];
    }

    if (contextMenu.item.type === 'CONNECTOR') {
      type SceneConnector = (typeof scene.connectors)[number];
      let connector: SceneConnector;
      try {
        connector = getItemByIdOrThrow(
          scene.connectors,
          contextMenu.item.id
        ).value;
      } catch {
        return layoutItems;
      }

      const { tile } = contextMenu;
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

      const items: ContextMenuEntry[] = [];

      if (connector.locked) {
        items.push({
          label: 'Odblokuj połączenie',
          onClick: () => {
            try {
              scene.updateConnector(
                connector.id,
                { locked: false },
                { overlapResolve: 'off' }
              );
            } catch {
              // ignore
            }
            onClose();
          }
        });
      } else {
        items.push({
          label: 'Blokuj połączenie',
          onClick: () => {
            try {
              scene.updateConnector(
                connector.id,
                { locked: true },
                { overlapResolve: 'off' }
              );
            } catch {
              // ignore
            }
            onClose();
          }
        });
      }

      if (!connector.locked) {
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
      }

      return [...items, ...layoutItems];
    }

    if (contextMenu.item.type === 'RECTANGLE') {
      let rectangle: (typeof scene.rectangles)[number];
      try {
        rectangle = getItemByIdOrThrow(
          scene.rectangles,
          contextMenu.item.id
        ).value;
      } catch {
        return layoutItems;
      }

      const items: ContextMenuEntry[] = [];

      if (rectangle.locked) {
        items.push({
          label: 'Odblokuj kształt',
          onClick: () => {
            try {
              scene.updateRectangle(rectangle.id, { locked: false });
            } catch {
              // ignore
            }
            onClose();
          }
        });
      } else {
        items.push({
          label: 'Blokuj kształt',
          onClick: () => {
            try {
              scene.updateRectangle(rectangle.id, { locked: true });
            } catch {
              // ignore
            }
            onClose();
          }
        });
      }

      items.push(
        {
          label: 'Send backward',
          onClick: () => {
            scene.changeLayerOrder('SEND_BACKWARD', {
              type: 'RECTANGLE',
              id: rectangle.id
            });
            onClose();
          }
        },
        {
          label: 'Bring forward',
          onClick: () => {
            scene.changeLayerOrder('BRING_FORWARD', {
              type: 'RECTANGLE',
              id: rectangle.id
            });
            onClose();
          }
        },
        {
          label: 'Send to back',
          onClick: () => {
            scene.changeLayerOrder('SEND_TO_BACK', {
              type: 'RECTANGLE',
              id: rectangle.id
            });
            onClose();
          }
        },
        {
          label: 'Bring to front',
          onClick: () => {
            scene.changeLayerOrder('BRING_TO_FRONT', {
              type: 'RECTANGLE',
              id: rectangle.id
            });
            onClose();
          }
        }
      );

      return [...items, ...layoutItems];
    }

    return layoutItems;
  }, [
    contextMenu,
    onClose,
    scene,
    modelItems,
    uiStateActions,
    buildAutoLayoutItems,
    buildV3TestLayoutItems,
    buildDensityGroupItems
  ]);

  if (!contextMenu || menuItems.length === 0) {
    return null;
  }

  const tilePos = isPlanProjection(projectionMode)
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
