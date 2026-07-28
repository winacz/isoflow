import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useScene } from 'src/hooks/useScene';
import { SceneLayer } from 'src/components/SceneLayer/SceneLayer';
import { DeviceShape2d } from 'src/components/Shapes2d/DeviceShape2d';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import {
  TILE_SIZE_2D,
  getModelItemSize,
  getShape2dSize,
  getModelItemPorts
} from 'src/config';
import {
  getShape2dCenterPosition,
  screenToTile2dContinuous,
  isPlanProjection,
  connectorPathTileToGlobal,
  buildConnectorSvgPathD
} from 'src/utils';
import { ModelItem } from 'src/types';

/** Loupe diameter on screen (px) — stays roughly constant while zooming. */
const LOUPE_SCREEN_PX = 248;
/** Magnification inside the glass at zoom=1 (screen-constant after SceneLayer). */
const LOUPE_MAG = 0.55;
/** Fade-out when leaving ports (ms). */
const LOUPE_FADE_OUT_MS = 320;
/** Fade-in when appearing (ms). */
const LOUPE_FADE_IN_MS = 180;
/** Dwell before the loupe appears on first hover (ms). */
const LOUPE_SHOW_DELAY_MS = 700;
/** Light cursor follow smoothing (ms). Low = stuck to the pointer. */
const LOUPE_CURSOR_TAU_MS = 45;

type SceneConnector = ReturnType<typeof useScene>['connectors'][number];

type LoupeDevice = {
  itemId: string;
  portId: string;
  modelItem: ModelItem;
  deviceCenter: { x: number; y: number };
  diameter: number;
};

type LoupeContent = {
  itemId: string;
  portId: string;
  modelItem: ModelItem;
  deviceCenter: { x: number; y: number };
  diameter: number;
};

/** Lightweight cable strokes for the loupe (Connector2d is too heavy / often hidden under chassis). */
const LoupeCableLayer = ({
  connectors,
  itemId,
  portId,
  deviceCenter
}: {
  connectors: SceneConnector[];
  itemId: string;
  portId: string;
  deviceCenter: { x: number; y: number };
}) => {
  return (
    <Box
      sx={{
        position: 'absolute',
        left: -deviceCenter.x,
        top: -deviceCenter.y,
        width: 0,
        height: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 6
      }}
    >
      {connectors.map((connector) => {
        const pathTiles = connector.path?.tiles ?? [];
        if (pathTiles.length < 2) return null;

        const pathFrom = connector.path.rectangle.from;
        const globalTiles = pathTiles.map((tile) => {
          return connectorPathTileToGlobal(tile, pathFrom);
        });
        const points = globalTiles.map((tile) => {
          return { x: tile.x + 0.5, y: tile.y + 0.5 };
        });
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const widthTiles = Math.max(1, maxX - minX);
        const heightTiles = Math.max(1, maxY - minY);
        const pathD = buildConnectorSvgPathD({
          points,
          jumps: [],
          minX,
          minY,
          tileSize: TILE_SIZE_2D
        });
        if (!pathD) return null;

        const onHoveredPort = connector.anchors.some((anchor) => {
          return anchor.ref.item === itemId && anchor.ref.port === portId;
        });
        const core = onHoveredPort ? 5.5 : 4;
        const outline = core + 2.5;

        return (
          <Box
            key={connector.id}
            component="svg"
            width={widthTiles * TILE_SIZE_2D}
            height={heightTiles * TILE_SIZE_2D}
            sx={{
              position: 'absolute',
              left: minX * TILE_SIZE_2D,
              top: minY * TILE_SIZE_2D,
              overflow: 'visible',
              display: 'block'
            }}
          >
            <path
              d={pathD}
              fill="none"
              stroke="#ffffff"
              strokeWidth={outline}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.95}
            />
            <path
              d={pathD}
              fill="none"
              stroke={onHoveredPort ? '#2563eb' : '#0a0a0a'}
              strokeWidth={core}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={1}
            />
          </Box>
        );
      })}
    </Box>
  );
};

/** Continuous tile → scene-layer pixel (top-left origin of tile 0,0). */
const continuousTileToWorld = (tile: { x: number; y: number }) => {
  return {
    x: tile.x * TILE_SIZE_2D,
    y: tile.y * TILE_SIZE_2D
  };
};

