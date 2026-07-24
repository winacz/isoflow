import React, { useState } from 'react';
import { Box, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { DeviceCreatorPanel } from 'src/components/ItemControls/DeviceCreator/DeviceCreatorPanel';
import { VirtualServerCreatorPanel } from 'src/components/ItemControls/VirtualServerCreator/VirtualServerCreatorPanel';
import { ServerV2CreatorPanel } from 'src/components/ItemControls/ServerV2Creator/ServerV2CreatorPanel';
import { useModelStore, useModelStoreApi } from 'src/stores/modelStore';

export const WorkshopView = () => {
  const [creatorType, setCreatorType] = useState<
    'SWITCH' | 'SERVER' | 'SERVER_V2' | 'PATCH_PANEL'
  >('SWITCH');
  const [v2PreviewMode, setV2PreviewMode] = useState<'logical' | 'rack'>(
    'logical'
  );
  const modelActions = useModelStore((state) => state.actions);
  const modelApi = useModelStoreApi();

  const handleSaveDevice = (template: any) => {
    const { deviceTemplates = [] } = modelApi.getState();
    const existing = deviceTemplates.findIndex((t) => t.id === template.id);
    if (existing >= 0) {
      const next = [...deviceTemplates];
      next[existing] = template;
      modelActions.set({ deviceTemplates: next });
    } else {
      modelActions.set({ deviceTemplates: [...deviceTemplates, template] });
    }
  };

  const handleSaveVirtualServer = (template: any) => {
    const { deviceTemplates = [] } = modelApi.getState();
    const existing = deviceTemplates.findIndex((t) => t.id === template.id);
    if (existing >= 0) {
      const next = [...deviceTemplates];
      next[existing] = template;
      modelActions.set({ deviceTemplates: next });
    } else {
      modelActions.set({ deviceTemplates: [...deviceTemplates, template] });
    }
  };

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: '#f1f5f9',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{
          position: 'absolute',
          top: 16,
          right: 24,
          zIndex: 100
        }}
      >
        {creatorType === 'SERVER_V2' && (
          <ToggleButtonGroup
            color="primary"
            value={v2PreviewMode}
            exclusive
            onChange={(_, val) => val && setV2PreviewMode(val)}
            size="small"
            sx={{ bgcolor: 'background.paper' }}
          >
            <ToggleButton value="logical">Topologia</ToggleButton>
            <ToggleButton value="rack">Rack</ToggleButton>
          </ToggleButtonGroup>
        )}
        <ToggleButtonGroup
          color="primary"
          value={creatorType}
          exclusive
          onChange={(_, val) => val && setCreatorType(val)}
          size="small"
          sx={{ bgcolor: 'background.paper' }}
        >
          <ToggleButton value="SWITCH">Switch</ToggleButton>
          <ToggleButton value="SERVER">Serwer (Virtual)</ToggleButton>
          <ToggleButton value="SERVER_V2">Serwer V2</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {creatorType === 'SWITCH' && (
        <DeviceCreatorPanel
          isWorkshopMode
          onSave={handleSaveDevice}
          onCancel={() => {}}
        />
      )}

      {creatorType === 'SERVER' && (
        <VirtualServerCreatorPanel
          isWorkshopMode
          onSave={handleSaveVirtualServer}
          onCancel={() => {}}
        />
      )}

      {creatorType === 'SERVER_V2' && (
        <ServerV2CreatorPanel
          isWorkshopMode
          previewMode={v2PreviewMode}
          onSave={handleSaveVirtualServer}
          onCancel={() => {}}
        />
      )}
    </Box>
  );
};
