import React, { useRef } from 'react';
import { Box, SxProps } from '@mui/material';

const CONNECTOR_DOT_SIZE = 3;

export interface Props {
  labelHeight?: number;
  maxWidth: number;
  maxHeight?: number;
  expandDirection?: 'CENTER' | 'BOTTOM';
  /** Vertical stem (iso) or diagonal callout from the node (2D). */
  stemDirection?: 'vertical' | 'diagonal';
  /**
   * Free callout tip (world px relative to anchor). When set, overrides the
   * default diagonal derived from `labelHeight`.
   */
  stemOffset?: { x: number; y: number } | null;
  /** Stem stroke fill color (node color). */
  stemColor?: string;
  /** Contrasting outline behind the stem. */
  stemOutlineColor?: string;
  /** Stem thickness in px (fill). Outline is drawn slightly thicker. */
  stemWidth?: number;
  /**
   * Horizontal Bezier bulge relative to the node centre:
   * `-1` = curve left, `1` = curve right.
   */
  stemCurveSide?: -1 | 1;
  children: React.ReactNode;
  sx?: SxProps;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
}

export const Label = ({
  children,
  maxWidth,
  maxHeight,
  expandDirection = 'CENTER',
  stemDirection = 'vertical',
  labelHeight = 0,
  stemOffset = null,
  stemColor = 'black',
  stemOutlineColor,
  stemWidth = CONNECTOR_DOT_SIZE,
  stemCurveSide,
  sx,
  onMouseDown
}: Props) => {
  const contentRef = useRef<HTMLDivElement>();
  const useFreeStem =
    Boolean(stemOffset) || (stemDirection === 'diagonal' && labelHeight > 0);

  const tipX = stemOffset
    ? stemOffset.x
    : stemDirection === 'diagonal'
      ? Math.round(labelHeight * 0.85)
      : 0;
  const tipY = stemOffset
    ? stemOffset.y
    : labelHeight > 0
      ? -labelHeight
      : 0;

  const stroke = Math.max(2, stemWidth);
  const outline = stemOutlineColor
    ? Math.max(stroke + 3, Math.round(stroke * 1.55))
    : 0;
  const pad = Math.max(stroke, outline) + 2;

  // Quadratic Bezier: bulge left/right from the node centre of symmetry.
  const dx = tipX;
  const dy = tipY;
  const stemLen = Math.hypot(dx, dy) || 1;
  const bulge = Math.min(110, Math.max(20, stemLen * 0.28));
  const side: -1 | 1 =
    stemCurveSide ?? (tipX < 0 ? -1 : tipX > 0 ? 1 : -1);
  const ctrlX = dx * 0.5 + side * bulge;
  const ctrlY = dy * 0.45;

  const stemMinX = Math.min(0, tipX, ctrlX) - pad;
  const stemMinY = Math.min(0, tipY, ctrlY) - pad;
  const stemMaxX = Math.max(0, tipX, ctrlX) + pad;
  const stemMaxY = Math.max(0, tipY, ctrlY) + pad;
  const stemW = Math.max(1, stemMaxX - stemMinX);
  const stemH = Math.max(1, stemMaxY - stemMinY);

  const x1 = -stemMinX;
  const y1 = -stemMinY;
  const x2 = tipX - stemMinX;
  const y2 = tipY - stemMinY;
  const cpx = ctrlX - stemMinX;
  const cpy = ctrlY - stemMinY;
  const curvePath = `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`;
  // Sparse dashes — short stroke, wide gap.
  const dash = `${Math.max(3, Math.round(stroke * 0.85))} ${Math.max(
    12,
    Math.round(stroke * 3.4)
  )}`;

  return (
    <Box
      sx={{
        position: 'absolute',
        width: maxWidth,
        overflow: 'visible'
      }}
    >
      {labelHeight > 0 && !useFreeStem && (
        <Box
          component="svg"
          viewBox={`0 0 ${stroke} ${labelHeight}`}
          width={stroke}
          sx={{
            position: 'absolute',
            top: -labelHeight,
            left: -stroke / 2,
            overflow: 'visible'
          }}
        >
          {stemOutlineColor && (
            <line
              x1={stroke / 2}
              y1={0}
              x2={stroke / 2}
              y2={labelHeight}
              stroke={stemOutlineColor}
              strokeWidth={outline || stroke + 3}
              strokeLinecap="round"
              strokeDasharray={dash}
            />
          )}
          <line
            x1={stroke / 2}
            y1={0}
            x2={stroke / 2}
            y2={labelHeight}
            strokeDasharray={dash}
            stroke={stemColor}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        </Box>
      )}

      {useFreeStem && (tipX !== 0 || tipY !== 0) && (
        <Box
          component="svg"
          width={stemW}
          height={stemH}
          sx={{
            position: 'absolute',
            top: stemMinY,
            left: stemMinX,
            overflow: 'visible',
            pointerEvents: 'none'
          }}
        >
          {stemOutlineColor && (
            <path
              d={curvePath}
              fill="none"
              stroke={stemOutlineColor}
              strokeWidth={outline}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={dash}
            />
          )}
          <path
            d={curvePath}
            fill="none"
            stroke={stemColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dash}
          />
          {stemOutlineColor && (
            <circle
              cx={x1}
              cy={y1}
              r={outline / 2}
              fill={stemOutlineColor}
            />
          )}
          <circle
            cx={x1}
            cy={y1}
            r={stroke / 2}
            fill={stemColor}
          />
        </Box>
      )}

      <Box
        ref={contentRef}
        onMouseDown={onMouseDown}
        sx={{
          position: 'absolute',
          display: 'block',
          boxSizing: 'border-box',
          width: '100%',
          bgcolor: 'common.white',
          border: '1px solid',
          borderColor: 'grey.400',
          borderRadius: 2,
          py: 1,
          px: 1.5,
          transformOrigin: 'bottom center',
          transform: `translate(-50%, ${
            expandDirection === 'BOTTOM' ? '-100%' : '-50%'
          })`,
          overflow: 'hidden',
          ...sx
        }}
        style={{
          maxHeight,
          maxWidth,
          width: maxWidth,
          top: useFreeStem ? tipY : -labelHeight,
          left: useFreeStem ? tipX : 0
        }}
      >
        {children}
      </Box>
    </Box>
  );
};
