import type { DeviceTemplate, Icon } from 'src/types';
import { deviceTemplatesSchema } from 'src/schemas';
import { generateId } from './common';

const STORAGE_KEY = 'isoflow.deviceTemplates.v1';

export const deviceTemplateToIcon = (template: DeviceTemplate): Icon => {
  return {
    id: template.id,
    name: template.name,
    url: '',
    collection: 'Switches',
    isIsometric: false
  };
};

/** Deep-clone a template with fresh ids (for „Kopiuj szablon”). */
export const cloneDeviceTemplate = (
  template: DeviceTemplate,
  nameSuffix = ' (kopia)'
): DeviceTemplate => {
  return {
    ...template,
    id: generateId(),
    name: `${template.name}${nameSuffix}`,
    sections: template.sections.map((section) => {
      return {
        ...section,
        id: generateId()
      };
    })
  };
};

export const loadSavedDeviceTemplates = (): DeviceTemplate[] => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const result = deviceTemplatesSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
};

export const saveDeviceTemplatesLibrary = (templates: DeviceTemplate[]) => {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Quota / private mode — ignore
  }
};

/** Insert or replace a template in the persistent library. */
export const upsertSavedDeviceTemplate = (template: DeviceTemplate) => {
  const current = loadSavedDeviceTemplates();
  const index = current.findIndex((item) => {
    return item.id === template.id;
  });

  if (index >= 0) {
    current[index] = template;
  } else {
    current.push(template);
  }

  saveDeviceTemplatesLibrary(current);
  return current;
};

/**
 * Merge model templates with the local library.
 * Model wins on id conflict (diagram-specific edits); library fills gaps.
 */
export const mergeDeviceTemplatesWithLibrary = (
  modelTemplates: DeviceTemplate[] | undefined | null
): DeviceTemplate[] => {
  const library = loadSavedDeviceTemplates();
  const byId = new Map<string, DeviceTemplate>();

  library.forEach((template) => {
    byId.set(template.id, template);
  });
  (modelTemplates ?? []).forEach((template) => {
    byId.set(template.id, template);
  });

  return Array.from(byId.values());
};

/** Ensure each template has a matching icon entry. */
export const ensureDeviceTemplateIcons = (
  icons: Icon[],
  templates: DeviceTemplate[]
): Icon[] => {
  const next = [...icons];
  const ids = new Set(next.map((icon) => icon.id));

  templates.forEach((template) => {
    if (ids.has(template.id)) return;
    next.push(deviceTemplateToIcon(template));
    ids.add(template.id);
  });

  return next;
};
