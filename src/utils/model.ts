import { produce } from 'immer';
import {
  Model,
  ModelStore,
  ProjectionMode,
  View,
  Icon,
  Colors
} from 'src/types';
import { DEFAULT_COLOR } from 'src/config';
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
    deviceTemplates: modelStore.deviceTemplates ?? []
  };
};

/** JSON / InitialData payload for round-trip open after export. */
export type ExportSnapshot = Model & {
  view?: string;
  projectionMode?: ProjectionMode;
  fitToView?: boolean;
};

/**
 * 2D diagram export: active view layout only (nodes + connections).
 * Device template library is omitted — loaded separately / from localStorage.
 */
const buildTwoDLayoutSnapshot = (
  modelStore: ModelStore,
  viewId: string
): ExportSnapshot => {
  const full = modelFromModelStore(modelStore);
  const activeView = full.views.find((view) => {
    return view.id === viewId;
  });

  if (!activeView) {
    return {
      ...full,
      deviceTemplates: [],
      view: viewId,
      projectionMode: 'TWO_D',
      fitToView: false
    };
  }

  const view: View = {
    ...activeView,
    items: activeView.items ?? [],
    connectors: activeView.connectors ?? [],
    rectangles: activeView.rectangles ?? [],
    textBoxes: activeView.textBoxes ?? []
  };

  const itemIds = new Set(
    view.items.map((item) => {
      return item.id;
    })
  );

  const items = full.items.filter((item) => {
    return itemIds.has(item.id);
  });

  const iconIds = new Set(
    items
      .map((item) => {
        return item.icon;
      })
      .filter((id): id is string => {
        return Boolean(id);
      })
  );

  const icons: Icon[] = full.icons.filter((icon) => {
    return iconIds.has(icon.id);
  });

  const colorIds = new Set<string>([DEFAULT_COLOR.id]);
  (view.connectors ?? []).forEach((connector) => {
    if (connector.color) colorIds.add(connector.color);
  });
  (view.rectangles ?? []).forEach((rectangle) => {
    if (rectangle.color) colorIds.add(rectangle.color);
  });

  const colors: Colors = full.colors.filter((color) => {
    return colorIds.has(color.id);
  });
  if (!colors.some((color) => color.id === DEFAULT_COLOR.id)) {
    colors.unshift(DEFAULT_COLOR);
  }

  return {
    version: full.version,
    title: full.title,
    description: full.description,
    colors,
    icons,
    items,
    views: [view],
    // Library stays out of diagram files
    deviceTemplates: [],
    view: view.id,
    projectionMode: 'TWO_D',
    fitToView: false
  };
};

export const buildExportSnapshot = (
  modelStore: ModelStore,
  ui: { view: string; projectionMode: ProjectionMode }
): ExportSnapshot => {
  if (ui.projectionMode === 'TWO_D') {
    return buildTwoDLayoutSnapshot(modelStore, ui.view);
  }

  return {
    ...modelFromModelStore(modelStore),
    view: ui.view,
    projectionMode: ui.projectionMode,
    fitToView: false
  };
};
