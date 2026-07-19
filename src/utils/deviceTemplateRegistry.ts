import type { DeviceTemplate, Size } from 'src/types';
import type { Shape2dPort } from 'src/config';
import {
  layoutDeviceTemplate,
  type DeviceTemplateLayout
} from './deviceTemplateLayout';

const cache = new Map<string, DeviceTemplateLayout>();

/** Rebuild layout cache whenever model.deviceTemplates changes. */
export const syncDeviceTemplateCache = (
  templates: DeviceTemplate[] | undefined | null
) => {
  cache.clear();
  (templates ?? []).forEach((template) => {
    cache.set(template.id, layoutDeviceTemplate(template));
  });
};

export const getDeviceTemplateLayout = (
  id: string | undefined | null
): DeviceTemplateLayout | null => {
  if (!id) return null;
  return cache.get(id) ?? null;
};

export const getDeviceTemplateSize = (
  id: string | undefined | null
): Size | null => {
  return getDeviceTemplateLayout(id)?.size ?? null;
};

export const getDeviceTemplatePorts = (
  id: string | undefined | null
): Shape2dPort[] | null => {
  return getDeviceTemplateLayout(id)?.ports ?? null;
};

export const isDeviceTemplateId = (id: string | undefined | null): boolean => {
  return Boolean(id && cache.has(id));
};
