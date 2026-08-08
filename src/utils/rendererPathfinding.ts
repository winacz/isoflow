/**
 * Connector path building (A* + fast preview). Prefer this import surface
 * when wiring routing / sync code.
 */
export {
  getConnectorPath,
  getConnectorPathPreview,
  getAnchorTile,
  getAllAnchors,
  splitConnectorPathByNodeBodies,
  connectorPathTileToGlobal,
  connectorPathTouchesTile
} from './renderer';
