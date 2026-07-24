import React, { useId, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import {
  TILE_SIZE_2D,
  CABINET_EAR_TILES,
  BLANKING_DEFAULT_UNITS,
  getBlankingSize
} from 'src/config';
import { parseDeviceColor } from 'src/utils';

interface Props {
  name?: string;
  /** Height in rack units (U). */
  rackUnits?: number;
  color?: string;
  width?: number;
  height?: number;
  centered?: boolean;
  showShadow?: boolean;
}

/**
 * Non-network rack utility plate (blanking / UPS label).
 * Footprint includes rack ears (full cabinet bay width) so free-place and
 * cabinet snap both center the whole plate correctly.
 */
export const BlankingPlateShape2d = ({
  name = 'ZAŚLEPKA',
  rackUnits = BLANKING_DEFAULT_UNITS,
  color = '#cbd5e1',
  width,
  height,
  centered = true,
  showShadow = true
}: Props) => {
  const earMaskUid = useId().replace(/:/g, '');
  const footprint = useMemo(() => {
    return getBlankingSize(rackUnits);
  }, [rackUnits]);

  const pxWidth = width ?? footprint.width * TILE_SIZE_2D;
  const pxHeight = height ?? footprint.height * TILE_SIZE_2D;
  // Scale ears from the natural bay so custom preview widths stay proportional.
  const scale = pxWidth / (footprint.width * TILE_SIZE_2D);
  const earW = Math.max(1, Math.round(CABINET_EAR_TILES * TILE_SIZE_2D * scale));
  const chassisW = Math.max(1, pxWidth - earW * 2);
  const mountHoleW = Math.max(12, Math.round(earW * 0.72));
  const mountHoleH = Math.max(6, Math.round(mountHoleW * 0.42));
  const earRadius = Math.max(4, Math.round(earW * 0.28));
  const chassisTint = parseDeviceColor(color);
  const label = name.trim() || 'ZAŚLEPKA';

  const fontSize = Math.max(
    14,
    Math.min(
      Math.round(pxHeight * 0.72),
      Math.round(chassisW * 0.22),
      120
    )
  );

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
        filter: showShadow
          ? 'drop-shadow(0 2px 4px rgba(15,23,42,0.18))'
          : undefined
      }}
    >
      {/* Rack ears — inside footprint (left / right strips) */}
      {(['left', 'right'] as const).map((side) => {
        const cx = earW / 2;
        const hw = mountHoleW / 2;
        const hh = mountHoleH / 2;
        const fracs = [0.25, 0.75];
        const maskId = `blank-ear-mask-${side}-${earMaskUid}`;
        const gradId = `blank-ear-grad-${side}-${earMaskUid}`;
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
                <stop offset="0%" stopColor="#4a5560" />
                <stop offset="50%" stopColor="#3a424c" />
                <stop offset="100%" stopColor="#2d343c" />
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

      {/* Chassis between ears */}
      <Box
        sx={{
          position: 'absolute',
          left: earW,
          top: 0,
          width: chassisW,
          height: pxHeight,
          bgcolor: '#e2e8f0',
          border: '2px solid #64748b',
          boxSizing: 'border-box',
          zIndex: 1,
          backgroundImage:
            'repeating-linear-gradient(135deg, rgba(100,116,139,0.12) 0 8px, transparent 8px 16px)'
        }}
      />
      {chassisTint.alpha > 0.01 && (
        <Box
          sx={{
            position: 'absolute',
            left: earW,
            top: 0,
            width: chassisW,
            height: pxHeight,
            bgcolor: chassisTint.css,
            pointerEvents: 'none',
            zIndex: 2
          }}
        />
      )}

      <Box
        sx={{
          position: 'absolute',
          left: earW,
          top: 0,
          width: chassisW,
          height: pxHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 1.5,
          zIndex: 3
        }}
      >
        <Typography
          sx={{
            fontSize,
            fontWeight: 800,
            letterSpacing: Math.max(1, fontSize * 0.06),
            color: '#334155',
            opacity: 0.32,
            userSelect: 'none',
            pointerEvents: 'none',
            textAlign: 'center',
            lineHeight: 0.95,
            textTransform: 'uppercase',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%'
          }}
        >
          {label}
        </Typography>
      </Box>
    </Box>
  );
};
