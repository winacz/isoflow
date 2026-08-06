import { useState, useMemo } from 'react';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { Icon } from 'src/types';
import { isShape2dIcon } from 'src/config';
import { isPlan2dCanvas } from 'src/utils';

export const useIconFiltering = () => {
  const [filter, setFilter] = useState<string>('');

  const icons = useModelStore((state) => {
    return state.icons;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });

  const modeIcons = useMemo(() => {
    return icons.filter((icon: Icon) => {
      const isPlan = isShape2dIcon(icon.id);
      return isPlan2dCanvas(projectionMode) ? isPlan : !isPlan;
    });
  }, [icons, projectionMode]);

  const filteredIcons = useMemo(() => {
    if (filter === '') return null;

    const regex = new RegExp(filter, 'gi');

    return modeIcons.filter((icon: Icon) => {
      return regex.test(icon.name);
    });
  }, [modeIcons, filter]);

  return {
    setFilter,
    filter,
    filteredIcons
  };
};
