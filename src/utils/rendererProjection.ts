/**
 * Projection / screen↔tile helpers.
 * Implementation still lives in renderer.ts; this module is the preferred import
 * surface so hot-path consumers do not pull the entire renderer mental model.
 */
export {
  screenToTile2d,
  screenToTile2dContinuous,
  screenToIso,
  getTilePosition,
  getTilePosition2d,
  getShape2dCenterPosition,
  getIsoProjectionCss,
  getTranslateCSS,
  getMouse
} from './renderer';
