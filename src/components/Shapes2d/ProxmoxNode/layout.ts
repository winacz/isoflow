import { TILE_SIZE_2D, type Shape2dPort } from 'src/config';
import type { Size } from 'src/types';
import type { BlockPosition, ProxmoxLayout, ServerConfig } from './types';

// Constants from the user's specification
const NODE_WIDTH = 180;
const NODE_HEIGHT = 120;
const GAP_X = 40;
const GAP_Y = 60;
const MAX_COLUMNS = 4;
const START_X = 40;
const START_Y = 80;
const NET_H = 40;

export const computeProxmoxLayout = ({
  config,
  size,
  layoutPorts
}: {
  config: ServerConfig;
  size: Size;
  layoutPorts: Shape2dPort[];
}): ProxmoxLayout & { internalWidth: number; internalHeight: number; physicalWidth: number; physicalHeight: number } => {
  const physicalWidth = size.width * TILE_SIZE_2D;
  const physicalHeight = size.height * TILE_SIZE_2D;

  const total_vms = config.virtualMachines.length;
  const cols = Math.max(1, Math.min(MAX_COLUMNS, total_vms));
  const rows = Math.max(1, Math.ceil(total_vms / MAX_COLUMNS));

  const colPitch = Math.max(
    NODE_WIDTH,
    ...config.virtualMachines.map((vm) =>
      Math.max(NODE_WIDTH, 56 + Math.max(1, vm.interfaces.length) * 40)
    ),
    NODE_WIDTH
  );
  const rowPitch = NODE_HEIGHT;

  const internalWidth =
    START_X * 2 + cols * colPitch + Math.max(0, cols - 1) * GAP_X;
  const vmsBottomY =
    START_Y + rows * rowPitch + Math.max(0, rows - 1) * GAP_Y;

  const logicalNetworksY = vmsBottomY + GAP_Y + 40;
  const vswitchWidth =
    Math.min(total_vms || 1, MAX_COLUMNS) * colPitch +
    Math.max(0, Math.min(total_vms || 1, MAX_COLUMNS) - 1) * GAP_X;
  
  const logicalNetworksBottomY = logicalNetworksY + NET_H;
  const internalHeight = logicalNetworksBottomY + GAP_Y + 60;

  const scaleX = internalWidth / physicalWidth;
  const scaleY = internalHeight / physicalHeight;

  const portRowTop =
    layoutPorts.length > 0
      ? Math.min(...layoutPorts.map((p) => p.tile.y)) * TILE_SIZE_2D
      : physicalHeight - 3 * TILE_SIZE_2D;

  const portAnchors = new Map<string, { x: number; y: number }>();
  layoutPorts.forEach((port) => {
    portAnchors.set(port.id, {
      x: (port.tile.x + 0.5) * TILE_SIZE_2D * scaleX,
      y: port.tile.y * TILE_SIZE_2D * scaleY
    });
  });

  const vmPositions = new Map<string, BlockPosition>();
  const vnicAnchors = new Map<string, { x: number; y: number }>();
  
  config.virtualMachines.forEach((vm, index) => {
    const col = index % MAX_COLUMNS;
    const row = Math.floor(index / MAX_COLUMNS);
    const nicCount = Math.max(1, vm.interfaces.length);
    const width = Math.max(NODE_WIDTH, 56 + nicCount * 40);
    const height = Math.max(NODE_HEIGHT, 100 + Math.min(24, nicCount * 2));
    const pos = {
      x: START_X + col * (colPitch + GAP_X),
      y: START_Y + row * (rowPitch + GAP_Y),
      width,
      height
    };
    vmPositions.set(vm.id, pos);

    // Anchor each vNIC at the bottom of its column in the NIC band
    const ifaceCount = vm.interfaces.length;
    vm.interfaces.forEach((iface, i) => {
      const colW = pos.width / Math.max(1, ifaceCount);
      vnicAnchors.set(iface.id, {
        x: pos.x + colW * i + colW / 2,
        y: pos.y + pos.height
      });
    });
  });

  const netPositions = new Map<string, BlockPosition>();
  const netCount = config.virtualNetworks.length;
  // If there are multiple networks, we divide the vswitchWidth among them evenly with GAP_X
  const singleNetWidth = netCount > 0 ? (vswitchWidth - Math.max(0, netCount - 1) * GAP_X) / netCount : vswitchWidth;

  config.virtualNetworks.forEach((net, index) => {
    netPositions.set(net.id, {
      x: START_X + index * (singleNetWidth + GAP_X),
      y: logicalNetworksY,
      width: singleNetWidth,
      height: NET_H
    });
  });

  return {
    pxWidth: internalWidth, // we pass internal bounds as pxWidth/pxHeight for compatibility, but we provide physical too
    pxHeight: internalHeight,
    internalWidth,
    internalHeight,
    physicalWidth,
    physicalHeight,
    vmPositions,
    netPositions,
    portAnchors,
    vnicAnchors,
    portRowTop: portRowTop * scaleY
  };
};

/** Orthogonal-ish cubic between two points (vertical preference). */
export const bezierBetween = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string => {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
};
