import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import OpenWithOutlinedIcon from '@mui/icons-material/OpenWithOutlined';
import { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { useStackFanStore } from 'src/stores/stackFanStore';
import {
  encodeWaypointSegmentId,
  findConnectorStackBadges,
  findWaypointSegmentNearTile,
  getConnectorGlobalTiles,
  getStackHandleOffsetsPx,
  getTilePosition2d,
  prepareWaypointSegmentDrag,
  classifyStackOverlap,
  STACK_OVERLAP_COLORS
} from 'src/utils';
import { TILE_SIZE_2D } from 'src/config';
import type { ItemReference } from 'src/types';

const HANDLE_SPACING_PX = Math.round(TILE_SIZE_2D * 0.7);
const HANDLE_SIZE = 28;
const BADGE_SIZE = Math.max(24, Math.round(TILE_SIZE_2D * 0.58));
const HANDLE_LIFT_PX = BADGE_SIZE * 0.45 + HANDLE_SIZE * 0.65 + 6;
const BADGE_DRAG_THRESHOLD_PX = 4;

/**
 * Counter SceneLayer zoom so UI stays readable when zoomed out.
 * Mild growth only — badge stays compact; handles slightly larger far out.
 */
const counterZoom = (zoom: number) => {
  return 1 / Math.max(zoom, 0.08);
};

const handleZoomBoost = (zoom: number) => {
  // zoom 1 → 1×, 0.5 → ~1.2×, 0.25 → ~1.45× (capped)
  return Math.min(1.5, Math.max(1, Math.pow(1 / Math.max(zoom, 0.12), 0.35)));
};

const stackKey = (tile: { x: number; y: number }) => {
  return `${tile.x},${tile.y}`;
};

/**
 * Interactive stack badges — must sit ABOVE the interaction capture layer
 * so hover/click reach the DOM.
 *
 * Drag the count badge to move all stacked cables together.
 * Click (no drag) to pin/unpin individual grab handles.
 */
export const ConnectorStackBadges = () => {
  const scene = useScene();
  const { connectors, currentView } = scene;
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });
  const uiActions = useUiStateStore((state) => {
    return state.actions;
  });

  const badgeScale = useMemo(() => {
    return counterZoom(zoom);
  }, [zoom]);
  const handleScale = useMemo(() => {
    return counterZoom(zoom) * handleZoomBoost(zoom);
  }, [zoom]);

  const pinnedKey = useStackFanStore((state) => {
    return state.pinnedKey;
  });
  const setPinnedKey = useStackFanStore((state) => {
    return state.setPinnedKey;
  });
  const clearPinned = useStackFanStore((state) => {
    return state.clearPinned;
  });
  const setHighlightedConnectorId = useStackFanStore((state) => {
    return state.setHighlightedConnectorId;
  });
  const modeType = useUiStateStore((state) => {
    return state.mode.type;
  });

  const pendingBadgeDragRef = useRef<{
    key: string;
    tile: { x: number; y: number };
    connectorIds: string[];
    startX: number;
    startY: number;
    started: boolean;
  } | null>(null);

  useEffect(() => {
    if (!pinnedKey) {
      setHighlightedConnectorId(null);
    }
  }, [pinnedKey, setHighlightedConnectorId]);

  // Fan-handle hover emphasize must not stick across / after a cable drag.
  useEffect(() => {
    if (modeType === 'DRAG_ITEMS') {
      setHighlightedConnectorId(null);
    }
  }, [modeType, setHighlightedConnectorId]);

  const stackBadges = useMemo(() => {
    return findConnectorStackBadges(
      connectors.map((connector) => {
        return {
          id: connector.id,
          tiles: getConnectorGlobalTiles(connector)
        };
      })
    );
  }, [connectors]);

  const togglePin = useCallback(
    (key: string) => {
      if (pinnedKey === key) {
        clearPinned();
        return;
      }
      setPinnedKey(key);
    },
    [pinnedKey, clearPinned, setPinnedKey]
  );

  const grabStackedConnectors = useCallback(
    (connectorIds: string[], badgeTile: { x: number; y: number }) => {
      const dragItems: ItemReference[] = [];
      const anchorOrigins: Record<string, { x: number; y: number }> = {};

      connectorIds.forEach((connectorId) => {
        const sceneConnector = connectors.find((con) => {
          return con.id === connectorId;
        });
        if (!sceneConnector) return;

        const segment = findWaypointSegmentNearTile({
          connectorId,
          anchors: sceneConnector.anchors,
          path: sceneConnector.path,
          tile: badgeTile
        });
        if (!segment) return;

        const prepared = prepareWaypointSegmentDrag({
          anchors: sceneConnector.anchors,
          path: sceneConnector.path,
          hit: segment,
          view: currentView,
          modelItems
        });

        if (segment.materializeAtPort || segment.materializeBothPorts) {
          scene.updateConnector(
            connectorId,
            { anchors: prepared.anchors },
            { overlapResolve: 'off' }
          );
        }

        prepared.anchors.forEach((anchor) => {
          if (
            (anchor.id === prepared.startAnchorId ||
              anchor.id === prepared.endAnchorId) &&
            anchor.ref.tile
          ) {
            anchorOrigins[anchor.id] = { ...anchor.ref.tile };
          }
        });

        dragItems.push({
          type: 'CONNECTOR_SEGMENT',
          id: encodeWaypointSegmentId(
            connectorId,
            prepared.startAnchorId,
            prepared.endAnchorId
          )
        });
      });

      if (dragItems.length === 0) return;

      // Untangling stacks should not leave a cable permanently selected
      // (that dims the rest of the diagram until another click).
      setHighlightedConnectorId(null);
      uiActions.setItemControls(null);

      // Keep mousedown from badge press when present (stable drag origin).
      const mouse = uiActions.getMouse();
      if (!mouse.mousedown) {
        uiActions.setMouse({
          ...mouse,
          mousedown: {
            screen: { ...mouse.position.screen },
            tile: { ...badgeTile }
          },
          delta: null
        });
      }

      setPinnedKey(stackKey(badgeTile));
      uiActions.setMode({
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: dragItems,
        isInitialMovement: true,
        anchorOrigins
      });
    },
    [
      connectors,
      currentView,
      modelItems,
      scene,
      setPinnedKey,
      setHighlightedConnectorId,
      uiActions
    ]
  );

  const grabStackedConnector = useCallback(
    (connectorId: string, badgeTile: { x: number; y: number }) => {
      grabStackedConnectors([connectorId], badgeTile);
    },
    [grabStackedConnectors]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const pending = pendingBadgeDragRef.current;
      if (!pending || pending.started) return;

      const dx = e.clientX - pending.startX;
      const dy = e.clientY - pending.startY;
      if (Math.hypot(dx, dy) < BADGE_DRAG_THRESHOLD_PX) return;

      pending.started = true;
      grabStackedConnectors(pending.connectorIds, pending.tile);
    };

    const onUp = () => {
      const pending = pendingBadgeDragRef.current;
      pendingBadgeDragRef.current = null;
      if (!pending || pending.started) return;

      // Click without drag — clear press state, then pin/unpin handles.
      const mouse = uiActions.getMouse();
      if (mouse.mousedown) {
        uiActions.setMouse({
          ...mouse,
          mousedown: null,
          delta: null
        });
      }
      togglePin(pending.key);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [grabStackedConnectors, togglePin, uiActions]);

  return (
    <>
      {stackBadges.map((badge) => {
        const key = stackKey(badge.tile);
        const isPinned = pinnedKey === key;
        const severity = classifyStackOverlap({
          connectorIds: badge.connectorIds,
          connectors,
          modelItems
        });
        const colors = STACK_OVERLAP_COLORS[severity];
        const center = getTilePosition2d({
          tile: badge.tile,
          origin: 'CENTER'
        });
        const handleOffsets = isPinned
          ? getStackHandleOffsetsPx(
              badge.connectorIds,
              badge.along,
              HANDLE_SPACING_PX,
              HANDLE_LIFT_PX
            )
          : {};

        return (
          <Box
            key={`stack-${key}`}
            className="isoflow-stack-badge"
            data-stack-key={key}
            data-connector-ids={badge.connectorIds.join(',')}
            data-stack-connectors={badge.connectorIds.join(',')}
            sx={{
              position: 'absolute',
              left: center.x,
              top: center.y,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              zIndex: isPinned ? 6 : 5
            }}
          >
            {/* Count badge — drag all cables; click to pin handles */}
            <Box
              title="Przeciągnij wszystkie kable · kliknij, aby wybrać osobno"
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();

                const mouse = uiActions.getMouse();
                uiActions.setMouse({
                  ...mouse,
                  mousedown: {
                    screen: { ...mouse.position.screen },
                    tile: { ...badge.tile }
                  },
                  delta: null
                });

                pendingBadgeDragRef.current = {
                  key,
                  tile: { ...badge.tile },
                  connectorIds: [...badge.connectorIds],
                  startX: e.clientX,
                  startY: e.clientY,
                  started: false
                };
              }}
              sx={{
                position: 'relative',
                zIndex: 2,
                minWidth: BADGE_SIZE,
                height: BADGE_SIZE,
                px: 0.75,
                borderRadius: '999px',
                bgcolor: isPinned ? colors.bgActive : colors.bg,
                border: `2px solid ${colors.border}`,
                boxShadow: isPinned
                  ? `0 2px 8px ${colors.shadow}`
                  : `0 1px 4px ${colors.shadow}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: Math.max(11, Math.round(BADGE_SIZE * 0.4)),
                fontWeight: 800,
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                color: '#fff',
                lineHeight: 1,
                userSelect: 'none',
                cursor: 'grab',
                transform: `scale(${badgeScale * (isPinned ? 1.06 : 1)})`,
                transformOrigin: 'center center',
                transition:
                  'transform 0.12s ease, background-color 0.12s ease',
                pointerEvents: 'auto',
                '&:active': {
                  cursor: 'grabbing'
                }
              }}
            >
              {badge.count}
            </Box>

            {isPinned &&
              badge.connectorIds.map((connectorId) => {
                const off = handleOffsets[connectorId] ?? { x: 0, y: 0 };
                // Offsets are in unscaled scene px; scale with handles so
                // they stay near the badge on screen.
                const screenOff = {
                  x: off.x * handleScale,
                  y: off.y * handleScale
                };

                return (
                  <Box
                    key={`fan-hit-${connectorId}`}
                    onMouseEnter={() => {
                      setHighlightedConnectorId(connectorId);
                    }}
                    onMouseLeave={() => {
                      setHighlightedConnectorId(null);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setHighlightedConnectorId(null);
                      grabStackedConnector(connectorId, badge.tile);
                    }}
                    title="Przeciągnij kabel"
                    sx={{
                      position: 'absolute',
                      left: `calc(50% + ${screenOff.x}px)`,
                      top: `calc(50% + ${screenOff.y}px)`,
                      transform: `translate(-50%, -50%) scale(${handleScale})`,
                      transformOrigin: 'center center',
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                      borderRadius: '5px',
                      bgcolor: '#fff',
                      border: '2px solid #1e3a5f',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'grab',
                      zIndex: 4,
                      '&:hover': {
                        borderColor: '#dc2626',
                        boxShadow: '0 3px 8px rgba(220, 38, 38, 0.35)'
                      }
                    }}
                  >
                    <OpenWithOutlinedIcon
                      sx={{ fontSize: 18, color: '#1e3a5f' }}
                    />
                  </Box>
                );
              })}
          </Box>
        );
      })}
    </>
  );
};
