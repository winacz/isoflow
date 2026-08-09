import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  ButtonBase,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Typography
} from '@mui/material';
import {
  Check as CheckIcon,
  ExpandMore as ExpandMoreIcon,
  ViewInArOutlined as IsoIcon,
  MapOutlined as PlansIcon,
  HandymanOutlined as WorkshopIcon
} from '@mui/icons-material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore, useModelStoreApi } from 'src/stores/modelStore';
import { useView } from 'src/hooks/useView';
import { useDiagramUtils } from 'src/hooks/useDiagramUtils';
import { MainMenu } from 'src/components/MainMenu/MainMenu';
import { EditorModeEnum } from 'src/types';
import {
  ViewKind,
  ViewKindEnum,
  getProjectTabs,
  projectionModeForKind,
  PLAN_2D_VIEW_NAME,
  PLAN_2D_V3_VIEW_NAME,
  ISOMETRIC_VIEW_NAME
} from 'src/utils';

const WORKSHOP_SECTIONS = [
  { id: 'templates' as const, label: 'Szablony urządzeń' },
  { id: 'ipam' as const, label: 'IPAM' }
];

/** Fixed top chrome height — keep in sync with UiOverlay / Workshop spacers. */
export const VIEW_MODE_TABS_BAR_HEIGHT = 52;

const menuPaperSx = {
  mt: 0.75,
  minWidth: 220,
  borderRadius: 2,
  border: '1px solid',
  borderColor: 'divider',
  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
  overflow: 'hidden',
  '& .MuiList-root': { py: 0.5 }
} as const;

const menuItemSx = {
  mx: 0.5,
  px: 1.25,
  py: 0.85,
  borderRadius: 1.5,
  fontSize: 13,
  fontWeight: 500,
  '&.Mui-selected': {
    bgcolor: 'rgba(37, 99, 235, 0.1)',
    color: 'primary.main',
    fontWeight: 650,
    '&:hover': { bgcolor: 'rgba(37, 99, 235, 0.14)' }
  }
} as const;

type SegmentProps = {
  active: boolean;
  label: string;
  icon?: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  endAdornment?: React.ReactNode;
  title?: string;
};

const ModeSegment = ({
  active,
  label,
  icon,
  onClick,
  endAdornment,
  title
}: SegmentProps) => {
  return (
    <ButtonBase
      title={title}
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        height: 34,
        px: 1.35,
        borderRadius: 2,
        fontSize: 13,
        fontWeight: active ? 700 : 600,
        letterSpacing: 0.01,
        color: active ? 'text.primary' : 'text.secondary',
        bgcolor: active ? 'background.paper' : 'transparent',
        boxShadow: active ? '0 1px 3px rgba(15, 23, 42, 0.12)' : 'none',
        transition:
          'background-color 120ms ease, color 120ms ease, box-shadow 120ms ease',
        '&:hover': {
          bgcolor: active ? 'background.paper' : 'rgba(15, 23, 42, 0.05)',
          color: 'text.primary'
        },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 1
        }
      }}
    >
      {icon && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            color: active ? 'primary.main' : 'inherit',
            '& svg': { fontSize: 17 }
          }}
        >
          {icon}
        </Box>
      )}
      <Box component="span" sx={{ whiteSpace: 'nowrap', lineHeight: 1 }}>
        {label}
      </Box>
      {endAdornment}
    </ButtonBase>
  );
};

