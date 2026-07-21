import { z } from 'zod';
import { id, coords } from './common';

export const rectangleKindSchema = z.enum(['area', 'building']);

export const rectangleSchema = z.object({
  id,
  color: id.optional(),
  from: coords,
  to: coords,
  /** Visual style — area (default) or building outline. */
  kind: rectangleKindSchema.optional(),
  /** Fill opacity 0–1 (default ~0.25). */
  opacity: z.number().min(0).max(1).optional(),
  /** Optional display name (portal search). */
  name: z.string().max(100).optional(),
  /** Locked — cannot be moved / resized until unlocked (context menu). */
  locked: z.boolean().optional()
});
