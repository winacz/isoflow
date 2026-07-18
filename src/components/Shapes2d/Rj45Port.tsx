import React from 'react';
import { Box, Typography } from '@mui/material';
import { TILE_SIZE_2D, Shape2dPortSide } from 'src/config';

const PORT_STATUS_COLORS = ['#4c8bf5', '#3ecf8e', '#f0a04b', '#a78bfa'];

interface Props {
  side: Shape2dPortSide;
  tileSize?: number;
  portNumber: number;
  statusColor?: string;
}

/**
 * Port square matching the topology-card style.
 * Jack + handle are centered on the tile (connection point unchanged).
 * Port number sits below the jack without shifting the handle.
 */
export const Rj45Port = ({
  side,
  tileSize = TILE_SIZE_2D,
  portNumber,
  statusColor = PORT_STATUS_COLORS[(portNumber - 1) % PORT_STATUS_COLORS.length]
}: Props) => {
  const facesUp = side === 'TOP';
  const jackSize = Math.round(tileSize * 0.72);
  const barH = Math.max(3, Math.round(jackSize * 0.14));
  const iconSize = Math.round(jackSize * 0.72);
  const numberSize = Math.max(10, Math.round(tileSize * 0.22));
  const handleSize = Math.max(6, Math.round(tileSize * 0.16));

  return (
    <Box
      sx={{
        position: 'relative',
        width: tileSize,
        height: tileSize,
        boxSizing: 'border-box',
        pointerEvents: 'none'
      }}
    >
      {/* Jack centered on tile center (= connection attachment point) */}
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: jackSize,
          height: jackSize,
          transform: 'translate(-50%, -50%)',
          boxSizing: 'border-box',
          border: '1px solid #6b7c93',
          borderRadius: '3px',
          bgcolor: 'transparent',
          display: 'flex',
          flexDirection: facesUp ? 'column' : 'column-reverse',
          alignItems: 'center',
          overflow: 'hidden'
        }}
      >
        <Box
          sx={{
            width: '100%',
            height: barH,
            bgcolor: statusColor,
            flexShrink: 0
          }}
        />

        <Box
          sx={{
            flex: 1,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Box
            component="svg"
            viewBox="0 0 24 20"
            sx={{
              width: iconSize,
              height: iconSize * 0.85,
              display: 'block'
            }}
          >
            <path
              d="M4 3h16v8c0 1.1-.9 2-2 2h-1.2l-1.3 4H8.5l-1.3-4H6c-1.1 0-2-.9-2-2V3z"
              fill="none"
              stroke="#9aabc2"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            {[5, 8, 11, 14, 17].map((x) => {
              return (
                <line
                  key={x}
                  x1={x}
                  y1={5}
                  x2={x}
                  y2={10}
                  stroke="#9aabc2"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              );
            })}
          </Box>
        </Box>

        {/* Handle — center of the jack / tile */}
        <Box
          data-port-handle
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: handleSize,
            height: handleSize,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            bgcolor: '#3b82f6',
            border: '2px solid #1d4ed8',
            boxSizing: 'border-box',
            zIndex: 2,
            boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.25)'
          }}
        />
      </Box>

      <Typography
        sx={{
          position: 'absolute',
          left: '50%',
          top: `calc(50% + ${jackSize / 2}px + 2px)`,
          transform: 'translateX(-50%)',
          fontSize: numberSize,
          lineHeight: 1,
          color: '#8b9bb0',
          fontWeight: 500,
          userSelect: 'none',
          whiteSpace: 'nowrap'
        }}
      >
        {portNumber}
      </Typography>
    </Box>
  );
};

export const PORT_STATUS_COLORS_LIST = PORT_STATUS_COLORS;
