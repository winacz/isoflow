import { Coords } from 'src/types';
import { connectorPathTileToGlobal } from './renderer';

/** Hop / gap radius in tile units at a crossing. */
export const CONNECTOR_JUMP_RADIUS_TILES = 0.28;

export type ConnectorJump = {
  /** Crossing point in continuous tile space. */
  point: Coords;
  /** Unit direction of this connector through the crossing. */
  along: Coords;
};

type PathInput = {
  id: string;
  tiles: Coords[];
};

type Polyline = {
  id: string;
  points: Coords[];
};

const EPS = 1e-6;

const nearlyEqual = (a: Coords, b: Coords, epsilon = 0.08) => {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
};

const tileCenters = (tiles: Coords[]): Coords[] => {
  return tiles.map((tile) => {
    return { x: tile.x + 0.5, y: tile.y + 0.5 };
  });
};

const unit = (dx: number, dy: number): Coords | null => {
  const len = Math.hypot(dx, dy);
  if (len < EPS) return null;
  return { x: dx / len, y: dy / len };
};

const cross2 = (ax: number, ay: number, bx: number, by: number) => {
  return ax * by - ay * bx;
};

/** Straight-through direction at vertex, or null if endpoint / bend. */
const throughDirectionAtVertex = (
  points: Coords[],
  index: number
): Coords | null => {
  if (index <= 0 || index >= points.length - 1) return null;

  const d1 = unit(
    points[index].x - points[index - 1].x,
    points[index].y - points[index - 1].y
  );
  const d2 = unit(
    points[index + 1].x - points[index].x,
    points[index + 1].y - points[index].y
  );
  if (!d1 || !d2) return null;

  // Must continue roughly straight (allows tiny float noise)
  if (d1.x * d2.x + d1.y * d2.y < 0.85) return null;

  return d2;
};

const segmentDirection = (a: Coords, b: Coords): Coords | null => {
  return unit(b.x - a.x, b.y - a.y);
};

/**
 * Intersection of segment a1→a2 with b1→b2.
 * Returns parametric t,u in [0,1] when they touch/cross.
 */
const segmentIntersection = (
  a1: Coords,
  a2: Coords,
  b1: Coords,
  b2: Coords
): { point: Coords; t: number; u: number } | null => {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = cross2(dax, day, dbx, dby);

  if (Math.abs(denom) < EPS) return null;

  const abx = b1.x - a1.x;
  const aby = b1.y - a1.y;
  const t = cross2(abx, aby, dbx, dby) / denom;
  const u = cross2(abx, aby, dax, day) / denom;

  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;

  return {
    point: { x: a1.x + t * dax, y: a1.y + t * day },
    t: Math.min(1, Math.max(0, t)),
    u: Math.min(1, Math.max(0, u))
  };
};

const isNearPathEnd = (point: Coords, points: Coords[], margin = 0.35) => {
  if (points.length === 0) return true;
  return (
    nearlyEqual(point, points[0], margin) ||
    nearlyEqual(point, points[points.length - 1], margin)
  );
};

const pushUniqueJump = (
  result: Record<string, ConnectorJump[]>,
  connectorId: string,
  jump: ConnectorJump
) => {
  const list = result[connectorId] ?? [];
  if (
    list.some((existing) => {
      return nearlyEqual(existing.point, jump.point);
    })
  ) {
    return;
  }
  list.push(jump);
  result[connectorId] = list;
};

const directionAtHit = (
  points: Coords[],
  segmentIndex: number,
  t: number
): Coords | null => {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  const segDir = segmentDirection(a, b);
  if (!segDir) return null;

  // Vertex involvement — prefer straight-through direction
  if (t <= 0.05) {
    return throughDirectionAtVertex(points, segmentIndex) ?? segDir;
  }
  if (t >= 0.95) {
    return throughDirectionAtVertex(points, segmentIndex + 1) ?? segDir;
  }

  return segDir;
};

/**
 * True when both paths actually cross (not a T / kiss at a bend).
 * Mid-segment hits always count; vertex hits need straight-through on both.
 */
const isRealCrossing = (
  pointsA: Coords[],
  segA: number,
  t: number,
  pointsB: Coords[],
  segB: number,
  u: number
): { alongA: Coords; alongB: Coords } | null => {
  const interiorA = t > 0.05 && t < 0.95;
  const interiorB = u > 0.05 && u < 0.95;

  if (interiorA && interiorB) {
    const alongA = segmentDirection(pointsA[segA], pointsA[segA + 1]);
    const alongB = segmentDirection(pointsB[segB], pointsB[segB + 1]);
    if (!alongA || !alongB) return null;
    if (Math.abs(cross2(alongA.x, alongA.y, alongB.x, alongB.y)) < 0.15) {
      return null;
    }
    return { alongA, alongB };
  }

  // Shared-tile / vertex style crossing — both must pass straight through
  const alongA = directionAtHit(pointsA, segA, t);
  const alongB = directionAtHit(pointsB, segB, u);
  if (!alongA || !alongB) return null;

  const throughA =
    t <= 0.05
      ? throughDirectionAtVertex(pointsA, segA)
      : t >= 0.95
        ? throughDirectionAtVertex(pointsA, segA + 1)
        : alongA;
  const throughB =
    u <= 0.05
      ? throughDirectionAtVertex(pointsB, segB)
      : u >= 0.95
        ? throughDirectionAtVertex(pointsB, segB + 1)
        : alongB;

  if (!throughA || !throughB) return null;
  if (Math.abs(cross2(throughA.x, throughA.y, throughB.x, throughB.y)) < 0.15) {
    return null;
  }

  return { alongA: throughA, alongB: throughB };
};

