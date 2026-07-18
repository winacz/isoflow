import React, { useCallback, useMemo } from 'react';
import { useUiStateStore } from 'src/stores/uiStateStore';
import {
  getTilePosition,
  getTilePosition2d,
  CoordsUtils,
  getItemByIdOrThrow
} from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { ContextMenu } from './ContextMenu';

interface Props {
  anchorEl?: HTMLElement;
}

export const ContextMenuManager = ({ anchorEl }: Props) => {
  const scene = useScene();
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
      return [
        {
          label: 'Resetuj waypointy',
          onClick: () => {
            try {
              const connector = getItemByIdOrThrow(
                scene.connectors,
                contextMenu.item.id
              ).value;

              if (connector.anchors.length <= 2) {
                onClose();
                return;
              }

              const nextAnchors = [
                connector.anchors[0],
                connector.anchors[connector.anchors.length - 1]
              ];

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
        }
      ];
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
  }, [contextMenu, onClose, scene]);

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
