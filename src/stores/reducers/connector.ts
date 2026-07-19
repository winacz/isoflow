import { Connector, Coords } from 'src/types';
import { produce } from 'immer';
import {
  getItemByIdOrThrow,
  getConnectorPath,
  getConnectorPathPreview,
  getAllAnchors,
  resolveConnectorAnchorsAgainstOthers,
  resolveOrthogonalDetourAfterWaypointRemoval,
  collectOtherConnectorPaths,
  withOrthogonalPath,
  dedupeTileWaypoints,
  snapConnectorPathToElbowGuides,
  stripToEndpointAnchors,
  materializeBendWaypoints,
  isSimplePathsEnabled
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
  /** Route using only first/last anchors (ignore middle tile WPs). */
  ignoreWaypoints?: boolean;
  /** After path build, write bend corners back as tile waypoints. */
  materializeBends?: boolean;
  /**
   * Live drag preview: polyline through anchors only (no A* routing).
   * Call again without this on mouseup for the final path.
   */
  fastPath?: boolean;
  /**
   * Override module flag for this sync (avoids HMR / ordering desync).
   * When true: exactly two port endpoints, straight preview A↔B.
   */
  simplePaths?: boolean;
};

/** First and last item/port anchors (ignore tile vias). */
const getItemEndpointAnchors = <T extends { ref: { item?: string } }>(
  anchors: T[]
): T[] => {
  const items = anchors.filter((anchor) => {
    return Boolean(anchor.ref.item);
  });
  if (items.length >= 2) {
    return [items[0], items[items.length - 1]];
  }
  if (anchors.length >= 2) {
    return [anchors[0], anchors[anchors.length - 1]];
  }
  return anchors;
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

      // "Wyłącz obliczanie": plain port↔port line (drop every mid WP).
      const simplePaths =
        isTwoDView &&
        (options?.simplePaths ?? isSimplePathsEnabled());
      if (simplePaths) {
        anchors = getItemEndpointAnchors(anchors);
        const connectors = draft.model.views[view.index].connectors;
        if (connectors) {
          connectors[connector.index] = {
            ...connector.value,
            anchors
          };
        }

        draft.scene.connectors[connector.value.id] = {
          path: getConnectorPathPreview({
            anchors,
            view: view.value,
            modelItems: draft.model.items
          })
        };
        return;
      }

      const forceEndpoints = Boolean(options?.ignoreWaypoints);

      const routingAnchors = forceEndpoints
        ? stripToEndpointAnchors(anchors)
        : anchors;

      if (isTwoDView && overlapResolve !== 'off') {
        const otherPaths = collectOtherConnectorPaths(
          draft.scene.connectors,
          connector.value.id
        );

        if (otherPaths.length > 0) {
          const resolved =
            overlapResolve === 'orthogonalDetour'
              ? resolveOrthogonalDetourAfterWaypointRemoval({
                  anchors: routingAnchors,
                  removedTile: options?.removedTile,
                  view: view.value,
                  modelItems: draft.model.items,
                  otherPaths,
                  laneIndex: options?.laneIndex ?? 0
                })
              : resolveConnectorAnchorsAgainstOthers({
                  anchors: routingAnchors,
                  view: view.value,
                  modelItems: draft.model.items,
                  otherPaths
                });

          if (resolved !== routingAnchors) {
            anchors = resolved;
            const connectors = draft.model.views[view.index].connectors;
            if (connectors) {
              connectors[connector.index] = {
                ...connector.value,
                anchors
              };
            }
          } else if (options?.ignoreWaypoints) {
            anchors = routingAnchors;
          }
        } else if (options?.ignoreWaypoints) {
          anchors = routingAnchors;
        }
      } else if (forceEndpoints) {
        anchors = routingAnchors;
      }

      // Live node/WP drag: polyline through current anchors (no A* / L-fill).
      const pathAnchors = forceEndpoints
        ? stripToEndpointAnchors(anchors)
        : anchors;

      if (options?.fastPath) {
        draft.scene.connectors[connector.value.id] = {
          path: getConnectorPathPreview({
            anchors: pathAnchors,
            view: view.value,
            modelItems: draft.model.items
          })
        };
        return;
      }

      const buildOrthogonal =
        isTwoDView &&
        (Boolean(options?.ignoreWaypoints) ||
          (overlapResolve === 'orthogonalDetour' &&
            (Boolean(options?.removedTile) || pathAnchors.length > 2)));

      const buildPath = () => {
        return getConnectorPath({
          anchors: pathAnchors,
          view: view.value,
          modelItems: draft.model.items,
          orthogonal: buildOrthogonal
        });
      };

      let path = buildOrthogonal
        ? withOrthogonalPath(buildPath, options?.removedTile)
        : buildPath();

      // Align automatic elbows with nearby cable bends (shared Y/X guides).
      if (isTwoDView && pathAnchors.length === 2 && !forceEndpoints) {
        const guidePaths = collectOtherConnectorPaths(
          draft.scene.connectors,
          connector.value.id
        );
        path = snapConnectorPathToElbowGuides({
          anchors: pathAnchors,
          path,
          view: view.value,
          modelItems: draft.model.items,
          otherPaths: guidePaths,
          orthogonal: buildOrthogonal
        });
      }

      if (isTwoDView && options?.materializeBends) {
        const withBends = materializeBendWaypoints({
          anchors: pathAnchors,
          path,
          view: view.value,
          modelItems: draft.model.items
        });
        const connectors = draft.model.views[view.index].connectors;
        if (connectors) {
          connectors[connector.index] = {
            ...connectors[connector.index],
            anchors: withBends
          };
        }
      }

      draft.scene.connectors[connector.value.id] = { path };
    }
  });

  return newState;
};

export type UpdateConnectorPayload = {
  id: string;
  overlapResolve?: OverlapResolveMode;
  removedTile?: Coords;
  ignoreWaypoints?: boolean;
  materializeBends?: boolean;
  fastPath?: boolean;
  simplePaths?: boolean;
} & Partial<Connector>;

export const updateConnector = (
  {
    id,
    overlapResolve,
    removedTile,
    ignoreWaypoints,
    materializeBends,
    fastPath,
    simplePaths,
    ...updates
  }: UpdateConnectorPayload,
  { state, viewId }: ViewReducerContext
): State => {
  const newState = produce(state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, viewId);
    const { connectors } = draft.model.views[view.index];

    if (!connectors) return;

    const connector = getItemByIdOrThrow(connectors, id);
    const newConnector = {
      ...connector.value,
      ...updates,
      ...(updates.anchors
        ? { anchors: dedupeTileWaypoints(updates.anchors) }
        : {})
    };
    connectors[connector.index] = newConnector;

    if (
      updates.anchors ||
      materializeBends ||
      ignoreWaypoints ||
      fastPath ||
      simplePaths !== undefined
    ) {
      const stateAfterSync = syncConnector(
        newConnector.id,
        {
          viewId,
          state: draft
        },
        {
          overlapResolve,
          removedTile,
          ignoreWaypoints,
          materializeBends,
          fastPath,
          simplePaths
        }
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
      draft.model.views[view.index].connectors = [
        {
          ...newConnector,
          anchors: dedupeTileWaypoints(newConnector.anchors)
        }
      ];
    } else {
      draft.model.views[view.index].connectors?.unshift({
        ...newConnector,
        anchors: dedupeTileWaypoints(newConnector.anchors)
      });
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
