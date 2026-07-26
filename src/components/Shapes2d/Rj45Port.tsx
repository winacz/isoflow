import React from 'react';
import { Box, Typography } from '@mui/material';
import { TILE_SIZE_2D, Shape2dPortSide } from 'src/config';
import { TRUNK_RAINBOW_CSS, TRUNK_MISMATCH_COLOR } from 'src/utils';

const PORT_STATUS_COLORS = ['#4c8bf5', '#3ecf8e', '#f0a04b', '#a78bfa'];

/** LibreICONS RJ45 (MIT — Diemen Design). */
const RJ45_BEZEL = '#cfd8dc';
const RJ45_BODY = '#455a64';
const RJ45_PINS = '#fdd835';

interface Props {
  itemId?: string; // ID of the device this port belongs to
  side: Shape2dPortSide;
  tileSize?: number;
  portId?: string; // Add portId to construct the ID
  portNumber?: number;
  portLabel?: string;
  statusColor?: string;
  isTrunk?: boolean;
  hasMismatch?: boolean;
  isFocused?: boolean;
  isPeerHighlight?: boolean;
  isAttentionPulse?: boolean;
  isConnected?: boolean;
  media?: 'RJ45' | 'SFP';
  compactLabel?: boolean;
  hideStatusBar?: boolean;
  /** Template PoE direction — yellow bolt + PoE IN/Out label. */
  poe?: 'IN' | 'OUT' | null;
  /** Endpoint powered by PoE — green bolt next to port number. */
  poweredByPoe?: boolean;
  /**
   * Where the port number sits relative to the jack.
   * Bottom-row ports should use `above` so labels stay inside the chassis.
   */
  labelPosition?: 'below' | 'above';
  /** Cursor hover — jack zooms for easier click / cable start. */
  isHovered?: boolean;
}

