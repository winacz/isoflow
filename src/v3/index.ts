/**
 * 2D v3 — connection routing + test density grouping.
 *
 * Drawing cables uses ConnectorV3 + ./routing (walkable-node A*).
 * Density groups (./densityGroups) are a test visualisation only.
 */
export * from './routing';
export * from './densityGroups';
export * from './densityGroupBuses';
export * from './densityGroupLayout';
