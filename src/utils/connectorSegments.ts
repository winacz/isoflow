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

/** Ortho axis only — diagonals return null (no segment handle / drag). */
const orthoAxis = (start: Coords, end: Coords): 'H' | 'V' | null => {
  if (start.x === end.x && start.y !== end.y) return 'V';
  if (start.y === end.y && start.x !== end.x) return 'H';
  return null;
};

const midTileOf = (a: Coords, b: Coords): Coords => {
  return {
    x: Math.round((a.x + b.x) / 2),
    y: Math.round((a.y + b.y) / 2)
  };
};

/** One step from `from` toward `toward` (ortho or diagonal). */
const exitStep = (from: Coords, toward: Coords): Coords => {
  return {
    x: from.x + Math.sign(toward.x - from.x),
    y: from.y + Math.sign(toward.y - from.y)
  };
};

/**
 * True when `tile` lies on the open interior of an H/V segment (or on either
 * cell when the span is only one step — sparse preview paths often have no
 * intermediate tiles).
 */
const tileOnOrthoSegment = (
  tile: Coords,
  a: Coords,
  b: Coords,
  axis: 'H' | 'V'
): boolean => {
  if (axis === 'H') {
    if (tile.y !== a.y) return false;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    if (hi - lo <= 1) return tile.x === lo || tile.x === hi;
    return tile.x > lo && tile.x < hi;
  }

  if (tile.x !== a.x) return false;
  const lo = Math.min(a.y, b.y);
  const hi = Math.max(a.y, b.y);
  if (hi - lo <= 1) return tile.y === lo || tile.y === hi;
  return tile.y > lo && tile.y < hi;
};

type SegmentEndpoint = {
  kind: 'port' | 'wp';
  id: string | null;
  tile: Coords;
};

/**
 * Port → mid WPs (anchor order) → port. Uses path ends for ports and actual
 * WP tiles for geometry so sparse corner-only paths still work.
 */
const buildSegmentEndpoints = (
  anchors: ConnectorAnchor[],
  globalTiles: Coords[]
): SegmentEndpoint[] => {
  if (globalTiles.length < 2) return [];

  const start: SegmentEndpoint = {
    kind: 'port',
    id: null,
    tile: globalTiles[0]
  };
  const end: SegmentEndpoint = {
    kind: 'port',
    id: null,
    tile: globalTiles[globalTiles.length - 1]
  };

  const points: SegmentEndpoint[] = [start];

  anchors.forEach((anchor) => {
    const tile = anchor.ref.tile;
    if (!tile) return;
    if (CoordsUtils.isEqual(tile, start.tile)) return;
    if (CoordsUtils.isEqual(tile, end.tile)) return;

    const last = points[points.length - 1];
    if (CoordsUtils.isEqual(last.tile, tile)) return;

    points.push({ kind: 'wp', id: anchor.id, tile });
  });

  const last = points[points.length - 1];
  if (!CoordsUtils.isEqual(last.tile, end.tile)) {
    points.push(end);
  }

  return points;
};

