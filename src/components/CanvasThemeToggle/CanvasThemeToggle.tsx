import React from 'react';
import {
  DarkModeOutlined as DarkModeIcon,
  LightModeOutlined as LightModeIcon
} from '@mui/icons-material';
import { UiElement } from 'src/components/UiElement/UiElement';
import { IconButton } from 'src/components/IconButton/IconButton';
import { useUiStateStore } from 'src/stores/uiStateStore';

/** Toggle light / dark canvas for the active projection mode (iso ⟂ 2D). */
export const CanvasThemeToggle = () => {
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const canvasTheme = useUiStateStore((state) => {
    const key = projectionMode === 'TWO_D' ? 'TWO_D' : 'ISOMETRIC';
    return state.canvasByMode[key].theme;
  });
  const toggleCanvasTheme = useUiStateStore((state) => {
    return state.actions.toggleCanvasTheme;
  });
  const isDark = canvasTheme === 'dark';
  const isTwoD = projectionMode === 'TWO_D';

  return (
    <UiElement>
      <IconButton
        name={
          isTwoD
            ? isDark
              ? 'Motyw jasny (Plan)'
              : 'Motyw czarny (Plan)'
            : isDark
              ? 'Motyw jasny (Iso)'
              : 'Motyw czarny (Iso) — tło zostaje białe'
        }
        Icon={isDark ? <LightModeIcon /> : <DarkModeIcon />}
        onClick={() => {
          toggleCanvasTheme();
        }}
        isActive={isDark}
      />
    </UiElement>
  );
};
