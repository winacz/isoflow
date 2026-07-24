import { produce } from 'immer';
import {
  SHAPE_2D_PC_ID,
  SHAPE_2D_CAMERA_ID,
  SHAPE_2D_CAMERA_V2_ID,
  SHAPE_2D_PRINTER_ID,
  SHAPE_2D_VOIP_ID,
  SHAPE_2D_SMARTPHONE_ID,
  SHAPE_2D_IOT_ID,
  SHAPE_2D_AP_ID,
  SHAPE_2D_NAS_ID,
  SHAPE_2D_TABLET_ID
} from 'src/config';
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
    const next = { ...modelItem.value, ...updates };
    if ('portal' in updates && updates.portal === undefined) {
      delete next.portal;
    }
    draft.model.items[modelItem.index] = next;
  });

  return newState;
};

export const createModelItem = (
  item: ModelItem,
  state: State
): State => {
  return produce(state, (draft) => {
    draft.model.items.push(item);
  });
};

export const deleteModelItem = (id: string, state: State): State => {
  const modelItem = getItemByIdOrThrow(state.model.items, id);
  return produce(state, (draft) => {
    draft.model.items.splice(modelItem.index, 1);
  });
};

/** Apply a manual VLAN color to every non-PC port/SVI with the same VLAN. */
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
      if (
        item.icon === SHAPE_2D_PC_ID ||
        item.icon === SHAPE_2D_CAMERA_ID ||
        item.icon === SHAPE_2D_CAMERA_V2_ID ||
        item.icon === SHAPE_2D_PRINTER_ID ||
        item.icon === SHAPE_2D_VOIP_ID ||
        item.icon === SHAPE_2D_SMARTPHONE_ID ||
        item.icon === SHAPE_2D_IOT_ID ||
        item.icon === SHAPE_2D_AP_ID ||
        item.icon === SHAPE_2D_NAS_ID ||
        item.icon === SHAPE_2D_TABLET_ID
      ) {
        return;
      }

      let changed = false;
      let nextItem = item;

      if (item.ports) {
        const nextPorts = { ...item.ports };
        Object.entries(item.ports).forEach(([portId, config]) => {
          if (!vlansMatch(config.vlan, vlan)) return;
          if (config.vlanColor === color) return;
          nextPorts[portId] = { ...config, vlanColor: color };
          changed = true;
        });
        if (changed) {
          nextItem = { ...nextItem, ports: nextPorts };
        }
      }

      if (item.svis?.length) {
        let sviChanged = false;
        const nextSvis = item.svis.map((svi) => {
          if (!vlansMatch(svi.vlan, vlan) || svi.vlanColor === color) {
            return svi;
          }
          sviChanged = true;
          return { ...svi, vlanColor: color };
        });
        if (sviChanged) {
          nextItem = { ...nextItem, svis: nextSvis };
          changed = true;
        }
      }

      if (changed) {
        draft.model.items[index] = nextItem;
      }
    });
  });
};
