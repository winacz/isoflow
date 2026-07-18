import { useMemo } from 'react';
import { IconCollectionStateWithIcons } from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { isShape2dIcon } from 'src/config';

export const useIconCategories = () => {
  const icons = useModelStore((state) => {
    return state.icons;
  });
  const iconCategoriesState = useUiStateStore((state) => {
    return state.iconCategoriesState;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });

  const iconCategories = useMemo<IconCollectionStateWithIcons[]>(() => {
    return iconCategoriesState
      .map((collection) => {
        return {
          ...collection,
          icons: icons.filter((icon) => {
            if (icon.collection !== collection.id) return false;
            const isPlan = isShape2dIcon(icon.id);
            return projectionMode === 'TWO_D' ? isPlan : !isPlan;
          })
        };
      })
      .filter((collection) => {
        return collection.icons.length > 0;
      });
  }, [icons, iconCategoriesState, projectionMode]);

  return {
    iconCategories
  };
};
