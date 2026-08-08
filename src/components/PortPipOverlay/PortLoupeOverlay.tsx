import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useScene } from 'src/hooks/useScene';
import { SceneLayer } from 'src/components/SceneLayer/SceneLayer';
import { DeviceShape2d } from 'src/components/Shapes2d/DeviceShape2d';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import {
  TILE_SIZE_2D,
  getModelItemSize,
  getShape2dSize,
  getShape2dPortIfaceName,
  getModelItemPorts
} from 'src/config';
import {
  getShape2dCenterPosition,
  screenToTile2dContinuous,
  isPlanProjection,
  connectorPathTileToGlobal,
  buildConnectorSvgPathD,
  applyPortHoverInRoot,
  getConnectorRelationSummary,
  TRUNK_RAINBOW_COLORS,
  TRUNK_MISMATCH_COLOR,
  computeHighlightScale,
  getShape2dPortWorldTile,
  getShape2dPortAtPoint,
  setLoupeRevealLock,
  setLoupeGlassActive,
  isLoupeRevealLocked,
  isLoupeGlassActive
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
/** Dwell while the cursor is still over an RJ45 before the loupe appears (ms). */
const LOUPE_PORT_SHOW_DELAY_MS = 700;
/** Screen-px movement that cancels the pending show dwell (must "stand still"). */
const LOUPE_STILL_PX = 4;

/** After node hover + correct pan, one frame then show glass. */
const LOUPE_HOVER_SETTLE_MS = 50;
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
  /** Matches canvas node enlarge (loupe hover-first). */
  highlightScale: number;
};

const loupeHighlightScaleFor = (modelItem: ModelItem, zoom: number) => {
  const size =
    getModelItemSize(modelItem) ??
    (modelItem.icon ? getShape2dSize(modelItem.icon) : null);
  const areaTiles = size ? size.width * size.height : 0;
  return computeHighlightScale(areaTiles, zoom);
};

/** Resolve loupe stroke the same way Connector2d does (VLAN / trunk / mismatch). */
const getLoupeCableStroke = ({
  connector,
  modelItems,
  connectors,
  vlan1CableColor
}: {
  connector: SceneConnector;
  modelItems: ModelItem[];
  connectors: SceneConnector[];
  vlan1CableColor: string | null;
}): { color: string; isTrunk: boolean } => {
  const summary = getConnectorRelationSummary({
    anchors: connector.anchors,
    modelItems,
    connectors,
    connectorId: connector.id,
    resolvePortLabel: (itemId, portId) => {
      const modelItem = modelItems.find((item) => {
        return item.id === itemId;
      });
      return getShape2dPortIfaceName(modelItem?.icon ?? '', portId);
    }
  });

  if (summary.linkMode === 'mismatch') {
    return { color: TRUNK_MISMATCH_COLOR, isTrunk: false };
  }
  if (summary.linkMode === 'trunk') {
    return { color: TRUNK_RAINBOW_COLORS[0], isTrunk: true };
  }
  if (summary.vlanColor) {
    return { color: summary.vlanColor, isTrunk: false };
  }
  return { color: vlan1CableColor ?? '#0a0a0a', isTrunk: false };
};

