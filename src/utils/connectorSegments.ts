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

/**
 * Collapse tile waypoints that share the same grid cell (keep first along
 * the anchor list). Port / item endpoints are never removed.
 */
export const dedupeTileWaypoints = (
  anchors: ConnectorAnchor[]
): ConnectorAnchor[] => {
  const seen = new Set<string>();

  return anchors.filter((anchor) => {
    const tile = anchor.ref.tile;
    if (!tile) return true;

    const key = `${tile.x},${tile.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * True when `tile` is already occupied by another tile waypoint on this cable
 * (optionally ignoring one id — the WP being dragged).
 */
export const hasTileWaypointAt = (
  anchors: ConnectorAnchor[],
  tile: Coords,
  excludeAnchorId?: string
): boolean => {
  return anchors.some((anchor) => {
    if (excludeAnchorId && anchor.id === excludeAnchorId) return false;
    if (!anchor.ref.tile) return false;
    return CoordsUtils.isEqual(anchor.ref.tile, tile);
  });
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

type TileWaypoint = {
  id: string;
  tile: Coords;
  pathIndex: number;
};

const segmentAxis = (start: Coords, end: Coords): 'H' | 'V' => {
  return start.y === end.y ? 'H' : 'V';
};

/** One-step perpendicular (tile space) — used to keep exit WPs off port cells. */
const unitPerp = (along: Coords): Coords => {
  if (along.x === 0 && along.y === 0) {
    return { x: 1, y: 0 };
  }

  return {
    x: -Math.sign(along.y),
    y: Math.sign(along.x)
  };
};

const listTileWaypoints = (
  anchors: ConnectorAnchor[],
  globalTiles: Coords[]
): TileWaypoint[] => {
  return anchors
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
};

const buildSpans = (
  tileWaypoints: TileWaypoint[],
  pathLength: number
): Span[] => {
  const spans: Span[] = [];
  if (tileWaypoints.length === 0) return spans;

  const firstWp = tileWaypoints[0];
  if (firstWp.pathIndex >= 1) {
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
    if (end.pathIndex - start.pathIndex < 1) continue;

    spans.push({
      fromIndex: start.pathIndex,
      toIndex: end.pathIndex,
      startWaypointId: start.id,
      endWaypointId: end.id
    });
  }

  const lastWp = tileWaypoints[tileWaypoints.length - 1];
  if (lastWp.pathIndex <= pathLength - 2) {
    spans.push({
      fromIndex: lastWp.pathIndex,
      toIndex: pathLength - 1,
      startWaypointId: lastWp.id,
      endWaypointId: null
    });
  }

  return spans;
};

const hitFromPortPortPath = (
  connectorId: string,
  globalTiles: Coords[]
): WaypointSegmentHit => {
  const n = globalTiles.length;
  const startTile = globalTiles[0];
  const endTile = globalTiles[n - 1];
  const mid = globalTiles[Math.floor(n / 2)];

  // Prefer interior exits; for length-2 diagonals offset perpendicular so
  // WPs are not coincident with port cells (avoids triangle hairpins).
  let startExit: Coords;
  let endExit: Coords;

  if (n >= 3) {
    startExit = globalTiles[1];
    endExit = globalTiles[n - 2];
  } else {
    const along = {
      x: endTile.x - startTile.x,
      y: endTile.y - startTile.y
    };
    const perp = unitPerp(along);
    startExit = { x: startTile.x + perp.x, y: startTile.y + perp.y };
    endExit = { x: endTile.x + perp.x, y: endTile.y + perp.y };
  }

  return {
    connectorId,
    mid,
    axis: segmentAxis(startTile, endTile),
    existingWaypointIds: [],
    materializeAtPort: false,
    materializeBothPorts: true,
    startPortTile: { ...startExit },
    endPortTile: { ...endExit }
  };
};

const hitFromSpan = (
  connectorId: string,
  globalTiles: Coords[],
  span: Span
): WaypointSegmentHit | null => {
  const spanTiles = globalTiles.slice(span.fromIndex, span.toIndex + 1);
  if (spanTiles.length < 2) return null;

  const mid = spanTiles[Math.floor(spanTiles.length / 2)];
  const startTile = spanTiles[0];
  const endTile = spanTiles[spanTiles.length - 1];
  const axis = segmentAxis(startTile, endTile);

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
  if (!existingId) return null;

  const portSide: 'start' | 'end' = span.startWaypointId ? 'end' : 'start';
  // First cable tile after the port along this span (not the port cell)
  let exitTile =
    portSide === 'start'
      ? spanTiles[Math.min(1, spanTiles.length - 1)]
      : spanTiles[Math.max(0, spanTiles.length - 2)];

  if (CoordsUtils.isEqual(exitTile, startTile) || CoordsUtils.isEqual(exitTile, endTile)) {
    const along = {
      x: endTile.x - startTile.x,
      y: endTile.y - startTile.y
    };
    const perp = unitPerp(along);
    const portTile = portSide === 'start' ? startTile : endTile;
    exitTile = { x: portTile.x + perp.x, y: portTile.y + perp.y };
  }

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
};

/**
 * Finds a draggable span under `tile`:
 * - between two tile waypoints,
 * - between a path end (RJ45 port) and the nearest tile waypoint,
 * - or the whole path when there are no tile waypoints yet (port↔port).
 *
 * Requires an intermediate path tile (strict hover) — use
 * `findWaypointSegmentNearTile` for stack-badge grabs on diagonals.
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

  const tileWaypoints = listTileWaypoints(anchors, globalTiles);

  // No waypoints yet: whole cable between two ports is one draggable span
  if (tileWaypoints.length === 0) {
    if (globalTiles.length < 3) return null;

    const hovering = globalTiles.some((pathTile, index) => {
      if (index === 0 || index === globalTiles.length - 1) return false;
      return CoordsUtils.isEqual(pathTile, tile);
    });

    if (!hovering) return null;

    return hitFromPortPortPath(connectorId, globalTiles);
  }

  const spans = buildSpans(tileWaypoints, globalTiles.length);

  for (const span of spans) {
    const spanTiles = globalTiles.slice(span.fromIndex, span.toIndex + 1);
    if (spanTiles.length < 3) continue;

    const hoveringSpan = spanTiles.some((pathTile, index) => {
      if (index === 0 || index === spanTiles.length - 1) return false;
      return CoordsUtils.isEqual(pathTile, tile);
    });

    if (!hoveringSpan) continue;

    return hitFromSpan(connectorId, globalTiles, span);
  }

  return null;
};

/**
 * Stack-badge / diagonal-safe segment lookup.
 * Badge mid tiles often land on edge endpoints (esp. diagonals) or short
 * paths (<3 tiles) where strict hover fails — still return a draggable hit.
 */
export const findWaypointSegmentNearTile = ({
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
  const exact = findWaypointSegmentAtTile({
    connectorId,
    anchors,
    path,
    tile
  });
  if (exact) return exact;

  const globalTiles = getGlobalPathTiles(path);
  if (globalTiles.length < 2) return null;

  const tileWaypoints = listTileWaypoints(anchors, globalTiles);

  if (tileWaypoints.length === 0) {
    return hitFromPortPortPath(connectorId, globalTiles);
  }

  let idx = pathIndexOf(globalTiles, tile);
  if (idx <= 0 && globalTiles.length > 1) idx = 1;
  if (idx >= globalTiles.length - 1 && globalTiles.length > 1) {
    idx = globalTiles.length - 2;
  }

  const spans = buildSpans(tileWaypoints, globalTiles.length);
  const containing =
    spans.find((span) => {
      return idx >= span.fromIndex && idx <= span.toIndex;
    }) ?? spans[0];

  if (!containing) return null;

  return hitFromSpan(connectorId, globalTiles, containing);
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
    // Same exit cell → only one WP (never two on one tile).
    if (CoordsUtils.isEqual(hit.startPortTile, hit.endPortTile)) {
      const wp: ConnectorAnchor = {
        id: generateId(),
        ref: { tile: { ...hit.startPortTile } }
      };
      const exitIndex = pathIndexOf(globalTiles, hit.startPortTile);
      const ordered = sortAnchorsAlongPath(
        [...anchors, wp],
        path,
        view,
        modelItems,
        { [wp.id]: exitIndex }
      );
      const existingId = hit.existingWaypointIds[0];
      return {
        anchors: dedupeTileWaypoints(ordered),
        startAnchorId: wp.id,
        endAnchorId: existingId ?? wp.id
      };
    }

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
      anchors: dedupeTileWaypoints(ordered),
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

  // Exit tile already has a WP — drag that one with the neighbour, no duplicate.
  if (hasTileWaypointAt(anchors, hit.portTile)) {
    const occupant = anchors.find((anchor) => {
      return (
        Boolean(anchor.ref.tile) &&
        CoordsUtils.isEqual(anchor.ref.tile as Coords, hit.portTile as Coords)
      );
    });
    return {
      anchors,
      startAnchorId:
        hit.portSide === 'start' ? occupant!.id : existingId,
      endAnchorId: hit.portSide === 'start' ? existingId : occupant!.id
    };
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
    anchors: dedupeTileWaypoints(ordered),
    startAnchorId:
      hit.portSide === 'start' ? newAnchor.id : existingId,
    endAnchorId: hit.portSide === 'start' ? existingId : newAnchor.id
  };
};

/**
 * If a tile WP forms a short reverse stub against a neighbour (classic
 * diagonal "triangle" spike), snap it onto the chord toward the far anchor.
 *
 * Only true local spikes: BOTH legs must be short (≤2). A short exit stub
 * that then runs a long way to the far port (U/L via one WP) has dot < 0
 * but must be kept — otherwise upward stubs need 3+ tiles of clearance.
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

    // Local triangle spike only (both legs short + reverse)
    if (stubLen < 1 || stubLen > 2 || endStubLen < 1 || endStubLen > 2 || dot >= 0) {
      return anchor;
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

/**
 * Level-drag one axis of the two segment waypoints.
 *
 * - Aligned on this axis → both move together by `d`.
 * - Offset → only the trailing waypoint (behind in the drag direction) moves,
 *   until it catches up with the leading one; any overshoot then carries both.
 */
const levelAxis = (a: number, b: number, d: number): [number, number] => {
  if (d === 0) return [a, b];
  if (a === b) return [a + d, b + d];

  const lead = d > 0 ? Math.max(a, b) : Math.min(a, b);
  const lag = d > 0 ? Math.min(a, b) : Math.max(a, b);
  const newLag = lag + d;
  const overshoot = d > 0 ? newLag > lead : newLag < lead;
  const nextLead = overshoot ? newLag : lead;

  const aIsLead = d > 0 ? a > b : a < b;
  return aIsLead ? [nextLead, newLag] : [newLag, nextLead];
};

/**
 * Drag a segment by its handle with "leveling" behavior:
 * grabs the waypoint that trails in the drag direction until it aligns with
 * the leading one, then translates both. Applied independently per axis, so
 * it works for every drag direction.
 */
export const moveWaypointSegment = (
  anchors: ConnectorAnchor[],
  startAnchorId: string,
  endAnchorId: string,
  delta: Coords
): ConnectorAnchor[] => {
  if (CoordsUtils.isEqual(delta, CoordsUtils.zero())) {
    return anchors;
  }

  const startTile = anchors.find((anchor) => {
    return anchor.id === startAnchorId;
  })?.ref.tile;
  const endTile = anchors.find((anchor) => {
    return anchor.id === endAnchorId;
  })?.ref.tile;

  if (!startTile || !endTile) {
    return anchors;
  }

  const [startX, endX] = levelAxis(startTile.x, endTile.x, delta.x);
  const [startY, endY] = levelAxis(startTile.y, endTile.y, delta.y);

  const nextStart: Coords = { x: startX, y: startY };
  const nextEnd: Coords = { x: endX, y: endY };

  // Never stack both segment WPs on the same tile.
  if (CoordsUtils.isEqual(nextStart, nextEnd)) {
    return anchors;
  }

  return anchors.map((anchor) => {
    if (anchor.id === startAnchorId && anchor.ref.tile) {
      return { ...anchor, ref: { tile: nextStart } };
    }

    if (anchor.id === endAnchorId && anchor.ref.tile) {
      return { ...anchor, ref: { tile: nextEnd } };
    }

    return anchor;
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
