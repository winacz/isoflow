export interface ServerV2Pnic {
  id: string;
  label?: string;
  name?: string;
  speed?: string;
  badges?: string[];
}

export interface ServerV2LogicalNetwork {
  id: string;
  type: 'bridge' | 'nat' | string;
  name?: string;
  uplink?: string;
  connectsTo?: string;
  gateway_ip?: string;
}

export interface ServerV2Vnic {
  id?: string;
  /** Logical network id, or "direct" when passthrough. */
  network: string;
  /** Physical NIC id for passthrough. */
  target?: string;
  ip?: string;
  vlan?: string;
  mode?: string;
  metadata?: Record<string, string>;
}

export interface ServerV2ComputeNode {
  id: string;
  type: 'vm' | 'lxc' | string;
  name?: string;
  vNICs: ServerV2Vnic[];
}

export interface UnifiedNetworkModel {
  host: {
    id: string;
    name?: string;
    pNICs: Array<string | ServerV2Pnic>;
  };
  logicalNetworks: ServerV2LogicalNetwork[];
  computeNodes: ServerV2ComputeNode[];
}

export const createDefaultServerV2Model = (): UnifiedNetworkModel => ({
  host: {
    id: 'node_1',
    name: 'Proxmox-Node-01',
    pNICs: [
      { id: 'eth0', label: 'Uplink', badges: ['10GbE', 'Trunk'] },
      { id: 'eth1_pass', label: 'Dedicated PCIe', badges: ['1GbE', 'Passthrough'] }
    ]
  },
  logicalNetworks: [
    {
      id: 'vswitch0',
      type: 'bridge',
      name: 'vmbr0',
      uplink: 'eth0'
    },
    {
      id: 'nat0',
      type: 'nat',
      name: 'NAT Service',
      connectsTo: 'vswitch0',
      gateway_ip: '10.0.0.1'
    }
  ],
  computeNodes: [
    {
      id: 'vm1',
      type: 'vm',
      name: 'RouterOS / VyOS',
      vNICs: [
        {
          id: 'vnic0',
          network: 'vswitch0',
          ip: '192.168.1.5',
          vlan: 'ALL',
          mode: 'Trunk',
          metadata: { IP: '192.168.1.5', VLAN: 'ALL', Mode: 'Trunk' }
        }
      ]
    },
    {
      id: 'vm2',
      type: 'vm',
      name: 'Nginx Web',
      vNICs: [
        {
          id: 'vnic0',
          network: 'nat0',
          ip: '10.0.0.10',
          vlan: '100',
          metadata: { IP: '10.0.0.10', VLAN: '100' }
        }
      ]
    },
    {
      id: 'vm3',
      type: 'vm',
      name: 'DB Server',
      vNICs: [
        {
          id: 'vnic0',
          network: 'direct',
          target: 'eth1_pass',
          mode: 'Passthrough',
          metadata: { Mode: 'Passthrough' }
        }
      ]
    }
  ]
});

export const normalizePnic = (
  pnic: string | ServerV2Pnic
): ServerV2Pnic => {
  if (typeof pnic === 'string') return { id: pnic };
  return pnic;
};

/** Keep metadata in sync with primary vNIC fields for diagram labels. */
export const syncVnicFields = (vnic: ServerV2Vnic): ServerV2Vnic => {
  const metadata: Record<string, string> = { ...(vnic.metadata || {}) };
  if (vnic.ip) metadata.IP = vnic.ip;
  else delete metadata.IP;
  if (vnic.vlan) metadata.VLAN = vnic.vlan;
  else delete metadata.VLAN;
  if (vnic.mode) metadata.Mode = vnic.mode;
  else delete metadata.Mode;

  return {
    ...vnic,
    metadata: Object.keys(metadata).length ? metadata : undefined
  };
};
