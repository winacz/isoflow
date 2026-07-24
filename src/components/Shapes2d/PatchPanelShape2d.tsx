import React, { useId, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import {
  TILE_SIZE_2D,
  CABINET_EAR_TILES,
  PATCH_PANEL_COLOR,
  PATCH_PANEL_DEFAULT_PORTS,
  getPatchPanelSize,
  getPatchPanelPorts
} from 'src/config';
import { SHAPE_2D_PORT_VISUAL_SIZE_TILES } from 'src/utils';
import { Rj45Port } from 'src/components/Shapes2d/Rj45Port';

interface Props {
  itemId?: string;
  name?: string;
  portCount?: number;
  width?: number;
  height?: number;
  centered?: boolean;
  showShadow?: boolean;
  /** Dim / non-interactive look when not mounted in a cabinet. */
  inactive?: boolean;
  connectedPortIds?: ReadonlySet<string> | string[];
  focusedPortIds?: ReadonlySet<string> | string[] | null;
  peerHighlightPortIds?: ReadonlySet<string> | string[];
}

/**
 * Dark-grey 1U patch panel — visually distinct from switches.
 * Full-bay footprint (ears included). Each jack accepts two cables (bridge).
 */
export const PatchPanelShape2d = ({
  itemId,
  name = 'PATCH PANEL',
  portCount = PATCH_PANEL_DEFAULT_PORTS,
  width,
  height,
  centered = true,
  showShadow = true,
  inactive = false,
  connectedPortIds,
  focusedPortIds = null,
  peerHighlightPortIds
}: Props) => {
  const earMaskUid = useId().replace(/:/g, '');
  const footprint = useMemo(() => getPatchPanelSize(), []);
  const ports = useMemo(() => getPatchPanelPorts(portCount), [portCount]);

  const pxWidth = width ?? footprint.width * TILE_SIZE_2D;
  const pxHeight = height ?? footprint.height * TILE_SIZE_2D;
  const scaleX = pxWidth / (footprint.width * TILE_SIZE_2D);
  const scaleY = pxHeight / (footprint.height * TILE_SIZE_2D);
  const tileW = TILE_SIZE_2D * scaleX;
  const tileH = TILE_SIZE_2D * scaleY;
  const cellSize = Math.min(tileW, tileH);
  const portTileSize = cellSize * SHAPE_2D_PORT_VISUAL_SIZE_TILES;
  const earW = Math.max(1, Math.round(CABINET_EAR_TILES * tileW));
  const chassisW = Math.max(1, pxWidth - earW * 2);
  const mountHoleW = Math.max(12, Math.round(earW * 0.72));
  const mountHoleH = Math.max(6, Math.round(mountHoleW * 0.42));
  const earRadius = Math.max(4, Math.round(earW * 0.28));

  const connectedSet = useMemo(() => {
    if (!connectedPortIds) return null;
    return connectedPortIds instanceof Set
      ? connectedPortIds
      : new Set(connectedPortIds);
  }, [connectedPortIds]);

  const focusedSet = useMemo(() => {
    if (!focusedPortIds) return null;
    return focusedPortIds instanceof Set
      ? focusedPortIds
      : new Set(focusedPortIds);
  }, [focusedPortIds]);

  const peerSet = useMemo(() => {
    if (!peerHighlightPortIds) return null;
    return peerHighlightPortIds instanceof Set
      ? peerHighlightPortIds
      : new Set(peerHighlightPortIds);
  }, [peerHighlightPortIds]);

  const label = name.trim() || 'PATCH PANEL';

  return (
    <Box
      sx={{
        position: centered ? 'absolute' : 'relative',
        width: pxWidth,
        height: pxHeight,
        left: centered ? -pxWidth / 2 : 0,
        top: centered ? -pxHeight / 2 : 0,
        pointerEvents: 'none',
        boxSizing: 'border-box',
        overflow: 'visible',
        opacity: inactive ? 0.55 : 1,
        filter: showShadow
          ? 'drop-shadow(0 2px 4px rgba(15,23,42,0.22))'
          : undefined
      }}
    >
      {(['left', 'right'] as const).map((side) => {
        const cx = earW / 2;
        const hw = mountHoleW / 2;
        const hh = mountHoleH / 2;
        const fracs = [0.25, 0.75];
        const maskId = `pp-ear-mask-${side}-${earMaskUid}`;
        const gradId = `pp-ear-grad-${side}-${earMaskUid}`;
        const rx = earRadius;

        return (
          <Box
            key={side}
            component="svg"
            width={earW}
            height={pxHeight}
            viewBox={`0 0 ${earW} ${pxHeight}`}
            sx={{
              position: 'absolute',
              left: side === 'left' ? 0 : undefined,
              right: side === 'right' ? 0 : undefined,
              top: 0,
              zIndex: 0,
              pointerEvents: 'none',
              display: 'block'
            }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#5a6270" />
                <stop offset="50%" stopColor="#4a5260" />
                <stop offset="100%" stopColor="#3a424c" />
              </linearGradient>
              <mask id={maskId}>
                <rect width={earW} height={pxHeight} fill="white" />
                {fracs.map((frac) => {
                  const cy = pxHeight * frac;
                  return (
                    <rect
                      key={frac}
                      x={cx - hw}
                      y={cy - hh}
                      width={mountHoleW}
                      height={mountHoleH}
                      rx={hh}
                      ry={hh}
                      fill="black"
                    />
                  );
                })}
              </mask>
            </defs>
            <path
              d={
                side === 'left'
                  ? [
                      `M ${earW} 0`,
                      `L ${rx} 0`,
                      `Q 0 0 0 ${rx}`,
                      `L 0 ${pxHeight - rx}`,
                      `Q 0 ${pxHeight} ${rx} ${pxHeight}`,
                      `L ${earW} ${pxHeight}`,
                      'Z'
                    ].join(' ')
                  : [
                      `M 0 0`,
                      `L ${earW - rx} 0`,
                      `Q ${earW} 0 ${earW} ${rx}`,
                      `L ${earW} ${pxHeight - rx}`,
                      `Q ${earW} ${pxHeight} ${earW - rx} ${pxHeight}`,
                      `L 0 ${pxHeight}`,
                      'Z'
                    ].join(' ')
              }
              fill={`url(#${gradId})`}
              mask={`url(#${maskId})`}
            />
          </Box>
        );
      })}

      {/* Dark-grey chassis */}
      <Box
        sx={{
          position: 'absolute',
          left: earW,
          top: 0,
          width: chassisW,
          height: pxHeight,
          bgcolor: PATCH_PANEL_COLOR,
          border: '2px solid #2a3038',
          boxSizing: 'border-box',
          zIndex: 1,
          backgroundImage:
            'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 42%, rgba(0,0,0,0.22) 100%)'
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          left: earW + 6,
          top: 3,
          zIndex: 2,
          maxWidth: chassisW * 0.28
        }}
      >
        <Typography
          sx={{
            fontSize: Math.max(8, Math.round(pxHeight * 0.14)),
            fontWeight: 700,
            letterSpacing: 0.8,
            color: 'rgba(226,232,240,0.62)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            userSelect: 'none'
          }}
        >
          {label}
        </Typography>
      </Box>

      {ports.map((port) => {
        const isConnected = connectedSet?.has(port.id) ?? false;
        const isFocused = focusedSet?.has(port.id) ?? false;
        const isPeer = peerSet?.has(port.id) ?? false;

        return (
          <Box
            key={port.id}
            sx={{
              position: 'absolute',
              left: port.tile.x * tileW + tileW / 2,
              top: port.tile.y * tileH + tileH / 2,
              width: portTileSize,
              height: portTileSize,
              transform: 'translate(-50%, -50%)',
              zIndex: isFocused || isPeer ? 4 : 3,
              pointerEvents: 'none'
            }}
          >
            <Rj45Port
              side={port.side}
              itemId={itemId}
              portId={port.id}
              portLabel={port.label}
              media="RJ45"
              tileSize={portTileSize}
              portNumber={Number(port.label) || 1}
              isConnected={isConnected}
              isFocused={isFocused}
              isPeerHighlight={isPeer}
              compactLabel
              hideStatusBar
            />
          </Box>
        );
      })}
    </Box>
  );
};
