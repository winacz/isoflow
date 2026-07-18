import { Connector, Coords } from 'src/types';
import { produce } from 'immer';
import {
  getItemByIdOrThrow,
  getConnectorPath,
  getAllAnchors,
  resolveConnectorAnchorsAgainstOthers,
  resolveOrthogonalDetourAfterWaypointRemoval,
  collectOtherConnectorPaths,
  withOrthogonalPath
} from 'src/utils';
import { isShape2dIcon } from 'src/config';
import { validateConnector } from 'src/schemas/validation';
import { State, ViewReducerContext } from './types';

export type OverlapResolveMode = 'default' | 'orthogonalDetour' | 'off';

export type SyncConnectorOptions = {
  overlapResolve?: OverlapResolveMode;
  /** Tile of a waypoint just removed — prefers detour on that side. */
  removedTile?: Coords;
  /** Fan-out index when syncing many cables after a node move. */
  laneIndex?: number;
};

/** Anti-overlap is 2D-only — never mutate isometric connector anchors. */
const viewUsesShape2d = (
  viewItems: { id: string }[],
  modelItems: { id: string; icon?: string }[]
) => {
  return viewItems.some((viewItem) => {
    const modelItem = modelItems.find((candidate) => {
      return candidate.id === viewItem.id;
    });
    return Boolean(modelItem?.icon && isShape2dIcon(modelItem.icon));
  });
};

export const deleteConnector = (
  id: string,
  { viewId, state }: ViewReducerContext
): State => {
  const view = getItemByIdOrThrow(state.model.views, viewId);
  const connector = getItemByIdOrThrow(view.value.connectors ?? [], id);

  const newState = produce(state, (draft) => {
    draft.model.views[view.index].connectors?.splice(connector.index, 1);
    delete draft.scene.connectors[connector.index];
  });

  return newState;
};

export const syncConnector = (
  id: string,
  { viewId, state }: ViewReducerContext,
  options?: SyncConnectorOptions
) => {
  const overlapResolve = options?.overlapResolve ?? 'off';

  const newState = produce(state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, viewId);
    const connector = getItemByIdOrThrow(view.value.connectors ?? [], id);
    const allAnchors = getAllAnchors(view.value.connectors ?? []);
    const issues = validateConnector(connector.value, {
      view: view.value,
      model: state.model,
      allAnchors
    });

    if (issues.length > 0) {
      const stateAfterDelete = deleteConnector(id, { viewId, state: draft });

      draft.scene = stateAfterDelete.scene;
      draft.model = stateAfterDelete.model;
    } else {
      let anchors = connector.value.anchors;
      const isTwoDView = viewUsesShape2d(
        view.value.items,
        draft.model.items
      );

      if (isTwoDView && overlapResolve !== 'off') {
        const otherPaths = collectOtherConnectorPaths(
          draft.scene.connectors,
          connector.value.id
        );

        if (otherPaths.length > 0) {
          const resolved =
            overlapResolve === 'orthogonalDetour'
              ? resolveOrthogonalDetourAfterWaypointRemoval({
                  anchors,
                  removedTile: options?.removedTile,
                  view: view.value,
                  modelItems: draft.model.items,
                  otherPaths,
                  laneIndex: options?.laneIndex ?? 0
                })
              : resolveConnectorAnchorsAgainstOthers({
                  anchors,
                  view: view.value,
                  modelItems: draft.model.items,
                  otherPaths
                });

          if (resolved !== anchors) {
            anchors = resolved;
            const connectors = draft.model.views[view.index].connectors;
            if (connectors) {
              connectors[connector.index] = {
                ...connector.value,
                anchors
              };
            }
          }
        }
      }

      // Orthogonal L/U only when detour actually uses elbows (or WP-delete hint).
      // `off` and plain port↔port must keep A* diagonals — otherwise no angled cables.
      const buildOrthogonal =
        isTwoDView &&
        overlapResolve === 'orthogonalDetour' &&
        (Boolean(options?.removedTile) || anchors.length > 2);

      const buildPath = () => {
        return getConnectorPath({
          anchors,
          view: view.value,
          modelItems: draft.model.items,
          orthogonal: buildOrthogonal
        });
      };

      const path = buildOrthogonal
        ? withOrthogonalPath(buildPath, options?.removedTile)
        : buildPath();

      draft.scene.connectors[connector.value.id] = { path };
    }
  });

  return newState;
};

export type UpdateConnectorPayload = {
  id: string;
  overlapResolve?: OverlapResolveMode;
  removedTile?: Coords;
} & Partial<Connector>;

export const updateConnector = (
  { id, overlapResolve, removedTile, ...updates }: UpdateConnectorPayload,
  { state, viewId }: ViewReducerContext
): State => {
  const newState = produce(state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, viewId);
    const { connectors } = draft.model.views[view.index];

    if (!connectors) return;

    const connector = getItemByIdOrThrow(connectors, id);
    const newConnector = { ...connector.value, ...updates };
    connectors[connector.index] = newConnector;

    if (updates.anchors) {
      const stateAfterSync = syncConnector(
        newConnector.id,
        {
          viewId,
          state: draft
        },
        { overlapResolve, removedTile }
      );

      draft.model = stateAfterSync.model;
      draft.scene = stateAfterSync.scene;
    }
  });

  return newState;
};

export const createConnector = (
  newConnector: Connector,
  { state, viewId }: ViewReducerContext
): State => {
  const newState = produce(state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, viewId);
    const { connectors } = draft.model.views[view.index];

    if (!connectors) {
      draft.model.views[view.index].connectors = [newConnector];
    } else {
      draft.model.views[view.index].connectors?.unshift(newConnector);
    }

    const stateAfterSync = syncConnector(
      newConnector.id,
      {
        viewId,
        state: draft
      },
      { overlapResolve: 'off' }
    );

    draft.model = stateAfterSync.model;
    draft.scene = stateAfterSync.scene;
  });

  return newState;
};
