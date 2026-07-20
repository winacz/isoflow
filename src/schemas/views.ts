import { z } from 'zod';
import { id, constrainedStrings, coords } from './common';
import { rectangleSchema } from './rectangle';
import { connectorSchema } from './connector';
import { textBoxSchema } from './textBox';

export const viewItemSchema = z.object({
  id,
  tile: coords,
  labelHeight: z.number().optional(),
  /** Relative size of the floating description card (1 = default). */
  labelScale: z.number().positive().optional(),
  /** Cabinet this item is mounted in (RACK switches). */
  parentId: id.optional(),
  /** 0-based rack unit from the top of the cabinet. */
  rackUnit: z.number().int().min(0).optional(),
  /** Locked — cannot be moved until unlocked (context menu). */
  locked: z.boolean().optional()
});

export const viewSchema = z.object({
  id,
  lastUpdated: z.string().datetime().optional(),
  name: constrainedStrings.name,
  description: constrainedStrings.description.optional(),
  items: z.array(viewItemSchema),
  rectangles: z.array(rectangleSchema).optional(),
  connectors: z.array(connectorSchema).optional(),
  textBoxes: z.array(textBoxSchema).optional()
});

export const viewsSchema = z.array(viewSchema);
