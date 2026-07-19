import React, { useMemo } from 'react';
import { Coords, AnchorPosition, TileOrigin } from 'src/types';
import { Svg } from 'src/components/Svg/Svg';
import { TRANSFORM_CONTROLS_COLOR } from 'src/config';
import { useIsoProjection } from 'src/hooks/useIsoProjection';
import {
  getBoundingBox,
  outermostCornerPositions,
  getTilePosition,
  convertBoundsToNamedAnchors
} from 'src/utils';
import { TransformAnchor } from './TransformAnchor';

interface Props {
  from: Coords;
  to: Coords;
  onAnchorMouseDown?: (anchorPosition: AnchorPosition) => void;
}

const strokeWidth = 2;

const EDGE_ORIGINS: Record<'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT', TileOrigin> = {
  TOP: 'TOP',
  BOTTOM: 'BOTTOM',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT'
};

export const TransformControls = ({ from, to, onAnchorMouseDown }: Props) => {
  const { css, pxSize } = useIsoProjection({
    from,
    to
  });

  const anchors = useMemo(() => {
    if (!onAnchorMouseDown) return [];

    const corners = getBoundingBox([from, to]);
    const namedCorners = convertBoundsToNamedAnchors(corners);
    const cornerKeys: AnchorPosition[] = [
      'BOTTOM_LEFT',
      'BOTTOM_RIGHT',
      'TOP_RIGHT',
      'TOP_LEFT'
    ];

    const cornerAnchors = cornerKeys.map((key, i) => {
      const position = getTilePosition({
        tile: namedCorners[key],
        origin: outermostCornerPositions[i]
      });

      return {
        key,
        position,
        onMouseDown: () => {
          onAnchorMouseDown(key);
        }
      };
    });

    const edgeKeys: Array<'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT'> = [
      'TOP',
      'BOTTOM',
      'LEFT',
      'RIGHT'
    ];

    const edgeAnchors = edgeKeys.map((key) => {
      const position = getTilePosition({
        tile: namedCorners[key],
        origin: EDGE_ORIGINS[key]
      });

      return {
        key,
        position,
        onMouseDown: () => {
          onAnchorMouseDown(key);
        }
      };
    });

    return [...cornerAnchors, ...edgeAnchors];
  }, [onAnchorMouseDown, from, to]);

  return (
    <>
      <Svg
        style={{
          ...css,
          pointerEvents: 'none'
        }}
      >
        <g transform={`translate(${strokeWidth}, ${strokeWidth})`}>
          <rect
            width={pxSize.width - strokeWidth * 2}
            height={pxSize.height - strokeWidth * 2}
            fill="none"
            stroke={TRANSFORM_CONTROLS_COLOR}
            strokeDasharray={`${strokeWidth * 2} ${strokeWidth * 2}`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </g>
      </Svg>

      {anchors.map(({ key, position, onMouseDown }) => {
        return (
          <TransformAnchor
            key={key}
            position={position}
            onMouseDown={onMouseDown}
          />
        );
      })}
    </>
  );
};
