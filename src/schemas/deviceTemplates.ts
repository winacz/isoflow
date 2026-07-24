import { z } from 'zod';
import { id, constrainedStrings } from './common';

export const deviceFormFactorOptions = ['RACK', 'DIN', 'CUSTOM'] as const;
export const deviceNumberingOptions = [
  'ODD_EVEN',
  'ROWS_LTR',
  'COLS_TTB'
] as const;
export const devicePortMediaOptions = ['RJ45', 'SFP'] as const;

/** Role label for SWITCH templates shown on the chassis. */
export const switchRoleOptions = ['SW', 'ROUTER', 'OTHER'] as const;

export const SWITCH_ROLE_LABELS: Record<
  (typeof switchRoleOptions)[number],
  string
> = {
  SW: 'SW',
  ROUTER: 'Router',
  OTHER: 'Other'
};

/** Per-port PoE direction (template-level). Missing key = no PoE. */
export const portPoeOptions = ['IN', 'OUT'] as const;

/** Hypervisor / virtualization platform for SERVER templates. */
export const serverPlatformOptions = [
  'PROXMOX',
  'ESXI',
  'VSPHERE',
  'HYPERV',
  'XEN',
  'XCP_NG',
  'KVM',
  'QEMU',
  'OPENSTACK',
  'NUTANIX',
  'BAREMETAL',
  'OTHER'
] as const;

export const SERVER_PLATFORM_LABELS: Record<
  (typeof serverPlatformOptions)[number],
  string
> = {
  PROXMOX: 'Proxmox VE',
  ESXI: 'VMware ESXi',
  VSPHERE: 'VMware vSphere',
  HYPERV: 'Microsoft Hyper-V',
  XEN: 'Citrix XenServer',
  XCP_NG: 'XCP-ng',
  KVM: 'KVM',
  QEMU: 'QEMU',
  OPENSTACK: 'OpenStack',
  NUTANIX: 'Nutanix AHV',
  BAREMETAL: 'Bare metal',
  OTHER: 'Inna'
};

export const deviceTemplateSectionSchema = z.object({
  id,
  media: z.enum(devicePortMediaOptions),
  /** Total ports in this section (1–2 for uplinks, usually 8). */
  ports: z.number().int().min(1).max(48),
  /** v1: always 2 rows like SCALANCE blocks. */
  rows: z.number().int().min(1).max(4).optional(),
  cols: z.number().int().min(1).max(24).optional()
});

export const virtualInterfaceSchema = z.object({
  id,
  name: z.string().optional(),
  type: z.enum(['BRIDGE', 'NAT', 'PASSTHROUGH']),
  ipAddress: z.string().optional(),
  vlan: z.string().optional(),
  isTrunk: z.boolean().optional(),
  targetPortId: id.optional() // reference to RJ45 physical port id
});

export const virtualInstanceSchema = z.object({
  id,
  name: constrainedStrings.name,
  type: z.enum(['VM', 'LXC', 'DOCKER']),
  status: z.enum(['running', 'stopped']),
  description: z.string().optional(),
  color: z.string().optional(),
  interfaces: z.array(virtualInterfaceSchema)
});

export const managementPortSchema = z.object({
  id,
  /** Display label, e.g. iDRAC / iLO / Mgmt. */
  label: z.string().max(20).optional(),
  enabled: z.boolean()
});

export const deviceTemplateSchema = z.object({
  id,
  name: constrainedStrings.name,
  kind: z.enum(['SWITCH', 'SERVER', 'SERVER_V2']),
  formFactor: z.enum(deviceFormFactorOptions),
  numbering: z.enum(deviceNumberingOptions),
  sections: z.array(deviceTemplateSectionSchema).min(1).max(12),
  virtualInstances: z.array(virtualInstanceSchema).optional(),
  /** SERVER only — hypervisor platform. */
  platform: z.enum(serverPlatformOptions).optional(),
  /** SERVER only — dedicated OOB / BMC NIC (iDRAC, iLO, …). */
  managementPort: managementPortSchema.optional(),
  /** Raw JSON configuration for SERVER_V2. */
  serverV2Json: z.string().optional(),
  /** SWITCH only — SW / Router / Other badge on chassis. */
  switchRole: z.enum(switchRoleOptions).optional(),
  /**
   * SWITCH only — PoE direction keyed by Shape2dPort.id (`${sectionId}-pN`).
   * Absent key = no PoE on that port.
   */
  portPoe: z.record(z.enum(portPoeOptions)).optional()
});

export const deviceTemplatesSchema = z.array(deviceTemplateSchema);
