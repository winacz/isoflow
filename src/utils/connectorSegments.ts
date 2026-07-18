import {
  Coords,
  ConnectorAnchor,
  ConnectorPath,
  View,
  ModelItem
} from 'src/types';
import { CoordsUtils } from './CoordsUtils';
import { connectorPathTileToGlobal, getAnchorTile } from './renderer';
import { generateId } from './common';
import { computeOrthogonalHelpers } from './pathOptions';

const SEGMENT_REF_SEP = '::';

export type WaypointSegmentHit = {
  connectorId: string;
  /** Mid tile of the span (OpenWith icon position). */
  mid: Coords;
  axis: 'H' | 'V';
  /**
   * Existing tile waypoint(s) involved.
   * - two ids: drag both
   * - one id: spawn WP on the port exit tile, then drag [new, that id]
   * - empty: spawn WPs on both port exit tiles, then drag both
   */
  existingWaypointIds: [string, string] | [string] | [];
  /**
   * One side is a device port — insert WP on the first cable tile leaving
   * that port (not on the port cell — avoids Port→WP hairpin / "triangle").
   */
  materializeAtPort: boolean;
  /** Both ends are ports (no waypoints yet) — insert WPs on both exit tiles. */
  materializeBothPorts: boolean;
  /** Spawn tile for the new WP (cable exit next to the port). */
  portTile?: Coords;
  portSide?: 'start' | 'end';
  startPortTile?: Coords;
  endPortTile?: Coords;
};

export const encodeWaypointSegmentId = (
  connectorId: string,
  startAnchorId: string,
  endAnchorId: string
) => {
  return [connectorId, startAnchorId, endAnchorId].join(SEGMENT_REF_SEP);
};

export const parseWaypointSegmentId = (id: string) => {
  const [connectorId, startAnchorId, endAnchorId] = id.split(SEGMENT_REF_SEP);

  if (!connectorId || !startAnchorId || !endAnchorId) {
    throw new Error(`Invalid CONNECTOR_SEGMENT id: ${id}`);
  }

  return { connectorId, startAnchorId, endAnchorId };
};

const getGlobalPathTiles = (path: ConnectorPath): Coords[] => {
  return path.tiles.map((tile) => {
    return connectorPathTileToGlobal(tile, path.rectangle.from);
  });
};

const pathIndexOf = (globalTiles: Coords[], tile: Coords) => {
  const exact = globalTiles.findIndex((pathTile) => {
    return CoordsUtils.isEqual(pathTile, tile);
  });

  if (exact !== -1) return exact;

  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;

  globalTiles.forEach((pathTile, index) => {
    const dist =
      Math.abs(pathTile.x - tile.x) + Math.abs(pathTile.y - tile.y);

    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });

  return best;
};

const sortAnchorsAlongPath = (
  anchors: ConnectorAnchor[],
  path: ConnectorPath,
  view: View,
  modelItems: ModelItem[] | undefined,
  sortOverrides: Record<string, number> = {}
) => {
  const globalTiles = getGlobalPathTiles(path);

  return [...anchors]
    .map((anchor) => {
      if (sortOverrides[anchor.id] !== undefined) {
        return { anchor, pathIndex: sortOverrides[anchor.id] };
      }

      let pathIndex = Math.floor(globalTiles.length / 2);
      try {
        const resolved = getAnchorTile(anchor, view, modelItems);
        pathIndex = pathIndexOf(globalTiles, resolved);
      } catch {
        // keep midpoint fallback
      }

      return { anchor, pathIndex };
    })
    .sort((a, b) => {
      return a.pathIndex - b.pathIndex;
    })
    .map(({ anchor }) => {
      return anchor;
    });
};

type Span = {
  fromIndex: number;
  toIndex: number;
  startWaypointId: string | null;
  endWaypointId: string | null;
};

/**
 * Finds a draggable span under `tile`:
 * - between two tile waypoints,
 * - between a path end (RJ45 port) and the nearest tile waypoint,
 * - or the whole path when there are no tile waypoints yet (port↔port).
 */
