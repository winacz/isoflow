import { z } from 'zod';
import { ProjectionOrientationEnum } from 'src/types/common';
import { id, coords, constrainedStrings } from './common';

export const textBoxSchema = z.object({
  id,
  tile: coords,
  content: z.string().max(1000),
  fontSize: z.number().optional(),
  fontWeight: z.string().optional(),
  fontFamily: z.string().optional(),
  textAlign: z.string().optional(),
  color: z.string().optional(),
  orientation: z
    .union([
      z.literal(ProjectionOrientationEnum.X),
      z.literal(ProjectionOrientationEnum.Y)
    ])
    .optional()
});
