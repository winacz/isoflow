import React, { useEffect, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useInteractionManager } from 'src/interaction/useInteractionManager';
import { Grid } from 'src/components/Grid/Grid';
import { Cursor } from 'src/components/Cursor/Cursor';
import { Nodes } from 'src/components/SceneLayers/Nodes/Nodes';
import { Rectangles } from 'src/components/SceneLayers/Rectangles/Rectangles';
import { Connectors } from 'src/components/SceneLayers/Connectors/Connectors';
import { ConnectorStackBadges } from 'src/components/SceneLayers/Connectors/ConnectorStackBadges';
import { ConnectorLabels } from 'src/components/SceneLayers/ConnectorLabels/ConnectorLabels';
import { TextBoxes } from 'src/components/SceneLayers/TextBoxes/TextBoxes';
import { SizeIndicator } from 'src/components/DebugUtils/SizeIndicator';
import { SceneLayer } from 'src/components/SceneLayer/SceneLayer';
import { TransformControlsManager } from 'src/components/TransformControlsManager/TransformControlsManager';
import { useScene } from 'src/hooks/useScene';
import { RendererProps } from 'src/types/rendererProps';
import { isShape2dIcon } from 'src/config';
import { Connector as ConnectorModel } from 'src/types';
import { MarqueeSelection } from 'src/components/MarqueeSelection/MarqueeSelection';

const DIAGRAM_BG_2D = '#f6faff';

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
  const enableDebugTools = useUiStateStore((state) => {
    return state.enableDebugTools;
  });
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
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

  const isShowGrid = useMemo(() => {
    return showGrid === undefined || showGrid;
  }, [showGrid]);

  const isTwoD = projectionMode === 'TWO_D';

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
    return connectors.filter((connector) => {
      const itemIds = getConnectorItemIds(connector);

      if (itemIds.length === 0) {
        // In-progress connector with only tile anchors — show in active view only
        return isTwoD;
      }

      const allPlan = itemIds.every(isPlanItem);
      const anyPlan = itemIds.some(isPlanItem);

      if (isTwoD) {
        return allPlan;
      }

      return !anyPlan;
    });
  }, [connectors, isTwoD, iconByItemId]);

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        bgcolor: (theme) => {
          if (isTwoD) return backgroundColor ?? DIAGRAM_BG_2D;

          return backgroundColor ?? theme.customVars.customPalette.diagramBg;
        }
      }}
    >
      {!isTwoD && (
        <SceneLayer>
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
      {mode.showCursor && (
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
          {enableDebugTools && (
            <SceneLayer>
              <SizeIndicator />
            </SceneLayer>
          )}
        </>
      )}
      <SceneLayer>
        <Nodes nodes={visibleNodes} />
      </SceneLayer>
      {isTwoD && (
        <SceneLayer order={3} sx={{ pointerEvents: 'none' }}>
          <MarqueeSelection />
        </SceneLayer>
      )}
      {isTwoD && (
        <SceneLayer order={2} sx={{ pointerEvents: 'none' }}>
          <Connectors connectors={visibleConnectors} />
        </SceneLayer>
      )}
      {!isTwoD && (
        <SceneLayer>
          <TransformControlsManager />
        </SceneLayer>
      )}
      {/* Must stay on top so mouse events reach interaction manager */}
      <Box
        ref={interactionsRef}
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          zIndex: 10
        }}
      />
      {/* Above interaction overlay so badge hover/click work */}
      {isTwoD && (
        <SceneLayer order={11} sx={{ pointerEvents: 'none' }}>
          <ConnectorStackBadges />
        </SceneLayer>
      )}
    </Box>
  );
};
