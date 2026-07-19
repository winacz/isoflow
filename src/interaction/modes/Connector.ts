import { produce } from 'immer';
import {
  generateId,
  getItemAtTile,
  getShape2dItemAtTile,
  getNearestShape2dPort,
  getItemByIdOrThrow,
  hasMovedTile,
  setWindowCursor,
  BLACK_CROSSHAIR_CURSOR,
  SHAPE_2D_PORT_SNAP_DISTANCE,
  isShape2dPortInUse
} from 'src/utils';
import {
  ModeActions,
  Connector as ConnectorI,
  ItemReference,
  State,
  ConnectorAnchor
} from 'src/types';
import { isShape2dIcon } from 'src/config';

const resolveItemAtTile = ({
  uiState,
  scene,
  model
}: Pick<State, 'uiState' | 'scene' | 'model'>): ItemReference | null => {
  if (uiState.projectionMode === 'TWO_D') {
    return getShape2dItemAtTile({
      tile: uiState.mouse.position.tile,
      scene,
      modelItems: model.items
    });
  }

  const itemAtTile = getItemAtTile({
    tile: uiState.mouse.position.tile,
    scene
  });

  if (itemAtTile?.type === 'ITEM') {
    const modelItem = model.items.find((item) => {
      return item.id === itemAtTile.id;
    });

    if (modelItem && isShape2dIcon(modelItem.icon)) {
      return null;
    }
  }

  return itemAtTile;
};

const getViewConnectors = (scene: State['scene']) => {
  return scene.currentView.connectors ?? [];
};

const resolveAnchorRef = ({
  uiState,
  scene,
  model
}: Pick<State, 'uiState' | 'scene' | 'model'>): ConnectorAnchor['ref'] => {
  if (uiState.projectionMode === 'TWO_D') {
    const connectors = getViewConnectors(scene);
    const excludeConnectorId =
      uiState.mode.type === 'CONNECTOR' ? uiState.mode.id : null;

    const portHit = getNearestShape2dPort({
      tile: uiState.mouse.position.tile,
      scene,
      modelItems: model.items,
      maxDistance: SHAPE_2D_PORT_SNAP_DISTANCE,
      isPortAvailable: (hit) => {
        return !isShape2dPortInUse({
          itemId: hit.itemId,
          portId: hit.portId,
          connectors,
          excludeConnectorId
        });
      }
    });

    if (portHit) {
      return {
        item: portHit.itemId,
        port: portHit.portId
      };
    }

    // Require port handles in 2D — don't attach to device body
    return {
      tile: uiState.mouse.position.tile
    };
  }

  const itemAtTile = resolveItemAtTile({ uiState, scene, model });

  if (itemAtTile?.type === 'ITEM') {
    return { item: itemAtTile.id };
  }

  return { tile: uiState.mouse.position.tile };
};

export const Connector: ModeActions = {
  entry: () => {
    setWindowCursor(BLACK_CROSSHAIR_CURSOR);
  },
  exit: () => {
    setWindowCursor('default');
  },
  mousemove: ({ uiState, scene, model }) => {
    if (
      uiState.mode.type !== 'CONNECTOR' ||
      !uiState.mode.id ||
      !hasMovedTile(uiState.mouse)
    )
      return;

    const connector = getItemByIdOrThrow(
      scene.currentView.connectors ?? [],
      uiState.mode.id
    );

    const nextRef = resolveAnchorRef({ uiState, scene, model });

    const newConnector = produce(connector.value, (draft) => {
      draft.anchors[1] = { id: generateId(), ref: nextRef };
    });

    scene.updateConnector(uiState.mode.id, newConnector, {
      overlapResolve: 'off'
    });
  },
  mousedown: ({ uiState, scene, model, isRendererInteraction }) => {
    if (uiState.mode.type !== 'CONNECTOR' || !isRendererInteraction) return;

    const startRef = resolveAnchorRef({ uiState, scene, model });

    // In 2D, connections must start from a free port handle
    if (uiState.projectionMode === 'TWO_D') {
      if (!startRef.port || !startRef.item) return;

      if (
        isShape2dPortInUse({
          itemId: startRef.item,
          portId: startRef.port,
          connectors: getViewConnectors(scene)
        })
      ) {
        return;
      }
    }

    const newConnector: ConnectorI = {
      id: generateId(),
      color: scene.colors[0].id,
      anchors: [
        { id: generateId(), ref: startRef },
        { id: generateId(), ref: startRef }
      ]
    };

    scene.beginHistoryTransaction();
    scene.createConnector(newConnector);

    uiState.actions.setMode({
      type: 'CONNECTOR',
      showCursor: true,
      id: newConnector.id
    });
  },
  mouseup: ({ uiState, scene }) => {
    if (uiState.mode.type !== 'CONNECTOR' || !uiState.mode.id) {
      scene.endHistoryTransaction();
      return;
    }

    const connector = getItemByIdOrThrow(scene.connectors, uiState.mode.id);
    const firstAnchor = connector.value.anchors[0];
    const lastAnchor =
      connector.value.anchors[connector.value.anchors.length - 1];

    const startsOnDevice = Boolean(firstAnchor.ref.item);
    const endsOnDevice = Boolean(lastAnchor.ref.item);
    const startsOnPort = Boolean(firstAnchor.ref.port);
    const endsOnPort = Boolean(lastAnchor.ref.port);

    const connectors = getViewConnectors(scene);
    const endPortFree =
      firstAnchor.ref.item &&
      firstAnchor.ref.port &&
      lastAnchor.ref.item &&
      lastAnchor.ref.port
        ? !isShape2dPortInUse({
            itemId: lastAnchor.ref.item,
            portId: lastAnchor.ref.port,
            connectors,
            excludeConnectorId: uiState.mode.id
          })
        : false;

    const isValidIso =
      uiState.projectionMode !== 'TWO_D' &&
      connector.value.path.tiles.length >= 2 &&
      startsOnDevice &&
      endsOnDevice;

    const isValid2d =
      uiState.projectionMode === 'TWO_D' &&
      connector.value.path.tiles.length >= 2 &&
      startsOnPort &&
      endsOnPort &&
      endPortFree &&
      !(
        firstAnchor.ref.item === lastAnchor.ref.item &&
        firstAnchor.ref.port === lastAnchor.ref.port
      );

    if (!isValidIso && !isValid2d) {
      scene.deleteConnector(uiState.mode.id);
    } else if (uiState.projectionMode === 'TWO_D') {
      // Persist bend corners as editable waypoints.
      scene.updateConnector(
        uiState.mode.id,
        {},
        { overlapResolve: 'off', materializeBends: true }
      );
    }

    scene.endHistoryTransaction();

    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};
