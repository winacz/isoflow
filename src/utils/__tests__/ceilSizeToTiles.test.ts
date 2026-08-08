import { ceilSizeToTiles, PLAN_SIZE_MODULE_TILES, getShape2dSize, SHAPE_2D_SWITCH_ID } from 'src/config';
import { layoutDeviceTemplate } from 'src/utils/deviceTemplateLayout';
import type { DeviceTemplate } from 'src/types';

describe('ceilSizeToTiles', () => {
  test('rounds up to whole rack-grid modules (default step 9)', () => {
    // Old 19-wide switch ≈ 2.11 rack cells → 3 cells (27).
    expect(ceilSizeToTiles({ width: 19, height: 9 })).toEqual({
      width: 27,
      height: 9
    });
    expect(ceilSizeToTiles({ width: 1.2, height: 1.01 })).toEqual({
      width: PLAN_SIZE_MODULE_TILES,
      height: PLAN_SIZE_MODULE_TILES
    });
    expect(ceilSizeToTiles({ width: 27, height: 9 })).toEqual({
      width: 27,
      height: 9
    });
  });

  test('moduleTiles: 1 only integer-ceils (cabinet bay)', () => {
    expect(ceilSizeToTiles({ width: 60, height: 9 }, 1)).toEqual({
      width: 60,
      height: 9
    });
    expect(ceilSizeToTiles({ width: 1.2, height: 8.1 }, 1)).toEqual({
      width: 2,
      height: 9
    });
  });
});

describe('builtin switch footprint', () => {
  test('is a whole multiple of the rack grid cell', () => {
    const size = getShape2dSize(SHAPE_2D_SWITCH_ID);
    expect(size).not.toBeNull();
    expect(size!.width % PLAN_SIZE_MODULE_TILES).toBe(0);
    expect(size!.height % PLAN_SIZE_MODULE_TILES).toBe(0);
    expect(size!.width).toBe(27);
  });
});

describe('layoutDeviceTemplate size', () => {
  test('DIN switch chassis is a whole rack-grid module', () => {
    const template: DeviceTemplate = {
      id: 't-sw',
      kind: 'SWITCH',
      name: 'SW',
      formFactor: 'DIN',
      numbering: 'ROWS_LTR',
      sections: [{ id: 'front', ports: 4, media: 'RJ45', rows: 2 }]
    };
    const layout = layoutDeviceTemplate(template);
    expect(layout.size.width % PLAN_SIZE_MODULE_TILES).toBe(0);
    expect(layout.size.height % PLAN_SIZE_MODULE_TILES).toBe(0);
  });

  test('RACK bay stays exact cabinet width (not rounded to ×9)', () => {
    const template: DeviceTemplate = {
      id: 't-rack',
      kind: 'SWITCH',
      name: 'SW',
      formFactor: 'RACK',
      numbering: 'ROWS_LTR',
      sections: [{ id: 'front', ports: 8, media: 'RJ45', rows: 2 }]
    };
    const layout = layoutDeviceTemplate(template);
    expect(layout.size.width).toBe(60);
    expect(layout.size.height).toBe(9);
  });
});
