import React, { memo, useMemo } from 'react';
import { useTheme, Box } from '@mui/material';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import SwapVertOutlinedIcon from '@mui/icons-material/SwapVertOutlined';
import { TILE_SIZE_2D, getShape2dPortIfaceName } from 'src/config';
import {
  connectorPathTileToGlobal,
  getAnchorTile,
  findWaypointSegmentAtTile,
  listOrthoSegmentHandles,
  splitConnectorPathByNodeBodies,
  buildConnectorSvgPathD,
  getConnectorRelationSummary,
  getConnectorPathPreview,
  stripToEndpointAnchors,
  getPatchPanelCabinetFadeRect,
  TRUNK_RAINBOW_COLORS,
  TRUNK_MISMATCH_COLOR,
  CONNECTOR_JUMP_RADIUS_TILES,
  simplifyTilesForDraw,
  CoordsUtils,
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
  /** Emphasize line (e.g. linked to selected node); also shows mid waypoints */
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
  const { currentView, items, connectors: sceneConnectors } = useScene();
  const connector = useConnector(_connector.id);
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  // Mouse only when selected (segment hover handle) — locked cables stay fixed.
  const mouseTile = useUiStateStore((state) => {
    return isSelected && !connector.locked ? state.mouse.position.tile : null;
  });
  // Zoom for segment drag handle (selected cable only).
  const zoom = useUiStateStore((state) => {
    return isSelected && !connector.locked ? state.zoom : 1;
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
      connectors: sceneConnectors,
      connectorId: connector.id,
      resolvePortLabel: (itemId, portId) => {
        const modelItem = modelItems.find((item) => {
          return item.id === itemId;
        });
        return getShape2dPortIfaceName(modelItem?.icon ?? '', portId);
      }
    });
  }, [connector.anchors, connector.id, modelItems, sceneConnectors]);

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
    // During node drag, skip per-frame path rebuilds (many cables × many
    // mousemove events freezes the tab). Mouseup rebuilds final routes.
    if (softDim || !liveDragKey) return null;

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
  }, [softDim, liveDragKey, connector.anchors, currentView, modelItems]);

  const pathTiles = livePath?.tiles ?? connector.path.tiles;
  const pathFrom = livePath?.rectangle.from ?? connector.path.rectangle.from;

  const globalTiles = useMemo(() => {
    return simplifyTilesForDraw(
      pathTiles.map((tile) => {
        return connectorPathTileToGlobal(tile, pathFrom);
      })
    );
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

    const fadeCabinetRect = getPatchPanelCabinetFadeRect({
      endpointItemIds,
      viewItems: items,
      modelItems
    });

    return splitConnectorPathByNodeBodies({
      tiles: globalTiles,
      items,
      modelItems,
      endpointItemIds,
      fadeCabinetRect
    });
  }, [globalTiles, items, modelItems, endpointItemIds, softDim]);

  const showWaypoints = Boolean(isSelected || isFocused);

  /** Mid-tile "węzły" — grab handles (ports are endpoints, not shown here). */
  const anchorPositions = useMemo(() => {
    if (!showWaypoints) return [];

    return connector.anchors
      .filter((anchor) => {
        return Boolean(anchor.ref.tile);
      })
      .map((anchor) => {
        const position = getAnchorTile(anchor, currentView, modelItems);
        return {
          id: anchor.id,
          locked: Boolean(anchor.locked && anchor.ref.tile),
          x: (position.x - bounds.minX) * TILE_SIZE_2D + TILE_SIZE_2D / 2,
          y: (position.y - bounds.minY) * TILE_SIZE_2D + TILE_SIZE_2D / 2
        };
      });
  }, [currentView, connector.anchors, bounds, showWaypoints, modelItems]);

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
    if (!isSelected || !mouseTile || connector.locked) return null;

    const segment = findWaypointSegmentAtTile({
      connectorId: connector.id,
      anchors: connector.anchors,
      path: connector.path,
      tile: mouseTile
    });

    if (!segment) return null;

    return {
      id: segment.existingWaypointIds.join(':') || 'port:port',
      mid: segment.mid,
      axis: segment.axis
    };
  }, [isSelected, connector, mouseTile]);

  const segmentHandles = useMemo(() => {
    if (!isSelected || connector.locked) return [];

    return listOrthoSegmentHandles({
      anchors: connector.anchors,
      path: connector.path
    }).map((handle) => {
      return {
        id: handle.id,
        axis: handle.axis,
        x: (handle.mid.x - bounds.minX) * TILE_SIZE_2D + TILE_SIZE_2D / 2,
        y: (handle.mid.y - bounds.minY) * TILE_SIZE_2D + TILE_SIZE_2D / 2,
        active:
          hoveredSegmentHandle != null &&
          CoordsUtils.isEqual(handle.mid, hoveredSegmentHandle.mid)
      };
    });
  }, [isSelected, connector, bounds, hoveredSegmentHandle]);

  const connectorWidthPx = useMemo(() => {
    const base = (TILE_SIZE_2D / 100) * connector.width * 1.85;
    // Untagged links read clearer when slightly heavier
    return isUntaggedLink ? base * 1.35 : base;
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

  // Through-node: lighter + a bit sparser than solid, but still readable.
  const throughNodeDashArray = `${Math.max(3, connectorWidthPx * 1.0)}, ${Math.max(6, connectorWidthPx * 2.15)}`;
  // Patch→external inside cabinet: more transparent dashed run.
  const throughCabinetDashArray = `${Math.max(2, connectorWidthPx * 0.85)}, ${Math.max(7, connectorWidthPx * 2.6)}`;

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
  const emphasize = Boolean(
    isSelected || isFocused || isHighlighted || connector.locked
  );
  const lineOpacity = isDimmed
    ? softDim
      ? 0.55
      : 0.4
    : isHighlighted || connector.locked
      ? 1
      : emphasize
        ? 0.92
        : 0.72;
  const outlineOpacity = isDimmed
    ? softDim
      ? 0.35
      : 0.22
    : isHighlighted || connector.locked
      ? 0.85
      : emphasize
        ? 0.65
        : 0.45;
  const widthBoost = isHighlighted || connector.locked ? 1.55 : emphasize ? 1.25 : 1;
  /** Fade for segments under foreign node bodies — still visible, not solid. */
  const throughNodeLineOpacity = lineOpacity * 0.45;
  const throughNodeOutlineOpacity = outlineOpacity * 0.36;
  /** Stronger fade for patch-panel horizontal runs inside the cabinet. */
  const throughCabinetLineOpacity = lineOpacity * 0.22;
  const throughCabinetOutlineOpacity = outlineOpacity * 0.16;

  return (
    <Box
      className={`isoflow-cable ${endpointItemIds.map(id => `cable-target-${id}`).join(' ')}`}
      data-cable-id={connector.id}
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
          const isCabinetRun = Boolean(run.throughCabinet);
          const dash = isCabinetRun
            ? throughCabinetDashArray
            : run.throughNode
              ? throughNodeDashArray
              : solidDashArray;
          const coreWidth = connectorWidthPx * widthBoost;
          const runLineOpacity = isCabinetRun
            ? throughCabinetLineOpacity
            : run.throughNode
              ? throughNodeLineOpacity
              : lineOpacity;
          const runOutlineOpacity = isCabinetRun
            ? throughCabinetOutlineOpacity
            : run.throughNode
              ? throughNodeOutlineOpacity
              : outlineOpacity;

          return (
            <g
              key={`${isCabinetRun ? 'cab' : run.throughNode ? 'in' : 'out'}-${index}`}
            >
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
                strokeOpacity={runOutlineOpacity}
                strokeDasharray={dash}
                fill="none"
              />
              <path
                d={pathD}
                stroke={lineStroke}
                strokeWidth={coreWidth}
                strokeLinecap="butt"
                strokeLinejoin="round"
                strokeOpacity={runLineOpacity}
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
            : isSelected
              ? theme.palette.common.black
              : theme.palette.grey[700];
          // Larger grab targets — easier to drag mid-path "węzły".
          const outer = isSelected ? (anchor.locked ? 16 : 14) : 12;
          const inner = isSelected ? (anchor.locked ? 11 : 10) : 8.5;
          return (
            <g key={anchor.id}>
              <Circle
                tile={anchor}
                radius={outer}
                fill={anchor.locked ? lockedColor : theme.palette.common.white}
                fillOpacity={anchor.locked ? 0.28 : isSelected ? 0.75 : 0.6}
              />
              <Circle
                tile={anchor}
                radius={inner}
                stroke={stroke}
                fill={theme.palette.common.white}
                strokeWidth={isSelected ? (anchor.locked ? 3.5 : 3) : 2.75}
              />
              {anchor.locked && (
                <Circle
                  tile={anchor}
                  radius={4}
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
              radius={12}
              fill={theme.palette.primary.main}
              fillOpacity={0.25}
            />
            <Circle
              tile={anchor}
              radius={8}
              stroke={theme.palette.primary.main}
              fill={theme.palette.common.white}
              strokeWidth={3}
            />
          </g>
        ))}
      </Svg>

      {segmentHandles.map((handle) => {
        const size = handle.active ? 24 : 18;
        const iconSize = handle.active ? 16 : 12;
        const Icon =
          handle.axis === 'H' ? SwapVertOutlinedIcon : SwapHorizOutlinedIcon;
        return (
          <Box
            key={handle.id}
            sx={{
              position: 'absolute',
              left: handle.x,
              top: handle.y,
              // Counter SceneLayer zoom + grow when zoomed out (same idea as stack handles)
              transform: `translate(-50%, -50%) scale(${Math.min(
                1.5,
                Math.max(1, Math.pow(1 / Math.max(zoom, 0.12), 0.35))
              ) / Math.max(zoom, 0.08)})`,
              transformOrigin: 'center center',
              width: size,
              height: size,
              borderRadius: '4px',
              bgcolor: theme.palette.common.white,
              border: `${handle.active ? 1.5 : 1}px solid ${handleColor}`,
              boxShadow: handle.active
                ? '0 1px 4px rgba(0,0,0,0.2)'
                : '0 1px 2px rgba(0,0,0,0.12)',
              opacity: handle.active ? 1 : 0.72,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: handle.active ? 3 : 2
            }}
          >
            <Icon
              sx={{
                fontSize: iconSize,
                color: handleColor
              }}
            />
          </Box>
        );
      })}
    </Box>
  );
});
