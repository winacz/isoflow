import React from 'react';
import { Box, Typography } from '@mui/material';
import { TILE_SIZE_2D, Shape2dPortSide } from 'src/config';
import { TRUNK_RAINBOW_CSS, TRUNK_MISMATCH_COLOR } from 'src/utils';

const PORT_STATUS_COLORS = ['#4c8bf5', '#3ecf8e', '#f0a04b', '#a78bfa'];
const PLUG_FILL = '#9aa3af';
const PLUG_STROKE = '#7a8494';

/** Frosted jack face — sits above chassis tint so device color doesn't muddy ports. */
const PORT_GLASS_SX = {
  bgcolor: 'rgba(255, 255, 255, 0.78)',
  backgroundImage:
    'linear-gradient(165deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.72) 45%, rgba(241,245,249,0.88) 100%)',
  backdropFilter: 'blur(5px)',
  WebkitBackdropFilter: 'blur(5px)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(100,116,139,0.1), 0 1px 2px rgba(15,23,42,0.04)',
  border: '1px solid rgba(107, 124, 147, 0.55)'
} as const;

interface Props {
  side: Shape2dPortSide;
  tileSize?: number;
  portNumber?: number;
  portLabel?: string;
  statusColor?: string;
  /** Trunk port — status bar uses rainbow instead of solid VLAN color. */
  isTrunk?: boolean;
  /** Highlight port with a red ring (trunk↔access / trunk↔host mismatch). */
  hasMismatch?: boolean;
  /** Soft selection ring when this port is focused in the sidebar. */
  isFocused?: boolean;
  /** Strong ring — peer port on the other end of a cable from the selected node. */
  isPeerHighlight?: boolean;
  /** Brief shake after jumping here from the relation panel. */
  isAttentionPulse?: boolean;
  isConnected?: boolean;
  /** RJ45 jack (default) or open SFP cage. */
  media?: 'RJ45' | 'SFP';
  /** Smaller iface labels for dense rack layouts (e.g. Gi0/0). */
  compactLabel?: boolean;
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
  isTrunk = false,
  hasMismatch = false,
  isFocused = false,
  isPeerHighlight = false,
  isAttentionPulse = false,
  isConnected = false,
  media = 'RJ45',
  compactLabel = false
}: Props) => {
  const facesUp = side === 'TOP';
  const jackSize = Math.round(tileSize * 0.72);
  const barH = Math.max(3, Math.round(jackSize * 0.14));
  const iconSize = Math.round(jackSize * 0.72);
  const label = portLabel ?? String(portNumber);
  const numberSize = compactLabel
    ? Math.max(6, Math.round(tileSize * (label.length > 3 ? 0.14 : 0.2)))
    : Math.max(10, Math.round(tileSize * (label.length > 3 ? 0.26 : 0.34)));
  const isSfp = media === 'SFP';

  return (
    <Box
      sx={{
        position: 'relative',
        width: tileSize,
        height: tileSize,
        boxSizing: 'border-box',
        pointerEvents: 'none',
        '@keyframes portAttentionShake': {
          '0%, 100%': {
            transform: 'translate(-50%, -50%) rotate(0deg) scale(1)'
          },
          '12%': {
            transform: 'translate(-50%, -50%) translateX(-3px) rotate(-6deg) scale(1.18)'
          },
          '24%': {
            transform: 'translate(-50%, -50%) translateX(3px) rotate(6deg) scale(1.18)'
          },
          '36%': {
            transform: 'translate(-50%, -50%) translateX(-2px) rotate(-4deg) scale(1.14)'
          },
          '48%': {
            transform: 'translate(-50%, -50%) translateX(2px) rotate(4deg) scale(1.14)'
          },
          '60%': {
            transform: 'translate(-50%, -50%) translateX(-1px) rotate(-2deg) scale(1.08)'
          },
          '72%': {
            transform: 'translate(-50%, -50%) translateX(1px) rotate(2deg) scale(1.08)'
          }
        }
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
          borderRadius: isSfp ? '2px' : '3px',
          display: 'flex',
          flexDirection: facesUp ? 'column' : 'column-reverse',
          alignItems: 'center',
          overflow: 'hidden',
          ...PORT_GLASS_SX,
          ...(hasMismatch
            ? {
                border: `3px solid ${TRUNK_MISMATCH_COLOR}`,
                bgcolor: 'rgba(239, 68, 68, 0.92)',
                backgroundImage: 'none',
                boxShadow: `0 0 0 3px rgba(239, 68, 68, 0.45), 0 0 18px rgba(239, 68, 68, 0.55), inset 0 1px 0 rgba(255,255,255,0.35)`,
                transform: 'translate(-50%, -50%) scale(1.15)'
              }
            : null),
          ...(isPeerHighlight && !hasMismatch
            ? {
                border: '3px solid #f59e0b',
                boxShadow: `0 0 0 4px rgba(245, 158, 11, 0.5), 0 0 16px rgba(245, 158, 11, 0.65), inset 0 1px 0 rgba(255,255,255,0.95)`,
                transform: 'translate(-50%, -50%) scale(1.12)'
              }
            : null),
          ...(isFocused && !isPeerHighlight && !hasMismatch
            ? {
                border: '2px solid #3b82f6',
                boxShadow: `0 0 0 3px rgba(59, 130, 246, 0.32), 0 0 10px rgba(59, 130, 246, 0.22), inset 0 1px 0 rgba(255,255,255,0.95)`
              }
            : null),
          ...(isAttentionPulse
            ? {
                zIndex: 6,
                border: hasMismatch
                  ? `3px solid ${TRUNK_MISMATCH_COLOR}`
                  : '3px solid #2563eb',
                boxShadow: hasMismatch
                  ? `0 0 0 4px rgba(239, 68, 68, 0.5), 0 0 22px rgba(239, 68, 68, 0.55)`
                  : '0 0 0 4px rgba(37, 99, 235, 0.45), 0 0 22px rgba(37, 99, 235, 0.55), inset 0 1px 0 rgba(255,255,255,0.95)',
                animation: 'portAttentionShake 0.85s ease-in-out 1'
              }
            : null)
        }}
      >
        <Box
          sx={{
            width: '100%',
            height: barH,
            bgcolor: hasMismatch
              ? '#fecaca'
              : isTrunk
                ? undefined
                : statusColor,
            background: hasMismatch
              ? undefined
              : isTrunk
                ? TRUNK_RAINBOW_CSS
                : undefined,
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
