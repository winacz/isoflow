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

export const deviceTemplateSchema = z.object({
  id,
  name: constrainedStrings.name,
  kind: z.literal('SWITCH'),
  formFactor: z.enum(deviceFormFactorOptions),
  numbering: z.enum(deviceNumberingOptions),
  sections: z.array(deviceTemplateSectionSchema).min(1).max(12)
});

export const deviceTemplatesSchema = z.array(deviceTemplateSchema);
