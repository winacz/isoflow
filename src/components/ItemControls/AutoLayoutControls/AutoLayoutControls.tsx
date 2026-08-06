import React, { useCallback, useState } from 'react';
import {
  Box,
  Button,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import {
  AutoModeOutlined,
  CableOutlined,
  SwapHorizOutlined,
  TurnSharpRightOutlined,
  ShowChartOutlined,
  MergeTypeOutlined,
  StraightOutlined
} from '@mui/icons-material';
import { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import type {
  AutoLayoutMetrics,
  PlacementMode,
  RouteStyle
} from 'src/utils/autoLayout';

const STYLE_OPTIONS: {
  value: RouteStyle;
  label: string;
  hint: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'ORTHOGONAL',
    label: 'Orto',
    hint: 'Ortogonalny — kable tylko poziomo/pionowo, korytarzami między urządzeniami.',
    icon: <TurnSharpRightOutlined />
  },
  {
    value: 'DIAGONAL',
    label: 'Skos',
    hint: 'Diagonalny — dopuszcza odcinki pod 45°, krótsze trasy i mniej zagięć.',
    icon: <ShowChartOutlined />
  },
  {
    value: 'BUS',
    label: 'Wiązka',
    hint: 'Magistrala — kable zbierają się we wspólny pas i rozchodzą przy urządzeniach.',
    icon: <MergeTypeOutlined />
  },
  {
    value: 'STRAIGHT',
    label: 'Prosty',
    hint: 'Prosty — linia port↔port, bez omijania. Szybki podgląd topologii.',
    icon: <StraightOutlined />
  }
];

const actionBtnSx = {
  justifyContent: 'flex-start',
  textTransform: 'none',
  fontSize: 12,
  py: 0.35,
  px: 1,
  minHeight: 28,
  lineHeight: 1.2,
  '& .MuiButton-startIcon': {
    marginRight: 0.75,
    '& > *:nth-of-type(1)': { fontSize: 16 }
  }
} as const;

const Delta = ({
  label,
  before,
  after
}: {
  label: string;
  before: number;
  after: number;
}) => {
  const improved = after < before;
  const worse = after > before;

  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
      <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
        {before} →
      </Typography>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          // eslint-disable-next-line no-nested-ternary
          color: improved
            ? 'success.main'
            : worse
            ? 'warning.main'
            : 'text.secondary'
        }}
      >
        {after}
      </Typography>
    </Box>
  );
};

export const AutoLayoutControls = () => {
  const selectedItemIds = useUiStateStore((state) => {
    return state.selectedItemIds;
  });
  const routingStyle = useUiStateStore((state) => {
    return state.routingStyle;
  });
  const setRoutingStyle = useUiStateStore((state) => {
    return state.actions.setRoutingStyle;
  });
  const { runAutoLayoutForItems, runAutoRouteForItems } = useScene();

  const [metrics, setMetrics] = useState<AutoLayoutMetrics | null>(null);
  const [busy, setBusy] = useState(false);

  const style = routingStyle as RouteStyle;
  const count = selectedItemIds.length;
  const scopeLabel = count === 0 ? 'cały widok' : `${count} zaznaczonych`;

  const run = useCallback(
    (placement: PlacementMode) => {
      setBusy(true);
      // Yield a task so the button paints its disabled state before the
      // (synchronous) solver blocks the main thread on large plans.
      // setTimeout, not requestAnimationFrame: rAF is throttled — and may not
      // fire at all — when the tab is not actively painting.
      setTimeout(() => {
        try {
          const result =
            placement === 'none'
              ? runAutoRouteForItems(selectedItemIds, { style })
              : runAutoLayoutForItems(selectedItemIds, { style, placement });
          setMetrics(result);
        } finally {
          setBusy(false);
        }
      }, 0);
    },
    [runAutoLayoutForItems, runAutoRouteForItems, selectedItemIds, style]
  );

  return (
    <Box
      sx={{
        px: 1.25,
        pt: 1,
        pb: 1.25,
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}
    >
      <Typography
        sx={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.6,
          color: 'text.secondary',
          textTransform: 'uppercase',
          mb: 0.5
        }}
      >
        Auto-Układ
      </Typography>
      <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>
        Zasięg: {scopeLabel}
      </Typography>

      <ToggleButtonGroup
        size="small"
        exclusive
        fullWidth
        value={style}
        onChange={(_event, next) => {
          if (next) setRoutingStyle(next as RouteStyle);
        }}
        sx={{ mb: 1 }}
      >
        {/*
          ToggleButton must stay a DIRECT child: ToggleButtonGroup clones its
          children to inject `selected`/`onChange`, and wrapping each one in a
          <Tooltip> made the group clone the tooltip instead — the buttons then
          never toggled. Hence the native `title` rather than a MUI Tooltip.
        */}
        {STYLE_OPTIONS.map((option) => {
          return (
            <ToggleButton
              key={option.value}
              value={option.value}
              title={option.hint}
              sx={{
                textTransform: 'none',
                fontSize: 11,
                py: 0.35,
                px: 0.5,
                gap: 0.4,
                '& svg': { fontSize: 14 }
              }}
            >
              {option.icon}
              {option.label}
            </ToggleButton>
          );
        })}
      </ToggleButtonGroup>

      <Stack spacing={0.5}>
        <Button
          size="small"
          variant="contained"
          color="secondary"
          startIcon={<AutoModeOutlined />}
          disabled={busy}
          onClick={() => {
            run('full');
          }}
          sx={actionBtnSx}
        >
          Ułóż wszystko
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="secondary"
          startIcon={<SwapHorizOutlined />}
          disabled={busy}
          onClick={() => {
            run('swap');
          }}
          title="Urządzenia tylko zamieniają się miejscami — żadne nie zmienia położenia, więc plan zachowuje swój kształt. Potem kable są układane wybranym stylem."
          sx={actionBtnSx}
        >
          Porządkuj w miejscu + kable
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="secondary"
          startIcon={<CableOutlined />}
          disabled={busy}
          onClick={() => {
            run('none');
          }}
          sx={actionBtnSx}
        >
          Tylko kable
        </Button>
      </Stack>

      {metrics && (
        <Box
          sx={{
            mt: 1,
            px: 0.75,
            py: 0.5,
            borderRadius: 1,
            bgcolor: 'action.hover'
          }}
        >
          <Delta
            label="przecięcia"
            before={metrics.crossingsBefore}
            after={metrics.crossingsAfter}
          />
          <Delta
            label="kable na sobie"
            before={metrics.overlapsBefore}
            after={metrics.overlapsAfter}
          />
          <Typography sx={{ fontSize: 10, color: 'text.disabled', mt: 0.25 }}>
            {metrics.cables} kabli · przesunięto {metrics.movedNodes} urządzeń
          </Typography>
          {metrics.unrouted > 0 && (
            <Typography
              sx={{ fontSize: 10, color: 'warning.main', fontWeight: 600 }}
            >
              {metrics.unrouted} kabli bez legalnej trasy (port zablokowany)
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};
