import React, { useCallback, useMemo, useRef } from 'react';
import { Box, IconButton, Typography, useTheme } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { EditorModeEnum } from 'src/types';
import { UiElement } from 'src/components/UiElement/UiElement';
import { SceneLayer } from 'src/components/SceneLayer/SceneLayer';
import { DragAndDrop } from 'src/components/DragAndDrop/DragAndDrop';
import { ItemControlsManager } from 'src/components/ItemControls/ItemControlsManager';
import { ToolMenu } from 'src/components/ToolMenu/ToolMenu';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { MainMenu } from 'src/components/MainMenu/MainMenu';
import { ZoomControls } from 'src/components/ZoomControls/ZoomControls';
import { ConnectorRelationPanel } from 'src/components/ConnectorRelationPanel/ConnectorRelationPanel';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { ContextMenuManager } from 'src/components/ContextMenu/ContextMenuManager';
import { ViewModeTabs } from 'src/components/ViewModeTabs/ViewModeTabs';
import { PortPipOverlay } from 'src/components/PortPipOverlay/PortPipOverlay';
import { PortPipHoverController } from 'src/components/PortPipOverlay/PortPipHoverController';
import { Shape2dPortHoverController } from 'src/components/PortPipOverlay/Shape2dPortHoverController';
import { PortLoupeOverlay } from 'src/components/PortPipOverlay/PortLoupeOverlay';
import { SviHoverController } from 'src/components/UiOverlay/SviHoverController';
import { WorkshopView } from 'src/components/Workshop/WorkshopView';
import { PerfHud } from 'src/components/PerfHud/PerfHud';
import { ExportImageDialog } from '../ExportImageDialog/ExportImageDialog';
import { useScene } from 'src/hooks/useScene';
import { isPlanProjection, isPlan2dCanvas } from 'src/utils';

const findConnectorIdForPort = (
  connectors: { id: string; anchors: { ref: { item?: string; port?: string } }[] }[],
  itemId: string,
  portId: string
): string | null => {
  const hit = connectors.find((connector) => {
    return connector.anchors.some((anchor) => {
      return anchor.ref.item === itemId && anchor.ref.port === portId;
    });
  });
  return hit?.id ?? null;
};

