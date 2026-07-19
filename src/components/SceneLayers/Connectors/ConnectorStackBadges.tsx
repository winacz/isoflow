import React, { useCallback, useEffect, useMemo } from 'react';
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

const HANDLE_SPACING_PX = Math.round(TILE_SIZE_2D * 0.85);
const HANDLE_SIZE = 36;
const BADGE_SIZE = Math.max(28, Math.round(TILE_SIZE_2D * 0.72));
const HANDLE_LIFT_PX = BADGE_SIZE * 0.5 + HANDLE_SIZE * 0.75 + 8;

const stackKey = (tile: { x: number; y: number }) => {
  return `${tile.x},${tile.y}`;
};

const chebyshev = (
  a: { x: number; y: number },
  b: { x: number; y: number }
) => {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
};

/**
 * Interactive stack badges — must sit ABOVE the interaction capture layer
 * so hover/click reach the DOM.
 */
export const ConnectorStackBadges = () => {
  const scene = useScene();
  const { connectors, currentView } = scene;
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const mouse = useUiStateStore((state) => {
    return state.mouse;
  });
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const uiActions = useUiStateStore((state) => {
    return state.actions;
  });

  const hoveredKey = useStackFanStore((state) => {
    return state.hoveredKey;
  });
  const pinnedKey = useStackFanStore((state) => {
    return state.pinnedKey;
  });
  const setHoveredKey = useStackFanStore((state) => {
    return state.setHoveredKey;
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

  const activeKey = pinnedKey ?? hoveredKey;

  useEffect(() => {
    if (mode.type !== 'DRAG_ITEMS') {
      clearPinned();
    }
  }, [mode.type, clearPinned]);

  useEffect(() => {
    if (!activeKey) {
      setHighlightedConnectorId(null);
    }
  }, [activeKey, setHighlightedConnectorId]);

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

  // Tile proximity — works even when the interaction overlay covers the badge
  useEffect(() => {
    if (pinnedKey) return;

    const radius = hoveredKey ? 2 : 1;
    const near = stackBadges.find((badge) => {
      return chebyshev(badge.tile, mouse.position.tile) <= radius;
    });

    const nextKey = near ? stackKey(near.tile) : null;
    if (nextKey !== hoveredKey) {
      setHoveredKey(nextKey);
    }
  }, [
    mouse.position.tile.x,
    mouse.position.tile.y,
    stackBadges,
    hoveredKey,
    pinnedKey,
    setHoveredKey
  ]);

  const grabStackedConnector = useCallback(
    (connectorId: string, badgeTile: { x: number; y: number }) => {
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

      uiActions.setItemControls({ type: 'CONNECTOR', id: connectorId });
      uiActions.setMouse({
        ...mouse,
        mousedown: {
          screen: { ...mouse.position.screen },
          tile: { ...badgeTile }
        },
        delta: null
      });

      if (!segment) {
        return;
      }

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

      const anchorOrigins: Record<string, { x: number; y: number }> = {};
      prepared.anchors.forEach((anchor) => {
        if (
          (anchor.id === prepared.startAnchorId ||
            anchor.id === prepared.endAnchorId) &&
          anchor.ref.tile
        ) {
          anchorOrigins[anchor.id] = { ...anchor.ref.tile };
        }
      });

      setPinnedKey(stackKey(badgeTile));
      uiActions.setMode({
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [
          {
            type: 'CONNECTOR_SEGMENT',
            id: encodeWaypointSegmentId(
              connectorId,
              prepared.startAnchorId,
              prepared.endAnchorId
            )
          }
        ],
        isInitialMovement: true,
        anchorOrigins
      });
    },
    [
      connectors,
      currentView,
      modelItems,
      mouse,
      scene,
      setPinnedKey,
      uiActions
    ]
  );

  return (
    <>
      {stackBadges.map((badge) => {
        const key = stackKey(badge.tile);
        const isActive = activeKey === key;
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
        const handleOffsets = isActive
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
            onMouseEnter={() => {
              setHoveredKey(key);
            }}
            onMouseLeave={() => {
              if (!pinnedKey && hoveredKey === key) {
                setHoveredKey(null);
              }
              setHighlightedConnectorId(null);
            }}
            sx={{
              position: 'absolute',
              left: center.x,
              top: center.y,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              zIndex: 5
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: isActive
                  ? Math.max(
                      BADGE_SIZE + 12,
                      HANDLE_SPACING_PX * badge.count + HANDLE_SIZE
                    )
                  : BADGE_SIZE + 12,
                height: isActive
                  ? BADGE_SIZE + HANDLE_LIFT_PX + HANDLE_SIZE
                  : BADGE_SIZE + 12,
                borderRadius: '50%',
                // Expand hit area upward so leaving toward handles keeps hover
                marginTop: isActive ? `-${HANDLE_LIFT_PX * 0.35}px` : 0
              }}
            />

            <Box
              title={
                severity === 'sameVlan'
                  ? 'Nakładające się kable — ten sam VLAN'
                  : 'Nakładające się kable — różne VLAN / trunk'
              }
              sx={{
                position: 'relative',
                zIndex: 1,
                minWidth: BADGE_SIZE,
                height: BADGE_SIZE,
                px: 0.75,
                borderRadius: '999px',
                bgcolor: isActive ? colors.bgActive : colors.bg,
                border: `2px solid ${colors.border}`,
                boxShadow: isActive
                  ? `0 2px 8px ${colors.shadow}`
                  : `0 1px 4px ${colors.shadow}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: Math.max(13, Math.round(BADGE_SIZE * 0.42)),
                fontWeight: 800,
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                color: '#fff',
                lineHeight: 1,
                userSelect: 'none',
                cursor: 'default',
                transform: isActive ? 'scale(1.08)' : 'scale(1)',
                transition:
                  'transform 0.12s ease, background-color 0.12s ease',
                pointerEvents: 'none'
              }}
            >
              {badge.count}
            </Box>

            {isActive &&
              badge.connectorIds.map((connectorId) => {
                const off = handleOffsets[connectorId] ?? { x: 0, y: 0 };

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
                      grabStackedConnector(connectorId, badge.tile);
                    }}
                    title="Przeciągnij kabel"
                    sx={{
                      position: 'absolute',
                      left: `calc(50% + ${off.x}px)`,
                      top: `calc(50% + ${off.y}px)`,
                      transform: 'translate(-50%, -50%)',
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                      borderRadius: '6px',
                      bgcolor: '#fff',
                      border: '2px solid #1e3a5f',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.28)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'grab',
                      zIndex: 4,
                      transition: 'left 0.12s ease, top 0.12s ease',
                      '&:hover': {
                        borderColor: '#dc2626',
                        boxShadow: '0 3px 8px rgba(220, 38, 38, 0.4)',
                        transform: 'translate(-50%, -50%) scale(1.08)'
                      }
                    }}
                  >
                    <OpenWithOutlinedIcon
                      sx={{ fontSize: 22, color: '#1e3a5f' }}
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
