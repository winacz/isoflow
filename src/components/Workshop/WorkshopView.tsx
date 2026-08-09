import React, { useState } from 'react';
import { Box, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { DeviceCreatorPanel } from 'src/components/ItemControls/DeviceCreator/DeviceCreatorPanel';
import { ConnectionMatrixCreatorPanel } from 'src/components/ConnectionMatrixTopology/ConnectionMatrixCreatorPanel';
import { IpamPanel } from 'src/components/Workshop/IpamPanel';
import { VIEW_MODE_TABS_BAR_HEIGHT } from 'src/components/ViewModeTabs/ViewModeTabs';
import { useModelStore, useModelStoreApi } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';

type CreatorType = 'SWITCH' | 'MATRIX';

export const WorkshopView = () => {
  const section = useUiStateStore((state) => state.workshopSection);
  const [creatorType, setCreatorType] = useState<CreatorType>('MATRIX');
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
        flexDirection: 'column',
        pt: `${VIEW_MODE_TABS_BAR_HEIGHT}px`,
        boxSizing: 'border-box'
      }}
    >
      {section === 'templates' && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{
            position: 'absolute',
            top: VIEW_MODE_TABS_BAR_HEIGHT + 16,
            right: 24,
            zIndex: 100
          }}
        >
          <ToggleButtonGroup
            color="primary"
            value={creatorType}
            exclusive
            onChange={(_, val) => val && setCreatorType(val)}
            size="small"
            sx={{ bgcolor: 'background.paper' }}
          >
            <ToggleButton value="SWITCH">Switch</ToggleButton>
            <ToggleButton value="MATRIX">Macierz Proxmox</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {section === 'ipam' ? (
          <IpamPanel />
        ) : (
          <>
            {creatorType === 'SWITCH' && (
              <DeviceCreatorPanel
                isWorkshopMode
                onSave={handleSaveDevice}
                onCancel={() => {}}
              />
            )}

            {creatorType === 'MATRIX' && <ConnectionMatrixCreatorPanel />}
          </>
        )}
      </Box>
    </Box>
  );
};