const hitFromEndpoints = (
  connectorId: string,
  a: SegmentEndpoint,
  b: SegmentEndpoint,
  axis: 'H' | 'V'
): WaypointSegmentHit => {
  const mid = midTileOf(a.tile, b.tile);

  if (a.kind === 'wp' && b.kind === 'wp' && a.id && b.id) {
    return {
      connectorId,
      mid,
      axis,
      existingWaypointIds: [a.id, b.id],
      materializeAtPort: false,
      materializeBothPorts: false
    };
  }

  if (a.kind === 'port' && b.kind === 'port') {
    return {
      connectorId,
      mid,
      axis,
      existingWaypointIds: [],
      materializeAtPort: false,
      materializeBothPorts: true,
      startPortTile: exitStep(a.tile, b.tile),
      endPortTile: exitStep(b.tile, a.tile)
    };
  }

  if (a.kind === 'port' && b.kind === 'wp' && b.id) {
    return {
      connectorId,
      mid,
      axis,
      existingWaypointIds: [b.id],
      materializeAtPort: true,
      materializeBothPorts: false,
      portTile: exitStep(a.tile, b.tile),
      portSide: 'start'
    };
  }

  if (a.kind === 'wp' && b.kind === 'port' && a.id) {
    return {
      connectorId,
      mid,
      axis,
      existingWaypointIds: [a.id],
      materializeAtPort: true,
      materializeBothPorts: false,
      portTile: exitStep(b.tile, a.tile),
      portSide: 'end'
    };
  }

  return {
    connectorId,
    mid,
    axis,
    existingWaypointIds: [],
    materializeAtPort: false,
    materializeBothPorts: true,
    startPortTile: exitStep(a.tile, b.tile),
    endPortTile: exitStep(b.tile, a.tile)
  };
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

  const axis = orthoAxis(startTile, endTile) ?? 'H';

  return {
    connectorId,
    mid,
    axis,
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
  const axis = orthoAxis(startTile, endTile);
  if (!axis) return null;

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
 * Mid-point handles for every H/V span between consecutive path nodes
 * (port ↔ WP ↔ WP ↔ port). Diagonals are omitted.
 */
export const listOrthoSegmentHandles = ({
  anchors,
  path
}: {
  anchors: ConnectorAnchor[];
  path: ConnectorPath;
}): Array<{
  id: string;
  mid: Coords;
  axis: 'H' | 'V';
}> => {
  const globalTiles = getGlobalPathTiles(path);
  const points = buildSegmentEndpoints(anchors, globalTiles);
  const handles: Array<{ id: string; mid: Coords; axis: 'H' | 'V' }> = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const axis = orthoAxis(a.tile, b.tile);
    if (!axis) continue;

    handles.push({
      id: `${a.id ?? 'port'}:${b.id ?? 'port'}`,
      mid: midTileOf(a.tile, b.tile),
      axis
    });
  }

  return handles;
};

/**
 * Finds a draggable H/V span under `tile`:
 * - between two tile waypoints,
 * - between a path end (RJ45 port) and the nearest tile waypoint,
 * - or the whole path when there are no tile waypoints yet (port↔port).
 *
 * Uses geometric ortho tests so sparse corner-only preview paths still hit.
 * Diagonals are ignored — use `findWaypointSegmentNearTile` for stack badges.
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

  const points = buildSegmentEndpoints(anchors, globalTiles);

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const axis = orthoAxis(a.tile, b.tile);
    if (!axis) continue;
    if (!tileOnOrthoSegment(tile, a.tile, b.tile, axis)) continue;

    return hitFromEndpoints(connectorId, a, b, axis);
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

  return (
    hitFromSpan(connectorId, globalTiles, containing) ??
    hitFromPortPortPath(connectorId, globalTiles)
  );
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
    // Locked vias are fixed — never snap them away.
    if (anchor.locked) {
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
 * Level-drag values on one axis (N waypoints).
 *
 * - All aligned → everyone moves by `d`.
 * - Offset → only trailing values (behind in the drag direction) move toward
 *   the lead until they catch up; leftover delta then translates the pack.
 */
export const levelAxisValues = (values: number[], d: number): number[] => {
  if (d === 0 || values.length === 0) return values;
  if (values.every((value) => value === values[0])) {
    return values.map((value) => value + d);
  }

  if (d > 0) {
    const lead = Math.max(...values);
    const lagExtreme = Math.min(...values);
    const gap = lead - lagExtreme;
    if (d >= gap) {
      const target = lagExtreme + d;
      return values.map(() => target);
    }
    return values.map((value) => {
      return value === lead ? value : Math.min(value + d, lead);
    });
  }

  const lead = Math.min(...values);
  const lagExtreme = Math.max(...values);
  const gap = lagExtreme - lead;
  if (-d >= gap) {
    const target = lagExtreme + d;
    return values.map(() => target);
  }
  return values.map((value) => {
    return value === lead ? value : Math.max(value + d, lead);
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
  const [nextA, nextB] = levelAxisValues([a, b], d);
  return [nextA, nextB];
};

/**
 * Apply leveling to a set of tiles (multi-WP / multi-cable selection).
 * X and Y are leveled independently — same policy as segment handles.
 */
export const levelWaypointTiles = (
  tiles: Coords[],
  delta: Coords
): Coords[] => {
  if (tiles.length === 0) return tiles;
  if (CoordsUtils.isEqual(delta, CoordsUtils.zero())) {
    return tiles.map((tile) => {
      return { ...tile };
    });
  }

  const nextX = levelAxisValues(
    tiles.map((tile) => tile.x),
    delta.x
  );
  const nextY = levelAxisValues(
    tiles.map((tile) => tile.y),
    delta.y
  );

  return tiles.map((_, index) => {
    return { x: nextX[index], y: nextY[index] };
  });
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
 * Snap `target` so the vector from `origin` is horizontal, vertical, or 45°.
 * Used for waypoint / segment edits on the plan grid.
 */
export const snapTileToHV45FromOrigin = (
  origin: Coords,
  target: Coords
): Coords => {
  const tx = Math.round(target.x);
  const ty = Math.round(target.y);
  const dx = tx - origin.x;
  const dy = ty - origin.y;

  if (dx === 0 && dy === 0) {
    return { x: origin.x, y: origin.y };
  }

  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  if (adx === 0 || ady === 0) {
    return { x: origin.x + dx, y: origin.y + dy };
  }

  const toH = ady;
  const toV = adx;
  const to45 = Math.abs(adx - ady);

  if (toH <= toV && toH <= to45) {
    return { x: origin.x + dx, y: origin.y };
  }
  if (toV <= to45) {
    return { x: origin.x, y: origin.y + dy };
  }

  const m = Math.max(adx, ady);
  return {
    x: origin.x + Math.sign(dx) * m,
    y: origin.y + Math.sign(dy) * m
  };
};

/** True when the chord between two tiles is H, V, or exact 45°. */
export const isHV45Segment = (a: Coords, b: Coords): boolean => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx === 0 || dy === 0 || dx === dy;
};

/**
 * Snap a dragged waypoint so every leg to `neighbors` stays H / V / 45°.
 * Prefers the candidate closest to `desired`.
 */
export const snapTileToHV45Neighbors = (
  desired: Coords,
  neighbors: Coords[]
): Coords => {
  const target = { x: Math.round(desired.x), y: Math.round(desired.y) };
  if (neighbors.length === 0) return target;

  const candidates: Coords[] = [target];
  neighbors.forEach((ref) => {
    candidates.push(snapTileToHV45FromOrigin(ref, target));
    candidates.push({ x: ref.x, y: target.y });
    candidates.push({ x: target.x, y: ref.y });

    const adx = Math.abs(target.x - ref.x);
    const ady = Math.abs(target.y - ref.y);
    const sx = Math.sign(target.x - ref.x) || 1;
    const sy = Math.sign(target.y - ref.y) || 1;
    const dMax = Math.max(adx, ady);
    const dMin = Math.min(adx, ady);
    if (dMax > 0) {
      candidates.push({ x: ref.x + sx * dMax, y: ref.y + sy * dMax });
    }
    if (dMin > 0) {
      candidates.push({ x: ref.x + sx * dMin, y: ref.y + sy * dMin });
    }
  });

  // With two neighbors, also try axis/45 intersections near the cursor.
  if (neighbors.length >= 2) {
    const [a, b] = neighbors;
    const xs = [a.x, b.x, target.x];
    const ys = [a.y, b.y, target.y];
    xs.forEach((x) => {
      ys.forEach((y) => {
        candidates.push({ x, y });
      });
    });
    // 45° from a intersecting H/V from b (and vice versa)
    const try45 = (from: Coords, other: Coords) => {
      for (const s of [-1, 1]) {
        candidates.push({ x: other.x, y: from.y + s * Math.abs(other.x - from.x) });
        candidates.push({ x: from.x + s * Math.abs(other.y - from.y), y: other.y });
      }
    };
    try45(a, b);
    try45(b, a);
  }

  let best = target;
  let bestScore = Number.POSITIVE_INFINITY;

  candidates.forEach((candidate) => {
    const invalid = neighbors.reduce((count, ref) => {
      return count + (isHV45Segment(ref, candidate) ? 0 : 1);
    }, 0);
    const dist =
      Math.abs(candidate.x - desired.x) + Math.abs(candidate.y - desired.y);
    const score = invalid * 10000 + dist;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  });

  return best;
};

/** Snap a drag delta to H / V / 45° in tile space. */
export const snapDeltaToHV45 = (delta: Coords): Coords => {
  return snapTileToHV45FromOrigin(CoordsUtils.zero(), delta);
};

type SegmentEndRole = 'collinear' | 'corner' | 'loose';

const classifySegmentEnd = (
  outer: Coords | null,
  cur: Coords,
  other: Coords,
  axis: 'H' | 'V'
): SegmentEndRole => {
  if (!outer) return 'loose';

  if (axis === 'H') {
    if (outer.y === cur.y && other.y === cur.y) return 'collinear';
    return 'corner';
  }

  if (outer.x === cur.x && other.x === cur.x) return 'collinear';
  return 'corner';
};

const resolveAnchorPositions = (
  anchors: ConnectorAnchor[],
  view: View,
  modelItems: ModelItem[] | undefined,
  overrides: Record<string, Coords>
): Array<Coords | null> => {
  return anchors.map((anchor) => {
    if (overrides[anchor.id]) {
      return { ...overrides[anchor.id] };
    }
    try {
      return getAnchorTile(anchor, view, modelItems);
    } catch {
      return null;
    }
  });
};

/**
 * Ortho segment drag: translate a free H/V span, or form a step when one end
 * sits on a straight run and the other is a corner — lock the collinear end,
 * move the corner, and insert an elbow so the path stays H/V (no bend).
 */
export const applyOrthoSegmentDrag = ({
  anchors,
  startAnchorId,
  endAnchorId,
  originStart,
  originEnd,
  delta,
  view,
  modelItems
}: {
  anchors: ConnectorAnchor[];
  startAnchorId: string;
  endAnchorId: string;
  originStart: Coords;
  originEnd: Coords;
  delta: Coords;
  view: View;
  modelItems?: { id: string; icon?: string }[];
}): ConnectorAnchor[] => {
  if (CoordsUtils.isEqual(delta, CoordsUtils.zero())) {
    return anchors;
  }

  const axis = orthoAxis(originStart, originEnd);
  if (!axis) {
    return anchors;
  }

  const constrained =
    axis === 'H' ? { x: 0, y: delta.y } : { x: delta.x, y: 0 };
  if (CoordsUtils.isEqual(constrained, CoordsUtils.zero())) {
    return anchors;
  }

  const startIndex = anchors.findIndex((anchor) => {
    return anchor.id === startAnchorId;
  });
  const endIndex = anchors.findIndex((anchor) => {
    return anchor.id === endAnchorId;
  });
  if (startIndex < 0 || endIndex < 0) {
    return anchors;
  }

  const positions = resolveAnchorPositions(
    anchors,
    view,
    modelItems as ModelItem[] | undefined,
    {
      [startAnchorId]: originStart,
      [endAnchorId]: originEnd
    }
  );

  const outerOf = (index: number, otherIndex: number): Coords | null => {
    const outerIndex = index < otherIndex ? index - 1 : index + 1;
    if (outerIndex < 0 || outerIndex >= positions.length) return null;
    return positions[outerIndex];
  };

  const startRole = classifySegmentEnd(
    outerOf(startIndex, endIndex),
    originStart,
    originEnd,
    axis
  );
  const endRole = classifySegmentEnd(
    outerOf(endIndex, startIndex),
    originEnd,
    originStart,
    axis
  );

  let moveStart = true;
  let moveEnd = true;

  if (startRole === 'collinear' && endRole === 'corner') {
    moveStart = false;
  } else if (endRole === 'collinear' && startRole === 'corner') {
    moveEnd = false;
  }

  if (anchors[startIndex]?.locked) moveStart = false;
  if (anchors[endIndex]?.locked) moveEnd = false;

  if (!moveStart && !moveEnd) {
    return anchors;
  }

  // Both free → translate (level if needed), keep a straight H/V span.
  if (moveStart && moveEnd) {
    const [nextStart, nextEnd] = levelWaypointTiles(
      [originStart, originEnd],
      constrained
    );
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
  }

  // One locked on the straight run, one corner → schodek + elbow WP.
  const lockedId = moveStart ? endAnchorId : startAnchorId;
  const freeId = moveStart ? startAnchorId : endAnchorId;
  const lockedOrigin = moveStart ? originEnd : originStart;
  const freeOrigin = moveStart ? originStart : originEnd;
  const nextFree = CoordsUtils.add(freeOrigin, constrained);

  if (CoordsUtils.isEqual(nextFree, lockedOrigin)) {
    return anchors;
  }

  const elbowTile =
    axis === 'H'
      ? { x: lockedOrigin.x, y: nextFree.y }
      : { x: nextFree.x, y: lockedOrigin.y };

  const lo = Math.min(startIndex, endIndex);
  const hi = Math.max(startIndex, endIndex);

  // Reuse the mid WP between the ends (stable across drag frames).
  const midAnchors: ConnectorAnchor[] = [];
  for (let i = lo + 1; i < hi; i += 1) {
    const mid = anchors[i];
    if (mid?.ref.tile) midAnchors.push(mid);
  }

  let elbowId: string | null = null;
  if (midAnchors.length === 1) {
    elbowId = midAnchors[0].id;
  } else if (midAnchors.length > 1) {
    const onStub = midAnchors.find((mid) => {
      const tile = mid.ref.tile!;
      return axis === 'H'
        ? tile.x === lockedOrigin.x
        : tile.y === lockedOrigin.y;
    });
    elbowId = onStub?.id ?? midAnchors[0].id;
  }

  let nextAnchors = anchors.map((anchor) => {
    if (anchor.id === freeId && anchor.ref.tile) {
      return { ...anchor, ref: { tile: { ...nextFree } } };
    }
    if (anchor.id === lockedId && anchor.ref.tile) {
      return { ...anchor, ref: { tile: { ...lockedOrigin } } };
    }
    if (elbowId && anchor.id === elbowId && anchor.ref.tile) {
      return { ...anchor, ref: { tile: { ...elbowTile } } };
    }
    return anchor;
  });

  if (
    !elbowId &&
    !CoordsUtils.isEqual(elbowTile, lockedOrigin) &&
    !CoordsUtils.isEqual(elbowTile, nextFree) &&
    !hasTileWaypointAt(nextAnchors, elbowTile)
  ) {
    const elbow: ConnectorAnchor = {
      id: generateId(),
      ref: { tile: { ...elbowTile } }
    };
    const insertAt =
      startIndex < endIndex
        ? moveStart
          ? startIndex + 1
          : endIndex
        : moveStart
          ? startIndex
          : endIndex + 1;

    nextAnchors = [
      ...nextAnchors.slice(0, insertAt),
      elbow,
      ...nextAnchors.slice(insertAt)
    ];
  }

  return dedupeTileWaypoints(nextAnchors);
};

/**
 * Rebuild middle tile WPs as a clean L/U (max 2 elbows) between the
 * connector ends — avoids A* staircases when Shift is held.
 *
 * Locked middle waypoints split the cable into regions; only the region
 * that contains the dragged anchor is rebuilt.
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

  const dragIndex = anchors.findIndex((anchor) => {
    return anchor.id === draggedAnchorId;
  });
  if (dragIndex < 0) {
    return anchors;
  }

  // Dragging a locked via itself is a no-op (caller usually skips anyway).
  if (anchors[dragIndex]?.locked && anchors[dragIndex]?.ref.tile) {
    return anchors;
  }

  // Region bounds: previous locked mid (or start) … next locked mid (or end).
  let regionStart = 0;
  let regionEnd = anchors.length - 1;
  anchors.forEach((anchor, index) => {
    if (index === 0 || index === anchors.length - 1) return;
    if (!(anchor.locked && anchor.ref.tile)) return;
    if (index < dragIndex) {
      regionStart = index;
    }
    if (index > dragIndex && regionEnd === anchors.length - 1) {
      regionEnd = index;
    }
  });

  const region = anchors.slice(regionStart, regionEnd + 1);
  const rebuiltRegion = rebuildOrthogonalRegion({
    anchors: region,
    draggedAnchorId,
    hint,
    view,
    modelItems
  });

  return [
    ...anchors.slice(0, regionStart),
    ...rebuiltRegion,
    ...anchors.slice(regionEnd + 1)
  ];
};

const rebuildOrthogonalRegion = ({
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

    // Keep a single sliding WP on the straight run (preserve lock flags
    // on region endpoints — they are never mid tiles here).
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
      return (
        Boolean(anchor.ref.tile) &&
        anchor.id !== draggedAnchorId &&
        anchor.id !== first.id &&
        anchor.id !== last.id &&
        !anchor.locked
      );
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
