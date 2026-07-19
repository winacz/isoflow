import React, { useCallback, useMemo, useRef } from 'react';
import { Box, useTheme, Typography, Stack } from '@mui/material';
import { ChevronRight } from '@mui/icons-material';
import { EditorModeEnum } from 'src/types';
import { UiElement } from 'components/UiElement/UiElement';
import { SceneLayer } from 'src/components/SceneLayer/SceneLayer';
import { DragAndDrop } from 'src/components/DragAndDrop/DragAndDrop';
import { ItemControlsManager } from 'src/components/ItemControls/ItemControlsManager';
import { ToolMenu } from 'src/components/ToolMenu/ToolMenu';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { MainMenu } from 'src/components/MainMenu/MainMenu';
import { ZoomControls } from 'src/components/ZoomControls/ZoomControls';
import { BackgroundColorLab } from 'src/components/BackgroundColorLab/BackgroundColorLab';
import { ConnectorRelationPanel } from 'src/components/ConnectorRelationPanel/ConnectorRelationPanel';
import { DebugUtils } from 'src/components/DebugUtils/DebugUtils';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { ContextMenuManager } from 'src/components/ContextMenu/ContextMenuManager';
import { ViewModeTabs } from 'src/components/ViewModeTabs/ViewModeTabs';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { ExportImageDialog } from '../ExportImageDialog/ExportImageDialog';

const ToolsEnum = {
  MAIN_MENU: 'MAIN_MENU',
  ZOOM_CONTROLS: 'ZOOM_CONTROLS',
  TOOL_MENU: 'TOOL_MENU',
  ITEM_CONTROLS: 'ITEM_CONTROLS',
  VIEW_TITLE: 'VIEW_TITLE',
  VIEW_MODE_TABS: 'VIEW_MODE_TABS'
} as const;

interface EditorModeMapping {
  [k: string]: (keyof typeof ToolsEnum)[];
}

const EDITOR_MODE_MAPPING: EditorModeMapping = {
  [EditorModeEnum.EDITABLE]: [
    'ITEM_CONTROLS',
    'ZOOM_CONTROLS',
    'TOOL_MENU',
    'MAIN_MENU',
    'VIEW_TITLE',
    'VIEW_MODE_TABS'
  ],
  [EditorModeEnum.EXPLORABLE_READONLY]: [
    'ZOOM_CONTROLS',
    'VIEW_TITLE',
    'VIEW_MODE_TABS'
  ],
  [EditorModeEnum.NON_INTERACTIVE]: []
};

const getEditorModeMapping = (editorMode: keyof typeof EditorModeEnum) => {
  const availableUiFeatures = EDITOR_MODE_MAPPING[editorMode];

  return availableUiFeatures;
};

