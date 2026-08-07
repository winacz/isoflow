import type { ModelItem, ViewItem } from 'src/types';
import { buildFootprints } from './routing';
import type { Footprint } from 'src/utils/autoLayout/types';

/**
 * Test density grouping for 2D v3.
 *
 * Two free-standing nodes belong to the same group when the Chebyshev gap
 * between their footprints is ≤ `maxGapTiles` (default 1). Adjacent / touching
 * devices therefore merge; a gap of more than one tile starts a new group.
 */

export type DensityGroupBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DensityGroup = {
  id: string;
  memberIds: string[];
  bounds: DensityGroupBounds;
  /** Circle in tile space that surrounds the group (bbox circumcircle + pad). */
  circle: { cx: number; cy: number; r: number };
};

/** Test threshold: ≤1 tile between footprints → same group. */
export const DEFAULT_DENSITY_MAX_GAP_TILES = 1;

/** Circle pad for a 1-node group (tiles beyond bbox circumradius). */
export const DENSITY_CIRCLE_PAD_MIN = 4;
/** Circle pad for large groups (≥ `DENSITY_CIRCLE_PAD_MAX_AT` members). */
export const DENSITY_CIRCLE_PAD_MAX = 7;
/** Member count at which pad reaches the max (larger groups stay capped). */
export const DENSITY_CIRCLE_PAD_MAX_AT = 10;

/**
 * @deprecated Prefer `densityCirclePadForMemberCount` — kept as the mid default
 * when a fixed override is needed.
 */
export const DENSITY_CIRCLE_PAD_TILES = DENSITY_CIRCLE_PAD_MIN;

/**
 * Extra radius beyond the bbox half-diagonal, scaled by member count:
 * 1 node → 4.0, ≥10 nodes → 7.0 (linear in between, hard-capped).
 */
export const densityCirclePadForMemberCount = (memberCount: number): number => {
  const n = Math.max(1, memberCount);
  if (n <= 1) return DENSITY_CIRCLE_PAD_MIN;
  if (n >= DENSITY_CIRCLE_PAD_MAX_AT) return DENSITY_CIRCLE_PAD_MAX;
  const t = (n - 1) / (DENSITY_CIRCLE_PAD_MAX_AT - 1);
  return (
    DENSITY_CIRCLE_PAD_MIN +
    t * (DENSITY_CIRCLE_PAD_MAX - DENSITY_CIRCLE_PAD_MIN)
  );
};

export const footprintBounds = (fp: Footprint): DensityGroupBounds => {
  return { x: fp.tile.x, y: fp.tile.y, w: fp.width, h: fp.height };
};

/** Edge-to-edge gap on each axis (0 when the AABBs touch or overlap). */
export const aabbEdgeGaps = (
  a: DensityGroupBounds,
  b: DensityGroupBounds
): { gapX: number; gapY: number } => {
  const gapX = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gapY = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return { gapX, gapY };
};

/** Chebyshev gap — max axis separation. Matches “one tile apart” on a grid. */
export const aabbChebyshevGap = (
  a: DensityGroupBounds,
  b: DensityGroupBounds
): number => {
  const { gapX, gapY } = aabbEdgeGaps(a, b);
  return Math.max(gapX, gapY);
};

const unionFindParent = (parent: number[], i: number): number => {
  let root = i;
  while (parent[root] !== root) root = parent[root];
  let cur = i;
  while (cur !== root) {
    const next = parent[cur];
    parent[cur] = root;
    cur = next;
  }
  return root;
};

const unionFindMerge = (parent: number[], a: number, b: number) => {
  const ra = unionFindParent(parent, a);
  const rb = unionFindParent(parent, b);
  if (ra !== rb) parent[rb] = ra;
};

/** Minimal model fields needed to resolve a 2D footprint. */
export type DensityModelItem = Pick<ModelItem, 'id' | 'icon' | 'rackUnits'>;

export type ComputeDensityGroupsArgs = {
  items: Array<Pick<ViewItem, 'id' | 'tile' | 'parentId'>>;
  modelItems: DensityModelItem[];
  /** Max Chebyshev gap (tiles) still considered the same group. */
  maxGapTiles?: number;
  /**
   * Fixed extra radius for every group. When omitted, pad scales with member
   * count via `densityCirclePadForMemberCount` (4 → 7).
   */
  circlePadTiles?: number;
};

/**
 * Cluster free-standing plan nodes by spatial density and return a surrounding
 * circle for each cluster (test visualisation for 2D v3).
 */
export const computeDensityGroups = ({
  items,
  modelItems,
  maxGapTiles = DEFAULT_DENSITY_MAX_GAP_TILES,
  circlePadTiles
}: ComputeDensityGroupsArgs): DensityGroup[] => {
  // Mounted cabinet gear sits inside another footprint — skip for grouping.
  const freeItems = items.filter((item) => {
    return !item.parentId;
  }) as ViewItem[];
  const footprints = buildFootprints(freeItems, modelItems as ModelItem[]);
  const list = freeItems
    .map((item) => {
      return footprints.get(item.id);
    })
    .filter((fp): fp is Footprint => {
      return Boolean(fp);
    });

  if (list.length === 0) return [];

  const bounds = list.map(footprintBounds);
  const parent = list.map((_, i) => {
    return i;
  });

  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (aabbChebyshevGap(bounds[i], bounds[j]) <= maxGapTiles) {
        unionFindMerge(parent, i, j);
      }
    }
  }

  const buckets = new Map<number, number[]>();
  list.forEach((_, i) => {
    const root = unionFindParent(parent, i);
    const bucket = buckets.get(root);
    if (bucket) bucket.push(i);
    else buckets.set(root, [i]);
  });

  const groups: DensityGroup[] = [];
  let groupIndex = 0;

  buckets.forEach((indices) => {
    const memberIds = indices.map((i) => {
      return list[i].id;
    });
    const xs = indices.map((i) => {
      return bounds[i].x;
    });
    const ys = indices.map((i) => {
      return bounds[i].y;
    });
    const rights = indices.map((i) => {
      return bounds[i].x + bounds[i].w;
    });
    const bottoms = indices.map((i) => {
      return bounds[i].y + bounds[i].h;
    });

    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const w = Math.max(...rights) - x;
    const h = Math.max(...bottoms) - y;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const pad =
      circlePadTiles ?? densityCirclePadForMemberCount(memberIds.length);
    const r = Math.sqrt((w / 2) ** 2 + (h / 2) ** 2) + pad;

    groups.push({
      id: `density-group-${groupIndex}`,
      memberIds,
      bounds: { x, y, w, h },
      circle: { cx, cy, r }
    });
    groupIndex += 1;
  });

  // Stable visual order: top→bottom, then left→right.
  groups.sort((a, b) => {
    if (a.circle.cy !== b.circle.cy) return a.circle.cy - b.circle.cy;
    return a.circle.cx - b.circle.cx;
  });

  return groups.map((group, i) => {
    return { ...group, id: `density-group-${i}` };
  });
};
