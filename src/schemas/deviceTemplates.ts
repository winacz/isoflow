import { z } from 'zod';
import { id, constrainedStrings } from './common';

export const deviceFormFactorOptions = ['RACK', 'DIN', 'CUSTOM'] as const;
export const deviceNumberingOptions = [
  'ODD_EVEN',
  'ROWS_LTR',
  'COLS_TTB'
] as const;
export const devicePortMediaOptions = ['RJ45', 'SFP'] as const;

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
  type: z.enum(['BRIDGE', 'NAT']),
  targetPortId: id.optional() // reference to RJ45 physical port id
});

export const virtualInstanceSchema = z.object({
  id,
  name: constrainedStrings.name,
  type: z.enum(['VM', 'LXC', 'DOCKER']),
  status: z.enum(['running', 'stopped']),
  interfaces: z.array(virtualInterfaceSchema)
});

export const deviceTemplateSchema = z.object({
  id,
  name: constrainedStrings.name,
  kind: z.enum(['SWITCH', 'SERVER']),
  formFactor: z.enum(deviceFormFactorOptions),
  numbering: z.enum(deviceNumberingOptions),
  sections: z.array(deviceTemplateSectionSchema).min(1).max(12),
  virtualInstances: z.array(virtualInstanceSchema).optional()
});

export const deviceTemplatesSchema = z.array(deviceTemplateSchema);
