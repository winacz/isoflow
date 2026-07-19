import { produce } from 'immer';
import { SHAPE_2D_PC_ID } from 'src/config';
import { ModelItem } from 'src/types';
import { getItemByIdOrThrow, isVlan1, vlansMatch } from 'src/utils';
import { State } from './types';

export const updateModelItem = (
  id: string,
  updates: Partial<ModelItem>,
  state: State
): State => {
  const modelItem = getItemByIdOrThrow(state.model.items, id);

  const newState = produce(state, (draft) => {
    draft.model.items[modelItem.index] = { ...modelItem.value, ...updates };
  });

  return newState;
};

export const createModelItem = (
  newModelItem: ModelItem,
  state: State
): State => {
  const newState = produce(state, (draft) => {
    draft.model.items.push(newModelItem);
  });

  return updateModelItem(newModelItem.id, newModelItem, newState);
};

export const deleteModelItem = (id: string, state: State): State => {
  const modelItem = getItemByIdOrThrow(state.model.items, id);

  const newState = produce(state, (draft) => {
    delete draft.model.items[modelItem.index];
  });

  return newState;
};

/** Apply a manual VLAN color to every non-PC port with the same VLAN. */
export const setVlanColorAcrossModel = (
  vlan: string,
  vlanColor: string,
  state: State
): State => {
  if (isVlan1(vlan)) return state;

  const color = vlanColor.trim();
  if (!color) return state;

  return produce(state, (draft) => {
    draft.model.items.forEach((item, index) => {
      if (!item.ports || item.icon === SHAPE_2D_PC_ID) return;

      let changed = false;
      const nextPorts = { ...item.ports };

      Object.entries(item.ports).forEach(([portId, config]) => {
        if (!vlansMatch(config.vlan, vlan)) return;
        if (config.vlanColor === color) return;
        nextPorts[portId] = { ...config, vlanColor: color };
        changed = true;
      });

      if (changed) {
        draft.model.items[index] = { ...item, ports: nextPorts };
      }
    });
  });
};
