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
  children: React.ReactNode;
  sx?: SxProps;
}

export const Label = ({
  children,
  maxWidth,
  maxHeight,
  expandDirection = 'CENTER',
  stemDirection = 'vertical',
  labelHeight = 0,
  sx
}: Props) => {
  const contentRef = useRef<HTMLDivElement>();
  const isDiagonal = stemDirection === 'diagonal' && labelHeight > 0;
  const stemDx = isDiagonal ? Math.round(labelHeight * 0.85) : 0;
  const stemDy = labelHeight;

  return (
    <Box
      sx={{
        position: 'absolute',
        width: maxWidth,
        overflow: 'visible'
      }}
    >
      {labelHeight > 0 && !isDiagonal && (
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

      {isDiagonal && (
        <Box
          component="svg"
          width={stemDx + CONNECTOR_DOT_SIZE}
          height={stemDy + CONNECTOR_DOT_SIZE}
          sx={{
            position: 'absolute',
            top: -stemDy,
            left: 0,
            overflow: 'visible',
            pointerEvents: 'none'
          }}
        >
          <line
            x1={CONNECTOR_DOT_SIZE / 2}
            y1={stemDy}
            x2={stemDx}
            y2={CONNECTOR_DOT_SIZE / 2}
            strokeDasharray={`0, ${CONNECTOR_DOT_SIZE * 2}`}
            stroke="black"
            strokeWidth={CONNECTOR_DOT_SIZE}
            strokeLinecap="round"
          />
          <circle
            cx={CONNECTOR_DOT_SIZE / 2}
            cy={stemDy}
            r={CONNECTOR_DOT_SIZE}
            fill="black"
          />
        </Box>
      )}

      <Box
        ref={contentRef}
        sx={{
          position: 'absolute',
          display: 'inline-block',
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
          top: -stemDy,
          left: isDiagonal ? stemDx : 0
        }}
      >
        {children}
      </Box>
    </Box>
  );
};
