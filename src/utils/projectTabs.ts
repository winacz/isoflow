import type { InitialData, View, ProjectionMode } from 'src/types';
import { DEFAULT_COLOR, SHAPES_2D } from 'src/config';
import { generateId } from './common';
import { ensureDeviceTemplateIcons } from './deviceTemplateStorage';
import {
  ISOMETRIC_VIEW_NAME,
  PLAN_2D_VIEW_NAME,
  PLAN_2D_V2_VIEW_NAME,
  build2Dv2SnapshotFromPlan
} from './plan2dv2';

/** Modular tab role — drives UI + projection without hardcoding view names. */
export const ViewKindEnum = {
  ISOMETRIC: 'ISOMETRIC',
  PLAN_2D: 'PLAN_2D',
  PLAN_2D_V2: 'PLAN_2D_V2'
} as const;

export type ViewKind = keyof typeof ViewKindEnum;

export type ProjectTab = {
  viewId: string;
  kind: ViewKind;
  label: string;
  order: number;
};

export const inferViewKind = (view: Pick<View, 'name' | 'kind'>): ViewKind => {
  if (view.kind) return view.kind;
  if (view.name === PLAN_2D_V2_VIEW_NAME) return ViewKindEnum.PLAN_2D_V2;
  if (view.name === ISOMETRIC_VIEW_NAME) return ViewKindEnum.ISOMETRIC;
  if (view.name === PLAN_2D_VIEW_NAME) return ViewKindEnum.PLAN_2D;
  // Extra / custom plan-like views default to 2D.
  return ViewKindEnum.PLAN_2D;
};

export const projectionModeForKind = (kind: ViewKind): ProjectionMode => {
  switch (kind) {
    case ViewKindEnum.ISOMETRIC:
      return 'ISOMETRIC';
    case ViewKindEnum.PLAN_2D_V2:
      return 'TWO_D_V2';
    case ViewKindEnum.PLAN_2D:
    default:
      return 'TWO_D';
  }
};

export const defaultLabelForKind = (kind: ViewKind, name: string): string => {
  switch (kind) {
    case ViewKindEnum.ISOMETRIC:
      return 'Isometric';
    case ViewKindEnum.PLAN_2D_V2:
      return '2Dv2';
    case ViewKindEnum.PLAN_2D:
      return name === PLAN_2D_VIEW_NAME ? '2D' : name;
    default:
      return name;
  }
};

export const defaultOrderForKind = (kind: ViewKind): number => {
  switch (kind) {
    case ViewKindEnum.ISOMETRIC:
      return 0;
    case ViewKindEnum.PLAN_2D:
      return 100;
    case ViewKindEnum.PLAN_2D_V2:
      return 200;
    default:
      return 50;
  }
};

export const emptyView = ({
  id = generateId(),
  name,
  kind,
  order
}: {
  id?: string;
  name: string;
  kind: ViewKind;
  order: number;
}): View => {
  return {
    id,
    name,
    kind,
    order,
    items: [],
    connectors: [],
    rectangles: [],
    textBoxes: []
  };
};

/**
 * Normalize views for modular project tabs (backward-compatible with old JSON).
 * Ensures Isometric / Plan / 2Dv2 kinds exist; stamps kind + order when missing.
 */
export const ensureProjectViews = <
  T extends { views: View[]; items?: InitialData['items'] }