export const findWaypointSegmentAtTile = ({
  connectorId,
  anchors,
  path,
  tile
}: {
  connectorId: string;
  anchors: ConnectorAnchor[];
  path: ConnectorPath;
  tile: Coords;
}): WaypointSegmentHit | null => {
  const globalTiles = getGlobalPathTiles(path);

  if (globalTiles.length < 2) return null;

  const tileWaypoints = anchors
    .filter((anchor) => {
      return Boolean(anchor.ref.tile);
    })
    .map((anchor) => {
      const waypointTile = anchor.ref.tile as Coords;
      return {
        id: anchor.id,
        tile: waypointTile,
        pathIndex: pathIndexOf(globalTiles, waypointTile)
      };
    })
    .sort((a, b) => {
      return a.pathIndex - b.pathIndex;
    });

  // No waypoints yet: whole cable between two ports is one draggable span
  if (tileWaypoints.length === 0) {
    if (globalTiles.length < 3) return null;

    const hovering = globalTiles.some((pathTile, index) => {
      if (index === 0 || index === globalTiles.length - 1) return false;
      return CoordsUtils.isEqual(pathTile, tile);
    });

    if (!hovering) return null;

    const startTile = globalTiles[0];
    const endTile = globalTiles[globalTiles.length - 1];
    // Spawn WPs on the first/last cable tiles — not on the port cells.
    // Coincident port+WP + a 1-tile drag creates a Port→WP→diagonal hairpin
    // that renders as a sharp "triangle" spike on diagonal cables.
    const startExit = globalTiles[1];
    const endExit = globalTiles[globalTiles.length - 2];
    const mid = globalTiles[Math.floor(globalTiles.length / 2)];

    return {
      connectorId,
      mid,
      axis: startTile.y === endTile.y ? 'H' : 'V',
      existingWaypointIds: [],
      materializeAtPort: false,
      materializeBothPorts: true,
      startPortTile: { ...startExit },
      endPortTile: { ...endExit }
    };
  }

  const spans: Span[] = [];

  const firstWp = tileWaypoints[0];
  if (firstWp.pathIndex >= 2) {
    spans.push({
      fromIndex: 0,
      toIndex: firstWp.pathIndex,
      startWaypointId: null,
      endWaypointId: firstWp.id
    });
  }

  for (let i = 0; i < tileWaypoints.length - 1; i += 1) {
    const start = tileWaypoints[i];
    const end = tileWaypoints[i + 1];
    if (end.pathIndex - start.pathIndex < 2) continue;

    spans.push({
      fromIndex: start.pathIndex,
      toIndex: end.pathIndex,
      startWaypointId: start.id,
      endWaypointId: end.id
    });
  }

  const lastWp = tileWaypoints[tileWaypoints.length - 1];
  if (lastWp.pathIndex <= globalTiles.length - 3) {
    spans.push({
      fromIndex: lastWp.pathIndex,
      toIndex: globalTiles.length - 1,
      startWaypointId: lastWp.id,
      endWaypointId: null
    });
  }

  for (const span of spans) {
    const spanTiles = globalTiles.slice(span.fromIndex, span.toIndex + 1);
    if (spanTiles.length < 3) continue;

    const hoveringSpan = spanTiles.some((pathTile, index) => {
      if (index === 0 || index === spanTiles.length - 1) return false;
      return CoordsUtils.isEqual(pathTile, tile);
    });

    if (!hoveringSpan) continue;

    const mid = spanTiles[Math.floor(spanTiles.length / 2)];
    const startTile = spanTiles[0];
    const endTile = spanTiles[spanTiles.length - 1];
    const axis: 'H' | 'V' = startTile.y === endTile.y ? 'H' : 'V';

    if (span.startWaypointId && span.endWaypointId) {
      return {
        connectorId,
        mid,
        axis,
        existingWaypointIds: [span.startWaypointId, span.endWaypointId],
        materializeAtPort: false,
        materializeBothPorts: false
      };
    }

    const existingId = span.startWaypointId ?? span.endWaypointId;
    if (!existingId) continue;

    const portSide: 'start' | 'end' = span.startWaypointId ? 'end' : 'start';
    // First cable tile after the port along this span (not the port cell)
    const exitTile =
      portSide === 'start'
        ? spanTiles[1]
        : spanTiles[spanTiles.length - 2];

    return {
      connectorId,
      mid,
      axis,
      existingWaypointIds: [existingId],
      materializeAtPort: true,
      materializeBothPorts: false,
      portTile: { ...exitTile },
      portSide
    };
  }

  return null;
};

