import { z } from 'zod';
import { id, constrainedStrings } from './common';

export const portTypeSchema = z.enum(['access', 'trunk']);

export const shape2dPortConfigSchema = z.object({
  label: z.string().max(50).optional(),
  name: z.string().max(100).optional(),
  vlan: z.string().max(32).optional(),
  /** Manual override for VLAN display / cable color (hex). */
  vlanColor: z.string().max(32).optional(),
  type: portTypeSchema.optional(),
  speed: z.string().max(20).optional()
});

export const modelItemSchema = z.object({
  id,
  name: constrainedStrings.name,
  description: constrainedStrings.description.optional(),
  icon: id.optional(),
  /** Chassis / body fill for 2D plan devices (hex / hex8 / rgba). */
  color: z.string().max(64).optional(),
  /** Per-port config for 2D devices (keyed by Shape2dPort.id). */
  ports: z.record(shape2dPortConfigSchema).optional()
});

export const modelItemsSchema = z.array(modelItemSchema);
