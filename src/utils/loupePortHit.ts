import { getModelItemPorts } from 'src/config';
import type { ModelItem } from 'src/types';
import {
  getLoupeAnchorItemId,
  isLoupeGlassActive
} from './loupeRevealLock';
import { getShape2dPortWorldTile, type Shape2dPortHit } from './renderer';

type PortHover = { itemId: string; portId: string | null } | null;

/**
 * While the loupe glass is open, the magnified jack under the cursor is tracked
 * in `shape2dPortHover` (PortLoupeOverlay). Canvas hit-tests see the unscaled
 * scene underneath and pick the wrong port — use this instead.
 *
 * Returns null when glass is closed (caller should run a normal canvas hit),
 * or when glass is open but the cursor is on chassis / no valid jack.
 */
export const resolveLoupePortHit = ({
  shape2dPortHover,
  viewItems,
  modelItems,
  isPortAvailable
}: {
  shape2dPortHover: PortHover;
  viewItems: { id: string; tile: { x: number; y: number } }[];
  modelItems: ModelItem[];
  isPortAvailable?: (hit: Shape2dPortHit) => boolean;
}): Shape2dPortHit | null | undefined => {
  if (!isLoupeGlassActive()) return undefined;

  const hover = shape2dPortHover;
  const anchorId = getLoupeAnchorItemId();
  if (
    !hover?.portId ||
    (anchorId && hover.itemId !== anchorId)
  ) {
    return null;
  }

  const viewItem = viewItems.find((item) => item.id === hover.itemId);
  const modelItem = modelItems.find((item) => item.id === hover.itemId);
  const port = modelItem
    ? getModelItemPorts(modelItem).find((p) => p.id === hover.portId)
    : null;

  if (!viewItem || !port) return null;

  const hit: Shape2dPortHit = {
    itemId: hover.itemId,
    portId: hover.portId,
    portTile: port.tile,
    worldTile: getShape2dPortWorldTile(viewItem.tile, port.tile)
  };

  if (isPortAvailable && !isPortAvailable(hit)) return null;
  return hit;
};