/**
 * Prepares anchors for segment drag:
 * - two waypoints: drag as-is
 * - port↔waypoint: insert WP on port exit tile, drag with nearest WP
 * - port↔port: insert WPs on both exit tiles, drag both
 */
export const prepareWaypointSegmentDrag = ({
  anchors,
  path,
  hit,
  view,
  modelItems
}: {
  anchors: ConnectorAnchor[];
  path: ConnectorPath;
  hit: WaypointSegmentHit;
  view: View;
  modelItems?: ModelItem[];
}): {
  anchors: ConnectorAnchor[];
  startAnchorId: string;
  endAnchorId: string;
} => {
  const globalTiles = getGlobalPathTiles(path);

  if (
    hit.materializeBothPorts &&
    hit.startPortTile &&
    hit.endPortTile
  ) {
    const wpStart: ConnectorAnchor = {
      id: generateId(),
      ref: { tile: { ...hit.startPortTile } }
    };
    const wpEnd: ConnectorAnchor = {
      id: generateId(),
      ref: { tile: { ...hit.endPortTile } }
    };

    const startExitIndex = pathIndexOf(globalTiles, hit.startPortTile);
    const endExitIndex = pathIndexOf(globalTiles, hit.endPortTile);

    const ordered = sortAnchorsAlongPath(
      [...anchors, wpStart, wpEnd],
      path,
      view,
      modelItems,
      {
        [wpStart.id]: startExitIndex,
        [wpEnd.id]: endExitIndex
      }
    );

    return {
      anchors: ordered,
      startAnchorId: wpStart.id,
      endAnchorId: wpEnd.id
    };
  }

  if (!hit.materializeAtPort || !hit.portTile || !hit.portSide) {
    const [startAnchorId, endAnchorId] = hit.existingWaypointIds as [
      string,
      string
    ];
    return { anchors, startAnchorId, endAnchorId };
  }

  const existingId = hit.existingWaypointIds[0];
  if (!existingId) {
    throw new Error('Port↔waypoint segment is missing the existing waypoint id');
  }

  const newAnchor: ConnectorAnchor = {
    id: generateId(),
    ref: { tile: { ...hit.portTile } }
  };

  const exitPathIndex = pathIndexOf(globalTiles, hit.portTile);

  const ordered = sortAnchorsAlongPath(
    [...anchors, newAnchor],
    path,
    view,
    modelItems,
    { [newAnchor.id]: exitPathIndex }
  );

  return {
    anchors: ordered,
    startAnchorId:
      hit.portSide === 'start' ? newAnchor.id : existingId,
    endAnchorId: hit.portSide === 'start' ? existingId : newAnchor.id
  };
};

/**
 * If a tile WP forms a short reverse stub against a neighbour (classic
 * diagonal "triangle" spike), snap it onto the chord toward the far anchor.
 */
export const untangleAnchorHairpins = (
  anchors: ConnectorAnchor[],
  view: View,
  modelItems?: { id: string; icon?: string }[]
): ConnectorAnchor[] => {
  const positions = anchors.map((anchor) => {
    try {
      return getAnchorTile(anchor, view, modelItems);
    } catch {
      return null;
    }
  });

  return anchors.map((anchor, index) => {
    if (!anchor.ref.tile || index === 0 || index === anchors.length - 1) {
      return anchor;
    }

    const prev = positions[index - 1];
    const curr = positions[index];
    const next = positions[index + 1];
    if (!prev || !curr || !next) return anchor;

    const toCurr = { x: curr.x - prev.x, y: curr.y - prev.y };
    const toNext = { x: next.x - curr.x, y: next.y - curr.y };
    const stubLen = Math.abs(toCurr.x) + Math.abs(toCurr.y);
    const endStubLen = Math.abs(toNext.x) + Math.abs(toNext.y);
    const dot = toCurr.x * toNext.x + toCurr.y * toNext.y;

    if (stubLen < 1 || stubLen > 2 || dot >= 0) {
      // Also catch hairpin into a short end stub (WP just before end port)
      if (endStubLen < 1 || endStubLen > 2 || dot >= 0) {
        return anchor;
      }

      const chord = { x: next.x - prev.x, y: next.y - prev.y };
      const step = { x: Math.sign(chord.x), y: Math.sign(chord.y) };
      if (step.x === 0 && step.y === 0) return anchor;

      const fixed = { x: next.x - step.x, y: next.y - step.y };
      if (
        CoordsUtils.isEqual(fixed, prev) ||
        CoordsUtils.isEqual(fixed, curr)
      ) {
        return anchor;
      }

      return { ...anchor, ref: { tile: fixed } };
    }

    const chord = { x: next.x - prev.x, y: next.y - prev.y };
    const step = { x: Math.sign(chord.x), y: Math.sign(chord.y) };
    if (step.x === 0 && step.y === 0) return anchor;

    const fixed = { x: prev.x + step.x, y: prev.y + step.y };
    if (
      CoordsUtils.isEqual(fixed, next) ||
      CoordsUtils.isEqual(fixed, curr)
    ) {
      return anchor;
    }

    return { ...anchor, ref: { tile: fixed } };
  });
};

