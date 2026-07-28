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

/**
 * Compact demo (3 VMs) — kept for quick smoke tests.
 */
export const createSimpleServerV2Model = (): UnifiedNetworkModel => ({
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

/**
 * Stress-test diagram: 8 VM/LXC, 4 data NICs + Dell iDRAC, bridges, NATs, trunk.
 * Used as the workshop default so layout/routing can be checked under load.
 */
export const createStressTestServerV2Model = (): UnifiedNetworkModel => ({
  host: {
    id: 'dell-r750-01',
    name: 'Dell R750 — pve-lab-01',
    pNICs: [
      { id: 'eth0', label: 'UpLink A', badges: ['10GbE', 'Trunk'] },
      { id: 'eth1', label: 'UpLink B', badges: ['10GbE'] },
      { id: 'eth2', label: 'Storage', badges: ['25GbE', 'Passthrough'] },
      { id: 'eth3', label: 'Backup', badges: ['1GbE'] },
      {
        id: 'idrac0',
        label: 'iDRAC 9',
        badges: ['Dell', 'Mgmt', '1GbE']
      }
    ]
  },
  logicalNetworks: [
    {
      id: 'vmbr0',
      type: 'bridge',
      name: 'vmbr0 · LAN',
      uplink: 'eth0'
    },
    {
      id: 'vmbr1',
      type: 'bridge',
      name: 'vmbr1 · DMZ',
      uplink: 'eth1'
    },
    {
      id: 'vmbr2',
      type: 'bridge',
      name: 'vmbr2 · Internal'
    },
    {
      id: 'nat_dmz',
      type: 'nat',
      name: 'NAT · DMZ',
      connectsTo: 'vmbr1',
      gateway_ip: '10.20.0.1'
    },
    {
      id: 'nat_lab',
      type: 'nat',
      name: 'NAT · Lab',
      connectsTo: 'vmbr2',
      gateway_ip: '10.30.0.1'
    },
    {
      id: 'nat_iot',
      type: 'nat',
      name: 'NAT · IoT',
      connectsTo: 'vmbr0',
      gateway_ip: '10.40.0.1'
    }
  ],
  computeNodes: [
    {
      id: 'vm-edge',
      type: 'vm',
      name: 'edge-fw (VyOS)',
      vNICs: [
        {
          id: 'net0',
          network: 'vmbr0',
          ip: '192.168.10.2',
          vlan: 'ALL',
          mode: 'Trunk',
          metadata: { IP: '192.168.10.2', VLAN: 'ALL', Mode: 'Trunk' }
        }
      ]
    },
    {
      id: 'lxc-web',
      type: 'lxc',
      name: 'web-nginx',
      vNICs: [
        {
          id: 'eth0',
          network: 'nat_dmz',
          ip: '10.20.0.10',
          vlan: '100',
          metadata: { IP: '10.20.0.10', VLAN: '100' }
        }
      ]
    },
    {
      id: 'lxc-api',
      type: 'lxc',
      name: 'api-node',
      vNICs: [
        {
          id: 'eth0',
          network: 'nat_dmz',
          ip: '10.20.0.20',
          vlan: '100',
          metadata: { IP: '10.20.0.20', VLAN: '100' }
        }
      ]
    },
    {
      id: 'vm-db',
      type: 'vm',
      name: 'postgres-ha',
      vNICs: [
        {
          id: 'net0',
          network: 'vmbr1',
          ip: '10.20.0.50',
          vlan: '200',
          metadata: { IP: '10.20.0.50', VLAN: '200' }
        }
      ]
    },
    {
      id: 'lxc-redis',
      type: 'lxc',
      name: 'redis-cache',
      vNICs: [
        {
          id: 'eth0',
          network: 'vmbr1',
          ip: '10.20.0.60',
          vlan: '200',
          metadata: { IP: '10.20.0.60', VLAN: '200' }
        }
      ]
    },
    {
      id: 'vm-mon',
      type: 'vm',
      name: 'prometheus',
      vNICs: [
        {
          id: 'net0',
          network: 'vmbr2',
          ip: '10.30.0.15',
          vlan: '30',
          metadata: { IP: '10.30.0.15', VLAN: '30' }
        }
      ]
    },
    {
      id: 'vm-gitlab',
      type: 'vm',
      name: 'gitlab (PT)',
      vNICs: [
        {
          id: 'net0',
          network: 'direct',
          target: 'eth2',
          mode: 'Passthrough',
          metadata: { Mode: 'Passthrough' }
        }
      ]
    },
    {
      id: 'lxc-backup',
      type: 'lxc',
      name: 'proxmox-backup',
      vNICs: [
        {
          id: 'eth0',
          network: 'nat_lab',
          ip: '10.30.0.40',
          vlan: '40',
          metadata: { IP: '10.30.0.40', VLAN: '40' }
        },
        {
          id: 'eth1',
          network: 'nat_iot',
          ip: '10.40.0.40',
          vlan: '70',
          metadata: { IP: '10.40.0.40', VLAN: '70' }
        }
      ]
    }
  ]
});

/** Workshop / template default — stress layout for visual QA. */
export const createDefaultServerV2Model = (): UnifiedNetworkModel =>
  createStressTestServerV2Model();

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
