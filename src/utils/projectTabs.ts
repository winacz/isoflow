import type { InitialData, View, ProjectionMode } from 'src/types';
import { DEFAULT_COLOR, SHAPES_2D } from 'src/config';
import { generateId } from './common';
import { clonePlanViewContent } from './clonePlanView';
import { ensureDeviceTemplateIcons } from './deviceTemplateStorage';
import {
  ISOMETRIC_VIEW_NAME,
  PLAN_2D_VIEW_NAME,
  PLAN_2D_V3_VIEW_NAME
} from './plan2dv2';

/** Modular tab role — drives UI + projection without hardcoding view names. */
export const ViewKindEnum = {
  ISOMETRIC: 'ISOMETRIC',
  PLAN_2D: 'PLAN_2D',
  PLAN_2D_V3: 'PLAN_2D_V3'
} as const;

export type ViewKind = keyof typeof ViewKindEnum;

export type ProjectTab = {
  viewId: string;
  kind: ViewKind;
  label: string;
  order: number;
};

/** Truncate for tab strip / IPAM labels (keeps quotes readable). */
export const truncateProjectLabel = (text: string, max = 20): string => {
  const trimmed = text.trim() || 'Untitled';
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
};

export const inferViewKind = (view: Pick<View, 'name' | 'kind'>): ViewKind => {
  // Legacy PLAN_2D_V2 collapses into the modular PLAN_2D tab kind.
  if (view.kind === 'ISOMETRIC') return ViewKindEnum.ISOMETRIC;
  if (view.kind === 'PLAN_2D_V3') return ViewKindEnum.PLAN_2D_V3;
  if (view.kind === 'PLAN_2D' || view.kind === 'PLAN_2D_V2') {
    return ViewKindEnum.PLAN_2D;
  }
  if (view.name === ISOMETRIC_VIEW_NAME) return ViewKindEnum.ISOMETRIC;
  if (view.name === PLAN_2D_VIEW_NAME) return ViewKindEnum.PLAN_2D;
  if (view.name === PLAN_2D_V3_VIEW_NAME) return ViewKindEnum.PLAN_2D_V3;
  // Extra / custom plan-like views default to 2D.
  return ViewKindEnum.PLAN_2D;
};

export const projectionModeForKind = (kind: ViewKind): ProjectionMode => {
  switch (kind) {
    case ViewKindEnum.ISOMETRIC:
      return 'ISOMETRIC';
    case ViewKindEnum.PLAN_2D_V3:
      return 'TWO_D_V3';
    case ViewKindEnum.PLAN_2D:
    default:
      return 'TWO_D';
  }
};

/** Canonical primary Plan (classic "2D") — kept in model, hidden from the tab strip. */
export const isPrimaryPlan2dView = (
  view: Pick<View, 'name' | 'kind'>
): boolean => {
  return (
    inferViewKind(view) === ViewKindEnum.PLAN_2D &&
    view.name === PLAN_2D_VIEW_NAME
  );
};

export const defaultLabelForKind = (
  kind: ViewKind,
  name: string,
  projectTitle?: string
): string => {
  switch (kind) {
    case ViewKindEnum.ISOMETRIC:
      return 'Isometric';
    case ViewKindEnum.PLAN_2D:
      return name === PLAN_2D_VIEW_NAME ? '2D' : name;
    case ViewKindEnum.PLAN_2D_V3: {
      // Custom diagram name (e.g. "Szafa - Schowek"); fall back to project title.
      if (name && name !== PLAN_2D_V3_VIEW_NAME) {
        return name;
      }
      return truncateProjectLabel(projectTitle?.trim() || 'Untitled');
    }
    default:
      return name;
  }
};

