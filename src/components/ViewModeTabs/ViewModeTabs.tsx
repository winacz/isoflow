import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tooltip
} from '@mui/material';
import { Add as AddIcon, ArrowDropDown as ArrowDropDownIcon } from '@mui/icons-material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore, useModelStoreApi } from 'src/stores/modelStore';
import { useView } from 'src/hooks/useView';
import { useDiagramUtils } from 'src/hooks/useDiagramUtils';
import { UiElement } from 'src/components/UiElement/UiElement';
import {
  ViewKind,
  ViewKindEnum,
  createPlan2dTab,
  getProjectTabs,
  projectionModeForKind
} from 'src/utils';

const WORKSHOP_SECTIONS = [
  { id: 'templates' as const, label: 'Szablony' },
  { id: 'ipam' as const, label: 'IPAM' }
];

const tabButtonSx = {
  borderRadius: 0,
  px: 2,
  py: 1,
  minWidth: 'auto',
  whiteSpace: 'nowrap',
  fontWeight: 600
} as const;

export const ViewModeTabs = () => {
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const isWorkshopOpen = useUiStateStore((state) => {
    return state.isWorkshopOpen;
  });
  const workshopSection = useUiStateStore((state) => {
    return state.workshopSection;
  });
  const activeViewId = useUiStateStore((state) => {
    return state.view;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const modelStore = useModelStoreApi();
  const modelActions = useModelStore((state) => {
    return state.actions;
  });
  const views = useModelStore((state) => {
    return state.views;
  });
  const projectTitle = useModelStore((state) => {
    return state.title;
  });
  const { changeView } = useView();
  const { fitToView } = useDiagramUtils();
  const fitToViewRef = useRef(fitToView);

  useEffect(() => {
    fitToViewRef.current = fitToView;
  }, [fitToView]);

  const [workshopMenuEl, setWorkshopMenuEl] = useState<null | HTMLElement>(
    null
  );
  const [planMenuEl, setPlanMenuEl] = useState<null | HTMLElement>(null);

  const tabs = useMemo(() => {
    return getProjectTabs(views, projectTitle);
  }, [views, projectTitle]);

  const isoTabs = useMemo(() => {
    return tabs.filter((tab) => tab.kind === ViewKindEnum.ISOMETRIC);
  }, [tabs]);

  const planTabs = useMemo(() => {
    return tabs.filter(
      (tab) =>
        tab.kind === ViewKindEnum.PLAN_2D ||
        tab.kind === ViewKindEnum.PLAN_2D_V3
    );
  }, [tabs]);

  const activePlanTab = useMemo(() => {
    return planTabs.find((tab) => tab.viewId === activeViewId) ?? null;
  }, [planTabs, activeViewId]);

  const isPlanActive = Boolean(activePlanTab) && !isWorkshopOpen;

  const workshopLabel = useMemo(() => {
    const section = WORKSHOP_SECTIONS.find((entry) => {
      return entry.id === workshopSection;
    });
    if (!isWorkshopOpen) return 'Warsztat';
    return `Warsztat · ${section?.label ?? 'Szablony'}`;
  }, [isWorkshopOpen, workshopSection]);

  const resetInteraction = useCallback(() => {
    uiStateActions.setItemControls(null);
    uiStateActions.setPortPipHover(null);
    uiStateActions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }, [uiStateActions]);

  const scheduleFitToView = useCallback(() => {
    // Wait for view / projection swap to mount, then use the latest fit fn.
    window.setTimeout(() => {
      void fitToViewRef.current();
    }, 80);
  }, []);

  const onSelectTab = useCallback(
    (viewId: string, kind: ViewKind, opts?: { fit?: boolean }) => {
      const mode = projectionModeForKind(kind);
      const same = mode === projectionMode && viewId === activeViewId;

      if (!same) {
        const targetView = modelStore.getState().views.find((view) => {
          return view.id === viewId;
        });
        if (targetView) {
          changeView(targetView.id, modelStore.getState());
        }
        uiStateActions.setProjectionMode(mode);
        resetInteraction();
      }

      uiStateActions.setWorkshopOpen(false);

      // Entering a 2D project: snap + fit (snap runs inside fitToView).
      if (opts?.fit) {
        scheduleFitToView();
      }
    },
    [
      projectionMode,
      activeViewId,
      uiStateActions,
      modelStore,
      changeView,
      resetInteraction,
      scheduleFitToView
    ]
  );

  const onAddPlan2dTab = useCallback(() => {
    const model = modelStore.getState();
    const label = window.prompt('Nazwa nowego projektu 2D', '2D 2');
    if (label === null) return;

    const tab = createPlan2dTab(model.views, label.trim() || undefined);
    const nextViews = [...model.views, tab];
    modelActions.set({ views: nextViews });
    changeView(tab.id, { ...model, views: nextViews });
    uiStateActions.setWorkshopOpen(false);
    uiStateActions.setProjectionMode('TWO_D');
    resetInteraction();
    setPlanMenuEl(null);
    scheduleFitToView();
  }, [
    modelStore,
    modelActions,
    changeView,
    uiStateActions,
    resetInteraction,
    scheduleFitToView
  ]);

  const openWorkshopSection = useCallback(
    (section: 'templates' | 'ipam') => {
      uiStateActions.setWorkshopSection(section);
      uiStateActions.setWorkshopOpen(true);
      setWorkshopMenuEl(null);
    },
    [uiStateActions]
  );

  return (
    <UiElement>
      <Stack direction="row" alignItems="center">
        {isoTabs.map((tab) => {
          const isActive = activeViewId === tab.viewId && !isWorkshopOpen;

          return (
            <Button
              key={tab.viewId}
              variant="text"
              onClick={() => {
                onSelectTab(tab.viewId, tab.kind);
              }}
              sx={{
                ...tabButtonSx,
                color: isActive ? 'grey.200' : 'grey.500',
                bgcolor: isActive ? 'primary.light' : undefined
              }}
            >
              {tab.label}
            </Button>
          );
        })}

        {planTabs.length > 0 && (
          <>
            <Stack direction="row" alignItems="stretch">
              <Button
                variant="text"
                endIcon={<ArrowDropDownIcon />}
                onClick={(event) => {
                  setPlanMenuEl(event.currentTarget);
                }}
                sx={{
                  ...tabButtonSx,
                  pr: 1,
                  color: isPlanActive ? 'grey.200' : 'grey.500',
                  bgcolor: isPlanActive ? 'primary.light' : undefined
                }}
              >
                2D
              </Button>
              <Box
                aria-hidden
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  px: 0.25,
                  color: 'grey.600',
                  fontWeight: 300,
                  fontSize: 16,
                  userSelect: 'none',
                  lineHeight: 1
                }}
              >
                |
              </Box>
              <Tooltip title="Nowy projekt 2D">
                <IconButton
                  size="small"
                  onClick={onAddPlan2dTab}
                  aria-label="Nowy projekt 2D"
                  sx={{
                    borderRadius: 0,
                    px: 1,
                    color: 'grey.500',
                    '&:hover': {
                      color: 'grey.200',
                      bgcolor: 'action.hover'
                    }
                  }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
            <Menu
              anchorEl={planMenuEl}
              open={Boolean(planMenuEl)}
              onClose={() => {
                setPlanMenuEl(null);
              }}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            >
              {planTabs.map((tab) => (
                <MenuItem
                  key={tab.viewId}
                  selected={
                    !isWorkshopOpen && activeViewId === tab.viewId
                  }
                  onClick={() => {
                    onSelectTab(tab.viewId, tab.kind, { fit: true });
                    setPlanMenuEl(null);
                  }}
                >
                  {tab.label}
                </MenuItem>
              ))}
            </Menu>
          </>
        )}

        <Button
          variant="text"
          endIcon={<ArrowDropDownIcon />}
          onClick={(event) => {
            setWorkshopMenuEl(event.currentTarget);
          }}
          sx={{
            ...tabButtonSx,
            color: isWorkshopOpen ? 'grey.200' : 'grey.500',
            bgcolor: isWorkshopOpen ? 'primary.light' : undefined
          }}
        >
          {workshopLabel}
        </Button>
        <Menu
          anchorEl={workshopMenuEl}
          open={Boolean(workshopMenuEl)}
          onClose={() => {
            setWorkshopMenuEl(null);
          }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        >
          {WORKSHOP_SECTIONS.map((section) => (
            <MenuItem
              key={section.id}
              selected={isWorkshopOpen && workshopSection === section.id}
              onClick={() => {
                openWorkshopSection(section.id);
              }}
            >
              {section.label}
            </MenuItem>
          ))}
        </Menu>
      </Stack>
    </UiElement>
  );
};
