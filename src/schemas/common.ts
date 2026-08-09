import { z } from 'zod';

export const coords = z.object({
  x: z.number(),
  y: z.number()
});

export const id = z.string();
export const color = z.string();

export const constrainedStrings = {
  name: z.string().max(100),
  description: z.string().max(1000),
  /** Device note title (plakietka header). */
  descriptionTitle: z.string().max(100),
  /** Device short text (plakietka body) — never wraps in UI. */
  descriptionSummary: z.string().max(500),
  /** Rich notes HTML from the notebook editor. */
  descriptionNotes: z.string().max(100000)
};
