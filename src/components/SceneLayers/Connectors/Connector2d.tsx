import React, { memo, useMemo } from 'react';
import { useTheme, Box } from '@mui/material';
import OpenWithOutlinedIcon from '@mui/icons-material/OpenWithOutlined';
import { TILE_SIZE_2D, getShape2dPortIfaceName } from 'src/config';
import {
  connectorPathTileToGlobal,
  getAnchorTile,
  findWaypointSegmentAtTile,
  splitConnectorPathByNodeBodies,
  buildConnectorSvgPathD,
  getConnectorRelationSummary,
  getConnectorPathPreview,
  stripToEndpointAnchors,
  TRUNK_RAINBOW_COLORS,
  TRUNK_MISMATCH_COLOR,
  CONNECTOR_JUMP_RADIUS_TILES,
  type ConnectorJump
} from 'src/utils';
import { Circle } from 'src/components/Circle/Circle';
import { Svg } from 'src/components/Svg/Svg';
import { useConnector } from 'src/hooks/useConnector';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useNodeDragStore } from 'src/stores/nodeDragStore';

interface Props {
  connector: ReturnType<typeof useScene>['connectors'][0];
  jumps?: ConnectorJump[];
  isSelected?: boolean;
  /** Emphasize line (e.g. linked to selected node) without showing waypoints */
  isFocused?: boolean;
  /** Stronger than focus — stack handle hover target */
  isHighlighted?: boolean;
  /** Fade when another connector/node is the selection focus */
  isDimmed?: boolean;
  /** Softer fade while dragging a node — keep cables readable. */
  softDim?: boolean;
  /** Render-only pixel offset (stack fan-out on badge hover). */
  visualOffset?: { x: number; y: number };
}

