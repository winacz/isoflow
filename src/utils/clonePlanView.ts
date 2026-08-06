import type { ModelItem, View } from 'src/types';
import { generateId } from './common';
import { cloneModelItemWithNewId } from './cloneModelItem';

/**
 * Independent copy of a plan view — same devices in the same spots, same
 * wiring, on brand-new ids. Editing the copy can never reach back into the
 * source plan.
 *
 * Port ids come from the shape definition rather than the model item, so
 * connector anchors only need their `ref.item` remapped; `ref.port` and tile
 * waypoints carry over untouched.
 */
export const clonePlanViewContent = ({
  source,
  modelItems
}: {
  source: View;
  modelItems: ModelItem[];
}): {
  items: View['items'];
  connectors: View['connectors'];
  rectangles: View['rectangles'];
  textBoxes: View['textBoxes'];
  modelItems: ModelItem[];
} => {
  const modelItemById = new Map(
    modelItems.map((item) => {
      return [item.id, item];
    })
  );

  /** old model-item id → cloned id */
  const idMap = new Map<string, string>();
  const clonedModelItems: ModelItem[] = [];

  source.items.forEach((viewItem) => {
    const modelItem = modelItemById.get(viewItem.id);
    if (!modelItem) return;

    const clone = cloneModelItemWithNewId(modelItem);
    idMap.set(viewItem.id, clone.id);
    clonedModelItems.push(clone);
  });

  const items = source.items.flatMap((viewItem) => {
    const nextId = idMap.get(viewItem.id);
    if (!nextId) return [];

    // Rack mounts point at the cabinet's view item — remap or drop the mount.
    const nextParentId = viewItem.parentId
      ? idMap.get(viewItem.parentId)
      : undefined;

    const next = { ...viewItem, id: nextId };

    if (viewItem.parentId && !nextParentId) {
      delete next.parentId;
      delete next.rackUnit;
      return [next];
    }

    if (nextParentId) {
      next.parentId = nextParentId;
    }

    return [next];
  });

  const connectors = (source.connectors ?? []).flatMap((connector) => {
    // A cable whose device did not come across is not a relation any more.
    const lostEndpoint = connector.anchors.some((anchor) => {
      return Boolean(anchor.ref.item) && !idMap.has(anchor.ref.item as string);
    });
    if (lostEndpoint) return [];

    const anchors = connector.anchors.map((anchor) => {
      return {
        ...anchor,
        id: generateId(),
        ref: anchor.ref.item
          ? { ...anchor.ref, item: idMap.get(anchor.ref.item) }
          : { ...anchor.ref }
      };
    });

    return [{ ...connector, id: generateId(), anchors }];
  });

  const rectangles = (source.rectangles ?? []).map((rectangle) => {
    return { ...rectangle, id: generateId() };
  });

  const textBoxes = (source.textBoxes ?? []).map((textBox) => {
    return { ...textBox, id: generateId() };
  });

  return {
    items,
    connectors,
    rectangles,
    textBoxes,
    modelItems: clonedModelItems
  };
};
