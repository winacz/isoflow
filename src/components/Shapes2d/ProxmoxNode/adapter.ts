import { DeviceTemplate } from 'src/types';
import type { Shape2dPort } from 'src/config';
import { SERVER_PLATFORM_LABELS } from 'src/schemas/deviceTemplates';
import {
  ServerConfig,
  VirtualNetwork,
  VirtualMachine,
  PhysicalInterface,
  NetworkType
} from './types';

/**
 * Map a SERVER DeviceTemplate + laid-out Shape2dPorts into Proxmox diagram config.
 * Groups guest interfaces sharing (type, targetPortId) into one vSwitch / NAT.
 */
export const buildProxmoxConfig = (
  template: DeviceTemplate,
  layoutPorts: Shape2dPort[]
): ServerConfig => {
  const physicalInterfaces: PhysicalInterface[] = layoutPorts.map((port) => {
    const isMgmt = port.sectionId === 'mgmt';
    return {
      id: port.id,
      name: isMgmt
        ? port.label || 'Mgmt'
        : port.label
          ? `eth${port.label}`
          : port.id
    };
  });

  const virtualMachines: VirtualMachine[] = [];
  const virtualNetworksMap = new Map<string, VirtualNetwork>();
  let bridgeIndex = 0;
  let natIndex = 0;

  (template.virtualInstances ?? []).forEach((inst) => {
    const vm: VirtualMachine = {
      id: inst.id,
      name: inst.name,
      status: inst.status,
      kind: inst.type,
      description: inst.description,
      color: inst.color,
      interfaces: []
    };

    inst.interfaces.forEach((iface) => {
      let netId = '';
      if (iface.type !== 'PASSTHROUGH') {
        netId = `net-${iface.type}-${iface.targetPortId || 'none'}`;
        if (!virtualNetworksMap.has(netId)) {
          const name =
            iface.type === 'BRIDGE'
              ? `vmbr${bridgeIndex++}`
              : `nat${natIndex++}`;
          virtualNetworksMap.set(netId, {
            id: netId,
            name,
            type: iface.type as Exclude<NetworkType, 'PASSTHROUGH'>,
            physicalTargetId: iface.targetPortId
          });
        }
      }
      vm.interfaces.push({
        id: iface.id,
        name: iface.name,
        type: iface.type,
        ipAddress: iface.ipAddress,
        vlan: iface.vlan,
        isTrunk: iface.isTrunk,
        netId,
        physicalTargetId: iface.targetPortId
      });
    });

    virtualMachines.push(vm);
  });

  const platform = template.platform ?? 'PROXMOX';

  return {
    name: template.name,
    platformLabel: SERVER_PLATFORM_LABELS[platform] ?? platform,
    virtualMachines,
    virtualNetworks: Array.from(virtualNetworksMap.values()),
    physicalInterfaces
  };
};