export const defaultOrderForKind = (kind: ViewKind): number => {
  switch (kind) {
    case ViewKindEnum.ISOMETRIC:
      return 0;
    case ViewKindEnum.PLAN_2D_V3:
      // Main plan tab (shown as 2D "project") — before extra 2D tabs.
      return 100;
    case ViewKindEnum.PLAN_2D:
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
 * Ensures Isometric / Plan kinds exist; stamps kind + order when missing.
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

  if (!hasKind(ViewKindEnum.PLAN_2D_V3)) {
    views = [
      ...views,
      emptyView({
        name: PLAN_2D_V3_VIEW_NAME,
        kind: ViewKindEnum.PLAN_2D_V3,
        order: defaultOrderForKind(ViewKindEnum.PLAN_2D_V3)
      })
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

  // Canonical strip order: Isometric → 2D "project" (v3) → extra 2D tabs.
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
    if (kind === ViewKindEnum.PLAN_2D_V3) {
      return {
        ...view,
        order: defaultOrderForKind(ViewKindEnum.PLAN_2D_V3)
      };
    }
    if (kind === ViewKindEnum.PLAN_2D && view.id === primaryPlan?.id) {
      return {
        ...view,
        // Hidden from strip; keep after v3 so extras can sit next to +.
        order: defaultOrderForKind(ViewKindEnum.PLAN_2D)
      };
    }
    if (kind === ViewKindEnum.PLAN_2D) {
      const extraIndex = extraPlans.findIndex((candidate) => {
        return candidate.id === view.id;
      });
      return {
        ...view,
        order:
          defaultOrderForKind(ViewKindEnum.PLAN_2D) +
          1 +
          Math.max(0, extraIndex)
      };
    }
    return view;
  });

  // Seed an empty 2D v3 tab from the 2D plan so it opens on the real project
  // (same devices, same wiring) instead of a blank canvas. Only ever fills a
  // view that has nothing in it — work done in v3 is never overwritten.
  const planV3 = views.find((view) => {
    return inferViewKind(view) === ViewKindEnum.PLAN_2D_V3;
  });
  const sourceItems = model.items;

  if (
    planV3 &&
    planV3.items.length === 0 &&
    primaryPlan &&
    primaryPlan.items.length > 0 &&
    Array.isArray(sourceItems)
  ) {
    const copy = clonePlanViewContent({
      source: primaryPlan,
      modelItems: sourceItems
    });

    views = views.map((view) => {
      if (view.id !== planV3.id) return view;
      return {
        ...view,
        items: copy.items,
        connectors: copy.connectors,
        rectangles: copy.rectangles,
        textBoxes: copy.textBoxes
      };
    });

    return {
      ...model,
      views,
      items: [...sourceItems, ...copy.modelItems]
    };
  }

  return { ...model, views };
};

export const getProjectTabs = (
  views: View[],
  projectTitle?: string
): ProjectTab[] => {
  return [...views]
    .filter((view) => {
      // Classic primary "2D" / Plan — hidden; v3 is the main plan tab.
      return !isPrimaryPlan2dView(view);
    })
    .map((view, index) => {
      const kind = inferViewKind(view);
      return {
        viewId: view.id,
        kind,
        label: defaultLabelForKind(kind, view.name, projectTitle),
        order: view.order ?? defaultOrderForKind(kind) + index
      };
    })
    .sort((a, b) => {
      return a.order - b.order;
    });
};

/** Plan tabs suitable for IPAM (excludes Isometric + hidden primary Plan). */
export const getIpamPlanTabs = (
  views: View[],
  projectTitle?: string
): ProjectTab[] => {
  return getProjectTabs(views, projectTitle).filter((tab) => {
    return (
      tab.kind === ViewKindEnum.PLAN_2D || tab.kind === ViewKindEnum.PLAN_2D_V3
    );
  });
};

/** Primary Plan view (lowest-order PLAN_2D) */
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

/** Blank project with the modular tabs. */
export const createEmptyProject = (
  title = 'Untitled project'
): InitialData => {
  const planId = generateId();
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
        name: PLAN_2D_V3_VIEW_NAME,
        kind: ViewKindEnum.PLAN_2D_V3,
        order: defaultOrderForKind(ViewKindEnum.PLAN_2D_V3)
      })
    ],
    view: isoId
  };
};
