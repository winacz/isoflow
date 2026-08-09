import { z } from 'zod';
import { id, constrainedStrings } from './common';

export const portTypeSchema = z.enum(['access', 'trunk']);

export const shape2dPortConfigSchema = z.object({
  label: z.string().max(50).optional(),
  name: z.string().max(100).optional(),
  /** Access VLAN, or native VLAN when type is trunk. */
  vlan: z.string().max(32).optional(),
  /** Manual override for VLAN display / cable color (hex). */
  vlanColor: z.string().max(32).optional(),
  type: portTypeSchema.optional(),
  /**
   * VLANs allowed on a trunk port (tagged). Native stays in `vlan`.
   * Populated by the trunk VLAN picker (UI TBD).
   */
  allowedVlans: z.array(z.string().max(32)).max(64).optional(),
  speed: z.string().max(20).optional()
});

/** Switch Virtual Interface — IP in a VLAN, shown on the chassis. */
export const sviSchema = z.object({
  id,
  vlan: z.string().max(32),
  /** IPv4/IPv6 address, optionally with prefix (e.g. 10.0.0.1/24). */
  ip: z.string().max(64).optional(),
  /** When true, SVI gets address via DHCP — `ip` is ignored / UI disabled. */
  dhcp: z.boolean().optional(),
  vlanColor: z.string().max(32).optional()
});

export const modelItemSchema = z.object({
  id,
  name: constrainedStrings.name,
  /** Rich notes (Quill HTML) — opened via large editor, not on the badge. */
  description: constrainedStrings.descriptionNotes.optional(),
  /** Plakietka header. */
  descriptionTitle: constrainedStrings.descriptionTitle.optional(),
  /** Plakietka body (plain, max 500, single line). */
  descriptionSummary: constrainedStrings.descriptionSummary.optional(),
  icon: id.optional(),
  /** Chassis / body fill for 2D plan devices (hex / hex8 / rgba). */
  color: z.string().max(64).optional(),
  /**
   * Management / host IP (DIN switches, endpoint nodes).
   * Separate from switch SVIs (`svis[].ip`).
   */
  ip: z.string().max(64).optional(),
  /** When true, host gets address via DHCP — `ip` is ignored / UI disabled. */
  dhcp: z.boolean().optional(),
  /**
   * Endpoint Node face icon (MUI Outlined set via DeviceTypeIcon).
   * e.g. pc | camera | printer | ap | iot …
   */
  nodeIcon: z
    .enum([
      'pc',
      'camera',
      'cameraV2',
      'printer',
      'voip',
      'smartphone',
      'iot',
      'ap',
      'nas',
      'tablet',
      'other'
    ])
    .optional(),
  /** Per-port config for 2D devices (keyed by Shape2dPort.id). */
  ports: z.record(shape2dPortConfigSchema).optional(),
  /** Switch SVIs (not used on hosts / PC). */
  svis: z.array(sviSchema).optional(),
  /** Rack height in U — cabinet (4–42) or blanking plate (1–12). */
  rackUnits: z.number().int().min(1).max(42).optional(),
  /** Patch panel jack count (4–48). */
  portCount: z.number().int().min(4).max(48).optional(),
  /**
   * Endpoint devices (PC, AP, camera…) — powered via PoE from a switch port.
   * When true, a green bolt shows on the jack; warn if not linked to PoE OUT.
   */
  poweredByPoe: z.boolean().optional(),
  /** Portal from isometric node → Plan item / area / whole 2D project. */
  portal: z
    .object({
      targetType: z.enum(['ITEM', 'RECTANGLE', 'VIEW']),
      targetId: id,
      label: z.string().max(120).optional()
    })
    .optional()
});

export const modelItemsSchema = z.array(modelItemSchema);
