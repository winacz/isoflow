import { InitialData } from 'src/types';
import { DEFAULT_COLOR, SHAPES_2D } from 'src/config';
import { generateId } from 'src/utils';
import { initialData as isometricDemo } from './initialData';
import { createStartingTopology2d } from './startingTopology2d';

export const ISOMETRIC_VIEW_NAME = 'Isometric';
export const PLAN_2D_VIEW_NAME = 'Plan';

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

  const isoIcons = isometricDemo.icons ?? [];
  const planIconIds = new Set(SHAPES_2D.map((icon) => icon.id));
  const icons = [
    ...isoIcons.filter((icon) => {
      return !planIconIds.has(icon.id);
    }),
    ...SHAPES_2D
  ];

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

  return {
    title: isometricDemo.title ?? 'Isoflow',
    version: isometricDemo.version ?? '1.0',
    fitToView: true,
    projectionMode: 'ISOMETRIC',
    icons,
    colors,
    items: [...(isometricDemo.items ?? []), ...(plan.items ?? [])],
    views: [
      {
        id: isometricViewId,
        name: ISOMETRIC_VIEW_NAME,
        items: isoView?.items ?? [],
        connectors: isoView?.connectors ?? [],
        rectangles: isoView?.rectangles ?? [],
        textBoxes: isoView?.textBoxes ?? []
      },
      {
        id: planViewId,
        name: PLAN_2D_VIEW_NAME,
        items: planView?.items ?? [],
        connectors: planConnectors,
        rectangles: [],
        textBoxes: []
      }
    ],
    view: isometricViewId
  };
};