export const Connector2d = memo(({
  connector: _connector,
  jumps = [],
  isSelected,
  isFocused,
  isHighlighted,
  isDimmed,
  softDim,
  visualOffset
}: Props) => {
  const theme = useTheme();
  const { currentView, items } = useScene();
  const connector = useConnector(_connector.id);
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  // Mouse only when selected (segment hover handle).
  const mouseTile = useUiStateStore((state) => {
    return isSelected ? state.mouse.position.tile : null;
  });
  // Zoom for segment drag handle (selected cable only).
  const zoom = useUiStateStore((state) => {
    return isSelected ? state.zoom : 1;
  });
  const selectedWaypointIds = useUiStateStore((state) => {
    return state.selectedWaypointIds;
  });
  const vlan1CableColor = useUiStateStore((state) => {
    return state.vlan1CableColor;
  });

  const linkSummary = useMemo(() => {
    return getConnectorRelationSummary({
      anchors: connector.anchors,
      modelItems,
      resolvePortLabel: (itemId, portId) => {
        const modelItem = modelItems.find((item) => {
          return item.id === itemId;
        });
        return getShape2dPortIfaceName(modelItem?.icon ?? '', portId);
      }
    });
  }, [connector.anchors, modelItems]);

  const vlanStroke = linkSummary.linkMode === 'access' ? linkSummary.vlanColor : null;
  const isTrunkLink = linkSummary.linkMode === 'trunk';
  const isMismatchLink = linkSummary.linkMode === 'mismatch';
  const isUntaggedLink =
    linkSummary.linkMode === 'access' && !vlanStroke;
  const rainbowGradId = `trunk-rainbow-${connector.id}`;
  // Untagged / VLAN 1: TEMP override or solid black.
  const strokeBase =
    vlanStroke ?? (isUntaggedLink ? vlan1CableColor ?? '#0a0a0a' : '#0a0a0a');

  const endpointItemIds = useMemo(() => {
    return connector.anchors
      .map((anchor) => {
        return anchor.ref.item;
      })
      .filter((itemId): itemId is string => {
        return Boolean(itemId);
      });
  }, [connector.anchors]);

  // Fingerprint of live drag tiles that affect this cable — avoids model writes.
  const liveDragKey = useNodeDragStore((state) => {
    let key = '';
    endpointItemIds.forEach((itemId) => {
      const tile = state.tiles[itemId];
      if (!tile) return;
      key += `${itemId}:${tile.x},${tile.y};`;
    });
    return key;
  });

  const livePath = useMemo(() => {
    if (!liveDragKey) return null;

    const tileOverrides = useNodeDragStore.getState().tiles;
    try {
      return getConnectorPathPreview({
        anchors: stripToEndpointAnchors(connector.anchors),
        view: currentView,
        modelItems,
        tileOverrides
      });
    } catch {
      return null;
    }
  }, [liveDragKey, connector.anchors, currentView, modelItems]);

  const pathTiles = livePath?.tiles ?? connector.path.tiles;
  const pathFrom = livePath?.rectangle.from ?? connector.path.rectangle.from;

  const globalTiles = useMemo(() => {
    return pathTiles.map((tile) => {
      return connectorPathTileToGlobal(tile, pathFrom);
    });
  }, [pathTiles, pathFrom]);

  const bounds = useMemo(() => {
    if (globalTiles.length === 0) {
      return { minX: 0, minY: 0, width: 1, height: 1 };
    }

    const xs = globalTiles.map((tile) => tile.x);
    const ys = globalTiles.map((tile) => tile.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Pad so hop arcs near the bbox edge are not clipped
    const pad = jumps.length > 0 ? CONNECTOR_JUMP_RADIUS_TILES : 0;

    return {
      minX: minX - pad,
      minY: minY - pad,
      width: maxX - minX + 1 + pad * 2,
      height: maxY - minY + 1 + pad * 2
    };
  }, [globalTiles, jumps.length]);

  const pxSize = useMemo(() => {
    return {
      width: bounds.width * TILE_SIZE_2D,
      height: bounds.height * TILE_SIZE_2D
    };
  }, [bounds]);

  const styleRuns = useMemo(() => {
    // Body-crossing dashes are expensive (per-tile vs all nodes) — skip while dragging.
    if (softDim || globalTiles.length < 2) {
      if (globalTiles.length < 2) return [];
      return [
        {
          points: globalTiles.map((tile) => {
            return { x: tile.x + 0.5, y: tile.y + 0.5 };
          }),
          throughNode: false
        }
      ];
    }

    return splitConnectorPathByNodeBodies({
      tiles: globalTiles,
      items,
      modelItems,
      endpointItemIds
    });
  }, [globalTiles, items, modelItems, endpointItemIds, softDim]);

  const anchorPositions = useMemo(() => {
    if (!isSelected) return [];

    return connector.anchors.map((anchor) => {
      const position = getAnchorTile(anchor, currentView, modelItems);
      return {
        id: anchor.id,
        locked: Boolean(anchor.locked && anchor.ref.tile),
        x: (position.x - bounds.minX) * TILE_SIZE_2D + TILE_SIZE_2D / 2,
        y: (position.y - bounds.minY) * TILE_SIZE_2D + TILE_SIZE_2D / 2
      };
    });
  }, [currentView, connector.anchors, bounds, isSelected, modelItems]);

  const selectedWaypointPositions = useMemo(() => {
    if (selectedWaypointIds.length === 0) return [];

    const selectedSet = new Set(selectedWaypointIds);

    return connector.anchors
      .filter((anchor) => {
        return Boolean(anchor.ref.tile) && selectedSet.has(anchor.id);
      })
      .map((anchor) => {
        const tile = anchor.ref.tile!;
        return {
          id: anchor.id,
          x: (tile.x - bounds.minX) * TILE_SIZE_2D + TILE_SIZE_2D / 2,
          y: (tile.y - bounds.minY) * TILE_SIZE_2D + TILE_SIZE_2D / 2
        };
      });
  }, [selectedWaypointIds, connector.anchors, bounds]);

  const hoveredSegmentHandle = useMemo(() => {
    if (!isSelected || !mouseTile) return null;

    const segment = findWaypointSegmentAtTile({
      connectorId: connector.id,
      anchors: connector.anchors,
      path: connector.path,
      tile: mouseTile
    });

    if (!segment) return null;

    return {
      id: segment.existingWaypointIds.join(':'),
      x: (segment.mid.x - bounds.minX) * TILE_SIZE_2D + TILE_SIZE_2D / 2,
      y: (segment.mid.y - bounds.minY) * TILE_SIZE_2D + TILE_SIZE_2D / 2
    };
  }, [isSelected, connector, mouseTile, bounds]);

  const connectorWidthPx = useMemo(() => {
    const base = (TILE_SIZE_2D / 100) * connector.width * 1.25;
    // Untagged links read clearer when slightly heavier
    return isUntaggedLink ? base * 1.45 : base;
  }, [connector.width, isUntaggedLink]);

  const solidDashArray = useMemo(() => {
    switch (connector.style) {
      case 'DASHED':
        return `${connectorWidthPx * 2}, ${connectorWidthPx * 2}`;
      case 'DOTTED':
        return `0, ${connectorWidthPx * 1.8}`;
      case 'SOLID':
      default:
        return 'none';
    }
  }, [connector.style, connectorWidthPx]);

  const throughNodeDashArray = `${Math.max(1.5, connectorWidthPx * 0.55)}, ${Math.max(1.5, connectorWidthPx * 0.55)}`;

  const originPx = useMemo(() => {
    return {
      x: bounds.minX * TILE_SIZE_2D,
      y: bounds.minY * TILE_SIZE_2D
    };
  }, [bounds]);

  if (globalTiles.length === 0) return null;

  const handleColor = isMismatchLink
    ? TRUNK_MISMATCH_COLOR
    : isTrunkLink
      ? TRUNK_RAINBOW_COLORS[0]
      : strokeBase;
  const lineStroke = isTrunkLink ? `url(#${rainbowGradId})` : handleColor;
  const emphasize = Boolean(isSelected || isFocused || isHighlighted);
  const lineOpacity = isDimmed
    ? softDim
      ? 0.55
      : 0.4
    : isHighlighted
      ? 1
      : emphasize
        ? 0.92
        : 0.72;
  const outlineOpacity = isDimmed
    ? softDim
      ? 0.35
      : 0.22
    : isHighlighted
      ? 0.85
      : emphasize
        ? 0.65
        : 0.45;
  const widthBoost = isHighlighted ? 1.55 : emphasize ? 1.25 : 1;

  return (
    <Box
      sx={{
        position: 'absolute',
        pointerEvents: 'none',
        opacity: isDimmed ? (softDim ? 0.78 : 0.62) : 1,
        transition: 'opacity 0.12s ease'
      }}
      style={{
        left: originPx.x + (visualOffset?.x ?? 0),
        top: originPx.y + (visualOffset?.y ?? 0),
        zIndex: isHighlighted
          ? 4
          : jumps.length > 0 || visualOffset
            ? 2
            : 1,
        transition: visualOffset
          ? 'left 0.12s ease, top 0.12s ease'
          : undefined
      }}
    >
      <Svg viewboxSize={pxSize}>
        {isTrunkLink && (
          <defs>
            {/*
              userSpaceOnUse: objectBoundingBox breaks on straight H/V paths
              (zero-width or zero-height bbox → invisible stroke until the
              cable gains a bend after moving a node).
            */}
            <linearGradient
              id={rainbowGradId}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={0}
              x2={Math.max(pxSize.width, TILE_SIZE_2D)}
              y2={Math.max(pxSize.height, TILE_SIZE_2D)}
            >
              {TRUNK_RAINBOW_COLORS.map((color, index) => {
                return (
                  <stop
                    key={color}
                    offset={`${(index / (TRUNK_RAINBOW_COLORS.length - 1)) * 100}%`}
                    stopColor={color}
                  />
                );
              })}
            </linearGradient>
          </defs>
        )}
        {styleRuns.map((run, index) => {
          const pathD = buildConnectorSvgPathD({
            points: run.points,
            jumps,
            minX: bounds.minX,
            minY: bounds.minY,
            tileSize: TILE_SIZE_2D
          });
          const dash = run.throughNode
            ? throughNodeDashArray
            : solidDashArray;
          const coreWidth = connectorWidthPx * widthBoost;

          return (
            <g key={`${run.throughNode ? 'in' : 'out'}-${index}`}>
              <path
                d={pathD}
                stroke={theme.palette.common.white}
                strokeWidth={
                  connectorWidthPx *
                  (emphasize ? 1.8 : 1.4) *
                  (isHighlighted ? 1.15 : 1)
                }
                strokeLinecap="butt"
                strokeLinejoin="round"
                strokeOpacity={outlineOpacity}
                strokeDasharray={dash}
                fill="none"
              />
              <path
                d={pathD}
                stroke={lineStroke}
                strokeWidth={coreWidth}
                strokeLinecap="butt"
                strokeLinejoin="round"
                strokeOpacity={lineOpacity}
                strokeDasharray={dash}
                fill="none"
              />
            </g>
          );
        })}
        {anchorPositions.map((anchor) => {
          const lockedColor = '#ea580c';
          const stroke = anchor.locked
            ? lockedColor
            : theme.palette.common.black;
          return (
            <g key={anchor.id}>
              <Circle
                tile={anchor}
                radius={anchor.locked ? 12 : 10}
                fill={anchor.locked ? lockedColor : theme.palette.common.white}
                fillOpacity={anchor.locked ? 0.28 : 0.7}
              />
              <Circle
                tile={anchor}
                radius={anchor.locked ? 8 : 7}
                stroke={stroke}
                fill={theme.palette.common.white}
                strokeWidth={anchor.locked ? 3.5 : 3}
              />
              {anchor.locked && (
                <Circle
                  tile={anchor}
                  radius={3.5}
                  fill={lockedColor}
                  fillOpacity={1}
                />
              )}
            </g>
          );
        })}
        {selectedWaypointPositions.map((anchor) => (
          <g key={`wp-sel-${anchor.id}`}>
            <Circle
              tile={anchor}
              radius={9}
              fill={theme.palette.primary.main}
              fillOpacity={0.25}
            />
            <Circle
              tile={anchor}
              radius={6}
              stroke={theme.palette.primary.main}
              fill={theme.palette.common.white}
              strokeWidth={3}
            />
          </g>
        ))}
      </Svg>

      {hoveredSegmentHandle && (
        <Box
          sx={{
            position: 'absolute',
            left: hoveredSegmentHandle.x,
            top: hoveredSegmentHandle.y,
            // Counter SceneLayer zoom + grow when zoomed out (same idea as stack handles)
            transform: `translate(-50%, -50%) scale(${Math.min(
              1.5,
              Math.max(1, Math.pow(1 / Math.max(zoom, 0.12), 0.35))
            ) / Math.max(zoom, 0.08)})`,
            transformOrigin: 'center center',
            width: 24,
            height: 24,
            borderRadius: '4px',
            bgcolor: theme.palette.common.white,
            border: `1.5px solid ${handleColor}`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 3
          }}
        >
          <OpenWithOutlinedIcon
            sx={{
              fontSize: 16,
              color: handleColor
            }}
          />
        </Box>
      )}
    </Box>
  );
});
