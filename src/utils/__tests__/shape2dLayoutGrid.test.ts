import type { ViewItem } from 'src/types';
import { getShape2dSize, SHAPE_2D_PC_ID } from 'src/config';
import { layoutShape2dItems } from '../shape2dLayout';

const modelItems = [
  { id: 'a', icon: SHAPE_2D_PC_ID },
  { id: 'b', icon: SHAPE_2D_PC_ID },
  { id: 'c', icon: SHAPE_2D_PC_ID }
];

/** Deliberately off-grid start tiles, scattered. */
const selectedItems: ViewItem[] = [
  { id: 'a', tile: { x: 4, y: 7 } },
  { id: 'b', tile: { x: 31, y: 2 } },
  { id: 'c', tile: { x: 17, y: 25 } }
];

const pcSize = getShape2dSize(SHAPE_2D_PC_ID) ?? { width: 1, height: 1 };

const run = (mode: 'vertical' | 'horizontal' | 'grid', step: number) => {
  return layoutShape2dItems({
    selectedItems,
    allItems: selectedItems,
    modelItems,
    mode,
    gridStep: { x: step, y: step }
  });
};

describe('layoutShape2dItems grid alignment', () => {
  it.each([
    ['vertical', 1],
    ['horizontal', 1],
    ['grid', 1],
    ['vertical', 9],
    ['horizontal', 9],
    ['grid', 9]
  ] as const)('%s lands every tile on the %i-cell grid', (mode, step) => {
    const targets = run(mode, step);

    expect(Object.keys(targets)).toHaveLength(3);
    Object.values(targets).forEach((tile) => {
      expect(tile.x % step).toBe(0);
      expect(tile.y % step).toBe(0);
    });
  });

  it('packs vertically with no gap beyond grid rounding', () => {
    const targets = run('vertical', 1);
    const ys = Object.values(targets)
      .map((tile) => {
        return tile.y;
      })
      .sort((p, q) => {
        return p - q;
      });

    expect(ys[1] - ys[0]).toBe(pcSize.height);
    expect(ys[2] - ys[1]).toBe(pcSize.height);
  });

  it('packs horizontally with no gap beyond grid rounding', () => {
    const targets = run('horizontal', 1);
    const xs = Object.values(targets)
      .map((tile) => {
        return tile.x;
      })
      .sort((p, q) => {
        return p - q;
      });

    expect(xs[1] - xs[0]).toBe(pcSize.width);
    expect(xs[2] - xs[1]).toBe(pcSize.width);
  });

  it('advances by exactly one rack cell when the node fits inside it', () => {
    const targets = run('vertical', 9);
    const ys = Object.values(targets)
      .map((tile) => {
        return tile.y;
      })
      .sort((p, q) => {
        return p - q;
      });

    // PC footprint is smaller than a 9-tile rack cell, so rows sit adjacent.
    expect(ys[1] - ys[0]).toBe(9);
    expect(ys[2] - ys[1]).toBe(9);
  });
});
