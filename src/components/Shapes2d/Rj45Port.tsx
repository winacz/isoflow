import React from 'react';
import { Box, Typography } from '@mui/material';
import { TILE_SIZE_2D, Shape2dPortSide } from 'src/config';

const PORT_STATUS_COLORS = ['#4c8bf5', '#3ecf8e', '#f0a04b', '#a78bfa'];
const PLUG_FILL = '#9aa3af';
const PLUG_STROKE = '#7a8494';

interface Props {
  side: Shape2dPortSide;
  tileSize?: number;
  portNumber?: number;
  portLabel?: string;
  statusColor?: string;
  isConnected?: boolean;
  /** RJ45 jack (default) or open SFP cage. */
  media?: 'RJ45' | 'SFP';
}

/**
 * Port square matching the topology-card style.
 * Jack center = connection attachment point (no visible handle dots).
 */
export const Rj45Port = ({
  side,
  tileSize = TILE_SIZE_2D,
  portNumber = 1,
  portLabel,
  statusColor = PORT_STATUS_COLORS[(portNumber - 1) % PORT_STATUS_COLORS.length],
  isConnected = false,
  media = 'RJ45'
}: Props) => {
  const facesUp = side === 'TOP';
  const jackSize = Math.round(tileSize * 0.72);
  const barH = Math.max(3, Math.round(jackSize * 0.14));
  const iconSize = Math.round(jackSize * 0.72);
  const label = portLabel ?? String(portNumber);
  const numberSize = Math.max(
    8,
    Math.round(tileSize * (label.length > 3 ? 0.16 : 0.22))
  );
  const isSfp = media === 'SFP';

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
          borderRadius: isSfp ? '2px' : '3px',
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
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          {isSfp ? (
            <Box
              component="svg"
              viewBox="0 0 24 20"
              sx={{
                width: iconSize,
                height: iconSize * 0.85,
                display: 'block'
              }}
            >
              {/* Open SFP cage slot */}
              <rect
                x="3"
                y="3"
                width="18"
                height="14"
                rx="1.5"
                fill={isConnected ? PLUG_FILL : 'none'}
                stroke={isConnected ? PLUG_STROKE : '#9aabc2'}
                strokeWidth="1.4"
              />
              <rect
                x="6"
                y="6"
                width="12"
                height="8"
                rx="0.8"
                fill="none"
                stroke={isConnected ? '#6b7380' : '#9aabc2'}
                strokeWidth="1.2"
              />
              <line
                x1="9"
                y1="3"
                x2="9"
                y2="6"
                stroke={isConnected ? '#6b7380' : '#9aabc2'}
                strokeWidth="1.1"
              />
              <line
                x1="15"
                y1="3"
                x2="15"
                y2="6"
                stroke={isConnected ? '#6b7380' : '#9aabc2'}
                strokeWidth="1.1"
              />
            </Box>
          ) : (
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
                fill={isConnected ? PLUG_FILL : 'none'}
                stroke={isConnected ? PLUG_STROKE : '#9aabc2'}
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
                    stroke={isConnected ? '#6b7380' : '#9aabc2'}
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                );
              })}
            </Box>
          )}

          <Box
            data-port-handle
            sx={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 1,
              height: 1,
              transform: 'translate(-50%, -50%)',
              opacity: 0,
              pointerEvents: 'none'
            }}
          />
        </Box>
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
        {label}
      </Typography>
    </Box>
  );
};

export const PORT_STATUS_COLORS_LIST = PORT_STATUS_COLORS;
