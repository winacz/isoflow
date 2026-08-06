import React, { useState, useCallback, useMemo } from 'react';
import { Box, Menu, Typography, Divider, Card } from '@mui/material';
import {
  Menu as MenuIcon,
  GitHub as GitHubIcon,
  QuestionAnswer as QuestionAnswerIcon,
  DataObject as ExportJsonIcon,
  ImageOutlined as ExportImageIcon,
  FolderOpen as FolderOpenIcon,
  Save as SaveIcon,
  DeleteOutline as DeleteOutlineIcon,
  NoteAdd as NoteAddIcon,
  DriveFileRenameOutline as RenameIcon,
  PictureAsPdf as ExportPdfIcon,
  DarkModeOutlined as DarkModeIcon,
  LightModeOutlined as LightModeIcon,
  PaletteOutlined as PaletteIcon
} from '@mui/icons-material';
import { UiElement } from 'src/components/UiElement/UiElement';
import { IconButton } from 'src/components/IconButton/IconButton';
import { BackgroundColorLab } from 'src/components/BackgroundColorLab/BackgroundColorLab';
import { useUiStateStore } from 'src/stores/uiStateStore';
import {
  createEmptyProject,
  exportAsJSON,
  buildProjectSnapshot,
  generateProjectFilename,
  isPlanProjection,
  isPlan2dCanvas,
  projectionPrefsKey
} from 'src/utils';
// Direct import: exportAsPdf renders React, so it is deliberately kept out of
// the `src/utils` barrel to stop non-UI modules pulling in the whole app.
import { exportAsInteractivePdf } from 'src/utils/exportAsPdf';
import { useInitialDataManager } from 'src/hooks/useInitialDataManager';
import { useModelStore, useModelStoreApi } from 'src/stores/modelStore';
import { useScene } from 'src/hooks/useScene';
import { MenuItem } from './MenuItem';