export const ViewModeTabs = () => {
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const isWorkshopOpen = useUiStateStore((state) => {
    return state.isWorkshopOpen;
  });
  const isPlanPickerOpen = useUiStateStore((state) => {
    return state.isPlanPickerOpen;
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

  const isPlanActive =
    !isWorkshopOpen && (isPlanPickerOpen || Boolean(activePlanTab));
  const isIsoActive =
    !isWorkshopOpen &&
    !isPlanPickerOpen &&
    isoTabs.some((tab) => tab.viewId === activeViewId);

  const projectLabel = projectTitle?.trim() || 'Untitled';

  /** Secondary header label: open 2D diagram or workshop section. */
  const diagramLabel = useMemo(() => {
    if (isWorkshopOpen) {
      const section = WORKSHOP_SECTIONS.find((entry) => {
        return entry.id === workshopSection;
      });
      return section ? section.label : 'Warsztat';
    }

    if (isPlanPickerOpen) {
      return 'Wybór planu';
    }

    const activeView = views.find((view) => view.id === activeViewId);
    if (!activeView) return null;

    const kind =
      activePlanTab?.kind ??
      (isoTabs.some((tab) => tab.viewId === activeViewId)
        ? ViewKindEnum.ISOMETRIC
        : null);

    if (kind === ViewKindEnum.ISOMETRIC) {
      const name = activeView.name?.trim();
      if (
        name &&
        name !== ISOMETRIC_VIEW_NAME &&
        name.toLowerCase() !== projectLabel.toLowerCase()
      ) {
        return name;
      }
      return null;
    }

    if (kind === ViewKindEnum.PLAN_2D || kind === ViewKindEnum.PLAN_2D_V3) {
      const name = activeView.name?.trim();
      if (
        name &&
        name !== PLAN_2D_VIEW_NAME &&
        name !== PLAN_2D_V3_VIEW_NAME &&
        name.toLowerCase() !== projectLabel.toLowerCase()
      ) {
        return name;
      }
      const label = activePlanTab?.label?.trim();
      if (
        label &&
        label !== '2D' &&
        label.toLowerCase() !== projectLabel.toLowerCase()
      ) {
        return label;
      }
    }

    return null;
  }, [
    isWorkshopOpen,
    isPlanPickerOpen,
    workshopSection,
    views,
    activeViewId,
    activePlanTab,
    isoTabs,
    projectLabel
  ]);

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
      uiStateActions.setPlanPickerOpen(false);

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

  const openPlanPicker = useCallback(() => {
    uiStateActions.setPlanPickerOpen(true);
    uiStateActions.setWorkshopOpen(false);
    resetInteraction();
  }, [uiStateActions, resetInteraction]);

  const openWorkshopSection = useCallback(
    (section: 'templates' | 'ipam') => {
      uiStateActions.setWorkshopSection(section);
      uiStateActions.setWorkshopOpen(true);
      uiStateActions.setPlanPickerOpen(false);
      setWorkshopMenuEl(null);
    },
    [uiStateActions]
  );

  const mainMenuOptions = useUiStateStore((state) => {
    return state.mainMenuOptions;
  });
  const editorMode = useUiStateStore((state) => {
    return state.editorMode;
  });
  const showMainMenu =
    editorMode === EditorModeEnum.EDITABLE && mainMenuOptions.length > 0;

  const chevron = (open: boolean) => (
    <ExpandMoreIcon
      sx={{
        fontSize: 18,
        ml: -0.15,
        opacity: 0.7,
        transition: 'transform 150ms ease',
        transform: open ? 'rotate(180deg)' : 'none'
      }}
    />
  );

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        minHeight: VIEW_MODE_TABS_BAR_HEIGHT,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        px: 1.25,
        py: 0.5,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}
    >
      {/* Left: menu + project / diagram titles */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          minWidth: 0,
          flex: '1 1 0',
          zIndex: 1,
          pointerEvents: 'none',
          '& > *': { pointerEvents: 'auto' }
        }}
      >
        {showMainMenu && <MainMenu embedded />}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 1,
            minWidth: 0,
            overflow: 'hidden',
            pointerEvents: 'none'
          }}
        >
          <Typography
            component="span"
            title={projectLabel}
            sx={{
              fontSize: 15,
              fontWeight: 700,
              color: 'text.primary',
              letterSpacing: 0.01,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.2,
              userSelect: 'none'
            }}
          >
            {projectLabel}
          </Typography>
          {diagramLabel && (
            <Typography
              component="span"
              title={diagramLabel}
              sx={{
                fontSize: 12,
                fontWeight: 500,
                color: 'text.secondary',
                letterSpacing: 0.01,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.2,
                userSelect: 'none',
                opacity: 0.85
              }}
            >
              {diagramLabel}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Center: mode switcher */}
      <Stack
        direction="row"
        alignItems="center"
        sx={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2,
          pointerEvents: 'auto',
          p: 0.4,
          gap: 0.35,
          borderRadius: 2.5,
          bgcolor: 'rgba(15, 23, 42, 0.045)',
          border: '1px solid',
          borderColor: 'rgba(15, 23, 42, 0.06)'
        }}
      >
        {isoTabs.map((tab) => (
          <ModeSegment
            key={tab.viewId}
            active={isIsoActive && activeViewId === tab.viewId}
            label="Izometria"
            icon={<IsoIcon />}
            title="Widok izometryczny topologii"
            onClick={() => {
              onSelectTab(tab.viewId, tab.kind);
            }}
          />
        ))}

        {planTabs.length > 0 && (
          <ModeSegment
            active={isPlanActive}
            label="Plany"
            icon={<PlansIcon />}
            title="Plany 2D — wybierz plan z galerii"
            onClick={() => {
              openPlanPicker();
            }}
          />
        )}

        <ModeSegment
          active={isWorkshopOpen}
          label="Warsztat"
          icon={<WorkshopIcon />}
          title="Szablony urządzeń i IPAM"
          endAdornment={chevron(Boolean(workshopMenuEl))}
          onClick={(event) => {
            if (!isWorkshopOpen) {
              openWorkshopSection(workshopSection || 'templates');
            }
            setWorkshopMenuEl(event.currentTarget);
          }}
        />
        <Menu
          anchorEl={workshopMenuEl}
          open={Boolean(workshopMenuEl)}
          onClose={() => setWorkshopMenuEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          PaperProps={{ sx: menuPaperSx }}
        >
          {WORKSHOP_SECTIONS.map((section) => {
            const selected =
              isWorkshopOpen && workshopSection === section.id;
            return (
              <MenuItem
                key={section.id}
                selected={selected}
                onClick={() => openWorkshopSection(section.id)}
                sx={menuItemSx}
              >
                <ListItemText
                  primary={section.label}
                  primaryTypographyProps={{
                    fontSize: 13,
                    fontWeight: selected ? 700 : 500
                  }}
                />
                {selected && (
                  <ListItemIcon sx={{ minWidth: 28, color: 'primary.main' }}>
                    <CheckIcon sx={{ fontSize: 18 }} />
                  </ListItemIcon>
                )}
              </MenuItem>
            );
          })}
        </Menu>
      </Stack>

      <Box
        sx={{ flex: '1 1 0', minWidth: 0, pointerEvents: 'none' }}
        aria-hidden
      />
    </Box>
  );
};
