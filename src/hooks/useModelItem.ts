import { useMemo } from 'react';
import { ModelItem } from 'src/types';
import { useModelStore } from 'src/stores/modelStore';
import { getItemByIdOrThrow } from 'src/utils';

export const useModelItem = (id: string): ModelItem => {
  const modelItem = useModelStore((state) => {
    const found = state.items.find((item) => item.id === id);
    if (!found) throw new Error(`Model item ${id} not found`);
    return found;
  });

  return modelItem;
};