/** Translate both tile waypoints by the same delta. */
export const moveWaypointSegment = (
  anchors: ConnectorAnchor[],
  startAnchorId: string,
  endAnchorId: string,
  delta: Coords
): ConnectorAnchor[] => {
  if (CoordsUtils.isEqual(delta, CoordsUtils.zero())) {
    return anchors;
  }

  return anchors.map((anchor) => {
    if (anchor.id !== startAnchorId && anchor.id !== endAnchorId) {
      return anchor;
    }

    if (!anchor.ref.tile) {
      return anchor;
    }

    return {
      ...anchor,
      ref: {
        tile: CoordsUtils.add(anchor.ref.tile, delta)
      }
    };
  });
};

/**
 * Rebuild middle tile WPs as a clean L/U (max 2 elbows) between the
 * connector ends — avoids A* staircases when Shift is held.
 */
export const applyOrthogonalBendAnchors = ({
  anchors,
  draggedAnchorId,
  hint,
  view,
  modelItems
}: {
  anchors: ConnectorAnchor[];
  draggedAnchorId: string;
  hint: Coords;
  view: View;
  modelItems?: { id: string; icon?: string }[];
}): ConnectorAnchor[] => {
  if (anchors.length < 2) {
    return anchors;
  }

  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  let fromTile: Coords;
  let toTile: Coords;

  try {
    fromTile = getAnchorTile(first, view, modelItems);
    toTile = getAnchorTile(last, view, modelItems);
  } catch {
    return anchors;
  }

  const helpers = computeOrthogonalHelpers(fromTile, toTile, hint);

  if (helpers.length === 0) {
    const tile =
      fromTile.x === toTile.x
        ? { x: fromTile.x, y: hint.y }
        : fromTile.y === toTile.y
          ? { x: hint.x, y: fromTile.y }
          : hint;

    // Keep a single sliding WP on the straight run
    return [
      first,
      {
        id: draggedAnchorId,
        ref: { tile }
      },
      last
    ];
  }

  const reusableIds = anchors
    .filter((anchor) => {
      return Boolean(anchor.ref.tile) && anchor.id !== draggedAnchorId;
    })
    .map((anchor) => {
      return anchor.id;
    });

  let closestIndex = 0;
  helpers.forEach((helper, index) => {
    const best = helpers[closestIndex];
    if (
      Math.abs(helper.x - hint.x) + Math.abs(helper.y - hint.y) <
      Math.abs(best.x - hint.x) + Math.abs(best.y - hint.y)
    ) {
      closestIndex = index;
    }
  });

  const usedIds = new Set<string>();
  const bendAnchors: ConnectorAnchor[] = helpers.map((tile, index) => {
    let id: string;

    if (index === closestIndex) {
      id = draggedAnchorId;
    } else {
      id =
        reusableIds.find((candidate) => {
          return !usedIds.has(candidate);
        }) ?? generateId();
    }

    usedIds.add(id);

    return {
      id,
      ref: { tile: { ...tile } }
    };
  });

  return [first, ...bendAnchors, last];
};
