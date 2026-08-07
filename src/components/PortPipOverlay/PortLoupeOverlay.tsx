import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useScene } from 'src/hooks/useScene';
import { SceneLayer } from 'src/components/SceneLayer/SceneLayer';
import { DeviceShape2d } from 'src/components/Shapes2d/DeviceShape2d';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { TILE_SIZE_2D, getModelItemSize, getShape2dSize } from 'src/config';
import {
  getShape2dCenterPosition,
  screenToTile2dContinuous,
  isPlanProjection,
  connectorPathTileToGlobal,
  buildConnectorSvgPathD,
  applyPortHoverInRoot
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
/** Dwell before the loupe appears on port hover (ms). */
const LOUPE_PORT_SHOW_DELAY_MS = 700;

/** Light cursor follow smoothing (ms). Low = stuck to the pointer. */
const LOUPE_CURSOR_TAU_MS = 45;

/**
 * When true, loupe highlights the hovered RJ45 / cable via imperative DOM
 * (no DeviceShape2d re-render — safe while sliding along port rows).
 */
const LOUPE_SHOW_PORT_HOVER = true;

type SceneConnector = ReturnType<typeof useScene>['connectors'][number];

type LoupeDevice = {
  itemId: string;
  modelItem: ModelItem;
  deviceCenter: { x: number; y: number };
  diameter: number;
};

type LoupeContent = {
  itemId: string;
  modelItem: ModelItem;
  deviceCenter: { x: number; y: number };
  diameter: number;
};

/** Lightweight cable strokes for the loupe (Connector2d is too heavy / often hidden under chassis). */
const LoupeCableLayer = React.memo(
  ({
    connectors,
    itemId,
    deviceCenter
  }: {
    connectors: SceneConnector[];
    itemId: string;
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
          const xs = points.map((point) => {
            return point.x;
          });
          const ys = points.map((point) => {
            return point.y;
          });
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

          // Port ids on THIS device — used by imperative hover (no React re-render).
          const localPortIds = connector.anchors
            .filter((anchor) => {
              return anchor.ref.item === itemId && Boolean(anchor.ref.port);
            })
            .map((anchor) => {
              return anchor.ref.port as string;
            })
            .join(' ');
          const core = 4;
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
                data-loupe-cable-outline
                d={pathD}
                fill="none"
                stroke="#ffffff"
                strokeWidth={outline}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={0.95}
              />
              <path
                data-loupe-cable-core
                data-loupe-cable-ports={localPortIds}
                d={pathD}
                fill="none"
                stroke="#0a0a0a"
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
  }
);
LoupeCableLayer.displayName = 'LoupeCableLayer';

/**
 * Port / cable hover inside the loupe — pure DOM, no React state.
 * Jack visuals come from applyPortHoverInRoot; cables are loupe-specific.
 */
function applyLoupePortHoverDom(
  root: HTMLElement | null,
  portId: string | null,
  prevJackRef: { current: HTMLElement | null }
) {
  applyPortHoverInRoot(root, portId, prevJackRef);

  if (root) {
    root.querySelectorAll('[data-loupe-cable-core]').forEach((node) => {
      const core = node as SVGPathElement;
      core.setAttribute('stroke', '#0a0a0a');
      core.setAttribute('stroke-width', '4');
      const outline = core.previousElementSibling as SVGPathElement | null;
      if (outline?.hasAttribute('data-loupe-cable-outline')) {
        outline.setAttribute('stroke-width', '6.5');
      }
    });
  }

  if (!root || !portId) return;

  root.querySelectorAll('[data-loupe-cable-core]').forEach((node) => {
    const core = node as SVGPathElement;
    const ports = (core.getAttribute('data-loupe-cable-ports') || '').split(
      /\s+/
    );
    if (!ports.includes(portId)) return;
    core.setAttribute('stroke', '#2563eb');
    core.setAttribute('stroke-width', '5.5');
    const outline = core.previousElementSibling as SVGPathElement | null;
    if (outline?.hasAttribute('data-loupe-cable-outline')) {
      outline.setAttribute('stroke-width', '8');
    }
  });
}

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
  diameter: number,
  zoom: number
) {
  if (!loupeEl) return;
  const radius = diameter / 2;
  const safeZoom = Math.max(0.01, zoom);
  const loupeStyle = loupeEl.style;
  loupeStyle.width = `${diameter}px`;
  loupeStyle.height = `${diameter}px`;
  // Cancel SceneLayer zoom on the glass so Chromium composites a layer no
  // larger than `diameter` px, rather than a multi-thousand-pixel texture at
  // low zoom. With transformOrigin at the top-left (set in sx below), the
  // composed transform maps local point P to `translate + scale * P` — so to
  // land the box's own centre (radius, radius) on the cursor we must offset
  // the translate by `radius / zoom`, not by `radius`.
  const tx = cursor.x - radius / safeZoom;
  const ty = cursor.y - radius / safeZoom;
  const invZoom = 1 / safeZoom;
  loupeStyle.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${invZoom})`;
  if (contentEl) {
    const offsetX = cursor.x - deviceCenter.x;
    const offsetY = cursor.y - deviceCenter.y;
    const contentStyle = contentEl.style;
    contentStyle.transform = `translate3d(${-offsetX}px, ${-offsetY}px, 0)`;
  }
}

/**
 * Circular magnifying-glass that follows the cursor while a port is hovered
 * OR when the cursor dwells on the body of a switch.
 * Magnifies the device under the pointer so port-to-port motion stays smooth.
 *
 * Performance note: cursor tracking uses zustand.subscribe + refs to avoid
 * triggering React re-renders of DeviceShape2d on every mouse-move frame.
 */
export const PortLoupeOverlay = () => {
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });
  // Only the hovered ITEM drives loupe React state. Port-id changes are
  // applied imperatively (see applyLoupePortHoverDom) so DeviceShape2d does
  // not re-render while sliding along a port row.
  const hoverItemId = useUiStateStore((state) => {
    return state.shape2dPortHover?.itemId ?? null;
  });
  const showLoupe = useUiStateStore((state) => {
    return state.showLoupe;
  });
  const rendererEl = useUiStateStore((state) => {
    return state.rendererEl;
  });
  const uiStoreApi = useUiStateStoreApi();
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const rendererSizeRef = useRef(rendererSize);
  useEffect(() => {
    rendererSizeRef.current = rendererSize;
  }, [rendererSize]);
  const { items, connectors } = useScene();
  const modelItems = useModelStore((state) => {
    return state.items;
  });

  /** Compute the loupe device from a port/body hover (item only). */
  const deviceFromPortHover = useMemo((): LoupeDevice | null => {
    if (!showLoupe || !hoverItemId) return null;
    if (!isPlanProjection(projectionMode) || projectionMode === 'TWO_D_V2') {
      return null;
    }

    // Ukryj lupę przy przybliżeniu 30% i większym
    if (zoom >= 0.3) {
      return null;
    }

    const viewItem = items.find((item) => {
      return item.id === hoverItemId;
    });
    const modelItem = modelItems.find((item) => {
      return item.id === hoverItemId;
    });
    if (!viewItem || !modelItem?.icon) return null;

    const size = getModelItemSize(modelItem) ??
      getShape2dSize(modelItem.icon) ?? { width: 1, height: 1 };
    const deviceCenter = getShape2dCenterPosition(viewItem.tile, size);

    // Oblicz rozmiar lupy na ekranie.
    // Od 30% w górę: ukryta. Poniżej 30% zaczyna od 248px.
    // Osiąga maksymalny rozmiar przy 20% (ok. 400px).
    let targetPx = 248;
    const MAX_LOUPE_PX = 400;
    if (zoom <= 0.2) {
      targetPx = MAX_LOUPE_PX;
    } else if (zoom < 0.3) {
      const linearRatio = (0.3 - zoom) / (0.3 - 0.2);
      // Nieliniowy przyrost (quartic ease-in): na początku rośnie jeszcze wolniej.
      const ratio = linearRatio ** 4;
      targetPx = 248 + ratio * (MAX_LOUPE_PX - 248);
    }

    return {
      itemId: viewItem.id,
      modelItem,
      deviceCenter,
      diameter: targetPx
    };
  }, [hoverItemId, items, modelItems, projectionMode, zoom, showLoupe]);

  const device = deviceFromPortHover;
  const hasDevice = Boolean(device);

  const relatedConnectors = useMemo(() => {
    if (!device) return [];
    return connectors.filter((connector) => {
      return connector.anchors.some((anchor) => {
        return anchor.ref.item === device.itemId;
      });
    });
  }, [connectors, device]);

  const cursorWorldRef = useRef<{ x: number; y: number } | null>(null);

  const [content, setContent] = useState<LoupeContent | null>(null);
  const [visible, setVisible] = useState(false);

  const loupeRef = useRef<HTMLDivElement | null>(null);
  const contentElRef = useRef<HTMLDivElement | null>(null);
  const focusRef = useRef<{ x: number; y: number } | null>(null);
  const cursorTargetRef = useRef<{ x: number; y: number } | null>(null);
  const deviceCenterRef = useRef<{ x: number; y: number } | null>(null);
  const diameterRef = useRef(LOUPE_SCREEN_PX);
  const zoomRef = useRef(zoom);
  const latestDeviceRef = useRef<LoupeDevice | null>(null);
  const contentItemIdRef = useRef<string | null>(null);
  const hoveredJackRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFrameRef = useRef<number | null>(null);

  latestDeviceRef.current = device;
  zoomRef.current = zoom;
  contentItemIdRef.current = content?.itemId ?? null;

  const syncLoupePortHover = () => {
    if (!LOUPE_SHOW_PORT_HOVER) {
      applyLoupePortHoverDom(contentElRef.current, null, hoveredJackRef);
      return;
    }
    const hover = uiStoreApi.getState().shape2dPortHover;
    const itemId = contentItemIdRef.current;
    const portId =
      hover && itemId && hover.itemId === itemId ? hover.portId : null;
    applyLoupePortHoverDom(contentElRef.current, portId, hoveredJackRef);
  };

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
      contentElRef.current,
      focus,
      deviceCenter,
      diameterRef.current,
      zoomRef.current
    );

    const dist = Math.hypot(target.x - focus.x, target.y - focus.y);
    if (dist > 0.2) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      focus.x = target.x;
      focus.y = target.y;
      applyLoupeDom(
        loupeRef.current,
        contentElRef.current,
        focus,
        deviceCenter,
        diameterRef.current,
        zoomRef.current
      );
      rafRef.current = null;
      lastTsRef.current = null;
    }
  };

  const ensureRafImperative = () => {
    if (rafRef.current == null) {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  // Track the cursor imperatively so pointer movement never re-renders the
  // loupe's DeviceShape2d subtree.
  useEffect(() => {
    const unsubscribe = uiStoreApi.subscribe((state) => {
      const { mouse, zoom: z, scroll: s } = state;
      const rSize = rendererSizeRef.current;
      if (!rSize || !rSize.width || !rSize.height) return;

      const tile = screenToTile2dContinuous({
        mouse: mouse.position.screen,
        zoom: z,
        scroll: s,
        rendererSize: rSize
      });
      const world = continuousTileToWorld(tile);
      cursorWorldRef.current = world;

      if (contentElRef.current && deviceCenterRef.current && focusRef.current) {
        cursorTargetRef.current = { ...world };
        ensureRafImperative();
      } else if (deviceCenterRef.current && !focusRef.current) {
        cursorTargetRef.current = { ...world };
        focusRef.current = { ...world };
        applyLoupeDom(
          loupeRef.current,
          contentElRef.current,
          focusRef.current,
          deviceCenterRef.current,
          diameterRef.current,
          zoomRef.current
        );
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable refs
  }, [uiStoreApi]);

  // Port hover highlight — subscribe without React state so sliding along
  // ports never re-renders DeviceShape2d / LoupeCableLayer.
  useEffect(() => {
    if (!LOUPE_SHOW_PORT_HOVER) {
      applyLoupePortHoverDom(contentElRef.current, null, hoveredJackRef);
      return undefined;
    }
    let prevPortKey = '';
    const onStore = () => {
      const hover = uiStoreApi.getState().shape2dPortHover;
      const itemId = contentItemIdRef.current;
      const portId =
        hover && itemId && hover.itemId === itemId ? hover.portId : null;
      const key = `${itemId ?? ''}:${portId ?? ''}`;
      if (key === prevPortKey) return;
      prevPortKey = key;
      applyLoupePortHoverDom(contentElRef.current, portId, hoveredJackRef);
    };
    onStore();
    return uiStoreApi.subscribe(onStore);
  }, [uiStoreApi]);

  const revealLoupe = (dev: LoupeDevice, cursor: { x: number; y: number }) => {
    deviceCenterRef.current = { ...dev.deviceCenter };
    diameterRef.current = dev.diameter;
    cursorTargetRef.current = { ...cursor };
    focusRef.current = { ...cursor };

    setContent({
      itemId: dev.itemId,
      modelItem: dev.modelItem,
      deviceCenter: { ...dev.deviceCenter },
      diameter: dev.diameter
    });

    applyLoupeDom(
      loupeRef.current,
      contentElRef.current,
      focusRef.current,
      deviceCenterRef.current,
      diameterRef.current,
      zoomRef.current
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
            contentElRef.current,
            focusRef.current,
            deviceCenterRef.current,
            diameterRef.current,
            zoomRef.current
          );
        }
        syncLoupePortHover();
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
      applyLoupePortHoverDom(contentElRef.current, null, hoveredJackRef);
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
          prev.diameter === device.diameter &&
          prev.modelItem === device.modelItem &&
          prev.deviceCenter.x === device.deviceCenter.x &&
          prev.deviceCenter.y === device.deviceCenter.y
        ) {
          return prev;
        }
        return {
          itemId: device.itemId,
          modelItem: device.modelItem,
          deviceCenter: { ...device.deviceCenter },
          diameter: device.diameter
        };
      });
      setVisible(true);
      return;
    }

    const delayMs = LOUPE_PORT_SHOW_DELAY_MS;

    if (!showDelayTimerRef.current) {
      showDelayTimerRef.current = setTimeout(() => {
        showDelayTimerRef.current = null;
        const latest = latestDeviceRef.current;
        const cursor = cursorWorldRef.current;
        if (!latest || !cursor) return;
        revealLoupe(latest, cursor);
      }, delayMs);
    }

    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dwell + device identity
  }, [
    device?.itemId,
    device?.diameter,
    device?.modelItem,
    device?.deviceCenter.x,
    device?.deviceCenter.y,
    hasDevice,
    content
  ]);

  useEffect(() => {
    return () => {
      stopRaf();
      clearShowDelay();

      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      if (showFrameRef.current) cancelAnimationFrame(showFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!content) return null;

  const { modelItem, deviceCenter, diameter } = content;
  const fadeMs = visible ? LOUPE_FADE_IN_MS : LOUPE_FADE_OUT_MS;
  // The glass cancels SceneLayer zoom, so this is already screen-constant.
  const contentScale = LOUPE_MAG;
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
        contentElRef.current,
        focusRef.current,
        deviceCenterRef.current,
        diameterRef.current,
        zoomRef.current
      );
    }
  };

  const setContentEl = (el: HTMLDivElement | null) => {
    contentElRef.current = el;
    if (el && focusRef.current && deviceCenterRef.current) {
      applyLoupeDom(
        loupeRef.current,
        el,
        focusRef.current,
        deviceCenterRef.current,
        diameterRef.current,
        zoomRef.current
      );
    }
    // Content just mounted — apply current port hover without a React update.
    syncLoupePortHover();
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
          // Must match the translate/scale math in applyLoupeDom — with the
          // default centre origin, scale() would shift the box off-cursor.
          transformOrigin: '0 0',
          willChange: 'transform, opacity',
          opacity: visible ? 1 : 0,
          transition: `opacity ${fadeMs}ms ease`,
          border: '3px solid rgba(248, 250, 252, 0.92)',
          boxShadow: `
            0 0 0 1.5px rgba(15, 23, 42, 0.35),
            0 8px 28px rgba(15, 23, 42, 0.4),
            inset 0 2px 10px rgba(255, 255, 255, 0.45),
            inset 0 -6px 14px rgba(15, 23, 42, 0.18)
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
                    hoveredPortId={null}
                  />
                </Box>
                {/* Cables above the chassis so stubs stay visible in the glass */}
                <LoupeCableLayer
                  connectors={loupeConnectors}
                  itemId={content.itemId}
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
              boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.25)'
            }}
          />
        </Box>
      </Box>
    </SceneLayer>
  );
};