/** Lightweight cable strokes for the loupe (Connector2d is too heavy / often hidden under chassis). */
const LoupeCableLayer = React.memo(
  ({
    connectors,
    allConnectors,
    itemId,
    deviceCenter,
    modelItems,
    vlan1CableColor
  }: {
    connectors: SceneConnector[];
    allConnectors: SceneConnector[];
    itemId: string;
    deviceCenter: { x: number; y: number };
    modelItems: ModelItem[];
    vlan1CableColor: string | null;
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
          const { color, isTrunk } = getLoupeCableStroke({
            connector,
            modelItems,
            connectors: allConnectors,
            vlan1CableColor
          });
          const rainbowGradId = `loupe-trunk-${connector.id}`;
          const stroke = isTrunk ? `url(#${rainbowGradId})` : color;
          const core = 4;
          const outline = core + 2.5;
          const svgW = widthTiles * TILE_SIZE_2D;
          const svgH = heightTiles * TILE_SIZE_2D;

          return (
            <Box
              key={connector.id}
              component="svg"
              width={svgW}
              height={svgH}
              sx={{
                position: 'absolute',
                left: minX * TILE_SIZE_2D,
                top: minY * TILE_SIZE_2D,
                overflow: 'visible',
                display: 'block'
              }}
            >
              {isTrunk && (
                <defs>
                  <linearGradient
                    id={rainbowGradId}
                    gradientUnits="userSpaceOnUse"
                    x1={0}
                    y1={0}
                    x2={Math.max(svgW, TILE_SIZE_2D)}
                    y2={Math.max(svgH, TILE_SIZE_2D)}
                  >
                    {TRUNK_RAINBOW_COLORS.map((stopColor, index) => {
                      return (
                        <stop
                          key={stopColor}
                          offset={`${(index / (TRUNK_RAINBOW_COLORS.length - 1)) * 100}%`}
                          stopColor={stopColor}
                        />
                      );
                    })}
                  </linearGradient>
                </defs>
              )}
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
                data-loupe-cable-color={stroke}
                d={pathD}
                fill="none"
                stroke={stroke}
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
      const base =
        core.getAttribute('data-loupe-cable-color') || '#0a0a0a';
      core.setAttribute('stroke', base);
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
    // Keep VLAN / trunk color — only thicken for hover emphasis.
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
 * Circular magnifying-glass that follows the cursor after the pointer dwells
 * still on an RJ45/SFP jack. Leaving the port (node body / empty canvas)
 * hides the loupe — glancing a port then stopping on the chassis does not.
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
  // Item alone is not enough — body sticky hover keeps itemId after leaving
  // a jack; loupe must require an actual port under the cursor.
  const hoverItemId = useUiStateStore((state) => {
    return state.shape2dPortHover?.portId
      ? state.shape2dPortHover.itemId
      : null;
  });
  const hoverPortId = useUiStateStore((state) => {
    return state.shape2dPortHover?.portId ?? null;
  });
  /** Body sticky may keep itemId after leaving a jack — used to hold enlarge. */
  const stickyHoverItemId = useUiStateStore((state) => {
    return state.shape2dPortHover?.itemId ?? null;
  });
  const showLoupe = useUiStateStore((state) => {
    return state.showLoupe;
  });
  const vlan1CableColor = useUiStateStore((state) => {
    return state.vlan1CableColor;
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

  /**
   * Once the glass opens on a node, stay anchored to that node until the
   * pointer leaves its body — ignore other nodes underneath the enlarge.
   */
  const [loupeAnchorItemId, setLoupeAnchorItemId] = useState<string | null>(
    null
  );
  const loupeAnchorItemIdRef = useRef<string | null>(null);
  loupeAnchorItemIdRef.current = loupeAnchorItemId;

  const activeLoupeItemId = loupeAnchorItemId ?? hoverItemId;

  /** Open from port dwell; keep for the whole node body after that. */
  const deviceFromPortHover = useMemo((): LoupeDevice | null => {
    if (!showLoupe || !activeLoupeItemId) return null;
    if (!isPlanProjection(projectionMode) || projectionMode === 'TWO_D_V2') {
      return null;
    }

    if (zoom >= 0.3) {
      return null;
    }

    // Opening still requires a jack (unless already anchored on the node).
    if (!loupeAnchorItemId && !hoverPortId) return null;

    const viewItem = items.find((item) => {
      return item.id === activeLoupeItemId;
    });
    const modelItem = modelItems.find((item) => {
      return item.id === activeLoupeItemId;
    });
    if (!viewItem || !modelItem?.icon) return null;

    const size = getModelItemSize(modelItem) ??
      getShape2dSize(modelItem.icon) ?? { width: 1, height: 1 };
    const deviceCenter = getShape2dCenterPosition(viewItem.tile, size);

    let targetPx = 248;
    const MAX_LOUPE_PX = 320;
    if (zoom <= 0.2) {
      targetPx = MAX_LOUPE_PX;
    } else if (zoom < 0.3) {
      const linearRatio = (0.3 - zoom) / (0.3 - 0.2);
      const ratio = linearRatio ** 4;
      targetPx = 248 + ratio * (MAX_LOUPE_PX - 248);
    }

    return {
      itemId: viewItem.id,
      modelItem,
      deviceCenter,
      diameter: targetPx
    };
  }, [
    activeLoupeItemId,
    loupeAnchorItemId,
    hoverPortId,
    items,
    modelItems,
    projectionMode,
    zoom,
    showLoupe
  ]);

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
  const hoverSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const showFrameRef = useRef<number | null>(null);
  /** True while waiting for the still-on-port dwell before first reveal. */
  const pendingDwellRef = useRef(false);
  const dwellScreenRef = useRef<{ x: number; y: number } | null>(null);
  /** Enlarge owned by loupe reveal (cleared when glass hides). */
  const loupeOwnedEnlargeRef = useRef<string | null>(null);
  /** Scroll delta applied so the dwell port stays under the cursor after scale. */
  const loupePanCompRef = useRef<{ x: number; y: number } | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const modelItemsRef = useRef(modelItems);
  modelItemsRef.current = modelItems;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

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
    if (hoverSettleTimerRef.current) {
      clearTimeout(hoverSettleTimerRef.current);
      hoverSettleTimerRef.current = null;
    }
    pendingDwellRef.current = false;
    dwellScreenRef.current = null;
  };

  const revealLoupeRef = useRef<
    ((dev: LoupeDevice, cursor: { x: number; y: number }) => void) | null
  >(null);
  const hideLoupeGlassRef = useRef<() => void>(() => {});
  const clearLoupeNodeHoverRef = useRef<() => void>(() => {});

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

  const clearLoupeNodeHover = () => {
    setLoupeRevealLock(false);
    setLoupeGlassActive(false);
    setLoupeAnchorItemId(null);
    const st = uiStoreApi.getState();
    if (
      loupeOwnedEnlargeRef.current &&
      st.shape2dEnlargedItemId === loupeOwnedEnlargeRef.current
    ) {
      st.actions.setShape2dEnlargedItemId(null);
    }
    loupeOwnedEnlargeRef.current = null;
    // Do NOT reverse the reveal pan — cursor has usually moved, and undoing
    // scroll teleports the view (e.g. off the right ports → middle of switch).
    loupePanCompRef.current = null;
  };

  /** Hide glass only — keep node enlarge while the pointer stays on the chassis. */
  const hideLoupeGlass = () => {
    setLoupeRevealLock(false);
    setLoupeGlassActive(false);
    setLoupeAnchorItemId(null);
    loupeAnchorItemIdRef.current = null;
    setVisible(false);
    cursorTargetRef.current = null;
    applyLoupePortHoverDom(contentElRef.current, null, hoveredJackRef);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      stopRaf();
      focusRef.current = null;
      deviceCenterRef.current = null;
      setContent(null);
      fadeTimerRef.current = null;
    }, LOUPE_FADE_OUT_MS);
  };

  /**
   * screen = origin + scroll + zoom * world
   * ⇒ Δscroll = zoom * (worldBefore - worldAfter) to keep the same screen point.
   */
  const panScrollToKeepWorldUnderCursor = (
    fromWorld: { x: number; y: number },
    toWorld: { x: number; y: number },
    zoom: number
  ) => {
    const dx = zoom * (fromWorld.x - toWorld.x);
    const dy = zoom * (fromWorld.y - toWorld.y);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null;
    return { x: dx, y: dy };
  };

  const readCursorWorld = (): { x: number; y: number } | null => {
    const st = uiStoreApi.getState();
    const rSize = rendererSizeRef.current;
    if (!rSize?.width || !rSize?.height) return cursorWorldRef.current;
    const tile = screenToTile2dContinuous({
      mouse: st.mouse.position.screen,
      zoom: st.zoom,
      scroll: st.scroll,
      rendererSize: rSize
    });
    const world = continuousTileToWorld(tile);
    cursorWorldRef.current = world;
    return world;
  };

  /**
   * 1) Enlarge node (hover)
   * 2) Pan so the scaled dwell jack sits under the pointer
   * Does not show the glass yet.
   */
  const prepareLoupeNodeHover = (
    dev: LoupeDevice,
    cursorWorld: { x: number; y: number },
    portId: string
  ): { x: number; y: number } => {
    setLoupeRevealLock(true);

    const st = uiStoreApi.getState();
    const zoom = zoomRef.current;
    const scale = loupeHighlightScaleFor(dev.modelItem, zoom);

    // Keep port hover pinned for the whole align window.
    st.actions.setShape2dPortHover({ itemId: dev.itemId, portId });
    loupeOwnedEnlargeRef.current = dev.itemId;
    if (st.shape2dEnlargedItemId !== dev.itemId) {
      st.actions.setShape2dEnlargedItemId(dev.itemId);
    }
    st.actions.setShape2dNodeHoverItemId(dev.itemId);

    if (!loupePanCompRef.current && scale > 1.01) {
      const viewItem = itemsRef.current.find((item) => item.id === dev.itemId);
      const port = viewItem
        ? getModelItemPorts(dev.modelItem).find((p) => p.id === portId)
        : null;
      if (viewItem && port) {
        const worldTile = getShape2dPortWorldTile(viewItem.tile, port.tile);
        const px = (worldTile.x + 0.5) * TILE_SIZE_2D;
        const py = (worldTile.y + 0.5) * TILE_SIZE_2D;
        const vis = {
          x: dev.deviceCenter.x + scale * (px - dev.deviceCenter.x),
          y: dev.deviceCenter.y + scale * (py - dev.deviceCenter.y)
        };
        const delta = panScrollToKeepWorldUnderCursor(cursorWorld, vis, zoom);
        if (delta) {
          loupePanCompRef.current = delta;
          const scroll = st.scroll;
          st.actions.setScroll({
            position: {
              x: scroll.position.x + delta.x,
              y: scroll.position.y + delta.y
            },
            offset: scroll.offset
          });
        }
      }
    }

    return readCursorWorld() ?? cursorWorld;
  };

  /** 3) Show loupe glass on the aligned cursor/port. */
  const showLoupeGlass = (
    dev: LoupeDevice,
    focusCursor: { x: number; y: number }
  ) => {
    setLoupeAnchorItemId(dev.itemId);
    loupeAnchorItemIdRef.current = dev.itemId;
    deviceCenterRef.current = { ...dev.deviceCenter };
    diameterRef.current = dev.diameter;
    cursorTargetRef.current = { ...focusCursor };
    focusRef.current = { ...focusCursor };

    setContent({
      itemId: dev.itemId,
      modelItem: dev.modelItem,
      deviceCenter: { ...dev.deviceCenter },
      diameter: dev.diameter,
      highlightScale: loupeHighlightScaleFor(dev.modelItem, zoomRef.current)
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
      showFrameRef.current = null;
      setVisible(true);
      setLoupeRevealLock(false);
      setLoupeGlassActive(true, dev.itemId);
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
  };

  /**
   * Dwell done → hover node → pan port under cursor → show loupe.
   */
  const revealLoupe = (dev: LoupeDevice, cursor: { x: number; y: number }) => {
    const hover = uiStoreApi.getState().shape2dPortHover;
    if (!hover?.portId || hover.itemId !== dev.itemId) return;

    const focusAfterHover = prepareLoupeNodeHover(dev, cursor, hover.portId);

    if (showFrameRef.current) {
      cancelAnimationFrame(showFrameRef.current);
      showFrameRef.current = null;
    }
    if (hoverSettleTimerRef.current) {
      clearTimeout(hoverSettleTimerRef.current);
      hoverSettleTimerRef.current = null;
    }

    hoverSettleTimerRef.current = setTimeout(() => {
      hoverSettleTimerRef.current = null;
      const latest = latestDeviceRef.current;
      const liveHover = uiStoreApi.getState().shape2dPortHover;
      if (!latest || latest.itemId !== dev.itemId) {
        clearLoupeNodeHover();
        return;
      }
      // Prefer pinned hover from prepare; fall back to live.
      if (!liveHover?.portId || liveHover.itemId !== dev.itemId) {
        clearLoupeNodeHover();
        return;
      }

      const focus = readCursorWorld() ?? focusAfterHover;
      showLoupeGlass(latest, focus);
    }, LOUPE_HOVER_SETTLE_MS);
  };
  revealLoupeRef.current = revealLoupe;
  hideLoupeGlassRef.current = hideLoupeGlass;
  clearLoupeNodeHoverRef.current = clearLoupeNodeHover;

  const armShowDelay = () => {
    clearShowDelay();
    pendingDwellRef.current = true;
    dwellScreenRef.current = null;
    showDelayTimerRef.current = setTimeout(() => {
      showDelayTimerRef.current = null;
      pendingDwellRef.current = false;
      dwellScreenRef.current = null;
      const latest = latestDeviceRef.current;
      const cursor = cursorWorldRef.current;
      // Still need a live port under the cursor at fire time.
      const hover = uiStoreApi.getState().shape2dPortHover;
      if (!latest || !cursor || !hover?.portId) return;
      if (hover.itemId !== latest.itemId) return;
      revealLoupeRef.current?.(latest, cursor);
    }, LOUPE_PORT_SHOW_DELAY_MS);
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

      // Glass is open: stay on THIS node until leaving its body.
      // Chassis (non-port) keeps the loupe; nodes underneath are ignored.
      if (isLoupeGlassActive() && contentItemIdRef.current) {
        const itemId =
          loupeAnchorItemIdRef.current ?? contentItemIdRef.current;
        const modelItem = modelItemsRef.current.find((m) => m.id === itemId);
        const viewItem = itemsRef.current.find((v) => v.id === itemId);
        if (modelItem?.icon && viewItem) {
          const scale = loupeHighlightScaleFor(modelItem, z);
          const size =
            getModelItemSize(modelItem) ?? getShape2dSize(modelItem.icon);
          if (size) {
            const cx = viewItem.tile.x + size.width / 2;
            const cy = viewItem.tile.y + size.height / 2;
            const halfW = (size.width * scale) / 2;
            const halfH = (size.height * scale) / 2;
            const tx = world.x / TILE_SIZE_2D;
            const ty = world.y / TILE_SIZE_2D;
            const onBody =
              tx >= cx - halfW &&
              tx < cx + halfW &&
              ty >= cy - halfH &&
              ty < cy + halfH;

            if (!onBody) {
              if (visibleRef.current) hideLoupeGlassRef.current();
              clearLoupeNodeHoverRef.current();
              uiStoreApi.getState().actions.setShape2dPortHover(null);
              return;
            }

            const centerX = (viewItem.tile.x + size.width / 2) * TILE_SIZE_2D;
            const centerY = (viewItem.tile.y + size.height / 2) * TILE_SIZE_2D;
            const inv = Math.max(scale, 0.01);
            const ux = centerX + (world.x - centerX) / inv;
            const uy = centerY + (world.y - centerY) / inv;
            const hit = getShape2dPortAtPoint({
              point: { x: ux / TILE_SIZE_2D, y: uy / TILE_SIZE_2D },
              scene: { items: [viewItem] } as any,
              modelItems: modelItemsRef.current,
              stickyHover: null,
              highlightedItemIds: null,
              zoom: 1
            });

            const { setShape2dPortHover } = uiStoreApi.getState().actions;
            const prev = uiStoreApi.getState().shape2dPortHover;
            if (hit?.portId) {
              if (
                prev?.itemId !== itemId ||
                prev?.portId !== hit.portId
              ) {
                setShape2dPortHover({ itemId, portId: hit.portId });
              }
            } else if (prev?.itemId !== itemId || prev?.portId != null) {
              // On chassis — keep loupe, clear jack highlight only.
              setShape2dPortHover({ itemId, portId: null });
            }
          }
        }
      }

      // Pending dwell: movement restarts the still-on-port timer.
      if (pendingDwellRef.current && showDelayTimerRef.current) {
        const screen = mouse.position.screen;
        if (!dwellScreenRef.current) {
          dwellScreenRef.current = { x: screen.x, y: screen.y };
        } else {
          const moved = Math.hypot(
            screen.x - dwellScreenRef.current.x,
            screen.y - dwellScreenRef.current.y
          );
          if (moved > LOUPE_STILL_PX) {
            dwellScreenRef.current = { x: screen.x, y: screen.y };
            clearTimeout(showDelayTimerRef.current);
            showDelayTimerRef.current = setTimeout(() => {
              showDelayTimerRef.current = null;
              pendingDwellRef.current = false;
              dwellScreenRef.current = null;
              const latest = latestDeviceRef.current;
              const cursor = cursorWorldRef.current;
              const hover = uiStoreApi.getState().shape2dPortHover;
              if (!latest || !cursor || !hover?.portId) return;
              if (hover.itemId !== latest.itemId) return;
              revealLoupeRef.current?.(latest, cursor);
            }, LOUPE_PORT_SHOW_DELAY_MS);
          }
        }
      }

      // Freeze framing while the button is down so click jitter / hover churn
      // cannot pan the loupe mid-interaction.
      if (mouse.mousedown && contentElRef.current && focusRef.current) {
        return;
      }

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

  // Show / hide with still-on-port dwell. Do NOT put `content` in deps —
  // updating content inside the effect would re-fire and freeze the app.
  useEffect(() => {
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    if (!device) {
      // Align / glass: canvas hover is frozen — ignore underside "miss".
      if (isLoupeRevealLocked() || isLoupeGlassActive()) {
        return undefined;
      }
      clearShowDelay();

      const stickyItem = stickyHoverItemId;
      const stillOnSameNode =
        Boolean(loupeOwnedEnlargeRef.current) &&
        stickyItem === loupeOwnedEnlargeRef.current;

      if (stillOnSameNode) {
        hideLoupeGlass();
        return () => {
          if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        };
      }

      hideLoupeGlass();
      clearLoupeNodeHover();
      return () => {
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      };
    }

    deviceCenterRef.current = { ...device.deviceCenter };
    diameterRef.current = device.diameter;

    // Already showing this device — sync geometry without re-arming dwell.
    if (contentItemIdRef.current === device.itemId) {
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
          diameter: device.diameter,
          highlightScale: loupeHighlightScaleFor(device.modelItem, zoomRef.current)
        };
      });
      setVisible(true);
      return undefined;
    }

    // Not visible yet (or switching device) — dwell still on this port.
    armShowDelay();

    return () => {
      clearShowDelay();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dwell + port identity
  }, [
    device?.itemId,
    device?.diameter,
    device?.modelItem,
    device?.deviceCenter.x,
    device?.deviceCenter.y,
    hoverPortId,
    stickyHoverItemId,
    hasDevice
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

  const { modelItem, deviceCenter, diameter, highlightScale } = content;
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
    <SceneLayer order={55} disableAnimation omitTransform={false}>
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
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    // Origin is device centre (DeviceShape2d centered + cables
                    // offset by -deviceCenter) — same pivot as canvas Node scale.
                    transform:
                      highlightScale !== 1
                        ? `scale(${highlightScale})`
                        : undefined,
                    transformOrigin: '0 0'
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
                      modelItems={modelItems}
                      connectors={connectors}
                      showShadow={false}
                      centered
                      hoveredPortId={null}
                    />
                  </Box>
                  {/* Cables above the chassis so stubs stay visible in the glass */}
                  <LoupeCableLayer
                    connectors={loupeConnectors}
                    allConnectors={connectors}
                    itemId={content.itemId}
                    deviceCenter={deviceCenter}
                    modelItems={modelItems}
                    vlan1CableColor={vlan1CableColor}
                  />
                </Box>
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
