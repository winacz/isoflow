import { ConnectorAnchor, Coords, View } from 'src/types';
import { getShape2dSize } from 'src/config';
import { getAnchorTile, isTileInShape2dBounds } from './renderer';
import { untangleAnchorHairpins } from './connectorSegments';

type ModelItemRef = { id: string; icon?: string };

const isReverseStub = (from: Coords, mid: Coords, to: Coords) => {
  const toMid = { x: mid.x - from.x, y: mid.y - from.y };
  const toNext = { x: to.x - mid.x, y: to.y - mid.y };
  const stubLen = Math.abs(toMid.x) + Math.abs(toMid.y);
  const nextLen = Math.abs(toNext.x) + Math.abs(toNext.y);
  const dot = toMid.x * toNext.x + toMid.y * toNext.y;

  // Short reverse spike against the chord (classic port↔WP hairpin)
  return stubLen >= 1 && stubLen <= 2 && nextLen >= 1 && dot < 0;
};

/**
 * After a device moves, keep middle tile waypoints so cable shape is preserved
 * (horizontals shorten at the moving port). Only drop WPs that would cause
 * spaghetti: inside the moved footprint, or a reverse stub next to a port.
 */
export const pruneAnchorsAfterNodeMove = ({
  anchors,
  movedItemId,
  view,
  modelItems
}: {
  anchors: ConnectorAnchor[];
  movedItemId: string;
  view: View;
  modelItems?: ModelItemRef[];
}): ConnectorAnchor[] => {
  if (anchors.length <= 2) {
    return anchors;
  }

  const movedItem = view.items.find((item) => {
    return item.id === movedItemId;
  });

  if (!movedItem) {
    return anchors;
  }

  const modelItem = modelItems?.find((item) => {
    return item.id === movedItemId;
  });
  const size = getShape2dSize(modelItem?.icon ?? '') ?? {
    width: 1,
    height: 1
  };

  const positions = anchors.map((anchor) => {
    try {
      return getAnchorTile(anchor, view, modelItems);
    } catch {
      return null;
    }
  });

  const kept = anchors.filter((anchor, index) => {
    if (index === 0 || index === anchors.length - 1) {
      return true;
    }

    if (!anchor.ref.tile) {
      return true;
    }

    if (isTileInShape2dBounds(anchor.ref.tile, movedItem.tile, size)) {
      return false;
    }

    const prev = positions[index - 1];
    const curr = positions[index];
    const next = positions[index + 1];
    if (!prev || !curr || !next) {
      return true;
    }

    // Drop WP if it hairpins against either endpoint (moving port side)
    if (isReverseStub(prev, curr, next) || isReverseStub(next, curr, prev)) {
      return false;
    }

    return true;
  });

  if (kept.length < 2) {
    return [anchors[0], anchors[anchors.length - 1]];
  }

  return untangleAnchorHairpins(kept, view, modelItems);
};
