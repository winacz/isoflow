import React, { useEffect, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useInteractionManager } from 'src/interaction/useInteractionManager';
import { Grid } from 'src/components/Grid/Grid';
import { Cursor } from 'src/components/Cursor/Cursor';
import { Nodes } from 'src/components/SceneLayers/Nodes/Nodes';
import { NodeDescriptionLabels } from 'src/components/SceneLayers/Nodes/NodeDescriptionLabels';
import { IsoNodeLabels } from 'src/components/SceneLayers/Nodes/IsoNodeLabels';
import { MultiSelectMoveHandle } from 'src/components/SceneLayers/Nodes/MultiSelectMoveHandle';
import { Rectangles } from 'src/components/SceneLayers/Rectangles/Rectangles';
import { Connectors } from 'src/components/SceneLayers/Connectors/Connectors';
import { ConnectorV3Preview } from 'src/components/SceneLayers/ConnectorV3Preview/ConnectorV3Preview';
import { V3DensityGroupsOverlay } from 'src/components/V3DensityGroups/V3DensityGroupsOverlay';
import { ConnectorStackBadges } from 'src/components/SceneLayers/Connectors/ConnectorStackBadges';
import { WaypointGuides } from 'src/components/SceneLayers/Connectors/WaypointGuides';
import { ConnectorLabels } from 'src/components/SceneLayers/ConnectorLabels/ConnectorLabels';
import { TextBoxes } from 'src/components/SceneLayers/TextBoxes/TextBoxes';
import { SceneLayer } from 'src/components/SceneLayer/SceneLayer';
import { SceneViewport } from 'src/components/SceneLayer/SceneViewport';
import { TransformControlsManager } from 'src/components/TransformControlsManager/TransformControlsManager';
import { useScene } from 'src/hooks/useScene';
import { RendererProps } from 'src/types/rendererProps';
import { isShape2dIcon, DIAGRAM_BG_2D_LIGHT, DIAGRAM_BG_2D_DARK } from 'src/config';
import { Connector as ConnectorModel } from 'src/types';
import { MarqueeSelection } from 'src/components/MarqueeSelection/MarqueeSelection';
import { isWheelZoomGesture } from 'src/utils/zoom';
import { isPlanProjection, projectionPrefsKey } from 'src/utils';

const getConnectorItemIds = (connector: ConnectorModel) => {
  return connector.anchors
    .map((anchor) => {
      return anchor.ref.item;
    })
    .filter((id): id is string => {
      return Boolean(id);
    });
};