/**
 * Detect path crossings (orthogonal and diagonal).
 * Greater connector id hops over the other (underpass stays continuous).
 */
export const findConnectorJumpsById = (
  connectors: PathInput[]
): Record<string, ConnectorJump[]> => {
  const result: Record<string, ConnectorJump[]> = {};

  const polylines: Polyline[] = connectors.map((connector) => {
    return {
      id: connector.id,
      points: tileCenters(connector.tiles)
    };
  });

  for (let i = 0; i < polylines.length; i += 1) {
    for (let j = i + 1; j < polylines.length; j += 1) {
      const a = polylines[i];
      const b = polylines[j];

      for (let ai = 0; ai < a.points.length - 1; ai += 1) {
        for (let bi = 0; bi < b.points.length - 1; bi += 1) {
          const hit = segmentIntersection(
            a.points[ai],
            a.points[ai + 1],
            b.points[bi],
            b.points[bi + 1]
          );
          if (!hit) continue;

          if (
            isNearPathEnd(hit.point, a.points) ||
            isNearPathEnd(hit.point, b.points)
          ) {
            continue;
          }

          const dirs = isRealCrossing(
            a.points,
            ai,
            hit.t,
            b.points,
            bi,
            hit.u
          );
          if (!dirs) continue;

          const aHops = a.id > b.id;

          pushUniqueJump(result, aHops ? a.id : b.id, {
            point: hit.point,
            along: aHops ? dirs.alongA : dirs.alongB
          });
        }
      }
    }
  }

  return result;
};

export const getConnectorGlobalTiles = (connector: {
  path: { tiles: Coords[]; rectangle: { from: Coords } };
}): Coords[] => {
  return connector.path.tiles.map((tile) => {
    return connectorPathTileToGlobal(tile, connector.path.rectangle.from);
  });
};

/** Parametric position of point on segment a→b, or null if off-segment. */
const projectOnSegment = (
  point: Coords,
  a: Coords,
  b: Coords
): number | null => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPS) return null;

  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
  if (t < -0.02 || t > 1.02) return null;

  const closest = { x: a.x + t * dx, y: a.y + t * dy };
  if (!nearlyEqual(point, closest, 0.12)) return null;

  return Math.min(1, Math.max(0, t));
};

/**
 * Build SVG path `d` for a polyline in continuous tile space, inserting
 * semicircle hops at crossings (including mid-segment). Underpass wires stay solid.
 */
export const buildConnectorSvgPathD = ({
  points,
  jumps,
  minX,
  minY,
  tileSize,
  jumpRadiusTiles = CONNECTOR_JUMP_RADIUS_TILES
}: {
  points: Coords[];
  jumps: ConnectorJump[];
  minX: number;
  minY: number;
  tileSize: number;
  jumpRadiusTiles?: number;
}): string => {
  if (points.length === 0) return '';

  const toPx = (point: Coords) => {
    return {
      x: (point.x - minX) * tileSize,
      y: (point.y - minY) * tileSize
    };
  };

  const first = toPx(points[0]);
  let d = `M ${first.x} ${first.y}`;

  if (points.length === 1) return d;

  const radiusPx = jumpRadiusTiles * tileSize;
  const preferred = { x: 0, y: -1 };
  const used = new Set<number>();

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];

    const onSegment = jumps
      .map((jump, jumpIndex) => {
        const t = projectOnSegment(jump.point, a, b);
        if (t === null) return null;
        // Vertex at `a` belongs to the previous segment
        if (t < 0.02) return null;
        return { jump, jumpIndex, t };
      })
      .filter((entry): entry is NonNullable<typeof entry> => {
        return Boolean(entry);
      })
      .sort((left, right) => {
        return left.t - right.t;
      });

    let lastLanding: Coords | null = null;

    for (const { jump, jumpIndex } of onSegment) {
      if (used.has(jumpIndex)) continue;
      used.add(jumpIndex);

      let along = unit(jump.along.x, jump.along.y);
      const travel = unit(b.x - a.x, b.y - a.y);
      if (!along) continue;
      if (travel && along.x * travel.x + along.y * travel.y < 0) {
        along = { x: -along.x, y: -along.y };
      }

      const p0 = {
        x: jump.point.x - along.x * jumpRadiusTiles,
        y: jump.point.y - along.y * jumpRadiusTiles
      };
      const p1 = {
        x: jump.point.x + along.x * jumpRadiusTiles,
        y: jump.point.y + along.y * jumpRadiusTiles
      };

      const P0 = toPx(p0);
      const P1 = toPx(p1);
      d += ` L ${P0.x} ${P0.y}`;

      const left = { x: -along.y, y: along.x };
      const sweep =
        left.x * preferred.x + left.y * preferred.y >= 0 ? 0 : 1;
      d += ` A ${radiusPx} ${radiusPx} 0 0 ${sweep} ${P1.x} ${P1.y}`;

      lastLanding = p1;
    }

    // Don't draw back to `b` if a hop already landed past it
    if (lastLanding) {
      const toB = { x: b.x - lastLanding.x, y: b.y - lastLanding.y };
      const seg = { x: b.x - a.x, y: b.y - a.y };
      if (toB.x * seg.x + toB.y * seg.y <= EPS) {
        continue;
      }
    }

    const next = toPx(b);
    d += ` L ${next.x} ${next.y}`;
  }

  return d;
};
