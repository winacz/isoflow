import { ProjectionMode } from 'src/types';

/** Plan-like canvas: classic 2D, schematic 2Dv2 and 2D v3. */
export const isPlanProjection = (mode: ProjectionMode | string): boolean => {
  return mode === 'TWO_D' || mode === 'TWO_D_V2' || mode === 'TWO_D_V3';
};

/**
 * Plan canvases that share the classic 2D behaviour: same node look, same grid
 * snapping, same shape palette, same port-click handling. Schematic 2Dv2 is a
 * different board and is deliberately excluded.
 */
export const isPlan2dCanvas = (mode: ProjectionMode | string): boolean => {
  return mode === 'TWO_D' || mode === 'TWO_D_V3';
};

/**
 * Views that ship the *classic* cable tooling — the 2D waypoint editor, the
 * four routing styles and the Auto-Układ / Smart Layout panels. 2D v3 opts
 * out of that UI; drawing new cables still works via CONNECTOR_V3
 * (`supportsDrawingConnections`).
 */
export const supportsConnectorTools = (
  mode: ProjectionMode | string
): boolean => {
  return mode !== 'TWO_D_V3';
};

/** Views that can draw a new connection at all (2D via CONNECTOR, v3 via CONNECTOR_V3). */
export const supportsDrawingConnections = (
  mode: ProjectionMode | string
): boolean => {
  return mode !== 'TWO_D_V2';
};

/** The interaction mode a view starts a new connection in. */
export const connectorModeForProjection = (
  mode: ProjectionMode | string
): 'CONNECTOR' | 'CONNECTOR_V3' => {
  return mode === 'TWO_D_V3' ? 'CONNECTOR_V3' : 'CONNECTOR';
};

/** Key into viewTransformByMode / canvasByMode. */
export const projectionPrefsKey = (
  mode: ProjectionMode | string
): 'ISOMETRIC' | 'TWO_D' | 'TWO_D_V2' | 'TWO_D_V3' => {
  if (mode === 'TWO_D') return 'TWO_D';
  if (mode === 'TWO_D_V2') return 'TWO_D_V2';
  if (mode === 'TWO_D_V3') return 'TWO_D_V3';
  return 'ISOMETRIC';
};
