import { Coords } from 'src/types';
import { pathEdges } from './connectorOverlap';

export type ConnectorStackBadge = {
  /** Grid tile at the middle of a stacked run (badge sits on cell center). */
  tile: Coords;
  /** Number of connectors sharing that run (≥ 2). */
  count: number;
  /** Stable-sorted ids of connectors in this stack. */
  connectorIds: string[];
  /** Dominant direction of the shared run (tile space). */
  along: Coords;
};

type SharedEdge = {
  key: string;
  a: Coords;
  b: Coords;
  count: number;
  ids: string[];
};

const parseEdgeKey = (key: string): { a: Coords; b: Coords } | null => {
  const [left, right] = key.split('|');
  if (!left || !right) return null;

  const [ax, ay] = left.split(',').map(Number);
  const [bx, by] = right.split(',').map(Number);

  if ([ax, ay, bx, by].some((n) => Number.isNaN(n))) {
    return null;
  }

  return {
    a: { x: ax, y: ay },
    b: { x: bx, y: by }
  };
};

const tileKey = (tile: Coords) => {
  return `${tile.x},${tile.y}`;
};

const midTile = (a: Coords, b: Coords): Coords => {
  return {
    x: Math.round((a.x + b.x) / 2),
    y: Math.round((a.y + b.y) / 2)
  };
};

const edgeAlong = (a: Coords, b: Coords): Coords => {
  return { x: b.x - a.x, y: b.y - a.y };
};

/**
 * Pixel offsets to virtually fan stacked cables perpendicular to `along`.
 * Does not mutate model anchors — render-only.
 */
export const getStackFanOffsetsPx = (
  connectorIds: string[],
  along: Coords,
  spacingPx: number
): Record<string, Coords> => {
  const sorted = [...connectorIds].sort();
  const len = Math.hypot(along.x, along.y) || 1;
  const ux = along.x / len;
  const uy = along.y / len;
  // Perpendicular in screen/tile space (y grows down — same for both)
  const px = -uy;
  const py = ux;
  const n = sorted.length;
  const result: Record<string, Coords> = {};

  sorted.forEach((id, index) => {
    const t = index - (n - 1) / 2;
    result[id] = {
      x: px * t * spacingPx,
      y: py * t * spacingPx
    };
  });

  return result;
};

/**
 * Left→right handle order matching the fanned cable positions on screen.
 * (Sorted ids alone mirror vertical runs: first id fans right when along is down.)
 */
export const sortStackIdsLeftToRight = (
  connectorIds: string[],
  along: Coords
): string[] => {
  const fan = getStackFanOffsetsPx(connectorIds, along, 100);

  return [...connectorIds].sort((a, b) => {
    const dx = (fan[a]?.x ?? 0) - (fan[b]?.x ?? 0);
    if (Math.abs(dx) > 0.01) {
      return dx;
    }

    // Horizontal run → vertical fan: top cable → left handle
    return (fan[a]?.y ?? 0) - (fan[b]?.y ?? 0);
  });
};

/**
 * Grab-handle positions: row above the badge, left→right = left→right fanned cable.
 */
export const getStackHandleOffsetsPx = (
  connectorIds: string[],
  along: Coords,
  spacingPx: number,
  liftPx: number
): Record<string, Coords> => {
  const ordered = sortStackIdsLeftToRight(connectorIds, along);
  const n = ordered.length;
  const result: Record<string, Coords> = {};

  ordered.forEach((id, index) => {
    const t = index - (n - 1) / 2;
    result[id] = {
      x: t * spacingPx,
      y: -liftPx
    };
  });

  return result;
};

/**
 * Find places where ≥2 connectors share the same grid edge and place one
 * badge per connected cluster of shared edges (so stacked runs show ×N once).
 */
export const findConnectorStackBadges = (
  paths: { id: string; tiles: Coords[] }[]
): ConnectorStackBadge[] => {
  const edgeOwners = new Map<string, Set<string>>();

  paths.forEach((path) => {
    if (path.tiles.length < 2) return;

    pathEdges(path.tiles).forEach((key) => {
      let owners = edgeOwners.get(key);
      if (!owners) {
        owners = new Set();
        edgeOwners.set(key, owners);
      }
      owners.add(path.id);
    });
  });

  const shared: SharedEdge[] = [];
  edgeOwners.forEach((owners, key) => {
    if (owners.size < 2) return;
    const ends = parseEdgeKey(key);
    if (!ends) return;
    shared.push({
      key,
      a: ends.a,
      b: ends.b,
      count: owners.size,
      ids: [...owners].sort()
    });
  });

  if (shared.length === 0) {
    return [];
  }

  const parent = shared.map((_, index) => index);

  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) {
      root = parent[root];
    }
    let cursor = index;
    while (parent[cursor] !== cursor) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };

  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const vertexEdges = new Map<string, number[]>();
  shared.forEach((edge, index) => {
    [edge.a, edge.b].forEach((tile) => {
      const key = tileKey(tile);
      const list = vertexEdges.get(key) ?? [];
      list.push(index);
      vertexEdges.set(key, list);
    });
  });

  vertexEdges.forEach((indices) => {
    for (let i = 1; i < indices.length; i += 1) {
      unite(indices[0], indices[i]);
    }
  });

  const clusters = new Map<number, SharedEdge[]>();
  shared.forEach((edge, index) => {
    const root = find(index);
    const list = clusters.get(root) ?? [];
    list.push(edge);
    clusters.set(root, list);
  });

  const badges: ConnectorStackBadge[] = [];

  clusters.forEach((edges) => {
    const idSet = new Set<string>();
    edges.forEach((edge) => {
      edge.ids.forEach((id) => {
        idSet.add(id);
      });
    });
    const connectorIds = [...idSet].sort();
    const count = Math.max(
      connectorIds.length,
      edges.reduce((max, edge) => {
        return Math.max(max, edge.count);
      }, 0)
    );

    let sumX = 0;
    let sumY = 0;
    edges.forEach((edge) => {
      const mid = midTile(edge.a, edge.b);
      sumX += mid.x;
      sumY += mid.y;
    });
    const center = {
      x: sumX / edges.length,
      y: sumY / edges.length
    };

    let best = edges[0];
    let bestDist = Number.POSITIVE_INFINITY;
    edges.forEach((edge) => {
      const mid = midTile(edge.a, edge.b);
      const dist =
        Math.abs(mid.x - center.x) + Math.abs(mid.y - center.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = edge;
      }
    });

    badges.push({
      tile: midTile(best.a, best.b),
      count,
      connectorIds,
      along: edgeAlong(best.a, best.b)
    });
  });

  return badges;
};
