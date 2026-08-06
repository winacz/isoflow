import { ModeActions, Connector as ConnectorI } from 'src/types';
import {
  generateId,
  getShape2dPortAtTile,
  isShape2dPortUnavailable,
  setWindowCursor,
  BLACK_CROSSHAIR_CURSOR
} from 'src/utils';
import { routeNewConnection, type RoutedConnector } from 'src/v3/routing';

/**
 * §1 Connection lifecycle for the 2D v3 tab.
 *
 *   MOUSEDOWN — validate the port under the cursor, then create a zero-length
 *               connector on it (both anchors on the same port).
 *   MOUSEMOVE — move `mode.preview` only. No model write, so no routing runs
 *               while the pointer is moving; the drag renders as a straight
 *               hint line instead of a live path.
 *   MOUSEUP   — validate the destination. If it holds, run A* once and
 *               materialize the bends as real anchors; otherwise discard.
 *
 * Connections stay ordered `anchors` arrays throughout — there is no
 * source/target pair anywhere in this flow.
 */

const portUnderCursor = ({
  scene,
  model,
  tile
}: {
  scene: Parameters<NonNullable<ModeActions['mousedown']>>[0]['scene'];
  model: Parameters<NonNullable<ModeActions['mousedown']>>[0]['model'];
  tile: { x: number; y: number };
}) => {
  return getShape2dPortAtTile({
    tile,
    scene,
    modelItems: model.items
  });
};

export const ConnectorV3: ModeActions = {
  entry: () => {
    setWindowCursor(BLACK_CROSSHAIR_CURSOR);
  },

  exit: () => {
    setWindowCursor('default');
  },

  mousedown: ({ uiState, scene, model, isRendererInteraction }) => {
    if (uiState.mode.type !== 'CONNECTOR_V3' || !isRendererInteraction) return;

    const hit = portUnderCursor({
      scene,
      model,
      tile: uiState.mouse.position.tile
    });

    // Nothing to start from — stay armed rather than creating a stray cable.
    if (!hit) return;

    const taken = isShape2dPortUnavailable({
      itemId: hit.itemId,
      portId: hit.portId,
      connectors: scene.currentView.connectors ?? [],
      modelItems: model.items,
      viewItems: scene.items
    });
    if (taken) return;

    const ref = { item: hit.itemId, port: hit.portId };
    const connector: ConnectorI = {
      id: generateId(),
      color: scene.colors[0]?.id,
      // Zero length: both ends on the origin port until mouseup says otherwise.
      anchors: [
        { id: generateId(), ref: { ...ref } },
        { id: generateId(), ref: { ...ref } }
      ]
    };

    scene.beginHistoryTransaction();
    scene.createConnector(connector);
    uiState.actions.setFocusedPortId(hit.portId);

    uiState.actions.setMode({
      type: 'CONNECTOR_V3',
      showCursor: true,
      id: connector.id,
      start: ref,
      preview: { ...uiState.mouse.position.tile }
    });
  },

  mousemove: ({ uiState }) => {
    if (uiState.mode.type !== 'CONNECTOR_V3' || !uiState.mode.id) return;

    const next = uiState.mouse.position.tile;
    const current = uiState.mode.preview;
    if (current && current.x === next.x && current.y === next.y) return;

    // UI-only write: the connector in the model is untouched, so nothing
    // reroutes until the pointer is released.
    uiState.actions.setMode({
      ...uiState.mode,
      preview: { x: next.x, y: next.y }
    });
  },

  mouseup: ({ uiState, scene, model }) => {
    if (uiState.mode.type !== 'CONNECTOR_V3') return;

    const { id, start } = uiState.mode;

    const rearm = () => {
      uiState.actions.setMode({
        type: 'CONNECTOR_V3',
        showCursor: true,
        id: null,
        start: null,
        preview: null
      });
    };

    if (!id || !start) {
      scene.endHistoryTransaction();
      rearm();
      return;
    }

    const hit = portUnderCursor({
      scene,
      model,
      tile: uiState.mouse.position.tile
    });

    const sameJack =
      hit && hit.itemId === start.item && hit.portId === start.port;

    const destinationTaken =
      hit &&
      isShape2dPortUnavailable({
        itemId: hit.itemId,
        portId: hit.portId,
        connectors: scene.currentView.connectors ?? [],
        modelItems: model.items,
        viewItems: scene.items,
        excludeConnectorId: id
      });

    if (!hit || sameJack || destinationTaken) {
      scene.deleteConnector(id);
      scene.endHistoryTransaction();
      rearm();
      return;
    }

    const end = { item: hit.itemId, port: hit.portId };

    // One routing pass, now that both endpoints are known and validated.
    const routed = routeNewConnection({
      from: { itemId: start.item, portId: start.port },
      to: { itemId: end.item, portId: end.port },
      items: scene.items,
      modelItems: model.items,
      existingConnectors: (scene.connectors ?? []) as RoutedConnector[],
      excludeConnectorId: id
    });

    if (!routed) {
      scene.deleteConnector(id);
      scene.endHistoryTransaction();
      rearm();
      return;
    }

    // Materialize the path bends as real anchors between the two endpoints.
    const anchors = [
      { id: generateId(), ref: { item: start.item, port: start.port } },
      ...routed.waypoints.map((tile) => {
        return { id: generateId(), ref: { tile } };
      }),
      { id: generateId(), ref: { item: end.item, port: end.port } }
    ];

    scene.updateConnector(id, { anchors }, { overlapResolve: 'off' });
    scene.endHistoryTransaction();

    uiState.actions.setFocusedPortId(hit.portId);
    rearm();
  }
};
