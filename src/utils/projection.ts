import { ProjectionMode } from 'src/types';

/** Plan-like canvas: classic 2D and schematic 2Dv2. */
export const isPlanProjection = (mode: ProjectionMode | string): boolean => {
  return mode === 'TWO_D' || mode === 'TWO_D_V2';
};

/** Key into viewTransformByMode / canvasByMode. */
export const projectionPrefsKey = (
  mode: ProjectionMode | string
): 'ISOMETRIC' | 'TWO_D' | 'TWO_D_V2' => {
  if (mode === 'TWO_D') return 'TWO_D';
  if (mode === 'TWO_D_V2') return 'TWO_D_V2';
  return 'ISOMETRIC';
};
