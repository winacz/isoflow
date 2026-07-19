import React, { useMemo } from 'react';
import { Coords, AnchorPosition } from 'src/types';
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

    return cornerKeys.map((key, i) => {
      const position = getTilePosition({
        tile: namedCorners[key],
        origin: outermostCornerPositions[i]
      });

      return {
        position,
        onMouseDown: () => {
          onAnchorMouseDown(key);
        }
      };
    });
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

      {anchors.map(({ position, onMouseDown }) => {
        return (
          <TransformAnchor position={position} onMouseDown={onMouseDown} />
        );
      })}
    </>
  );
};
