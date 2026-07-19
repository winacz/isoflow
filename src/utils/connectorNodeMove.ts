import { ConnectorAnchor, Coords, View } from 'src/types';
import { getShape2dSize } from 'src/config';
import { getAnchorTile, isTileInShape2dBounds } from './renderer';
import { isLockedTileWaypoint } from './connectorBendWaypoints';

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
 * After a device moves, keep middle tile waypoints so cable shape beyond the
 * nearest via is preserved. Only drop WPs that would cause spaghetti: inside
 * the moved footprint, or a reverse stub next to the moving port.
 * Locked waypoints are never removed.
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

  const startIsMoved = anchors[0]?.ref.item === movedItemId;
  const endIsMoved =
    anchors[anchors.length - 1]?.ref.item === movedItemId;

  // Index of the first mid tile WP from the moved port (the only segment
  // that should re-route). Everything from that WP toward the other end stays.
  let nearestMidFromMoved = -1;
  if (startIsMoved) {
    for (let i = 1; i < anchors.length - 1; i += 1) {
      if (anchors[i]?.ref.tile) {
        nearestMidFromMoved = i;
        break;
      }
    }
  } else if (endIsMoved) {
    for (let i = anchors.length - 2; i >= 1; i -= 1) {
      if (anchors[i]?.ref.tile) {
        nearestMidFromMoved = i;
        break;
      }
    }
  }

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

    if (isLockedTileWaypoint(anchor)) {
      return true;
    }

    if (!anchor.ref.tile) {
      return true;
    }

    // Free WPs beyond the nearest via (away from the moved node) stay put.
    if (nearestMidFromMoved >= 0) {
      if (startIsMoved && index > nearestMidFromMoved) {
        return true;
      }
      if (endIsMoved && !startIsMoved && index < nearestMidFromMoved) {
        return true;
      }
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

    // Only prune hairpins on the moved side of the nearest via.
    const onMovedSide =
      nearestMidFromMoved < 0 ||
      (startIsMoved && index <= nearestMidFromMoved) ||
      (endIsMoved && !startIsMoved && index >= nearestMidFromMoved);

    if (
      onMovedSide &&
      (isReverseStub(prev, curr, next) || isReverseStub(next, curr, prev))
    ) {
      return false;
    }

    return true;
  });

  if (kept.length < 2) {
    return [anchors[0], anchors[anchors.length - 1]];
  }

  return kept;
};
