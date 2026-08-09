/**
 * Hit-testing helpers (nodes, ports, headers) for plan / iso interaction.
 * Prefer this module over importing the full renderer barrel in new code.
 */
export {
  getItemAtTile,
  getShape2dItemAtTile,
  getShape2dPortAtPoint,
  getShape2dPortAtTile,
  getNearestShape2dPort,
  getShape2dHeaderAtPoint,
  getShape2dBodyAtPoint
} from './renderer';
export {
  getShape2dInfoButtonAtPoint,
  getShape2dInfoSlotMetrics,
  isLocalPointInShape2dInfoSlot
} from './shape2dInfoSlot';
