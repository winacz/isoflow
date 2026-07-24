export type NetworkType = 'BRIDGE' | 'NAT' | 'PASSTHROUGH';

export interface PhysicalInterface {
  id: string;
  name: string;
}

export interface VirtualNetwork {
  id: string;
  name: string;
  type: Exclude<NetworkType, 'PASSTHROUGH'>;
  /** PhysicalInterface.id this uplink attaches to (optional). */
  physicalTargetId?: string;
}

export interface VMInterface {
  id: string;
  name?: string;
  type?: NetworkType;
  ipAddress?: string;
  vlan?: string;
  isTrunk?: boolean;
  netId: string;
  physicalTargetId?: string;
}

export interface VirtualMachine {
  id: string;
  name: string;
  status?: 'running' | 'stopped';
  kind?: 'VM' | 'LXC' | 'DOCKER';
  description?: string;
  color?: string;
  interfaces: VMInterface[];
}

export interface ServerConfig {
  name?: string;
  /** Hypervisor label shown under the node title. */
  platformLabel?: string;
  virtualMachines: VirtualMachine[];
  virtualNetworks: VirtualNetwork[];
  physicalInterfaces: PhysicalInterface[];
}

export interface BlockPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProxmoxLayout {
  /** Pixel size of the chassis (matches tile footprint × TILE_SIZE_2D). */
  pxWidth: number;
  pxHeight: number;
  vmPositions: Map<string, BlockPosition>;
  netPositions: Map<string, BlockPosition>;
  /** Cable endpoint on each physical port (px, top-center of jack cell). */
  portAnchors: Map<string, { x: number; y: number }>;
  /** Cable endpoint on each VM interface (px, bottom edge of VM block). */
  vnicAnchors: Map<string, { x: number; y: number }>;
  /** Y of the port row (px) — internals must stay above this. */
  portRowTop: number;
}