const ToolsEnum = {
  MAIN_MENU: 'MAIN_MENU',
  ZOOM_CONTROLS: 'ZOOM_CONTROLS',
  TOOL_MENU: 'TOOL_MENU',
  ITEM_CONTROLS: 'ITEM_CONTROLS',
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
    'VIEW_MODE_TABS'
  ],
  [EditorModeEnum.EXPLORABLE_READONLY]: [
    'ZOOM_CONTROLS',
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
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const placeIconTileX = useUiStateStore((state) =>
    state.mode.type === 'PLACE_ICON' ? state.mouse.position.tile.x : 0
  );
  const placeIconTileY = useUiStateStore((state) =>
    state.mode.type === 'PLACE_ICON' ? state.mouse.position.tile.y : 0
  );
  const dialog = useUiStateStore((state) => {
    return state.dialog;
  });
  const itemControls = useUiStateStore((state) => {
    return state.itemControls;
  });
  const selectedItemIds = useUiStateStore((state) => {
    return state.selectedItemIds;
  });
  const focusedPortIds = useUiStateStore((state) => {
    return state.focusedPortIds;
  });
  const shape2dPortHover = useUiStateStore((state) => {
    return state.shape2dPortHover;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const editorMode = useUiStateStore((state) => {
    return state.editorMode;
  });
  const availableTools = useMemo(() => {
    return getEditorModeMapping(editorMode);
  }, [editorMode]);
  const rendererEl = useUiStateStore((state) => {
    return state.rendererEl;
  });
  const isWorkshopOpen = useUiStateStore((state) => {
    return state.isWorkshopOpen;
  });
  const isRightSidebarOpen = useUiStateStore((state) => {
    return state.isRightSidebarOpen;
  });
  const { connectors } = useScene();
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const isTwoD = isPlanProjection(projectionMode);
  // In the 2D plan the dock always has content: with nothing selected it shows
  // a short hint (layout tools are on the RMB context menu).
  const hasItemControlsContent = Boolean(itemControls) || isTwoD;
  /**
   * Cable relation tile: selected cable, drawing mode, focused port, or
   * simply hovering a connected port on the plan.
   */
  const selectedConnectorId = useMemo(() => {
    if (itemControls?.type === 'CONNECTOR') {
      return itemControls.id;
    }
    if (mode.type === 'CONNECTOR' || mode.type === 'CONNECTOR_V3') {
      return mode.id;
    }
    if (
      isPlan2dCanvas(projectionMode) &&
      itemControls?.type === 'ITEM' &&
      focusedPortIds.length > 0
    ) {
      for (const portId of focusedPortIds) {
        const connectorId = findConnectorIdForPort(
          connectors,
          itemControls.id,
          portId
        );
        if (connectorId) return connectorId;
      }
    }
    if (
      isPlan2dCanvas(projectionMode) &&
      shape2dPortHover?.portId
    ) {
      return findConnectorIdForPort(
        connectors,
        shape2dPortHover.itemId,
        shape2dPortHover.portId
      );
    }
    return null;
  }, [
    itemControls,
    mode,
    projectionMode,
    focusedPortIds,
    shape2dPortHover,
    connectors
  ]);

  // Room for device creator radios + port previews (~22% width).
  const itemControlsWidth = isTwoD
    ? Math.min(340, Math.max(290, Math.round(rendererSize.width * 0.22)))
    : 280;

  /** Plan mode: persistent full-height right dock (content may be empty). */
  const showPlanSidebarChrome =
    isTwoD &&
    availableTools.includes('ITEM_CONTROLS') &&
    !isWorkshopOpen;
  const planSidebarExpanded = showPlanSidebarChrome && isRightSidebarOpen;

  /** Iso mode: floating panel only when there is content. */
  const showIsoItemControls =
    !isTwoD &&
    availableTools.includes('ITEM_CONTROLS') &&
    hasItemControlsContent &&
    !isWorkshopOpen;

  return (
    <>
      <PortPipHoverController />
      <Shape2dPortHoverController />
      <PortLoupeOverlay />
      <PortPipOverlay />
      <SviHoverController />
      {isWorkshopOpen && <WorkshopView />}
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
        {/* Plan (2D): persistent full-height right sidebar */}
        {showPlanSidebarChrome && (
          <>
            {planSidebarExpanded ? (
              <UiElement
                sx={{
                  position: 'absolute',
                  width: `${itemControlsWidth}px`,
                  height: `${rendererSize.height}px`,
                  maxHeight: `${rendererSize.height}px`,
                  overflow: 'hidden',
                  borderRadius: 0,
                  boxShadow: '-2px 0 12px rgba(15,23,42,0.08)',
                  display: 'flex',
                  flexDirection: 'column'
                }}
                style={{
                  left: rendererSize.width - itemControlsWidth,
                  top: 0
                }}
              >
                {/* Tools stay fixed — not inside the scrolling context */}
                <Box
                  sx={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 0.75,
                    py: 0.75,
                    bgcolor: 'background.paper'
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {availableTools.includes('TOOL_MENU') && (
                      <ToolMenu embedded />
                    )}
                  </Box>
                  <IconButton
                    size="small"
                    aria-label="Ukryj panel boczny"
                    title="Ukryj panel boczny"
                    onClick={() => {
                      uiStateActions.setRightSidebarOpen(false);
                    }}
                    sx={{ color: 'text.secondary', flexShrink: 0 }}
                  >
                    <ChevronRightIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Box
                  aria-hidden
                  sx={{
                    flexShrink: 0,
                    height: 3,
                    bgcolor: 'grey.800',
                    opacity: 0.85
                  }}
                />
                {/* ~70% context / item controls */}
                <Box
                  data-item-controls-scroll
                  sx={{
                    flex: '7 1 0%',
                    minHeight: 0,
                    width: '100%',
                    overflowY: 'auto',
                    overscrollBehavior: 'contain',
                    '&::-webkit-scrollbar': {
                      display: 'none'
                    }
                  }}
                >
                  {hasItemControlsContent ? (
                    <ItemControlsManager />
                  ) : (
                    <Box sx={{ px: 2, py: 2.5 }}>
                      <Typography
                        sx={{
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          mb: 0.75
                        }}
                      >
                        Kontekst
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 13,
                          color: 'text.secondary',
                          lineHeight: 1.45
                        }}
                      >
                        Wybierz urządzenie na planie albo naciśnij{' '}
                        <Box component="span" sx={{ fontWeight: 700 }}>
                          +
                        </Box>{' '}
                        aby dodać nowe.
                      </Typography>
                    </Box>
                  )}
                </Box>
                {/* ~30% cable relation tile */}
                <Box
                  aria-hidden
                  sx={{
                    flexShrink: 0,
                    height: 3,
                    bgcolor: 'grey.800',
                    opacity: 0.85
                  }}
                />
                <Box
                  sx={{
                    flex: '3 1 0%',
                    minHeight: 0,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: 'background.paper',
                    overflow: 'hidden'
                  }}
                >
                  {selectedConnectorId ? (
                    <ConnectorRelationPanel
                      connectorId={selectedConnectorId}
                      embedded
                    />
                  ) : (
                    <Box sx={{ px: 1.5, py: 1.5 }}>
                      <Typography
                        sx={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: 0.55,
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          mb: 0.75
                        }}
                      >
                        Połączenie
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 13,
                          color: 'text.secondary',
                          lineHeight: 1.45
                        }}
                      >
                        Najedź na podłączony port albo wybierz kabel, aby
                        zobaczyć relację.
                      </Typography>
                    </Box>
                  )}
                </Box>
              </UiElement>
            ) : (
              <Box
                sx={{
                  position: 'absolute',
                  zIndex: 21,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 1
                }}
                style={{
                  left: rendererSize.width - appPadding.x,
                  top: appPadding.y,
                  transform: 'translateX(-100%)'
                }}
              >
                {availableTools.includes('TOOL_MENU') && <ToolMenu />}
                <UiElement sx={{ p: 0.25 }}>
                  <IconButton
                    size="small"
                    aria-label="Pokaż panel boczny"
                    title="Pokaż panel boczny"
                    onClick={() => {
                      uiStateActions.setRightSidebarOpen(true);
                    }}
                    sx={{ color: 'text.secondary' }}
                  >
                    <ChevronLeftIcon fontSize="small" />
                  </IconButton>
                </UiElement>
                {selectedConnectorId && (
                  <Box sx={{ maxWidth: itemControlsWidth }}>
                    <ConnectorRelationPanel connectorId={selectedConnectorId} />
                  </Box>
                )}
              </Box>
            )}
          </>
        )}

        {/* Iso: floating item controls (left) — only when content exists */}
        {showIsoItemControls && (
          <UiElement
            data-item-controls-scroll
            sx={{
              position: 'absolute',
              width: `${itemControlsWidth}px`,
              overflowY: 'scroll',
              overscrollBehavior: 'contain',
              '&::-webkit-scrollbar': {
                display: 'none'
              }
            }}
            style={{
              left: appPadding.x,
              top: appPadding.y * 2 + spacing(2),
              maxHeight: rendererSize.height - appPadding.y * 6
            }}
          >
            <ItemControlsManager />
          </UiElement>
        )}

        {/* Iso / non-plan: floating tool menu (plan tools live in the sidebar) */}
        {availableTools.includes('TOOL_MENU') &&
          !isWorkshopOpen &&
          !isTwoD && (
            <Box
              sx={{
                position: 'absolute',
                transform: 'translateX(-100%)'
              }}
              style={{
                left: rendererSize.width - appPadding.x,
                top: appPadding.y
              }}
            >
              <ToolMenu />
            </Box>
          )}

        {availableTools.includes('ZOOM_CONTROLS') && !isWorkshopOpen && (
          <Box
            sx={{
              position: 'absolute',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 1,
              transform: 'translateY(-100%)'
            }}
            style={{
              top: rendererSize.height - appPadding.y,
              left: appPadding.x
            }}
          >
            <ZoomControls />
          </Box>
        )}

        {/* Density group tools: RMB context menu (2D v3) */}

        {availableTools.includes('MAIN_MENU') && !isWorkshopOpen && (
          <Box
            sx={{
              position: 'absolute',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 1
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
      </Box>

      {mode.type === 'PLACE_ICON' && mode.id && (
        <SceneLayer omitTransform={false} disableAnimation>
          <DragAndDrop
            iconId={mode.id}
            tile={{ x: placeIconTileX, y: placeIconTileY }}
            draftModelItem={mode.draftModelItem}
          />
        </SceneLayer>
      )}

      {dialog === 'EXPORT_IMAGE' && (
        <ExportImageDialog
          onClose={() => {
            return uiStateActions.setDialog(null);
          }}
        />
      )}

      <SceneLayer omitTransform={false}>
        <Box ref={contextMenuAnchorRef} />
        <ContextMenuManager anchorEl={contextMenuAnchorRef.current} />
      </SceneLayer>
      <PerfHud />
    </>
  );
};