export const Renderer = ({ showGrid, backgroundColor }: RendererProps) => {
  const containerRef = useRef<HTMLDivElement>();
  const interactionsRef = useRef<HTMLDivElement>();
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const diagramBackgroundColor = useUiStateStore((state) => {
    const key = projectionPrefsKey(state.projectionMode);
    return state.canvasByMode[key].backgroundColor;
  });
  const canvasTheme = useUiStateStore((state) => {
    const key = projectionPrefsKey(state.projectionMode);
    return state.canvasByMode[key].theme;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const showGridUi = useUiStateStore((state) => {
    return state.showGrid;
  });
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const { setInteractionsElement } = useInteractionManager();
  const { items, rectangles, connectors, textBoxes } = useScene();

  useEffect(() => {
    if (!containerRef.current || !interactionsRef.current) return;

    setInteractionsElement(interactionsRef.current);
    uiStateActions.setRendererEl(containerRef.current);
  }, [setInteractionsElement, uiStateActions]);

  // Native wheel: plan trackpad two-finger = pan; pinch / mouse wheel = zoom.
  // Isometric always zooms (classic map behavior).
  useEffect(() => {
    const el = interactionsRef.current;
    if (!el) return undefined;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const shouldZoom =
        !isPlanProjection(projectionMode) || isWheelZoomGesture(e);

      if (shouldZoom) {
        const rect = el.getBoundingClientRect();
        const focalFromCenter = {
          x: e.clientX - rect.left - rect.width / 2,
          y: e.clientY - rect.top - rect.height / 2
        };
        uiStateActions.adjustZoomByWheel(e.deltaY, e.deltaMode, focalFromCenter);
        return;
      }

      uiStateActions.panByWheel(e.deltaX, e.deltaY, e.deltaMode);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [uiStateActions, projectionMode]);

  const isShowGrid = showGrid !== undefined ? showGrid : showGridUi;

  const isTwoD = isPlanProjection(projectionMode);
  const isTwoDV2 = projectionMode === 'TWO_D_V2';
  const isTwoDV3 = projectionMode === 'TWO_D_V3';
  const isClassic2d = projectionMode === 'TWO_D';

  const iconByItemId = useMemo(() => {
    return new Map(
      modelItems.map((item) => {
        return [item.id, item.icon] as const;
      })
    );
  }, [modelItems]);

  const isPlanItem = (itemId: string) => {
    return isShape2dIcon(iconByItemId.get(itemId));
  };

  const visibleNodes = useMemo(() => {
    return items.filter((viewItem) => {
      const planItem = isPlanItem(viewItem.id);

      return isTwoD ? planItem : !planItem;
    });
  }, [isTwoD, items, iconByItemId]);

  const visibleConnectors = useMemo(() => {
    // Schematic 2Dv2 never draws cables — its PiP borrows Plan connectors.
    if (isTwoDV2) return [];

    // v3 owns plan cables the same way classic 2D does; each tab only ever
    // draws the connectors of its own view, so there is no cross-talk.
    const planCanvas = isClassic2d || isTwoDV3;

    return connectors.filter((connector) => {
      const itemIds = getConnectorItemIds(connector);

      if (itemIds.length === 0) {
        return planCanvas;
      }

      const allPlan = itemIds.every(isPlanItem);
      const anyPlan = itemIds.some(isPlanItem);

      if (planCanvas) {
        return allPlan;
      }

      return !anyPlan;
    });
  }, [connectors, isTwoDV2, isTwoDV3, isClassic2d, iconByItemId]);

  return (
    <Box
      ref={containerRef}
      id="isoflow-canvas-container"
      data-isoflow-canvas=""
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        bgcolor: (theme) => {
          const override = diagramBackgroundColor ?? backgroundColor;
          if (override) return override;
          if (isTwoD && canvasTheme === 'dark') return DIAGRAM_BG_2D_DARK;
          if (isTwoD) {
            // Slightly cooler schematic wash for 2Dv2
            return isTwoDV2 ? '#eef3f8' : DIAGRAM_BG_2D_LIGHT;
          }
          return theme.customVars.customPalette.diagramBg;
        }
      }}
    >
      {/* Plan 2D: grid under nodes so enlarge (header click) is not covered by lines. */}
      {isTwoD && isShowGrid && (
        <Box
          sx={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            top: 0,
            left: 0,
            zIndex: 0,
            pointerEvents: 'none'
          }}
        >
          <Grid />
        </Box>
      )}
      {!isTwoD && (
        <SceneViewport>
          <SceneLayer>
            <Rectangles rectangles={rectangles} />
          </SceneLayer>
          <SceneLayer>
            <Connectors connectors={visibleConnectors} />
          </SceneLayer>
          <SceneLayer>
            <ConnectorLabels connectors={visibleConnectors} />
          </SceneLayer>
          <SceneLayer>
            <TextBoxes textBoxes={textBoxes} />
          </SceneLayer>
          <SceneLayer order={11} sx={{ pointerEvents: 'none' }}>
            <Nodes nodes={visibleNodes} />
          </SceneLayer>
        </SceneViewport>
      )}
      {isTwoD && (
        <SceneViewport>
          <SceneLayer order={0} sx={{ pointerEvents: 'none' }}>
            <Rectangles rectangles={rectangles} />
          </SceneLayer>
          <SceneLayer order={2}>
            <TextBoxes textBoxes={textBoxes} />
          </SceneLayer>
          <SceneLayer
            order={1}
            sx={
              isTwoDV2
                ? {
                    filter: 'saturate(0.92) contrast(1.04)'
                  }
                : undefined
            }
          >
            <Nodes nodes={visibleNodes} />
          </SceneLayer>
          <SceneLayer order={3} sx={{ pointerEvents: 'none' }}>
            <MarqueeSelection />
          </SceneLayer>
          {(isClassic2d || isTwoDV3) && (
            <SceneLayer order={2} sx={{ pointerEvents: 'none' }}>
              <Connectors connectors={visibleConnectors} />
            </SceneLayer>
          )}
          {isTwoDV3 && (
            <SceneLayer order={5} sx={{ pointerEvents: 'none' }}>
              <ConnectorV3Preview />
              <V3DensityGroupsOverlay />
            </SceneLayer>
          )}
          {isClassic2d && (
            <SceneLayer order={4} sx={{ pointerEvents: 'none' }}>
              <WaypointGuides />
            </SceneLayer>
          )}
        </SceneViewport>
      )}
      {/* Isometric keeps grid overlay on top of the diamond floor. */}
      {!isTwoD && (
        <Box
          sx={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            top: 0,
            left: 0
          }}
        >
          {isShowGrid && <Grid />}
        </Box>
      )}
      {mode.showCursor && mode.type !== 'CURSOR' && (
        <SceneLayer omitTransform={false}>
          <Cursor />
        </SceneLayer>
      )}
      {/* Must stay on top so mouse events reach interaction manager */}
      <Box
        ref={interactionsRef}
        className="isoflow-interaction-layer"
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          zIndex: 10
        }}
      />
      {/* Above interaction overlay — own transform (outside SceneViewport) */}
      {!isTwoD && (
        <SceneLayer
          omitTransform={false}
          order={12}
          sx={{ pointerEvents: 'none' }}
        >
          <IsoNodeLabels nodes={visibleNodes} />
          {/* Must sit above the interaction layer or resize handles never receive clicks. */}
          <TransformControlsManager />
        </SceneLayer>
      )}
      {isTwoD && (
        <SceneLayer omitTransform={false} order={12} sx={{ pointerEvents: 'none' }}>
          <NodeDescriptionLabels nodes={visibleNodes} />
        </SceneLayer>
      )}
      {isClassic2d && (
        <SceneLayer omitTransform={false} order={11} sx={{ pointerEvents: 'none' }}>
          <ConnectorStackBadges />
          <MultiSelectMoveHandle />
          <TransformControlsManager />
        </SceneLayer>
      )}
      {isTwoDV2 && (
        <SceneLayer omitTransform={false} order={11} sx={{ pointerEvents: 'none' }}>
          <MultiSelectMoveHandle />
          <TransformControlsManager />
        </SceneLayer>
      )}
      {isTwoDV3 && (
        <SceneLayer omitTransform={false} order={11} sx={{ pointerEvents: 'none' }}>
          <MultiSelectMoveHandle />
          <TransformControlsManager />
        </SceneLayer>
      )}
    </Box>
  );
};