export const UiOverlay = () => {
  const theme = useTheme();
  const contextMenuAnchorRef = useRef();
  const { appPadding } = theme.customVars;
  const spacing = useCallback(
    (multiplier: number) => {
      return parseInt(theme.spacing(multiplier), 10);
    },
    [theme]
  );
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const enableDebugTools = useUiStateStore((state) => {
    return state.enableDebugTools;
  });
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const mouse = useUiStateStore((state) => {
    return state.mouse;
  });
  const dialog = useUiStateStore((state) => {
    return state.dialog;
  });
  const itemControls = useUiStateStore((state) => {
    return state.itemControls;
  });
  const selectedItemIds = useUiStateStore((state) => {
    return state.selectedItemIds;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const { currentView } = useScene();
  const editorMode = useUiStateStore((state) => {
    return state.editorMode;
  });
  const availableTools = useMemo(() => {
    return getEditorModeMapping(editorMode);
  }, [editorMode]);
  const rendererEl = useUiStateStore((state) => {
    return state.rendererEl;
  });
  const title = useModelStore((state) => {
    return state.title;
  });
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const isTwoD = projectionMode === 'TWO_D';
  const showItemControls =
    Boolean(itemControls) || (isTwoD && selectedItemIds.length >= 2);
  const selectedConnectorId =
    itemControls?.type === 'CONNECTOR' ? itemControls.id : null;
  // Compact on smaller Mac screens — ~18–20% width, not ~28%/360–420px.
  const itemControlsWidth = isTwoD
    ? Math.min(300, Math.max(260, Math.round(rendererSize.width * 0.2)))
    : 280;

  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          width: 0,
          height: 0,
          top: 0,
          left: 0,
          zIndex: 20
        }}
      >
        {availableTools.includes('ITEM_CONTROLS') && showItemControls && (
          <UiElement
            sx={{
              position: 'absolute',
              width: `${itemControlsWidth}px`,
              overflowY: 'scroll',
              '&::-webkit-scrollbar': {
                display: 'none'
              }
            }}
            style={{
              left: isTwoD
                ? rendererSize.width - appPadding.x - itemControlsWidth
                : appPadding.x,
              top: appPadding.y * 2 + spacing(2),
              maxHeight: rendererSize.height - appPadding.y * 6
            }}
          >
            <ItemControlsManager />
          </UiElement>
        )}

        {availableTools.includes('TOOL_MENU') && (
          <Box
            sx={{
              position: 'absolute',
              transform: 'translateX(-100%)'
            }}
            style={{
              left:
                rendererSize.width -
                appPadding.x -
                (isTwoD && showItemControls
                  ? itemControlsWidth + spacing(1)
                  : 0),
              top: appPadding.y
            }}
          >
            <ToolMenu />
          </Box>
        )}

        {availableTools.includes('ZOOM_CONTROLS') && (
          <Box
            sx={{
              position: 'absolute',
              transformOrigin: 'bottom left'
            }}
            style={{
              top: rendererSize.height - appPadding.y * 2,
              left: appPadding.x
            }}
          >
            <ZoomControls />
          </Box>
        )}

        {/* Bottom-left: cable relation (while selected) + TEMP color lab */}
        {availableTools.includes('ZOOM_CONTROLS') && (
          <Box
            sx={{
              position: 'absolute',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 1
            }}
            style={{
              left: appPadding.x,
              top: rendererSize.height - appPadding.y * 2 - spacing(22)
            }}
          >
            {isTwoD && selectedConnectorId && (
              <ConnectorRelationPanel connectorId={selectedConnectorId} />
            )}
            <BackgroundColorLab />
          </Box>
        )}

        {availableTools.includes('MAIN_MENU') && (
          <Box
            sx={{
              position: 'absolute'
            }}
            style={{
              top: appPadding.y,
              left: appPadding.x
            }}
          >
            <MainMenu />
          </Box>
        )}

        {availableTools.includes('VIEW_MODE_TABS') && (
          <Box
            sx={{
              position: 'absolute',
              transform: 'translateX(-50%)'
            }}
            style={{
              top: appPadding.y,
              left: rendererSize.width / 2
            }}
          >
            <ViewModeTabs />
          </Box>
        )}

        {availableTools.includes('VIEW_TITLE') && (
          <Box
            sx={{
              position: 'absolute',
              display: 'flex',
              justifyContent: 'center',
              transform: 'translateX(-50%)',
              pointerEvents: 'none'
            }}
            style={{
              left: rendererSize.width / 2,
              top: rendererSize.height - appPadding.y * 2,
              width: rendererSize.width - 500,
              height: appPadding.y
            }}
          >
            <UiElement
              sx={{
                display: 'inline-flex',
                px: 2,
                alignItems: 'center',
                height: '100%'
              }}
            >
              <Stack direction="row" alignItems="center">
                <Typography fontWeight={600} color="text.secondary">
                  {title}
                </Typography>
                <ChevronRight />
                <Typography fontWeight={600} color="text.secondary">
                  {currentView.name}
                </Typography>
              </Stack>
            </UiElement>
          </Box>
        )}

        {enableDebugTools && (
          <UiElement
            sx={{
              position: 'absolute',
              width: 350,
              transform: 'translateY(-100%)'
            }}
            style={{
              maxWidth: `calc(${rendererSize.width} - ${appPadding.x * 2}px)`,
              left: appPadding.x,
              top: rendererSize.height - appPadding.y * 2 - spacing(1)
            }}
          >
            <DebugUtils />
          </UiElement>
        )}
      </Box>

      {mode.type === 'PLACE_ICON' && mode.id && (
        <SceneLayer disableAnimation>
          <DragAndDrop iconId={mode.id} tile={mouse.position.tile} />
        </SceneLayer>
      )}

      {dialog === 'EXPORT_IMAGE' && (
        <ExportImageDialog
          onClose={() => {
            return uiStateActions.setDialog(null);
          }}
        />
      )}

      <SceneLayer>
        <Box ref={contextMenuAnchorRef} />
        <ContextMenuManager anchorEl={contextMenuAnchorRef.current} />
      </SceneLayer>
    </>
  );
};
