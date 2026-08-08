import React, { useCallback, useMemo, useState } from 'react';
import { Button, Stack, Typography } from '@mui/material';
import {
  BubbleChartOutlined,
  AccountTreeOutlined,
  TimelineOutlined,
  DashboardCustomizeOutlined,
  ShowChartOutlined,
  HubOutlined
} from '@mui/icons-material';
import { UiElement } from 'src/components/UiElement/UiElement';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { computeDensityGroups } from 'src/v3/densityGroups';
import { useDensityGroupsDebugStore } from 'src/v3/densityGroupsStore';
import type { DensityBusExitStyle } from 'src/v3/densityGroupBuses';
import { yieldToMain } from 'src/utils/scheduleHeavyWork';

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
  const { items, runDensityGroupBuses, runArrangeDensityGroups } = useScene();
  const modelItems = useModelStore((state) => {
    return state.items;
  });

  const [busBusy, setBusBusy] = useState(false);
  const [busSummary, setBusSummary] = useState<string | null>(null);

  const groupCount = useMemo(() => {
    return computeDensityGroups({ items, modelItems }).length;
  }, [items, modelItems]);

  const runBus = useCallback(
    (exitStyle: DensityBusExitStyle, label: string) => {
      setBusBusy(true);
      setVisible(true);
      void (async () => {
        await yieldToMain();
        try {
          const result = runDensityGroupBuses({ exitStyle });
          setBusSummary(
            result.cableCount === 0
              ? exitStyle === 'simple'
                ? 'Brak kabli do prostego układu'
                : 'Brak kabli do magistrali'
              : `${label}: ${result.cableCount} kabli · ${result.groupCount} grup` +
                  (result.swappedNodes
                    ? ` · zamieniono ${result.swappedNodes}`
                    : '')
          );
        } finally {
          setBusBusy(false);
        }
      })();
    },
    [runDensityGroupBuses, setVisible]
  );

  const runArrange = useCallback(() => {
    setBusBusy(true);
    setVisible(true);
    void (async () => {
      await yieldToMain();
      try {
        const result = runArrangeDensityGroups();
        setBusSummary(
          result.groupCount === 0
            ? 'Brak grup do ułożenia'
            : `Ułożono ${result.groupCount} ${
                result.groupCount === 1
                  ? 'grupę'
                  : result.groupCount < 5
                    ? 'grupy'
                    : 'grup'
              }` +
                (result.movedNodes
                  ? ` · przesunięto ${result.movedNodes}`
                  : '')
        );
      } finally {
        setBusBusy(false);
      }
    })();
  }, [runArrangeDensityGroups, setVisible]);

  const runArrangeMagistrala = useCallback(() => {
    setBusBusy(true);
    setVisible(true);
    void (async () => {
      await yieldToMain();
      try {
        const result = runArrangeDensityGroups({ mode: 'magistrala' });
        setBusSummary(
          result.groupCount === 0
            ? 'Brak grup do ułożenia'
            : `Magistrale: ułożono ${result.groupCount} ${
                result.groupCount === 1
                  ? 'grupę'
                  : result.groupCount < 5
                    ? 'grupy'
                    : 'grup'
              }` +
                (result.movedNodes
                  ? ` · przesunięto ${result.movedNodes}`
                  : '')
        );
      } finally {
        setBusBusy(false);
      }
    })();
  }, [runArrangeDensityGroups, setVisible]);

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
          startIcon={<DashboardCustomizeOutlined />}
          disabled={busBusy || groupCount === 0}
          onClick={runArrange}
          title="Hub-and-spoke: okręgi layoutu (pad jak w algorytmie), kąty left→top→right; rezerwuje pas magistrali przy grupie i nie stawia innych grup na tej drodze."
          sx={{
            justifyContent: 'flex-start',
            textTransform: 'none',
            fontSize: 12,
            py: 0.4
          }}
        >
          Ułóż grupy
        </Button>
        <Button
          size="small"
          variant="contained"
          color="secondary"
          startIcon={<HubOutlined />}
          disabled={busBusy || groupCount === 0}
          onClick={runArrangeMagistrala}
          title="Jak Ułóż grupy, ale z większymi odstępami: najpierw największe grupy, grube korytarze magistrali, minimalizacja przecięć spoków."
          sx={{
            justifyContent: 'flex-start',
            textTransform: 'none',
            fontSize: 12,
            py: 0.4
          }}
        >
          Ułóż grupy (magistrale)
        </Button>
        <Button
          size="small"
          variant="contained"
          color="secondary"
          startIcon={<ShowChartOutlined />}
          disabled={busBusy || groupCount === 0}
          onClick={() => {
            return runBus('simple', 'Prosty');
          }}
          title="Proste linie port↔port (bez magistrali). W grupie przestawia nody wg kolejności portów, żeby było mniej przecięć."
          sx={{
            justifyContent: 'flex-start',
            textTransform: 'none',
            fontSize: 12,
            py: 0.4
          }}
        >
          Prosty z grup
        </Button>
        <Button
          size="small"
          variant="contained"
          color="secondary"
          startIcon={<AccountTreeOutlined />}
          disabled={busBusy || groupCount === 0}
          onClick={() => {
            return runBus('orthogonal', 'Magistrala');
          }}
          title="Ortogonalna magistrala; nakładania X/Y → przesunięcie z krótką przekątną z portu celu."
          sx={{
            justifyContent: 'flex-start',
            textTransform: 'none',
            fontSize: 12,
            py: 0.4
          }}
        >
          Magistrala z grup
        </Button>
        <Button
          size="small"
          variant="contained"
          color="secondary"
          startIcon={<TimelineOutlined />}
          disabled={busBusy || groupCount === 0}
          onClick={() => {
            return runBus('oneBend', 'Diagonalny');
          }}
          title="Pozioma magistrala z grupy, krótki offset, potem przekątna do portów."
          sx={{
            justifyContent: 'flex-start',
            textTransform: 'none',
            fontSize: 12,
            py: 0.4
          }}
        >
          Diagonalny z grup
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
