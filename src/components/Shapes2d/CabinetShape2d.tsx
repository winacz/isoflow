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
}

/**
 * Rack cabinet chassis — rails, U slots, header label.
 */
export const CabinetShape2d = ({
  name = 'SZAFA',
  rackUnits = CABINET_DEFAULT_UNITS,
  width,
  height,
  centered = true,
  color,
  highlightUnit = null
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
        overflow: 'hidden'
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: '#d8dee8',
          border: `${Math.max(1, Math.round(tileW * 0.04))}px solid #5b6b7f`,
          borderRadius: Math.max(2, Math.round(tileW * 0.08)),
          boxSizing: 'border-box',
          boxShadow: '0 2px 6px rgba(0,0,0,0.12)'
        }}
      />

      {/* Left / right ears */}
      {[0, 1].map((side) => {
        return (
          <Box
            key={side}
            sx={{
              position: 'absolute',
              left: side === 0 ? 0 : undefined,
              right: side === 1 ? 0 : undefined,
              top: headerH * 0.15,
              width: earW,
              height: pxHeight - headerH * 0.3,
              bgcolor: '#b8c2d0',
              border: '1px solid #7a8ba3',
              boxSizing: 'border-box',
              '&::before, &::after': {
                content: '""',
                position: 'absolute',
                left: '50%',
                width: Math.max(3, earW * 0.35),
                height: Math.max(3, earW * 0.35),
                borderRadius: '50%',
                bgcolor: '#6b7c90',
                transform: 'translateX(-50%)'
              },
              '&::before': { top: '12%' },
              '&::after': { bottom: '12%' }
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
          px: `${Math.max(4, tileW * 0.2)}px`,
          boxSizing: 'border-box',
          borderBottom: '1px solid #9aa8b8',
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
              fontSize: Math.max(28, Math.round(headerH * 0.55)),
              width: Math.max(28, Math.round(headerH * 0.55)),
              height: Math.max(28, Math.round(headerH * 0.55)),
              color: '#334155',
              flexShrink: 0
            }}
          />
          <Typography
            sx={{
              color: '#1f2937',
              fontSize: Math.max(16, Math.round(headerH * 0.38)),
              fontWeight: 800,
              letterSpacing: 0.3,
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
          <Typography
            sx={{
              color: '#64748b',
              fontSize: Math.max(12, Math.round(headerH * 0.28)),
              fontWeight: 600,
              userSelect: 'none',
              flexShrink: 0
            }}
          >
            {units}U
          </Typography>
        </Box>
      </Box>

      {/* U slots */}
      {Array.from({ length: units }, (_, index) => {
        const isHi = highlightUnit === index;
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
                ? 'rgba(37, 99, 235, 0.18)'
                : index % 2 === 0
                  ? '#eef2f7'
                  : '#e4eaf2',
              borderBottom: '1px solid #c5cdd8',
              borderLeft: isHi ? '3px solid #2563eb' : '1px solid #c5cdd8',
              borderRight: isHi ? '3px solid #2563eb' : '1px solid #c5cdd8',
              boxSizing: 'border-box'
            }}
          >
            {/* Rail holes */}
            {[0, 1].map((side) => {
              return (
                <Box
                  key={side}
                  sx={{
                    position: 'absolute',
                    left: side === 0 ? 2 : undefined,
                    right: side === 1 ? 2 : undefined,
                    top: '50%',
                    width: Math.max(2, tileW * 0.12),
                    height: Math.max(2, tileW * 0.12),
                    borderRadius: '50%',
                    bgcolor: '#8b97a8',
                    transform: 'translateY(-50%)'
                  }}
                />
              );
            })}
          </Box>
        );
      })}

      {chassisTint.alpha > 0.01 && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            bgcolor: chassisTint.css,
            pointerEvents: 'none',
            zIndex: 2,
            borderRadius: Math.max(2, Math.round(tileW * 0.08))
          }}
        />
      )}

      {/* U labels above tint so they stay readable */}
      {Array.from({ length: units }, (_, index) => {
        const isHi = highlightUnit === index;
        return (
          <Typography
            key={`u-label-${index}`}
            sx={{
              position: 'absolute',
              left: earW + 3,
              top: headerH + index * slotH + 1,
              fontSize: Math.max(5, slotH * 0.11),
              fontWeight: 600,
              color: isHi ? '#1d4ed8' : '#64748b',
              userSelect: 'none',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              lineHeight: 1,
              opacity: 0.9,
              zIndex: 3,
              pointerEvents: 'none'
            }}
          >
            {index + 1}U
          </Typography>
        );
      })}
    </Box>
  );
};
