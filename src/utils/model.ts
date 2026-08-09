import { produce } from 'immer';
import { Model, ModelStore, ProjectionMode } from 'src/types';
import { validateModel } from 'src/schemas/validation';
import { getItemByIdOrThrow } from './common';

export const fixModel = (model: Model): Model => {
  const issues = validateModel(model);

  return issues.reduce((acc, issue) => {
    if (issue.type === 'INVALID_MODEL_TO_ICON_REF') {
      return produce(acc, (draft) => {
        const { index: itemIndex } = getItemByIdOrThrow(
          draft.items,
          issue.params.modelItem
        );

        draft.items[itemIndex].icon = undefined;
      });
    }

    if (issue.type === 'CONNECTOR_TOO_FEW_ANCHORS') {
      return produce(acc, (draft) => {
        const view = getItemByIdOrThrow(draft.views, issue.params.view);

        const connector = getItemByIdOrThrow(
          view.value.connectors ?? [],
          issue.params.connector
        );

        draft.views[view.index].connectors?.splice(connector.index, 1);
      });
    }

    if (issue.type === 'INVALID_ANCHOR_TO_ANCHOR_REF') {
      return produce(acc, (draft) => {
        const view = getItemByIdOrThrow(draft.views, issue.params.view);

        const connector = getItemByIdOrThrow(
          view.value.connectors ?? [],
          issue.params.connector
        );

        const anchor = getItemByIdOrThrow(
          connector.value.anchors,
          issue.params.srcAnchor
        );

        connector.value.anchors.splice(anchor.index, 1);
      });
    }

    return acc;
  }, model);
};

export const modelFromModelStore = (modelStore: ModelStore): Model => {
  return {
    version: modelStore.version,
    title: modelStore.title,
    description: modelStore.description,
    colors: modelStore.colors,
    icons: modelStore.icons,
    items: modelStore.items,
    views: modelStore.views,
    deviceTemplates: modelStore.deviceTemplates ?? [],
    vlanNames: modelStore.vlanNames
  };
};

/** JSON / InitialData payload for round-trip open after export. */
export type ExportSnapshot = Model & {
  view?: string;
  projectionMode?: ProjectionMode;
  fitToView?: boolean;
};

/** Full project round-trip: all tabs/views, items, icons, colors, templates. */
export const buildProjectSnapshot = (
  modelStore: ModelStore,
  ui: { view: string; projectionMode: ProjectionMode }
): ExportSnapshot => {
  return {
    ...modelFromModelStore(modelStore),
    view: ui.view,
    projectionMode: ui.projectionMode,
    fitToView: false
  };
};

/** Alias — full project snapshot (same as buildProjectSnapshot). */
export const buildExportSnapshot = (
  modelStore: ModelStore,
  ui: { view: string; projectionMode: ProjectionMode }
): ExportSnapshot => {
  return buildProjectSnapshot(modelStore, ui);
};