export const MainMenu = () => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [colorLabOpen, setColorLabOpen] = useState(false);
  const modelStoreApi = useModelStoreApi();
  const projectTitle = useModelStore((state) => {
    return state.title;
  });
  const modelActions = useModelStore((state) => {
    return state.actions;
  });
  const isMainMenuOpen = useUiStateStore((state) => {
    return state.isMainMenuOpen;
  });
  const mainMenuOptions = useUiStateStore((state) => {
    return state.mainMenuOptions;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const activeViewId = useUiStateStore((state) => {
    return state.view;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const canvasTheme = useUiStateStore((state) => {
    return state.canvasByMode[projectionPrefsKey(state.projectionMode)].theme;
  });
  const toggleCanvasTheme = useUiStateStore((state) => {
    return state.actions.toggleCanvasTheme;
  });
  const initialDataManager = useInitialDataManager();
  const { clearView } = useScene();
  const isDarkCanvas = canvasTheme === 'dark';
  const showIsoflowVersion =
    !isPlanProjection(projectionMode) &&
    mainMenuOptions.includes('VERSION');

  const onToggleMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setAnchorEl(event.currentTarget);
      uiStateActions.setIsMainMenuOpen(true);
    },
    [uiStateActions]
  );

  const gotoUrl = useCallback((url: string) => {
    window.open(url, '_blank');
  }, []);

  const { load } = initialDataManager;

  const onNewProject = useCallback(() => {
    const name = window.prompt('Nazwa nowego projektu', 'Untitled project');
    if (name === null) return;

    const confirmed = window.confirm(
      'Utworzyć nowy pusty projekt? Niezapisane zmiany w bieżącym dokumencie zostaną utracone.'
    );
    if (!confirmed) return;

    uiStateActions.resetUiState();
    load(createEmptyProject(name.trim() || 'Untitled project'));
    uiStateActions.setIsMainMenuOpen(false);
  }, [load, uiStateActions]);

  const onRenameProject = useCallback(() => {
    const next = window.prompt(
      'Nazwa projektu',
      projectTitle || 'Untitled project'
    );
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    modelActions.set({ title: trimmed });
    uiStateActions.setIsMainMenuOpen(false);
  }, [projectTitle, modelActions, uiStateActions]);

  const onOpenModel = useCallback(async () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json';

    fileInput.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];

      if (!file) {
        throw new Error('No file selected');
      }

      const fileReader = new FileReader();

      fileReader.onload = async (e) => {
        const modelData = JSON.parse(e.target?.result as string);
        load({ ...modelData, fitToView: true });
      };
      fileReader.readAsText(file);

      uiStateActions.resetUiState();
    };

    await fileInput.click();
    uiStateActions.setIsMainMenuOpen(false);
  }, [uiStateActions, load]);

  const onSaveProject = useCallback(() => {
    const model = modelStoreApi.getState();
    exportAsJSON(
      buildProjectSnapshot(model, {
        view: activeViewId,
        projectionMode
      }),
      generateProjectFilename(model.title || projectTitle || 'Untitled project')
    );
    uiStateActions.setIsMainMenuOpen(false);
  }, [
    modelStoreApi,
    activeViewId,
    projectionMode,
    projectTitle,
    uiStateActions
  ]);

  const onExportAsJSON = useCallback(() => {
    exportAsJSON(
      buildProjectSnapshot(modelStoreApi.getState(), {
        view: activeViewId,
        projectionMode
      })
    );
    uiStateActions.setIsMainMenuOpen(false);
  }, [modelStoreApi, activeViewId, projectionMode, uiStateActions]);

  const onExportAsImage = useCallback(() => {
    uiStateActions.setIsMainMenuOpen(false);
    uiStateActions.setDialog('EXPORT_IMAGE');
  }, [uiStateActions]);

  const onExportPdf = useCallback(() => {
    uiStateActions.setIsMainMenuOpen(false);
    exportAsInteractivePdf({
      model: buildProjectSnapshot(modelStoreApi.getState(), {
        view: activeViewId,
        projectionMode
      }),
      filename: generateProjectFilename(projectTitle || 'Untitled', 'pdf')
    }).catch((error: unknown) => {
      // eslint-disable-next-line no-console -- surface unexpected export
      // failures instead of silently doing nothing.
      console.error('Eksport do PDF nie powiódł się:', error);
      window.alert(
        'Eksport do PDF nie powiódł się. Sprawdź konsolę po szczegóły.'
      );
    });
  }, [
    modelStoreApi,
    activeViewId,
    projectionMode,
    projectTitle,
    uiStateActions
  ]);

  const { clear } = initialDataManager;

  const onClearCanvas = useCallback(() => {
    const confirmed = window.confirm(
      isPlan2dCanvas(projectionMode)
        ? 'Clear the entire 2D canvas? This cannot be undone.'
        : 'Clear the canvas? This will reset the diagram and cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    if (isPlan2dCanvas(projectionMode)) {
      clearView();
      uiStateActions.setItemControls(null);
      uiStateActions.setMode({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      });
      uiStateActions.setScroll({
        position: { x: 0, y: 0 },
        offset: { x: 0, y: 0 }
      });
      uiStateActions.setZoom(1);
    } else {
      clear();
    }

    uiStateActions.setIsMainMenuOpen(false);
  }, [uiStateActions, clear, clearView, projectionMode]);

  const sectionVisibility = useMemo(() => {
    return {
      actions: Boolean(
        mainMenuOptions.find((opt) => {
          return opt.includes('ACTION') || opt.includes('EXPORT');
        })
      ),
      links: Boolean(
        mainMenuOptions.find((opt) => {
          return opt.includes('LINK');
        })
      ),
      version: showIsoflowVersion
    };
  }, [mainMenuOptions, showIsoflowVersion]);

  if (mainMenuOptions.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1
      }}
    >
      <UiElement>
        <IconButton
          Icon={<MenuIcon />}
          name="Main menu"
          onClick={onToggleMenu}
        />

        <Menu
          anchorEl={anchorEl}
          open={isMainMenuOpen}
          onClose={() => {
            uiStateActions.setIsMainMenuOpen(false);
          }}
          elevation={0}
          sx={{
            mt: 2
          }}
          MenuListProps={{
            sx: {
              minWidth: '250px',
              py: 0
            }
          }}
        >
          <Card sx={{ py: 1 }}>
            {mainMenuOptions.includes('ACTION.NEW_PROJECT') && (
              <MenuItem onClick={onNewProject} Icon={<NoteAddIcon />}>
                New project
              </MenuItem>
            )}

            {mainMenuOptions.includes('ACTION.RENAME_PROJECT') && (
              <MenuItem onClick={onRenameProject} Icon={<RenameIcon />}>
                Rename project
              </MenuItem>
            )}

            {mainMenuOptions.includes('ACTION.OPEN') && (
              <MenuItem onClick={onOpenModel} Icon={<FolderOpenIcon />}>
                Open project
              </MenuItem>
            )}

            {mainMenuOptions.includes('ACTION.SAVE_PROJECT') && (
              <MenuItem onClick={onSaveProject} Icon={<SaveIcon />}>
                Save project
              </MenuItem>
            )}

            {mainMenuOptions.includes('EXPORT.JSON') && (
              <MenuItem onClick={onExportAsJSON} Icon={<ExportJsonIcon />}>
                Export as JSON
              </MenuItem>
            )}

            {mainMenuOptions.includes('EXPORT.PNG') && (
              <MenuItem onClick={onExportAsImage} Icon={<ExportImageIcon />}>
                Export as image
              </MenuItem>
            )}

            {mainMenuOptions.includes('EXPORT.JSON') && (
              <MenuItem onClick={onExportPdf} Icon={<ExportPdfIcon />}>
                Export as PDF
              </MenuItem>
            )}

            {mainMenuOptions.includes('ACTION.CLEAR_CANVAS') && (
              <MenuItem onClick={onClearCanvas} Icon={<DeleteOutlineIcon />}>
                Clear the canvas
              </MenuItem>
            )}

            <Divider />

            <MenuItem
              onClick={() => {
                toggleCanvasTheme();
                uiStateActions.setIsMainMenuOpen(false);
              }}
              Icon={isDarkCanvas ? <LightModeIcon /> : <DarkModeIcon />}
            >
              {isDarkCanvas ? 'Motyw jasny' : 'Motyw ciemny'}
            </MenuItem>

            <MenuItem
              onClick={() => {
                setColorLabOpen(true);
                uiStateActions.setIsMainMenuOpen(false);
              }}
              Icon={<PaletteIcon />}
            >
              Kolory / siatka
            </MenuItem>

            {sectionVisibility.links && (
              <>
                <Divider />

                {mainMenuOptions.includes('LINK.GITHUB') && (
                  <MenuItem
                    onClick={() => {
                      return gotoUrl(`${REPOSITORY_URL}`);
                    }}
                    Icon={<GitHubIcon />}
                  >
                    GitHub
                  </MenuItem>
                )}

                {mainMenuOptions.includes('LINK.DISCORD') && (
                  <MenuItem
                    onClick={() => {
                      return gotoUrl('https://discord.gg/QYPkvZth7D');
                    }}
                    Icon={<QuestionAnswerIcon />}
                  >
                    Discord
                  </MenuItem>
                )}
              </>
            )}

            {sectionVisibility.version && (
              <>
                <Divider />

                <MenuItem>
                  <Typography variant="body2" color="text.secondary">
                    Isoflow v{PACKAGE_VERSION}
                  </Typography>
                </MenuItem>
              </>
            )}
          </Card>
        </Menu>
      </UiElement>

      <BackgroundColorLab
        open={colorLabOpen}
        onClose={() => {
          setColorLabOpen(false);
        }}
      />
    </Box>
  );
};
