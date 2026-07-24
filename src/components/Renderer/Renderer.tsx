import React, { useEffect, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useInteractionManager } from 'src/interaction/useInteractionManager';
import { Grid } from 'src/components/Grid/Grid';
import { Cursor } from 'src/components/Cursor/Cursor';
import { Nodes } from 'src/components/SceneLayers/Nodes/Nodes';
import { NodeDescriptionLabels } from 'src/components/SceneLayers/Nodes/NodeDescriptionLabels';
import { Rectangles } from 'src/components/SceneLayers/Rectangles/Rectangles';
import { Connectors } from 'src/components/SceneLayers/Connectors/Connectors';
import { ConnectorStackBadges } from 'src/components/SceneLayers/Connectors/ConnectorStackBadges';
import { WaypointGuides } from 'src/components/SceneLayers/Connectors/WaypointGuides';
import { ConnectorLabels } from 'src/components/SceneLayers/ConnectorLabels/ConnectorLabels';
import { TextBoxes } from 'src/components/SceneLayers/TextBoxes/TextBoxes';
import { SceneLayer } from 'src/components/SceneLayer/SceneLayer';
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
    // Schematic 2Dv2 never draws cables (PiP uses Plan connectors instead).
    if (isTwoDV2) return [];

    return connectors.filter((connector) => {
      const itemIds = getConnectorItemIds(connector);

      if (itemIds.length === 0) {
        return isClassic2d;
      }

      const allPlan = itemIds.every(isPlanItem);
      const anyPlan = itemIds.some(isPlanItem);

      if (isClassic2d) {
        return allPlan;
      }

      return !anyPlan;
    });
  }, [connectors, isTwoDV2, isClassic2d, iconByItemId]);

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
      {!isTwoD && (
        <SceneLayer>
          <Rectangles rectangles={rectangles} />
        </SceneLayer>
      )}
      {isTwoD && (
        <SceneLayer order={0} sx={{ pointerEvents: 'none' }}>
          <Rectangles rectangles={rectangles} />
        </SceneLayer>
      )}
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
      {mode.showCursor && mode.type !== 'CURSOR' && (
        <SceneLayer>
          <Cursor />
        </SceneLayer>
      )}
      {!isTwoD && (
        <>
          <SceneLayer>
            <Connectors connectors={visibleConnectors} />
          </SceneLayer>
          <SceneLayer>
            <TextBoxes textBoxes={textBoxes} />
          </SceneLayer>
          <SceneLayer>
            <ConnectorLabels connectors={visibleConnectors} />
          </SceneLayer>
        </>
      )}
      <SceneLayer
        order={isTwoD ? 1 : 11}
        sx={
          !isTwoD
            ? { pointerEvents: 'none' }
            : isTwoDV2
              ? {
                  // Distinct schematic look: soft lift, no cable clutter.
                  filter: 'saturate(0.92) contrast(1.04)'
                }
              : undefined
        }
      >
        <Nodes nodes={visibleNodes} />
      </SceneLayer>
      {isTwoD && (
        <SceneLayer order={3} sx={{ pointerEvents: 'none' }}>
          <MarqueeSelection />
        </SceneLayer>
      )}
      {isClassic2d && (
        <SceneLayer order={2} sx={{ pointerEvents: 'none' }}>
          <Connectors connectors={visibleConnectors} />
        </SceneLayer>
      )}
      {isClassic2d && (
        <SceneLayer order={4} sx={{ pointerEvents: 'none' }}>
          <WaypointGuides />
        </SceneLayer>
      )}
      {!isTwoD && (
        <SceneLayer order={12} sx={{ pointerEvents: 'none' }}>
          <TransformControlsManager />
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
      {/* Above interaction overlay so description bubbles stay visible + draggable */}
      {isTwoD && (
        <SceneLayer order={12} sx={{ pointerEvents: 'none' }}>
          <NodeDescriptionLabels nodes={visibleNodes} />
        </SceneLayer>
      )}
      {/* Above interaction overlay so badge / rectangle handles work */}
      {isClassic2d && (
        <SceneLayer order={11} sx={{ pointerEvents: 'none' }}>
          <ConnectorStackBadges />
          <TransformControlsManager />
        </SceneLayer>
      )}
      {isTwoDV2 && (
        <SceneLayer order={11} sx={{ pointerEvents: 'none' }}>
          <TransformControlsManager />
        </SceneLayer>
      )}
    </Box>
  );
};
