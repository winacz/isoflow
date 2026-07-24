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

/**
 * Fork a template for a single placed node — new template id, but keep
 * section / port / instance ids so existing cables stay attached.
 */
export const forkDeviceTemplateForNode = (
  template: DeviceTemplate
): DeviceTemplate => {
  return {
    ...template,
    id: generateId()
  };
};

/** Deep-clone a template with fresh ids (for „Kopiuj szablon”). */
export const cloneDeviceTemplate = (
  template: DeviceTemplate,
  nameSuffix = ' (kopia)'
): DeviceTemplate => {
  const sections = template.sections.map((section) => {
    return {
      ...section,
      id: generateId()
    };
  });

  const virtualInstances = template.virtualInstances?.map((inst) => {
    return {
      ...inst,
      id: generateId(),
      interfaces: inst.interfaces.map((iface) => {
        return {
          ...iface,
          id: generateId()
          // targetPortId kept — layout regenerates section-pN ids identically
          // only when section ids stay the same; after clone section ids change,
          // so clear bridge targets to avoid dangling refs.
        };
      })
    };
  });

  // Remap bridge targets: old `${oldSectionId}-pN` → new `${newSectionId}-pN`
  const oldToNewSection = new Map(
    template.sections.map((section, i) => [section.id, sections[i].id])
  );
  const remappedInstances = virtualInstances?.map((inst) => {
    return {
      ...inst,
      interfaces: inst.interfaces.map((iface) => {
        if (!iface.targetPortId) return iface;
        for (const [oldId, newId] of oldToNewSection) {
          const prefix = `${oldId}-p`;
          if (iface.targetPortId.startsWith(prefix)) {
            return {
              ...iface,
              targetPortId: `${newId}-p${iface.targetPortId.slice(prefix.length)}`
            };
          }
        }
        // Mgmt port — keep only if same id regenerated below
        return { ...iface, targetPortId: undefined };
      })
    };
  });

  return {
    ...template,
    id: generateId(),
    name: `${template.name}${nameSuffix}`,
    sections,
    virtualInstances: remappedInstances,
    managementPort: template.managementPort
      ? {
          ...template.managementPort,
          id: generateId()
        }
      : undefined
  };
};

/** Remove a template from the persistent library. */
export const deleteSavedDeviceTemplate = (templateId: string) => {
  const next = loadSavedDeviceTemplates().filter((item) => {
    return item.id !== templateId;
  });
  saveDeviceTemplatesLibrary(next);
  return next;
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
