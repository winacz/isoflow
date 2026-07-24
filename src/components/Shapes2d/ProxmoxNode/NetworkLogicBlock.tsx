import React from 'react';
import type { VirtualNetwork } from './types';

interface Props {
  network: VirtualNetwork;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const NetworkLogicBlock = ({
  network,
  x,
  y,
  width,
  height
}: Props) => {
  const isBridge = network.type === 'BRIDGE';
  const rectClass = isBridge ? 'net-bridge' : 'net-nat';
  const textFill = isBridge ? '#059669' : '#d97706';

  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width={width} height={height} className={rectClass} rx={4} />
      <text
        x={width / 2}
        y={height / 2 + 4}
        className="text-bold"
        fill={textFill}
        textAnchor="middle"
      >
        {network.name}
      </text>
    </g>
  );
};
