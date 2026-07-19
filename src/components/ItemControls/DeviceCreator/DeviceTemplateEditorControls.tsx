import React, { useCallback } from 'react';
import { Typography } from '@mui/material';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { DeviceCreatorPanel } from 'src/components/ItemControls/DeviceCreator/DeviceCreatorPanel';
import type { DeviceTemplate } from 'src/types';
import {
  deviceTemplateToIcon,
  upsertSavedDeviceTemplate,
  syncDeviceTemplateCache
} from 'src/utils';

interface Props {
  templateId: string;
  returnItemId?: string;
}

export const DeviceTemplateEditorControls = ({
  templateId,
  returnItemId
}: Props) => {
  const deviceTemplates = useModelStore((state) => {
    return state.deviceTemplates ?? [];
  });
  const icons = useModelStore((state) => {
    return state.icons;
  });
  const modelActions = useModelStore((state) => {
    return state.actions;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });

  const template = deviceTemplates.find((item) => {
    return item.id === templateId;
  });

  const goBack = useCallback(() => {
    if (returnItemId) {
      uiStateActions.setItemControls({ type: 'ITEM', id: returnItemId });
      return;
    }
    uiStateActions.setItemControls({ type: 'ADD_ITEM' });
  }, [returnItemId, uiStateActions]);

  const onSave = useCallback(
    (next: DeviceTemplate) => {
      const existingIndex = deviceTemplates.findIndex((item) => {
        return item.id === next.id;
      });

      let nextTemplates: DeviceTemplate[];
      if (existingIndex >= 0) {
        nextTemplates = deviceTemplates.map((item, index) => {
          return index === existingIndex ? next : item;
        });
      } else {
        nextTemplates = [...deviceTemplates, next];
      }

      const icon = deviceTemplateToIcon(next);
      const iconIndex = icons.findIndex((item) => {
        return item.id === next.id;
      });
      const nextIcons =
        iconIndex >= 0
          ? icons.map((item, index) => {
              return index === iconIndex ? { ...item, name: next.name } : item;
            })
          : [...icons, icon];

      upsertSavedDeviceTemplate(next);
      syncDeviceTemplateCache(nextTemplates);
      modelActions.set({
        deviceTemplates: nextTemplates,
        icons: nextIcons
      });

      goBack();
    },
    [deviceTemplates, icons, modelActions, goBack]
  );

  if (!template) {
    return (
      <Typography sx={{ p: 2 }} color="text.secondary" variant="body2">
        Nie znaleziono szablonu.
      </Typography>
    );
  }

  return (
    <DeviceCreatorPanel
      initialTemplate={template}
      mode="edit"
      onCancel={goBack}
      onSave={onSave}
    />
  );
};
