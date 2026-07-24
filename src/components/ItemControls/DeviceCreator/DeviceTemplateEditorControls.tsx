import React, { useCallback } from 'react';
import { Typography } from '@mui/material';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { DeviceCreatorPanel } from 'src/components/ItemControls/DeviceCreator/DeviceCreatorPanel';
import { VirtualServerCreatorPanel } from 'src/components/ItemControls/VirtualServerCreator/VirtualServerCreatorPanel';
import type { DeviceTemplate, ModelItem } from 'src/types';
import {
  deviceTemplateToIcon,
  upsertSavedDeviceTemplate,
  deleteSavedDeviceTemplate,
  syncDeviceTemplateCache,
  forkDeviceTemplateForNode
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
  const items = useModelStore((state) => {
    return state.items;
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

  const editingPlacedNode = Boolean(returnItemId);
  const editingServerNode =
    editingPlacedNode && template?.kind === 'SERVER';

  const goBack = useCallback(() => {
    if (returnItemId) {
      uiStateActions.setItemControls({ type: 'ITEM', id: returnItemId });
      return;
    }
    uiStateActions.setItemControls({ type: 'ADD_ITEM' });
  }, [returnItemId, uiStateActions]);

  const applyTemplateToModel = useCallback(
    (
      next: DeviceTemplate,
      options?: {
        /** Replace template id on this model item (node-specific fork). */
        rebindItemId?: string;
        /** Previous template id when forking away from a shared one. */
        previousTemplateId?: string;
      }
    ) => {
      const previousId = options?.previousTemplateId ?? next.id;
      let nextTemplates: DeviceTemplate[];

      if (options?.previousTemplateId && options.previousTemplateId !== next.id) {
        // Fork: keep the shared template, add the node-specific one.
        nextTemplates = [...deviceTemplates, next];
      } else {
        const existingIndex = deviceTemplates.findIndex((item) => {
          return item.id === next.id;
        });
        if (existingIndex >= 0) {
          nextTemplates = deviceTemplates.map((item, index) => {
            return index === existingIndex ? next : item;
          });
        } else if (previousId !== next.id) {
          nextTemplates = deviceTemplates.map((item) => {
            return item.id === previousId ? next : item;
          });
        } else {
          nextTemplates = [...deviceTemplates, next];
        }
      }

      const icon = deviceTemplateToIcon(next);
      let nextIcons = icons;
      const iconIndex = icons.findIndex((item) => item.id === next.id);
      if (iconIndex >= 0) {
        nextIcons = icons.map((item, index) => {
          return index === iconIndex ? { ...item, name: next.name } : item;
        });
      } else {
        nextIcons = [...icons, icon];
      }

      // Rename icon entry for in-place updates of previous id.
      if (previousId === next.id) {
        const prevIconIndex = nextIcons.findIndex((item) => item.id === previousId);
        if (prevIconIndex >= 0) {
          nextIcons = nextIcons.map((item, index) => {
            return index === prevIconIndex ? { ...item, name: next.name } : item;
          });
        }
      }

      let nextItems: ModelItem[] = items;
      if (options?.rebindItemId) {
        nextItems = items.map((item) => {
          if (item.id !== options.rebindItemId) return item;
          return {
            ...item,
            icon: next.id,
            name: next.name
          };
        });
      } else if (returnItemId) {
        nextItems = items.map((item) => {
          if (item.id !== returnItemId) return item;
          return {
            ...item,
            name: next.name
          };
        });
      }

      upsertSavedDeviceTemplate(next);
      syncDeviceTemplateCache(nextTemplates);
      modelActions.set({
        deviceTemplates: nextTemplates,
        icons: nextIcons,
        items: nextItems
      });
    },
    [deviceTemplates, icons, items, modelActions, returnItemId]
  );

  const onSave = useCallback(
    (draft: DeviceTemplate) => {
      // Editing a placed SERVER: bind config to this node only.
      if (editingServerNode && returnItemId) {
        const sharedUsers = items.filter((item) => {
          return item.icon === templateId;
        });
        const exclusive =
          sharedUsers.length <= 1 &&
          sharedUsers.every((item) => item.id === returnItemId);

        if (exclusive) {
          applyTemplateToModel(
            { ...draft, id: templateId },
            { rebindItemId: returnItemId }
          );
        } else {
          const forked = forkDeviceTemplateForNode({
            ...draft,
            id: templateId
          });
          applyTemplateToModel(forked, {
            previousTemplateId: templateId,
            rebindItemId: returnItemId
          });
        }
        goBack();
        return;
      }

      applyTemplateToModel(draft);
      goBack();
    },
    [
      editingServerNode,
      returnItemId,
      items,
      templateId,
      applyTemplateToModel,
      goBack
    ]
  );

  const onDelete = useCallback(() => {
    if (!template || editingPlacedNode) return;

    const usedCount = items.filter((item) => {
      return item.icon === template.id;
    }).length;

    const message =
      usedCount > 0
        ? `Szablon „${template.name}” jest używany na diagramie (${usedCount}). Usunąć mimo to?`
        : `Usunąć szablon „${template.name}”?`;

    if (!window.confirm(message)) return;

    const nextTemplates = deviceTemplates.filter((item) => {
      return item.id !== template.id;
    });
    const nextIcons = icons.filter((item) => {
      return item.id !== template.id;
    });

    deleteSavedDeviceTemplate(template.id);
    syncDeviceTemplateCache(nextTemplates);
    modelActions.set({
      deviceTemplates: nextTemplates,
      icons: nextIcons
    });

    uiStateActions.setItemControls({ type: 'ADD_ITEM' });
  }, [
    template,
    editingPlacedNode,
    items,
    deviceTemplates,
    icons,
    modelActions,
    uiStateActions
  ]);

  if (!template) {
    return (
      <Typography sx={{ p: 2 }} color="text.secondary" variant="body2">
        Nie znaleziono szablonu.
      </Typography>
    );
  }

  if (template.kind === 'SERVER') {
    return (
      <VirtualServerCreatorPanel
        initialTemplate={template}
        mode="edit"
        instanceEdit={editingServerNode}
        onCancel={goBack}
        onSave={onSave}
        onDelete={editingPlacedNode ? undefined : onDelete}
      />
    );
  }

  return (
    <DeviceCreatorPanel
      initialTemplate={template}
      mode="edit"
      onCancel={goBack}
      onSave={onSave}
      onDelete={editingPlacedNode ? undefined : onDelete}
    />
  );
};
