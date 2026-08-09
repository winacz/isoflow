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

  const stemMinX = Math.min(0, tipX);
  const stemMinY = Math.min(0, tipY);
  const stemW = Math.max(Math.abs(tipX), CONNECTOR_DOT_SIZE) + CONNECTOR_DOT_SIZE;
  const stemH = Math.max(Math.abs(tipY), CONNECTOR_DOT_SIZE) + CONNECTOR_DOT_SIZE;

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
          viewBox={`0 0 ${CONNECTOR_DOT_SIZE} ${labelHeight}`}
          width={CONNECTOR_DOT_SIZE}
          sx={{
            position: 'absolute',
            top: -labelHeight,
            left: -CONNECTOR_DOT_SIZE / 2,
            overflow: 'visible'
          }}
        >
          <line
            x1={CONNECTOR_DOT_SIZE / 2}
            y1={0}
            x2={CONNECTOR_DOT_SIZE / 2}
            y2={labelHeight}
            strokeDasharray={`0, ${CONNECTOR_DOT_SIZE * 2}`}
            stroke="black"
            strokeWidth={CONNECTOR_DOT_SIZE}
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
          <line
            x1={-stemMinX}
            y1={-stemMinY}
            x2={tipX - stemMinX}
            y2={tipY - stemMinY}
            strokeDasharray={`0, ${CONNECTOR_DOT_SIZE * 2}`}
            stroke="black"
            strokeWidth={CONNECTOR_DOT_SIZE}
            strokeLinecap="round"
          />
          <circle
            cx={-stemMinX}
            cy={-stemMinY}
            r={CONNECTOR_DOT_SIZE}
            fill="black"
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
