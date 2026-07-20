import { InitialData } from 'src/types';
import { DEFAULT_COLOR, SHAPES_2D } from 'src/config';
import {
  generateId,
  ensureDeviceTemplateIcons,
  build2Dv2SnapshotFromPlan,
  PLAN_2D_VIEW_NAME,
  PLAN_2D_V2_VIEW_NAME,
  ISOMETRIC_VIEW_NAME
} from 'src/utils';
import { MIKROTIK_ICONS, ensureMikrotikIcons } from 'src/fixtures/mikrotikIcons';
import { MIKROTIK_V2_ICONS } from 'src/fixtures/mikrotikV2Icons';
import { initialData as isometricDemo } from './initialData';
import { createStartingTopology2d } from './startingTopology2d';

export {
  ISOMETRIC_VIEW_NAME,
  PLAN_2D_VIEW_NAME,
  PLAN_2D_V2_VIEW_NAME
} from 'src/utils';

/**
 * Full editor bootstrap: classic isometric demo + 2D practice topology
 * as separate views (so fit-to-view and editing stay independent).
 */
export const createEditorInitialData = (): InitialData => {
  const plan = createStartingTopology2d();
  const isoView = isometricDemo.views[0];
  const planView = plan.views[0];

  const isometricViewId = isoView?.id ?? generateId();
  const planViewId = planView?.id ?? generateId();
  const plan2Dv2ViewId = generateId();

  const deviceTemplates = plan.deviceTemplates ?? [];

  const isoIcons = isometricDemo.icons ?? [];
  const planIconIds = new Set(SHAPES_2D.map((icon) => icon.id));
  const icons = ensureMikrotikIcons(
    ensureDeviceTemplateIcons(
      [
        ...isoIcons.filter((icon) => {
          return !planIconIds.has(icon.id);
        }),
        ...SHAPES_2D,
        ...MIKROTIK_ICONS,
        ...MIKROTIK_V2_ICONS
      ],
      deviceTemplates
    )
  );

  const isoColors = isometricDemo.colors ?? [];
  const colorIds = new Set(isoColors.map((color) => color.id));
  const colors = [
    ...isoColors,
    ...[DEFAULT_COLOR, ...(plan.colors ?? [])].filter((color) => {
      if (colorIds.has(color.id)) return false;
      colorIds.add(color.id);
      return true;
    })
  ];

  // Prefer an existing iso palette color for plan connectors so refs stay valid
  // even if DEFAULT_COLOR is stripped by consumers later.
  const planConnectorColor = isoColors[0]?.id ?? DEFAULT_COLOR.id;
  const planConnectors = (planView?.connectors ?? []).map((connector) => {
    return {
      ...connector,
      color: planConnectorColor
    };
  });

  const planItems = planView?.items ?? [];
  const planAsView = {
    id: planViewId,
    name: PLAN_2D_VIEW_NAME,
    items: planItems,
    connectors: planConnectors,
    rectangles: planView?.rectangles ?? [],
    textBoxes: []
  };
  const v2Snapshot = build2Dv2SnapshotFromPlan({
    plan: planAsView,
    modelItems: plan.items ?? []
  });

  return {
    title: plan.title ?? isometricDemo.title ?? 'Isoflow',
    version: isometricDemo.version ?? '1.0',
    fitToView: true,
    projectionMode: 'TWO_D',
    icons,
    colors,
    items: [...(isometricDemo.items ?? []), ...(plan.items ?? [])],
    deviceTemplates,
    views: [
      planAsView,
      {
        id: plan2Dv2ViewId,
        name: PLAN_2D_V2_VIEW_NAME,
        items: v2Snapshot.items,
        connectors: [],
        rectangles: v2Snapshot.rectangles,
        textBoxes: []
      },
      {
        id: isometricViewId,
        name: ISOMETRIC_VIEW_NAME,
        items: isoView?.items ?? [],
        connectors: isoView?.connectors ?? [],
        rectangles: isoView?.rectangles ?? [],
        textBoxes: isoView?.textBoxes ?? []
      }
    ],
    view: planViewId
  };
};
