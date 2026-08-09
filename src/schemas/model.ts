import { z } from 'zod';
import { INITIAL_DATA } from '../config';
import { constrainedStrings } from './common';
import { modelItemsSchema } from './modelItems';
import { viewsSchema } from './views';
import { validateModel } from './validation';
import { iconsSchema } from './icons';
import { colorsSchema } from './colors';
import { deviceTemplatesSchema } from './deviceTemplates';

/**
 * Project-wide VLAN display names (key = VLAN id, e.g. "10" → "Biuro").
 * Colour always comes from `getVlanColor` / VLAN id.
 */
export const vlanNamesSchema = z.record(z.string().max(100)).optional();

export const modelSchema = z
  .object({
    version: z.string().max(10).optional(),
    title: constrainedStrings.name,
    description: constrainedStrings.description.optional(),
    items: modelItemsSchema,
    views: viewsSchema,
    icons: iconsSchema,
    colors: colorsSchema,
    deviceTemplates: deviceTemplatesSchema.optional(),
    vlanNames: vlanNamesSchema
  })
  .superRefine((model, ctx) => {
    const issues = validateModel({ ...INITIAL_DATA, ...model });

    issues.forEach((issue) => {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        params: issue.params,
        message: issue.message
      });
    });
  });