>(
  model: T
): T => {
  let views: View[] = model.views.map((view, index) => {
    const kind = inferViewKind(view);
    return {
      ...view,
      kind,
      order: view.order ?? defaultOrderForKind(kind) + index * 0.01
    };
  });

  const hasKind = (kind: ViewKind) => {
    return views.some((view) => {
      return inferViewKind(view) === kind;
    });
  };

  if (!hasKind(ViewKindEnum.PLAN_2D)) {
    views = [
      emptyView({
        name: PLAN_2D_VIEW_NAME,
        kind: ViewKindEnum.PLAN_2D,
        order: defaultOrderForKind(ViewKindEnum.PLAN_2D)
      }),
      ...views
    ];
  }

  if (!hasKind(ViewKindEnum.PLAN_2D_V2)) {
    const plan =
      views
        .filter((view) => {
          return inferViewKind(view) === ViewKindEnum.PLAN_2D;
        })
        .sort((a, b) => {
          return (a.order ?? 0) - (b.order ?? 0);
        })[0] ?? null;
    const snapshot = plan
      ? build2Dv2SnapshotFromPlan({
          plan,
          modelItems: model.items ?? []
        })
      : {
          items: [],
          rectangles: [],
          connectors: [],
          textBoxes: []
        };
    views = [
      ...views,
      {
        ...emptyView({
          name: PLAN_2D_V2_VIEW_NAME,
          kind: ViewKindEnum.PLAN_2D_V2,
          order: defaultOrderForKind(ViewKindEnum.PLAN_2D_V2)
        }),
        items: snapshot.items,
        rectangles: snapshot.rectangles
      }
    ];
  }

  if (!hasKind(ViewKindEnum.ISOMETRIC)) {
    views = [
      ...views,
      emptyView({
        name: ISOMETRIC_VIEW_NAME,
        kind: ViewKindEnum.ISOMETRIC,
        order: defaultOrderForKind(ViewKindEnum.ISOMETRIC)
      })
    ];
  }

  // Canonical strip order: Isometric → 2D → 2Dv2 (extra 2D tabs sit between 2D and 2Dv2).
  const primaryPlan = views
    .filter((view) => {
      return inferViewKind(view) === ViewKindEnum.PLAN_2D;
    })
    .sort((a, b) => {
      return (a.order ?? 0) - (b.order ?? 0);
    })[0];
  const extraPlans = views
    .filter((view) => {
      return (
        inferViewKind(view) === ViewKindEnum.PLAN_2D &&
        view.id !== primaryPlan?.id
      );
    })
    .sort((a, b) => {
      return (a.order ?? 0) - (b.order ?? 0);
    });

  views = views.map((view) => {
    const kind = inferViewKind(view);
    if (kind === ViewKindEnum.ISOMETRIC) {
      return {
        ...view,
        order: defaultOrderForKind(ViewKindEnum.ISOMETRIC)
      };
    }
    if (kind === ViewKindEnum.PLAN_2D_V2) {
      return {
        ...view,
        order: defaultOrderForKind(ViewKindEnum.PLAN_2D_V2)
      };
    }
    if (kind === ViewKindEnum.PLAN_2D && view.id === primaryPlan?.id) {
      return {
        ...view,
        order: defaultOrderForKind(ViewKindEnum.PLAN_2D)
      };
    }
    if (kind === ViewKindEnum.PLAN_2D) {
      const extraIndex = extraPlans.findIndex((candidate) => {
        return candidate.id === view.id;
      });
      return {
        ...view,
        order: defaultOrderForKind(ViewKindEnum.PLAN_2D) + 1 + Math.max(0, extraIndex)
      };
    }
    return view;
  });

  return { ...model, views };
};

export const getProjectTabs = (views: View[]): ProjectTab[] => {
  return [...views]
    .map((view, index) => {
      const kind = inferViewKind(view);
      return {
        viewId: view.id,
        kind,
        label: defaultLabelForKind(kind, view.name),
        order: view.order ?? defaultOrderForKind(kind) + index
      };
    })
    .sort((a, b) => {
      return a.order - b.order;
    });
};

/** Primary Plan view (lowest-order PLAN_2D) — feeds 2Dv2 sync. */
export const findPrimaryPlanView = (views: View[]): View | null => {
  const plans = views
    .filter((view) => {
      return inferViewKind(view) === ViewKindEnum.PLAN_2D;
    })
    .sort((a, b) => {
      return (a.order ?? 0) - (b.order ?? 0);
    });
  return plans[0] ?? null;
};

export const findViewByKind = (
  views: View[],
  kind: ViewKind
): View | null => {
  return (
    views.find((view) => {
      return inferViewKind(view) === kind;
    }) ?? null
  );
};

export const nextPlan2dTabName = (views: View[]): string => {
  const planCount = views.filter((view) => {
    return inferViewKind(view) === ViewKindEnum.PLAN_2D;
  }).length;
  return planCount <= 0 ? PLAN_2D_VIEW_NAME : `2D ${planCount + 1}`;
};

export const createPlan2dTab = (views: View[], name?: string): View => {
  const planViews = views.filter((view) => {
    return inferViewKind(view) === ViewKindEnum.PLAN_2D;
  });
  const maxOrder = planViews.reduce((max, view) => {
    return Math.max(max, view.order ?? 0);
  }, defaultOrderForKind(ViewKindEnum.PLAN_2D) - 1);

  return emptyView({
    name: name?.trim() || nextPlan2dTabName(views),
    kind: ViewKindEnum.PLAN_2D,
    order: maxOrder + 1
  });
};

/** Blank project with the three default modular tabs. */
export const createEmptyProject = (
  title = 'Untitled project'
): InitialData => {
  const planId = generateId();
  const v2Id = generateId();
  const isoId = generateId();

  return {
    title: title.trim() || 'Untitled project',
    version: '1.0',
    fitToView: true,
    projectionMode: 'ISOMETRIC',
    icons: ensureDeviceTemplateIcons([...SHAPES_2D], []),
    colors: [DEFAULT_COLOR],
    items: [],
    deviceTemplates: [],
    views: [
      emptyView({
        id: isoId,
        name: ISOMETRIC_VIEW_NAME,
        kind: ViewKindEnum.ISOMETRIC,
        order: defaultOrderForKind(ViewKindEnum.ISOMETRIC)
      }),
      emptyView({
        id: planId,
        name: PLAN_2D_VIEW_NAME,
        kind: ViewKindEnum.PLAN_2D,
        order: defaultOrderForKind(ViewKindEnum.PLAN_2D)
      }),
      emptyView({
        id: v2Id,
        name: PLAN_2D_V2_VIEW_NAME,
        kind: ViewKindEnum.PLAN_2D_V2,
        order: defaultOrderForKind(ViewKindEnum.PLAN_2D_V2)
      })
    ],
    view: isoId
  };
};
