import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import {
  TILE_SIZE_2D,
  RACK_1U_WIDTH_TILES,
  RACK_1U_HEIGHT_TILES,
  CABINET_EAR_TILES,
  CABINET_HEADER_TILES,
  CABINET_DEFAULT_UNITS,
  getCabinetSize
} from 'src/config';
import { DeviceTypeIcon } from 'src/components/Icons/DeviceTypeIcon';
import { parseDeviceColor } from 'src/utils';

interface Props {
  name?: string;
  rackUnits?: number;
  width?: number;
  height?: number;
  centered?: boolean;
  /** Chassis tint (hex / hex8), same as device color. */
  color?: string;
  /** Highlight a free U slot while snapping (0-based). */
  highlightUnit?: number | null;
  /** Occupied rack unit indices (0-based) that have a mounted device. */
  occupiedUnits?: ReadonlySet<number> | number[];
}

/**
 * Rack cabinet — rails, U slots, free/occupied indication.
 */
export const CabinetShape2d = ({
  name = 'SZAFA',
  rackUnits = CABINET_DEFAULT_UNITS,
  width,
  height,
  centered = true,
  color,
  highlightUnit = null,
  occupiedUnits
}: Props) => {
  const footprint = useMemo(() => {
    return getCabinetSize(rackUnits);
  }, [rackUnits]);
  const pxWidth = width ?? footprint.width * TILE_SIZE_2D;
  const pxHeight = height ?? footprint.height * TILE_SIZE_2D;
  const scaleX = pxWidth / (footprint.width * TILE_SIZE_2D);
  const scaleY = pxHeight / (footprint.height * TILE_SIZE_2D);
  const tileW = TILE_SIZE_2D * scaleX;
  const tileH = TILE_SIZE_2D * scaleY;
  const earW = CABINET_EAR_TILES * tileW;
  const headerH = CABINET_HEADER_TILES * tileH;
  const slotH = RACK_1U_HEIGHT_TILES * tileH;
  const contentW = RACK_1U_WIDTH_TILES * tileW;
  const units = footprint.height
    ? Math.round((footprint.height - CABINET_HEADER_TILES) / RACK_1U_HEIGHT_TILES)
    : rackUnits;
  const chassisTint = parseDeviceColor(color);

  const occupied = useMemo(() => {
    if (!occupiedUnits) return new Set<number>();
    return occupiedUnits instanceof Set
      ? occupiedUnits
      : new Set(occupiedUnits);
  }, [occupiedUnits]);

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
        overflow: 'hidden',
        filter:
          'drop-shadow(0 5px 12px rgba(15,23,42,0.22)) drop-shadow(0 2px 4px rgba(15,23,42,0.12))'
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: '#c5d0dc',
          border: '1px solid #7a8ba3',
          borderRadius: Math.max(2, Math.round(tileW * 0.06)),
          boxSizing: 'border-box'
        }}
      />

      {/* Side rails — no mounting holes */}
      {[0, 1].map((side) => {
        return (
          <Box
            key={side}
            sx={{
              position: 'absolute',
              left: side === 0 ? 0 : undefined,
              right: side === 1 ? 0 : undefined,
              top: 0,
              width: earW,
              height: pxHeight,
              bgcolor: '#8b97a8',
              border: '1px solid #64748b',
              boxSizing: 'border-box',
              backgroundImage:
                'linear-gradient(90deg, rgba(255,255,255,0.22) 0%, transparent 45%, rgba(0,0,0,0.12) 100%)',
              zIndex: 2
            }}
          />
        );
      })}

      {/* Header */}
      <Box
        sx={{
          position: 'absolute',
          left: earW,
          top: 0,
          width: contentW,
          height: headerH,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: `${Math.max(6, tileW * 0.25)}px`,
          boxSizing: 'border-box',
          borderBottom: '1px solid #94a3b8',
          bgcolor: 'rgba(248,250,252,0.92)',
          zIndex: 3
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: `${Math.max(4, tileW * 0.15)}px`,
            minWidth: 0
          }}
        >
          <DeviceTypeIcon
            kind="cabinet"
            sx={{
              fontSize: Math.max(26, Math.round(headerH * 0.5)),
              width: Math.max(26, Math.round(headerH * 0.5)),
              height: Math.max(26, Math.round(headerH * 0.5)),
              color: '#334155',
              flexShrink: 0
            }}
          />
          <Typography
            sx={{
              color: '#0f172a',
              fontSize: Math.max(15, Math.round(headerH * 0.36)),
              fontWeight: 800,
              letterSpacing: 0.4,
              lineHeight: 1.1,
              userSelect: 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0
            }}
          >
            {name}
          </Typography>
        </Box>
        <Box
          sx={{
            px: `${Math.max(6, tileW * 0.2)}px`,
            py: `${Math.max(2, tileH * 0.15)}px`,
            borderRadius: 9999,
            bgcolor: '#1e293b',
            flexShrink: 0
          }}
        >
          <Typography
            sx={{
              color: '#f8fafc',
              fontSize: Math.max(11, Math.round(headerH * 0.26)),
              fontWeight: 700,
              letterSpacing: 0.3,
              userSelect: 'none',
              lineHeight: 1.2
            }}
          >
            {units}U
          </Typography>
        </Box>
      </Box>

      {/* U slots */}
      {Array.from({ length: units }, (_, index) => {
        const isHi = highlightUnit === index;
        const isFree = !occupied.has(index);
        const even = index % 2 === 0;

        return (
          <Box
            key={`u-${index}`}
            sx={{
              position: 'absolute',
              left: earW,
              top: headerH + index * slotH,
              width: contentW,
              height: slotH,
              bgcolor: isHi
                ? 'rgba(37, 99, 235, 0.2)'
                : isFree
                  ? even
                    ? '#a8b4c4'
                    : '#9aa8b8'
                  : even
                    ? '#dce4ee'
                    : '#cfd8e4',
              borderBottom: '1px solid #8b97a8',
              borderLeft: isHi ? '3px solid #2563eb' : '1px solid #8b97a8',
              borderRight: isHi ? '3px solid #2563eb' : '1px solid #8b97a8',
              boxSizing: 'border-box',
              boxShadow: isHi
                ? 'inset 0 0 0 1px rgba(37,99,235,0.25)'
                : undefined,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1
            }}
          >
            {isFree && chassisTint.alpha > 0.01 && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  bgcolor: chassisTint.css,
                  pointerEvents: 'none'
                }}
              />
            )}
            {isFree && (
              <Typography
                sx={{
                  position: 'relative',
                  fontSize: Math.max(9, Math.round(slotH * 0.22)),
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  color: '#334155',
                  opacity: 0.28,
                  userSelect: 'none',
                  pointerEvents: 'none'
                }}
              >
                WOLNY
              </Typography>
            )}
          </Box>
        );
      })}

      {/* Cabinet color on frame only (header + ears) — never over mounted gear. */}
      {chassisTint.alpha > 0.01 && (
        <>
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: pxWidth,
              height: headerH,
              bgcolor: chassisTint.css,
              pointerEvents: 'none',
              zIndex: 2
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              top: headerH,
              width: earW,
              height: pxHeight - headerH,
              bgcolor: chassisTint.css,
              pointerEvents: 'none',
              zIndex: 2
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              right: 0,
              top: headerH,
              width: earW,
              height: pxHeight - headerH,
              bgcolor: chassisTint.css,
              pointerEvents: 'none',
              zIndex: 2
            }}
          />
        </>
      )}

      {/* U labels — right side of chassis body */}
      {Array.from({ length: units }, (_, index) => {
        const isHi = highlightUnit === index;
        return (
          <Typography
            key={`u-label-${index}`}
            sx={{
              position: 'absolute',
              right: earW + 6,
              top: headerH + index * slotH + Math.max(2, slotH * 0.08),
              fontSize: Math.max(6, slotH * 0.14),
              fontWeight: 700,
              color: isHi ? '#1d4ed8' : '#475569',
              userSelect: 'none',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              lineHeight: 1,
              opacity: 0.95,
              zIndex: 3,
              pointerEvents: 'none',
              textAlign: 'right'
            }}
          >
            {index + 1}U
          </Typography>
        );
      })}
    </Box>
  );
};