function applyLoupeDom(
  loupeEl: HTMLDivElement | null,
  contentEl: HTMLDivElement | null,
  cursor: { x: number; y: number },
  deviceCenter: { x: number; y: number },
  diameter: number
) {
  if (!loupeEl) return;
  const radius = diameter / 2;
  loupeEl.style.width = `${diameter}px`;
  loupeEl.style.height = `${diameter}px`;
  loupeEl.style.transform = `translate(${cursor.x - radius}px, ${cursor.y - radius}px)`;
  if (contentEl) {
    // World point under the cursor stays at loupe center (true magnifier).
    contentEl.style.transform = `translate(${-(cursor.x - deviceCenter.x)}px, ${-(cursor.y - deviceCenter.y)}px)`;
  }
}

/**
 * Circular magnifying-glass that follows the cursor while a port is hovered.
 * Magnifies the device under the pointer so port-to-port motion stays smooth.
 */
export const PortLoupeOverlay = () => {
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });
  const scroll = useUiStateStore((state) => {
    return state.scroll;
  });
  const mouse = useUiStateStore((state) => {
    return state.mouse;
  });
  const hover = useUiStateStore((state) => {
    return state.shape2dPortHover;
  });
  const rendererEl = useUiStateStore((state) => {
    return state.rendererEl;
  });
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const { items, connectors } = useScene();
  const modelItems = useModelStore((state) => {
    return state.items;
  });

  const device = useMemo((): LoupeDevice | null => {
    if (!hover) return null;
    if (!isPlanProjection(projectionMode) || projectionMode === 'TWO_D_V2') {
      return null;
    }

    const viewItem = items.find((item) => {
      return item.id === hover.itemId;
    });
    const modelItem = modelItems.find((item) => {
      return item.id === hover.itemId;
    });
    if (!viewItem || !modelItem?.icon) return null;

    const ports = getModelItemPorts(modelItem);
    const port = ports.find((p) => {
      return p.id === hover.portId;
    });
    if (!port) return null;

    const size =
      getModelItemSize(modelItem) ??
      getShape2dSize(modelItem.icon) ?? { width: 1, height: 1 };
    const deviceCenter = getShape2dCenterPosition(viewItem.tile, size);
    const diameter = LOUPE_SCREEN_PX / Math.max(0.15, zoom);

    return {
      itemId: hover.itemId,
      portId: port.id,
      modelItem,
      deviceCenter,
      diameter
    };
  }, [hover, items, modelItems, projectionMode, zoom]);

  const relatedConnectors = useMemo(() => {
    if (!device) return [];
    return connectors.filter((connector) => {
      return connector.anchors.some((anchor) => {
        return anchor.ref.item === device.itemId;
      });
    });
  }, [connectors, device]);

  const cursorWorld = useMemo(() => {
    if (!rendererSize.width || !rendererSize.height) return null;
    const tile = screenToTile2dContinuous({
      mouse: mouse.position.screen,
      zoom,
      scroll,
      rendererSize
    });
    return continuousTileToWorld(tile);
  }, [
    mouse.position.screen.x,
    mouse.position.screen.y,
    zoom,
    scroll.position.x,
    scroll.position.y,
    rendererSize.width,
    rendererSize.height
  ]);

  const [content, setContent] = useState<LoupeContent | null>(null);
  const [visible, setVisible] = useState(false);

  const loupeRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const focusRef = useRef<{ x: number; y: number } | null>(null);
  const cursorTargetRef = useRef<{ x: number; y: number } | null>(null);
  const deviceCenterRef = useRef<{ x: number; y: number } | null>(null);
  const diameterRef = useRef(LOUPE_SCREEN_PX);
  const latestDeviceRef = useRef<LoupeDevice | null>(null);
  const latestCursorRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFrameRef = useRef<number | null>(null);

  latestDeviceRef.current = device;
  latestCursorRef.current = cursorWorld;

  const stopRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
  };

  const clearShowDelay = () => {
    if (showDelayTimerRef.current) {
      clearTimeout(showDelayTimerRef.current);
      showDelayTimerRef.current = null;
    }
  };

  const tick = (ts: number) => {
    const focus = focusRef.current;
    const target = cursorTargetRef.current;
    const deviceCenter = deviceCenterRef.current;
    if (!focus || !target || !deviceCenter) {
      rafRef.current = null;
      return;
    }

    const prev = lastTsRef.current ?? ts;
    lastTsRef.current = ts;
    const dt = Math.min(48, Math.max(0, ts - prev));
    const alpha = 1 - Math.exp(-dt / LOUPE_CURSOR_TAU_MS);

    focus.x += (target.x - focus.x) * alpha;
    focus.y += (target.y - focus.y) * alpha;

    applyLoupeDom(
      loupeRef.current,
      contentRef.current,
      focus,
      deviceCenter,
      diameterRef.current
    );

    const dist = Math.hypot(target.x - focus.x, target.y - focus.y);
    if (dist > 0.2) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      focus.x = target.x;
      focus.y = target.y;
      applyLoupeDom(
        loupeRef.current,
        contentRef.current,
        focus,
        deviceCenter,
        diameterRef.current
      );
      rafRef.current = null;
      lastTsRef.current = null;
    }
  };

  const ensureRaf = () => {
    if (rafRef.current == null) {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  const revealLoupe = (dev: LoupeDevice, cursor: { x: number; y: number }) => {
    deviceCenterRef.current = { ...dev.deviceCenter };
    diameterRef.current = dev.diameter;
    cursorTargetRef.current = { ...cursor };
    focusRef.current = { ...cursor };

    setContent({
      itemId: dev.itemId,
      portId: dev.portId,
      modelItem: dev.modelItem,
      deviceCenter: { ...dev.deviceCenter },
      diameter: dev.diameter
    });

    applyLoupeDom(
      loupeRef.current,
      contentRef.current,
      focusRef.current,
      deviceCenterRef.current,
      diameterRef.current
    );
    stopRaf();

    if (showFrameRef.current) {
      cancelAnimationFrame(showFrameRef.current);
      showFrameRef.current = null;
    }
    showFrameRef.current = requestAnimationFrame(() => {
      showFrameRef.current = requestAnimationFrame(() => {
        setVisible(true);
        showFrameRef.current = null;
        if (focusRef.current && deviceCenterRef.current) {
          applyLoupeDom(
            loupeRef.current,
            contentRef.current,
            focusRef.current,
            deviceCenterRef.current,
            diameterRef.current
          );
        }
      });
    });
  };

  // Show / hide with dwell delay.
  useEffect(() => {
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    if (!device) {
      clearShowDelay();
      setVisible(false);
      cursorTargetRef.current = null;
      fadeTimerRef.current = setTimeout(() => {
        stopRaf();
        focusRef.current = null;
        deviceCenterRef.current = null;
        setContent(null);
        fadeTimerRef.current = null;
      }, LOUPE_FADE_OUT_MS);
      return () => {
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      };
    }

    deviceCenterRef.current = { ...device.deviceCenter };
    diameterRef.current = device.diameter;

    if (content) {
      clearShowDelay();
      setContent((prev) => {
        if (
          prev &&
          prev.itemId === device.itemId &&
          prev.portId === device.portId &&
          prev.diameter === device.diameter &&
          prev.modelItem === device.modelItem &&
          prev.deviceCenter.x === device.deviceCenter.x &&
          prev.deviceCenter.y === device.deviceCenter.y
        ) {
          return prev;
        }
        return {
          itemId: device.itemId,
          portId: device.portId,
          modelItem: device.modelItem,
          deviceCenter: { ...device.deviceCenter },
          diameter: device.diameter
        };
      });
      setVisible(true);
      return;
    }

    if (!showDelayTimerRef.current) {
      showDelayTimerRef.current = setTimeout(() => {
        showDelayTimerRef.current = null;
        const latest = latestDeviceRef.current;
        const cursor = latestCursorRef.current;
        if (!latest || !cursor) return;
        revealLoupe(latest, cursor);
      }, LOUPE_SHOW_DELAY_MS);
    }

    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dwell + device identity
  }, [
    device?.itemId,
    device?.portId,
    device?.diameter,
    device?.modelItem,
    device?.deviceCenter.x,
    device?.deviceCenter.y,
    Boolean(device),
    content
  ]);

  // Stick loupe to cursor while visible.
  useEffect(() => {
    if (!content || !cursorWorld || !deviceCenterRef.current) return;
    cursorTargetRef.current = { ...cursorWorld };
    if (!focusRef.current) {
      focusRef.current = { ...cursorWorld };
      applyLoupeDom(
        loupeRef.current,
        contentRef.current,
        focusRef.current,
        deviceCenterRef.current,
        diameterRef.current
      );
      return;
    }
    ensureRaf();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rAF follow
  }, [content, cursorWorld?.x, cursorWorld?.y]);

  useEffect(() => {
    return () => {
      stopRaf();
      clearShowDelay();
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      if (showFrameRef.current) cancelAnimationFrame(showFrameRef.current);
    };
  }, []);

  if (!content) return null;

  const { modelItem, portId, deviceCenter, diameter } = content;
  const fadeMs = visible ? LOUPE_FADE_IN_MS : LOUPE_FADE_OUT_MS;
  // Compensate SceneLayer zoom so loupe magnification stays constant on screen.
  const contentScale = LOUPE_MAG / Math.max(0.15, zoom);
  const loupeConnectors = relatedConnectors.filter((connector) => {
    return connector.anchors.some((anchor) => {
      return anchor.ref.item === content.itemId;
    });
  });

  const setLoupeEl = (el: HTMLDivElement | null) => {
    loupeRef.current = el;
    if (el && focusRef.current && deviceCenterRef.current) {
      applyLoupeDom(
        el,
        contentRef.current,
        focusRef.current,
        deviceCenterRef.current,
        diameterRef.current
      );
    }
  };

  const setContentEl = (el: HTMLDivElement | null) => {
    contentRef.current = el;
    if (el && focusRef.current && deviceCenterRef.current) {
      applyLoupeDom(
        loupeRef.current,
        el,
        focusRef.current,
        deviceCenterRef.current,
        diameterRef.current
      );
    }
  };

  return (
    <SceneLayer order={55} disableAnimation>
      <Box
        ref={setLoupeEl}
        aria-hidden
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: diameter,
          height: diameter,
          borderRadius: '50%',
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 20,
          boxSizing: 'border-box',
          willChange: 'transform, opacity',
          opacity: visible ? 1 : 0,
          transition: `opacity ${fadeMs}ms ease`,
          border: `${Math.max(2, 3 / zoom)}px solid rgba(248, 250, 252, 0.92)`,
          boxShadow: `
            0 0 0 ${Math.max(1, 1.5 / zoom)}px rgba(15, 23, 42, 0.35),
            0 ${8 / zoom}px ${28 / zoom}px rgba(15, 23, 42, 0.4),
            inset 0 ${2 / zoom}px ${10 / zoom}px rgba(255, 255, 255, 0.45),
            inset 0 ${-6 / zoom}px ${14 / zoom}px rgba(15, 23, 42, 0.18)
          `,
          background:
            'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.02) 42%, rgba(15,23,42,0.06) 100%)'
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            transform: visible ? 'scale(1)' : 'scale(0.92)',
            transition: `transform ${fadeMs}ms ease`,
            overflow: 'hidden'
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 0,
              height: 0
            }}
          >
            <Box
              sx={{
                transform: `scale(${contentScale})`,
                transformOrigin: '0 0'
              }}
            >
              <Box
                ref={setContentEl}
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  willChange: 'transform'
                }}
              >
                <Box sx={{ position: 'relative', zIndex: 1 }}>
                  <DeviceShape2d
                    itemId={modelItem.id}
                    shapeId={modelItem.icon!}
                    name={modelItem.name}
                    ports={modelItem.ports}
                    svis={modelItem.svis}
                    ip={modelItem.dhcp ? 'DHCP' : modelItem.ip}
                    nodeIcon={modelItem.nodeIcon}
                    description={modelItem.description}
                    color={modelItem.color}
                    poweredByPoe={Boolean(modelItem.poweredByPoe)}
                    showShadow={false}
                    centered
                    hoveredPortId={portId}
                  />
                </Box>
                {/* Cables above the chassis so stubs stay visible in the glass */}
                <LoupeCableLayer
                  connectors={loupeConnectors}
                  itemId={content.itemId}
                  portId={portId}
                  deviceCenter={deviceCenter}
                />
              </Box>
            </Box>
          </Box>

          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              pointerEvents: 'none',
              background:
                'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 38%)',
              boxShadow: `inset 0 0 0 ${Math.max(1, 1.5 / zoom)}px rgba(255,255,255,0.25)`
            }}
          />
        </Box>
      </Box>
    </SceneLayer>
  );
};
