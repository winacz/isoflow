import { generateId } from 'src/utils/common';
import type { ModelItem } from 'src/types';

/**
 * Deep-clone a model item onto a fresh id (+ fresh SVI ids), name untouched.
 * Port ids come from the shape definition, so they stay valid on the clone —
 * only connector `ref.item` needs remapping by the caller.
 */
export const cloneModelItemWithNewId = (source: ModelItem): ModelItem => {
  const cloned: ModelItem = {
    ...(JSON.parse(JSON.stringify(source)) as ModelItem),
    id: generateId()
  };

  if (cloned.svis?.length) {
    cloned.svis = cloned.svis.map((svi) => {
      return { ...svi, id: generateId() };
    });
  }

  return cloned;
};

/**
 * Deep-clone a model item for duplicate-place (new id + fresh SVI ids).
 * Name gets a "(kopia)" suffix when missing one.
 */
export const cloneModelItemForDuplicate = (source: ModelItem): ModelItem => {
  const baseName = source.name?.trim() || 'Node';
  const name = /\(kopia\)\s*$/i.test(baseName)
    ? baseName
    : `${baseName} (kopia)`;

  return {
    ...cloneModelItemWithNewId(source),
    name
  };
};
