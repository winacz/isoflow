import React, { useCallback, useMemo, useState } from 'react';
import { Button, Stack, Typography } from '@mui/material';
import {
  BubbleChartOutlined,
  AccountTreeOutlined
} from '@mui/icons-material';
import { UiElement } from 'src/components/UiElement/UiElement';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { computeDensityGroups } from 'src/v3/densityGroups';
import { useDensityGroupsDebugStore } from 'src/v3/densityGroupsStore';

/**
 * Test panel for 2D v3 density grouping — rings + magistrala routing.
 */
export const V3DensityGroupsPanel = () => {
  const visible = useDensityGroupsDebugStore((state) => {
    return state.visible;
  });
  const toggle = useDensityGroupsDebugStore((state) => {
    return state.toggle;
  });
  const setVisible = useDensityGroupsDebugStore((state) => {
    return state.setVisible;
  });
  const { items, runDensityGroupBuses } = useScene();
  const modelItems = useModelStore((state) => {
    return state.items;
  });

  const [busBusy, setBusBusy] = useState(false);
  const [busSummary, setBusSummary] = useState<string | null>(null);

  const groupCount = useMemo(() => {
    return computeDensityGroups({ items, modelItems }).length;
  }, [items, modelItems]);

  const onBus = useCallback(() => {
    setBusBusy(true);
    setVisible(true);
    setTimeout(() => {
      try {
        const result = runDensityGroupBuses();
        setBusSummary(
          result.cableCount === 0
            ? 'Brak kabli do magistrali'
            : `Magistrala: ${result.cableCount} kabli · ${result.groupCount} grup` +
                (result.swappedNodes
                  ? ` · zamieniono ${result.swappedNodes}`
                  : '')
        );
      } finally {
        setBusBusy(false);
      }
    }, 0);
  }, [runDensityGroupBuses, setVisible]);

  return (
    <UiElement sx={{ px: 1.25, py: 1, width: 240 }}>
      <Typography
        sx={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.6,
          color: 'text.secondary',
          textTransform: 'uppercase',
          mb: 0.75
        }}
      >
        Gęstość (test)
      </Typography>
      <Stack spacing={0.75}>
        <Button
          size="small"
          variant={visible ? 'contained' : 'outlined'}
          color="secondary"
          startIcon={<BubbleChartOutlined />}
          onClick={toggle}
          sx={{
            justifyContent: 'flex-start',
            textTransform: 'none',
            fontSize: 12,
            py: 0.4
          }}
        >
          {visible ? 'Ukryj grupy' : 'Pokaż grupy'}
        </Button>
        <Button
          size="small"
          variant="contained"
          color="secondary"
          startIcon={<AccountTreeOutlined />}
          disabled={busBusy || groupCount === 0}
          onClick={onBus}
          title="Dla każdej grupy gęstości prowadzi kable wspólną magistralą (BUS)."
          sx={{
            justifyContent: 'flex-start',
            textTransform: 'none',
            fontSize: 12,
            py: 0.4
          }}
        >
          Magistrala z grup
        </Button>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
          {groupCount}{' '}
          {groupCount === 1 ? 'grupa' : groupCount < 5 ? 'grupy' : 'grup'} · gap
          ≤ 1 kratka
        </Typography>
        {busSummary && (
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
            {busSummary}
          </Typography>
        )}
      </Stack>
    </UiElement>
  );
};
