import React, { useMemo } from 'react';
import { useTheme, Box } from '@mui/material';
import OpenWithOutlinedIcon from '@mui/icons-material/OpenWithOutlined';
import { TILE_SIZE_2D } from 'src/config';
import {
  connectorPathTileToGlobal,
  getAnchorTile,
  getColorVariant,
  findWaypointSegmentAtTile,
  splitConnectorPathByNodeBodies,
  buildConnectorSvgPathD,
  getConnectorVlanColor,
  CONNECTOR_JUMP_RADIUS_TILES,
  type ConnectorJump
} from 'src/utils';
import { Circle } from 'src/components/Circle/Circle';
import { Svg } from 'src/components/Svg/Svg';
import { useConnector } from 'src/hooks/useConnector';
import { useScene } from 'src/hooks/useScene';
import { useColor } from 'src/hooks/useColor';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';

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

export const Connector2d = ({
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
  const paletteColor = useColor(_connector.color);
  const { currentView, items } = useScene();
  const connector = useConnector(_connector.id);
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const mouseTile = useUiStateStore((state) => {
    return state.mouse.position.tile;
  });
  const selectedWaypointIds = useUiStateStore((state) => {
    return state.selectedWaypointIds;
  });

  const vlanStroke = useMemo(() => {
    return getConnectorVlanColor({
      anchors: connector.anchors,
      modelItems
    });
  }, [connector.anchors, modelItems]);

  const strokeBase = vlanStroke ?? paletteColor.value;

  const globalTiles = useMemo(() => {
    return connector.path.tiles.map((tile) => {
      return connectorPathTileToGlobal(tile, connector.path.rectangle.from);
    });
  }, [connector.path.tiles, connector.path.rectangle.from]);

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

  const endpointItemIds = useMemo(() => {
    return connector.anchors
      .map((anchor) => {
        return anchor.ref.item;
      })
      .filter((itemId): itemId is string => {
        return Boolean(itemId);
      });
  }, [connector.anchors]);

  const styleRuns = useMemo(() => {
    return splitConnectorPathByNodeBodies({
      tiles: globalTiles,
      items,
      modelItems,
      endpointItemIds
    });
  }, [globalTiles, items, modelItems, endpointItemIds]);

  const anchorPositions = useMemo(() => {
    if (!isSelected) return [];

    return connector.anchors.map((anchor) => {
      const position = getAnchorTile(anchor, currentView, modelItems);
      return {
        id: anchor.id,
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
    if (!isSelected) return null;

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
    return (TILE_SIZE_2D / 100) * connector.width * 1.25;
  }, [connector.width]);

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

  const handleColor = vlanStroke
    ? strokeBase
    : getColorVariant(paletteColor.value, 'dark', { grade: 1 });
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
        zIndex: isHighlighted ? 4 : jumps.length > 0 || visualOffset ? 2 : 1,
        transition: visualOffset
          ? 'left 0.12s ease, top 0.12s ease'
          : undefined
      }}
    >
      <Svg viewboxSize={pxSize}>
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

          return (
            <g key={`${run.throughNode ? 'in' : 'out'}-${index}`}>
              <path
                d={pathD}
                stroke={theme.palette.common.white}
                strokeWidth={connectorWidthPx * (emphasize ? 1.8 : 1.4) * (isHighlighted ? 1.15 : 1)}
                strokeLinecap="butt"
                strokeLinejoin="round"
                strokeOpacity={outlineOpacity}
                strokeDasharray={dash}
                fill="none"
              />
              <path
                d={pathD}
                stroke={handleColor}
                strokeWidth={connectorWidthPx * widthBoost}
                strokeLinecap="butt"
                strokeLinejoin="round"
                strokeOpacity={lineOpacity}
                strokeDasharray={dash}
                fill="none"
              />
            </g>
          );
        })}
        {anchorPositions.map((anchor) => (
          <g key={anchor.id}>
            <Circle
              tile={anchor}
              radius={10}
              fill={theme.palette.common.white}
              fillOpacity={0.7}
            />
            <Circle
              tile={anchor}
              radius={7}
              stroke={theme.palette.common.black}
              fill={theme.palette.common.white}
              strokeWidth={3}
            />
          </g>
        ))}
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
            transform: 'translate(-50%, -50%)',
            width: 22,
            height: 22,
            borderRadius: '4px',
            bgcolor: theme.palette.common.white,
            border: `1.5px solid ${handleColor}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
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
};