export const Rj45Port = ({
  itemId,
  side: _side,
  tileSize = TILE_SIZE_2D,
  portId,
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
  compactLabel = false,
  hideStatusBar = false,
  poe = null,
  poweredByPoe = false,
  labelPosition = 'above',
  isHovered = false
}: Props) => {
  const jackSize = Math.round(tileSize * 0.72);
  const barH = hideStatusBar ? 0 : Math.max(3, Math.round(jackSize * 0.16));
  const iconSize = Math.round(jackSize * 0.92);
  const portW = iconSize;
  const label = portLabel ?? String(portNumber);
  const numberSize = compactLabel
    ? Math.max(6, Math.round(tileSize * (label.length > 3 ? 0.14 : 0.2)))
    : Math.max(10, Math.round(tileSize * (label.length > 3 ? 0.26 : 0.34)));
  const isSfp = media === 'SFP';
  const stackH = barH + iconSize;
  const bezelBg = hasMismatch ? '#fecaca' : RJ45_BEZEL;
  const labelAbove = labelPosition !== 'below';
  // Number stays above the jack; PoE sits below so they never collide.
  const poeBelow = labelAbove;

  return (
    <Box
      id={itemId && portId ? `isoflow-port-${itemId}-${portId}` : undefined}
      className={itemId && portId ? "isoflow-export-port" : undefined}
      data-item-id={itemId}
      data-port-id={portId}
      sx={{
        position: 'relative',
        width: tileSize,
        height: tileSize,
        boxSizing: 'border-box',
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: isHovered ? 5 : undefined,
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
          width: tileSize,
          height: tileSize,
          transform: isHovered
            ? 'translate(-50%, -50%) scale(1.22)'
            : 'translate(-50%, -50%) scale(1)',
          transformOrigin: 'center center',
          transition: 'transform 0.14s ease',
          overflow: 'visible'
        }}
      >
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: portW,
          height: stackH,
          transform: 'translate(-50%, -50%)',
          transformOrigin: 'center center',
          transition:
            'transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          overflow: 'hidden',
          borderRadius: isSfp ? '2px' : '3px',
          bgcolor: isSfp ? 'rgba(255, 255, 255, 0.78)' : bezelBg,
          border: isSfp
            ? '1px solid rgba(107, 124, 147, 0.55)'
            : `1px solid ${hasMismatch ? TRUNK_MISMATCH_COLOR : 'rgba(69, 90, 100, 0.35)'}`,
          ...(hasMismatch
            ? {
                border: `3px solid ${TRUNK_MISMATCH_COLOR}`,
                bgcolor: 'rgba(239, 68, 68, 0.92)',
                boxShadow: `0 0 0 3px rgba(239, 68, 68, 0.45), 0 0 18px rgba(239, 68, 68, 0.55)`,
                transform: 'translate(-50%, -50%) scale(1.15)'
              }
            : null),
          ...(isPeerHighlight && !hasMismatch
            ? {
                border: '3px solid #f59e0b',
                boxShadow: `0 0 0 4px rgba(245, 158, 11, 0.5), 0 0 16px rgba(245, 158, 11, 0.65)`,
                transform: 'translate(-50%, -50%) scale(1.12)'
              }
            : null),
          ...(isFocused && !isPeerHighlight && !hasMismatch
            ? {
                border: '2px solid #3b82f6',
                boxShadow: `0 0 0 3px rgba(59, 130, 246, 0.32), 0 0 10px rgba(59, 130, 246, 0.22)`
              }
            : null),
          ...(isHovered && !hasMismatch && !isPeerHighlight && !isAttentionPulse
            ? {
                border: isFocused
                  ? '2px solid #3b82f6'
                  : '2px solid rgba(59, 130, 246, 0.9)',
                boxShadow:
                  '0 0 0 3px rgba(59, 130, 246, 0.4), 0 0 14px rgba(59, 130, 246, 0.45)'
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
                  : '0 0 0 4px rgba(37, 99, 235, 0.45), 0 0 22px rgba(37, 99, 235, 0.55)',
                animation: 'portAttentionShake 0.85s ease-in-out 1'
              }
            : null)
        }}
      >
        {/* VLAN badge — glued to top, same width as port, on port bezel bg */}
        {!hideStatusBar && (
        <Box
          sx={{
            width: '100%',
            height: barH,
            flexShrink: 0,
            boxSizing: 'border-box',
            bgcolor: bezelBg,
            display: 'flex',
            alignItems: 'stretch',
            padding: '1px 1px 0'
          }}
        >
          <Box
            sx={{
              flex: 1,
              borderRadius: '1px 1px 0 0',
              bgcolor: hasMismatch
                ? '#fecaca'
                : isTrunk
                  ? undefined
                  : statusColor,
              background: hasMismatch
                ? undefined
                : isTrunk
                  ? TRUNK_RAINBOW_CSS
                  : undefined
            }}
          />
        </Box>
        )}

        <Box
          sx={{
            flex: 1,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            bgcolor: isSfp ? 'transparent' : bezelBg,
            minHeight: iconSize
          }}
        >
          {isSfp ? (
            <Box
              component="svg"
              viewBox="0 0 24 20"
              sx={{
                width: iconSize * 0.92,
                height: iconSize * 0.78,
                display: 'block'
              }}
            >
              <rect
                x="3"
                y="3"
                width="18"
                height="14"
                rx="1.5"
                fill="none"
                stroke="#9aabc2"
                strokeWidth="1.4"
              />
              <rect
                x="6"
                y="6"
                width="12"
                height="8"
                rx="0.8"
                fill="none"
                stroke="#9aabc2"
                strokeWidth="1.2"
              />
              <line
                x1="9"
                y1="3"
                x2="9"
                y2="6"
                stroke="#9aabc2"
                strokeWidth="1.1"
              />
              <line
                x1="15"
                y1="3"
                x2="15"
                y2="6"
                stroke="#9aabc2"
                strokeWidth="1.1"
              />
              {isConnected && (
                <g opacity="0.55">
                  <rect
                    x="5.2"
                    y="5.2"
                    width="13.6"
                    height="9.6"
                    rx="0.9"
                    fill="rgba(226, 232, 240, 0.85)"
                    stroke="rgba(100, 116, 139, 0.55)"
                    strokeWidth="0.9"
                  />
                  <rect
                    x="7"
                    y="7"
                    width="10"
                    height="6"
                    rx="0.5"
                    fill="rgba(148, 163, 184, 0.35)"
                  />
                </g>
              )}
            </Box>
          ) : (
            <Box
              component="svg"
              viewBox="0 0 14 14"
              role="img"
              aria-hidden
              sx={{
                width: iconSize,
                height: iconSize,
                display: 'block'
              }}
            >
              {/* Bezel — matches stack background so badge + jack read as one unit */}
              <path
                fill={bezelBg}
                d="M13 11.6667c0 .7363-.597 1.3333-1.3333 1.3333H2.3333C1.597 13 1 12.403 1 11.6667V2.3333C1 1.597 1.597 1 2.3333 1h9.3334C12.403 1 13 1.597 13 2.3333v9.3334z"
              />
              <g fill={hasMismatch ? '#991b1b' : RJ45_BODY}>
                <path d="M2.6667 3.3333h8.6666v5.3334H2.6667z" />
                <path d="M4 7.3333h6v2.3334H4z" />
                <path d="M5.3333 8.6667h3.3334v2H5.3333z" />
              </g>
              <path
                fill={hasMismatch ? '#fef08a' : RJ45_PINS}
                d="M3.6667 4h.6666v2.3333H3.6667zm1 0h.6666v2.3333H4.6667zm1 0h.6666v2.3333H5.6667zm1 0h.6666v2.3333H6.6667zm1 0h.6666v2.3333H7.6667zm1 0h.6666v2.3333H8.6667zm1 0h.6666v2.3333H9.6667z"
              />
              {/* Translucent RJ45 plug — inserted when the port has a cable */}
              {isConnected && (
                <g opacity="0.58">
                  {/* Nose / contact block covering pins */}
                  <rect
                    x="3.15"
                    y="3.55"
                    width="7.7"
                    height="4.35"
                    rx="0.25"
                    fill="rgba(241, 245, 249, 0.88)"
                    stroke="rgba(71, 85, 105, 0.4)"
                    strokeWidth="0.35"
                  />
                  {/* Plug body in latch well */}
                  <path
                    d="M4.15 7.85h5.7v2.05H4.15z"
                    fill="rgba(203, 213, 225, 0.9)"
                    stroke="rgba(71, 85, 105, 0.35)"
                    strokeWidth="0.3"
                  />
                  {/* Latch tab */}
                  <path
                    d="M5.45 9.75h3.1l0.45 1.55H5z"
                    fill="rgba(148, 163, 184, 0.75)"
                    stroke="rgba(71, 85, 105, 0.4)"
                    strokeWidth="0.25"
                    strokeLinejoin="round"
                  />
                  {/* Boot tip hint */}
                  <rect
                    x="5.55"
                    y="11.15"
                    width="2.9"
                    height="0.85"
                    rx="0.2"
                    fill="rgba(148, 163, 184, 0.55)"
                  />
                </g>
              )}
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

      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: labelAbove
            ? `calc(50% - ${stackH / 2}px - 1px)`
            : `calc(50% + ${stackH / 2}px + 2px)`,
          transform: labelAbove ? 'translate(-50%, -100%)' : 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          pointerEvents: 'none',
          whiteSpace: 'nowrap'
        }}
      >
        <Typography
          component="span"
          sx={{
            fontSize: numberSize,
            lineHeight: 1,
            color: isHovered ? '#2563eb' : '#8b9bb0',
            fontWeight: isHovered ? 700 : 500,
            textShadow: isHovered
              ? '0 0 6px rgba(37, 99, 235, 0.45)'
              : undefined,
            transition: 'color 0.14s ease, text-shadow 0.14s ease',
            userSelect: 'none'
          }}
        >
          {label}
        </Typography>
        {(poe || poweredByPoe) && (
          <Box
            component="svg"
            viewBox="0 0 12 16"
            aria-hidden
            sx={{
              width: Math.max(7, Math.round(numberSize * 0.95)),
              height: Math.max(9, Math.round(numberSize * 1.2)),
              display: 'block',
              flexShrink: 0
            }}
          >
            <path
              d="M7.2 0.5L2.1 8.2h3.1L3.4 15.5 10.2 6.4H6.8L7.2 0.5z"
              fill={poweredByPoe && !poe ? '#22c55e' : '#facc15'}
              stroke={poweredByPoe && !poe ? '#15803d' : '#ca8a04'}
              strokeWidth={0.4}
              strokeLinejoin="round"
            />
          </Box>
        )}
      </Box>

      {poe && (
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: poeBelow
              ? `calc(50% + ${stackH / 2}px + 2px)`
              : `calc(50% - ${stackH / 2}px - 2px)`,
            transform: poeBelow
              ? 'translateX(-50%)'
              : 'translate(-50%, -100%)',
            px: 0.35,
            py: 0.1,
            borderRadius: 0.5,
            bgcolor: 'transparent',
            border: 'none',
            color: poe === 'OUT' ? '#a16207' : '#64748b',
            fontSize: Math.max(6, Math.round(tileSize * 0.145)),
            fontWeight: 500,
            letterSpacing: 0.15,
            lineHeight: 1.15,
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            pointerEvents: 'none'
          }}
        >
          {poe === 'OUT' ? 'PoE Out' : 'PoE IN'}
        </Box>
      )}
      </Box>
    </Box>
  );
};

export const PORT_STATUS_COLORS_LIST = PORT_STATUS_COLORS;
