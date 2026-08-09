import { InitialData } from 'src/types';
import { DEFAULT_COLOR, SHAPES_2D } from 'src/config';
import {
  generateId,
  ensureDeviceTemplateIcons,
  ISOMETRIC_VIEW_NAME,
  ViewKindEnum,
  defaultOrderForKind
} from 'src/utils';
import { initialData as isometricDemo } from './initialData';
import { createKarczmaPlansBundle, KARCZMA_VLANS } from './karczmaPlans2d';

export {
  ISOMETRIC_VIEW_NAME,
  PLAN_2D_VIEW_NAME
} from 'src/utils';

/** IPAM → Vlany catalog matching Karczma plan VLAN IDs / names. */
export const karczmaVlanNames = Object.fromEntries(
  Object.values(KARCZMA_VLANS).map((vlan) => [vlan.id, vlan.name])
) as Record<string, string>;

/**
 * Full editor bootstrap: isometric demo + Karczma 2D practice plans
 * (Schowek / Biuro / Serwerownia) as separate views.
 */
export const createEditorInitialData = (): InitialData => {
  const isoView = isometricDemo.views[0];
  const isometricViewId = isoView?.id ?? generateId();

  const isoColors = isometricDemo.colors ?? [];
  const planConnectorColor = isoColors[0]?.id ?? DEFAULT_COLOR.id;
  const plans = createKarczmaPlansBundle(planConnectorColor);

  const deviceTemplates = plans.deviceTemplates;
  const isoIcons = isometricDemo.icons ?? [];
  const planIconIds = new Set(SHAPES_2D.map((icon) => icon.id));
  const icons = ensureDeviceTemplateIcons(
    [
      ...isoIcons.filter((icon) => !planIconIds.has(icon.id)),
      ...(plans.icons ?? SHAPES_2D)
    ],
    deviceTemplates
  );

  const colorIds = new Set(isoColors.map((color) => color.id));
  const colors = [
    ...isoColors,
    ...[DEFAULT_COLOR, ...(plans.colors ?? [])].filter((color) => {
      if (colorIds.has(color.id)) return false;
      colorIds.add(color.id);
      return true;
    })
  ];

  return {
    title: 'Karczma',
    version: isometricDemo.version ?? '1.0',
    fitToView: true,
    projectionMode: 'ISOMETRIC',
    icons,
    colors,
    items: [...(isometricDemo.items ?? []), ...plans.items],
    deviceTemplates,
    vlanNames: { ...karczmaVlanNames },
    views: [
      ...plans.views,
      {
        id: isometricViewId,
        name: ISOMETRIC_VIEW_NAME,
        kind: ViewKindEnum.ISOMETRIC,
        order: defaultOrderForKind(ViewKindEnum.ISOMETRIC),
        items: isoView?.items ?? [],
        connectors: isoView?.connectors ?? [],
        rectangles: isoView?.rectangles ?? [],
        textBoxes: isoView?.textBoxes ?? []
      }
    ],
    view: isometricViewId
  };
};
