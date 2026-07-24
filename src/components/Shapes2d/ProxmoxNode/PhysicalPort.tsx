import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import type { Shape2dPort } from 'src/config';
import { SHAPE_2D_PORT_VISUAL_SIZE_TILES } from 'src/utils';
import { Rj45Port } from 'src/components/Shapes2d/Rj45Port';

interface Props {
  itemId?: string;
  port: Shape2dPort;
  /** Display label under/above the jack (e.g. eth0). */
  name: string;
  tileW: number;
  tileH: number;
  isConnected?: boolean;
  isFocused?: boolean;
  isPeerHighlight?: boolean;
  attentionPortId?: string | null;
  attentionToken?: number | null;
  /** OOB / BMC management port (iDRAC etc.). */
  isMgmt?: boolean;
}

/**
 * Physical NIC jack positioned in tile space — same coordinate system as
 * DeviceShape2d, so getNearestShape2dPort / orthogonal routing snap correctly.
 */
export const PhysicalPort = ({
  itemId,
  port,
  name,
  tileW,
  tileH,
  isConnected = false,
  isFocused = false,
  isPeerHighlight = false,
  attentionPortId = null,
  attentionToken = null,
  isMgmt = false
}: Props) => {
  const cellSize = Math.min(tileW, tileH);
  const portTileSize = cellSize * SHAPE_2D_PORT_VISUAL_SIZE_TILES;
  const label = isMgmt
    ? name
    : name.replace(/^eth/i, '') || port.label || port.id;

  const attentionKey = useMemo(() => {
    return attentionPortId === port.id ? attentionToken : null;
  }, [attentionPortId, attentionToken, port.id]);

  return (
    <Box
      data-port-id={port.id}
      data-port-handle-root=""
      sx={{
        position: 'absolute',
        left: port.tile.x * tileW,
        top: port.tile.y * tileH,
        width: tileW,
        height: tileH,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: isFocused || isPeerHighlight ? 4 : 3
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: portTileSize,
          height: portTileSize,
          ...(isMgmt
            ? {
                outline: '2px solid #64748b',
                outlineOffset: 1,
                borderRadius: 0.5
              }
            : {})
        }}
      >
        <Rj45Port
          itemId={itemId}
          portId={port.id}
          side={port.side}
          portLabel={label}
          media={port.media ?? 'RJ45'}
          tileSize={portTileSize}
          portNumber={Number(port.label) || 1}
          isConnected={isConnected}
          isFocused={isFocused}
          isPeerHighlight={isPeerHighlight}
          isAttentionPulse={attentionKey != null}
          compactLabel
          hideStatusBar
        />
      </Box>
      {/* Invisible magnetic marker at jack center — DOM hook for overlays. */}
      <Box
        component="span"
        className="magnetic-snap-point"
        data-port-id={port.id}
        sx={{
          position: 'absolute',
          left: '50%',
          bottom: 0,
          width: 8,
          height: 8,
          transform: 'translate(-50%, 50%)',
          borderRadius: '50%',
          bgcolor: 'transparent',
          pointerEvents: 'none'
        }}
      />
      <Typography
        sx={{
          position: 'absolute',
          top: -14,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: Math.max(8, Math.round(cellSize * 0.28)),
          fontWeight: 700,
          color: isMgmt ? '#475569' : '#334155',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          lineHeight: 1
        }}
      >
        {name}
      </Typography>
    </Box>
  );
};
