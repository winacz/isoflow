import { SHAPE_2D_CABINET_ID, SHAPE_2D_PC_ID, getModelItemSize } from 'src/config';
import {
  aabbChebyshevGap,
  aabbEdgeGaps,
  computeDensityGroups,
  footprintBounds
} from '../densityGroups';
import type { Footprint } from 'src/utils/autoLayout/types';

const fp = (
  id: string,
  x: number,
  y: number,
  w = 2,
  h = 2
): Footprint => {
  return { id, tile: { x, y }, width: w, height: h };
};

describe('aabb gaps', () => {
  test('adjacent footprints have gap 0', () => {
    const a = footprintBounds(fp('a', 0, 0, 2, 2));
    const b = footprintBounds(fp('b', 2, 0, 2, 2));
    expect(aabbEdgeGaps(a, b)).toEqual({ gapX: 0, gapY: 0 });
    expect(aabbChebyshevGap(a, b)).toBe(0);
  });

  test('one-tile gap is 1', () => {
    const a = footprintBounds(fp('a', 0, 0, 2, 2));
    const b = footprintBounds(fp('b', 3, 0, 2, 2));
    expect(aabbChebyshevGap(a, b)).toBe(1);
  });

  test('two-tile gap is 2', () => {
    const a = footprintBounds(fp('a', 0, 0, 2, 2));
    const b = footprintBounds(fp('b', 4, 0, 2, 2));
    expect(aabbChebyshevGap(a, b)).toBe(2);
  });
});

describe('computeDensityGroups', () => {
  const size = getModelItemSize({ icon: SHAPE_2D_PC_ID });
  if (!size) {
    throw new Error('PC size missing from config');
  }
  const { width: w, height: h } = size;

  test('merges adjacent and 1-gap nodes; splits when gap > 1', () => {
    const items = [
      { id: 'a', tile: { x: 0, y: 0 } },
      { id: 'b', tile: { x: w, y: 0 } },
      { id: 'c', tile: { x: w + w + 1, y: 0 } },
      { id: 'd', tile: { x: w + w + 1 + w + 2, y: 0 } }
    ];
    const modelItems = items.map((item) => {
      return { id: item.id, icon: SHAPE_2D_PC_ID };
    });

    const groups = computeDensityGroups({ items, modelItems, maxGapTiles: 1 });
    expect(groups).toHaveLength(2);

    const memberSets = groups
      .map((g) => {
        return [...g.memberIds].sort().join(',');
      })
      .sort();
    expect(memberSets).toEqual(['a,b,c', 'd']);
  });

  test('each group gets a surrounding circle covering its bbox', () => {
    const items = [
      { id: 'a', tile: { x: 0, y: 0 } },
      { id: 'b', tile: { x: w, y: 0 } }
    ];
    const modelItems = items.map((item) => {
      return { id: item.id, icon: SHAPE_2D_PC_ID };
    });
    const [group] = computeDensityGroups({ items, modelItems });
    expect(group.bounds).toEqual({ x: 0, y: 0, w: w * 2, h });
    expect(group.circle.cx).toBe(w);
    expect(group.circle.cy).toBe(h / 2);
    expect(group.circle.r).toBeGreaterThan(w);
  });

  test('skips cabinet-mounted children', () => {
    const items = [
      { id: 'cab', tile: { x: 0, y: 0 } },
      { id: 'sw', tile: { x: 1, y: 1 }, parentId: 'cab' },
      { id: 'pc', tile: { x: 80, y: 0 } }
    ];
    const modelItems = [
      { id: 'cab', icon: SHAPE_2D_CABINET_ID, rackUnits: 12 },
      { id: 'sw', icon: SHAPE_2D_PC_ID },
      { id: 'pc', icon: SHAPE_2D_PC_ID }
    ];
    const groups = computeDensityGroups({ items, modelItems });
    const allMembers = groups.flatMap((g) => {
      return g.memberIds;
    });
    expect(allMembers).not.toContain('sw');
    expect(allMembers).toContain('pc');
    expect(allMembers).toContain('cab');
  });
});
