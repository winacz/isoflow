import React, { useCallback, useMemo } from 'react';
import {
  Box,
  Link,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography
} from '@mui/material';
import { useModelStore } from 'src/stores/modelStore';
import { useScene } from 'src/hooks/useScene';
import {
  collectPoePlanWarnings,
  focusShape2dPortOnCanvas,
  isPlan2dCanvas,
  type PoePlanWarning
} from 'src/utils';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { IconButton } from 'src/components/IconButton/IconButton';
import { ControlsContainer } from 'src/components/ItemControls/components/ControlsContainer';
import { Section } from 'src/components/ItemControls/components/Section';

export const PoeWarningTriangleIcon = ({ size = 18 }: { size?: number }) => {
  return (
    <Box
      component="svg"
      viewBox="0 0 16 14"
      sx={{ width: size, height: size, display: 'block', flexShrink: 0 }}
    >
      <path
        d="M8 1.2L14.8 13H1.2L8 1.2z"
        fill="#facc15"
        stroke="#ca8a04"
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
      <path
        d="M8 5v4.2"
        stroke="#78350f"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
      <circle cx={8} cy={11} r={0.7} fill="#78350f" />
    </Box>
  );
};

export const usePoePlanWarnings = () => {
  const projectionMode = useUiStateStore((state) => state.projectionMode);
  const modelItems = useModelStore((state) => state.items);
  const { connectors, items } = useScene();

  const planItemIds = useMemo(() => {
    return new Set(items.map((item) => item.id));
  }, [items]);

  const warnings = useMemo(() => {
    if (!isPlan2dCanvas(projectionMode)) return [];
    return collectPoePlanWarnings({
      modelItems,
      connectors,
      planItemIds
    });
  }, [projectionMode, modelItems, connectors, planItemIds]);

  return {
    enabled: isPlan2dCanvas(projectionMode),
    warnings
  };
};

const WarningMessage = ({
  warning,
  onJump
}: {
  warning: PoePlanWarning;
  onJump: (itemId: string, portId?: string) => void;
}) => {
  return (
    <Typography component="span" sx={{ fontSize: 13, lineHeight: 1.4 }}>
      {warning.parts.map((part, index) => {
        if (part.type === 'text') {
          return <React.Fragment key={index}>{part.text}</React.Fragment>;
        }
        return (
          <Link
            key={`${part.itemId}-${part.portId ?? ''}-${index}`}
            component="button"
            type="button"
            underline="hover"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onJump(part.itemId, part.portId);
            }}
            sx={{
              fontSize: 'inherit',
              fontWeight: 700,
              verticalAlign: 'baseline',
              cursor: 'pointer'
            }}
          >
            {part.label}
          </Link>
        );
      })}
    </Typography>
  );
};

/** Right-sidebar panel: list of PoE warnings on the active plan. */
export const PoeWarningsPanel = () => {
  const { warnings } = usePoePlanWarnings();
  const modelItems = useModelStore((state) => state.items);
  const { items: viewItems } = useScene();
  const uiStateActions = useUiStateStore((state) => state.actions);
  const rendererEl = useUiStateStore((state) => state.rendererEl);

  const jumpToItem = useCallback(
    (itemId: string, portId?: string) => {
      const size = rendererEl?.getBoundingClientRect();
      focusShape2dPortOnCanvas({
        itemId,
        portId: portId ?? '',
        viewItems,
        modelItems,
        rendererSize: {
          width: size?.width || 800,
          height: size?.height || 600
        },
        setZoom: uiStateActions.setZoom,
        setScroll: uiStateActions.setScroll,
        setItemControls: uiStateActions.setItemControls,
        setSelectedItemIds: uiStateActions.setSelectedItemIds,
        setFocusedPortId: uiStateActions.setFocusedPortId,
        setPortAttention: uiStateActions.setPortAttention,
        clearSelectedWaypointIds: () => {
          uiStateActions.setSelectedWaypointIds([]);
        }
      });
    },
    [rendererEl, viewItems, modelItems, uiStateActions]
  );

  return (
    <ControlsContainer
      header={
        <Section sx={{ py: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            <PoeWarningTriangleIcon size={20} />
            <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
              Ostrzeżenia PoE
            </Typography>
            {warnings.length > 0 ? (
              <Typography
                sx={{ fontSize: 12.5, fontWeight: 650, color: 'text.secondary' }}
              >
                ({warnings.length})
              </Typography>
            ) : null}
          </Box>
        </Section>
      }
    >
      <Section>
        {warnings.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            Brak ostrzeżeń PoE na tym planie.
          </Typography>
        ) : (
          <List dense disablePadding>
            {warnings.map((warning, index) => (
              <ListItem
                key={warning.id}
                alignItems="flex-start"
                sx={{
                  px: 0,
                  py: 0.85,
                  borderBottom:
                    index < warnings.length - 1 ? '1px solid' : 'none',
                  borderColor: 'divider'
                }}
              >
                <ListItemIcon sx={{ minWidth: 32, mt: 0.35 }}>
                  <PoeWarningTriangleIcon size={16} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <WarningMessage warning={warning} onJump={jumpToItem} />
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Section>
    </ControlsContainer>
  );
};

/**
 * Toolbar control: triangle + count opens PoE warnings in the right sidebar.
 */
export const PoeWarningsToolButton = () => {
  const { enabled, warnings } = usePoePlanWarnings();
  const itemControls = useUiStateStore((state) => state.itemControls);
  const uiStateActions = useUiStateStore((state) => state.actions);
  const isActive = itemControls?.type === 'POE_WARNINGS';

  const openPanel = useCallback(() => {
    uiStateActions.setRightSidebarOpen(true);
    if (isActive) {
      uiStateActions.setItemControls(null);
      return;
    }
    uiStateActions.setItemControls({ type: 'POE_WARNINGS' });
    uiStateActions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }, [isActive, uiStateActions]);

  if (!enabled) return null;

  const count = warnings.length;

  return (
    <IconButton
      name={
        count > 0
          ? `Ostrzeżenia PoE (${count})`
          : 'Ostrzeżenia PoE — brak na planie'
      }
      onClick={openPanel}
      isActive={isActive}
      autoWidth={count > 0}
      Icon={
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.4
          }}
        >
          <PoeWarningTriangleIcon size={18} />
          {count > 0 ? (
            <Box
              component="span"
              sx={{
                fontSize: 11,
                fontWeight: 800,
                lineHeight: 1,
                color: 'warning.dark',
                letterSpacing: -0.2
              }}
            >
              {count}
            </Box>
          ) : null}
        </Box>
      }
    />
  );
};

/** @deprecated Prefer PoeWarningsToolButton / PoeWarningsPanel. */
export const PoeWarningsSidebarControl = PoeWarningsToolButton;
