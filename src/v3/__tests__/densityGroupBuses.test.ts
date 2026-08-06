import { SHAPE_2D_PC_ID, SHAPE_2D_SWITCH_ID, getModelItemSize } from 'src/config';
import {
  pickTrunkSideToward,
  routeDensityGroupBuses,
  switchPortApproach,
  SWITCH_PORT_RUNWAY_TILES
} from '../densityGroupBuses';

describe('pickTrunkSideToward', () => {
  test('diagonal below-right prefers side exit (right), not bottom', () => {
    expect(
      pickTrunkSideToward({
        groupCenter: { x: 10, y: 10 },
        targetCenter: { x: 30, y: 35 }
      })
    ).toBe('right');
  });

  test('clearly below prefers bottom', () => {
    expect(
      pickTrunkSideToward({
        groupCenter: { x: 20, y: 5 },
        targetCenter: { x: 22, y: 50 }
      })
    ).toBe('bottom');
  });
});

describe('switchPortApproach', () => {
  test('TOP ports clear the chassis by SWITCH_PORT_RUNWAY_TILES', () => {
    const approach = switchPortApproach({
      switchTile: { x: 10, y: 20 },
      switchSize: { width: 19, height: 9 },
      portWorld: { x: 14, y: 24 },
      portSide: 'TOP',
      laneIndex: 0
    });
    // Chassis top at y=20 → approach at 20 - runway.
    expect(approach).toEqual({
      x: 14,
      y: 20 - SWITCH_PORT_RUNWAY_TILES
    });
    expect(approach.y).toBeLessThan(24 - 1);
  });
});

describe('routeDensityGroupBuses', () => {
  const pcSize = getModelItemSize({ icon: SHAPE_2D_PC_ID });
  if (!pcSize) throw new Error('PC size missing');
  const { width: w, height: h } = pcSize;

  test('same-row nearer trunk turns right before the farther leaf (no cross)', () => {
    // Two phones on one row; trunk to the right. Right leaf must run at stub Y;
    // left leaf nests one tile lower — never the other way around.
    const items = [
      { id: 'ph1', tile: { x: 0, y: 0 } },
      { id: 'ph2', tile: { x: w, y: 0 } },
      { id: 'sw', tile: { x: w * 2 + 14, y: h + 8 } }
    ];
    const modelItems = [
      { id: 'ph1', icon: SHAPE_2D_PC_ID, name: 'ph1' },
      { id: 'ph2', icon: SHAPE_2D_PC_ID, name: 'ph2' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'cL',
        anchors: [
          { id: 'a1', ref: { item: 'ph1', port: 'port-1' } },
          { id: 'a2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'cR',
        anchors: [
          { id: 'a3', ref: { item: 'ph2', port: 'port-1' } },
          { id: 'a4', ref: { item: 'sw', port: 'port-bottom-2' } }
        ]
      }
    ];

    const result = routeDensityGroupBuses({
      items,
      modelItems: modelItems as never,
      connectors
    });

    const leftPath = result.routes.cL;
    const rightPath = result.routes.cR;
    expect(leftPath?.length).toBeGreaterThan(2);
    expect(rightPath?.length).toBeGreaterThan(2);

    // First horizontal move (Δx) Ys must be unique — no stacked bus lanes.
    const firstHorizY = (path: typeof rightPath) => {
      return path.find((t, i) => {
        return i > 0 && t.x !== path[0].x;
      })?.y;
    };
    const firstRightY = firstHorizY(rightPath);
    const firstLeftY = firstHorizY(leftPath);
    expect(firstRightY).toBeDefined();
    expect(firstLeftY).toBeDefined();
    expect(firstRightY).not.toBe(firstLeftY);

    // Horizontal bus runs to the port column — no vertical trunk on the group edge.
    const longRight = (path: typeof rightPath) => {
      let best = 0;
      for (let i = 1; i < path.length; i += 1) {
        if (path[i].y === path[i - 1].y) {
          best = Math.max(best, Math.abs(path[i].x - path[i - 1].x));
        }
      }
      return best;
    };
    expect(longRight(rightPath)).toBeGreaterThan(w);
    // Only one major corner after nest: last turn is vertical into the switch.
    const last = rightPath[rightPath.length - 1];
    const prev = rightPath[rightPath.length - 2];
    expect(last.x).toBe(prev.x);
    expect(last.y).not.toBe(prev.y);
  });

  test('bottom-row cables climb into the top-row bus on unique lanes', () => {
    const items = [
      { id: 'ph1', tile: { x: 0, y: 0 } },
      { id: 'ph2', tile: { x: w, y: 0 } },
      { id: 'pc1', tile: { x: 0, y: h } },
      { id: 'pc2', tile: { x: w, y: h } },
      { id: 'sw', tile: { x: w * 2 + 14, y: h * 2 + 6 } }
    ];
    const modelItems = [
      { id: 'ph1', icon: SHAPE_2D_PC_ID, name: 'ph1' },
      { id: 'ph2', icon: SHAPE_2D_PC_ID, name: 'ph2' },
      { id: 'pc1', icon: SHAPE_2D_PC_ID, name: 'pc1' },
      { id: 'pc2', icon: SHAPE_2D_PC_ID, name: 'pc2' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'cPh1',
        anchors: [
          { id: 'a1', ref: { item: 'ph1', port: 'port-1' } },
          { id: 'a2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'cPh2',
        anchors: [
          { id: 'a3', ref: { item: 'ph2', port: 'port-1' } },
          { id: 'a4', ref: { item: 'sw', port: 'port-bottom-2' } }
        ]
      },
      {
        id: 'cPc1',
        anchors: [
          { id: 'a5', ref: { item: 'pc1', port: 'port-1' } },
          { id: 'a6', ref: { item: 'sw', port: 'port-bottom-3' } }
        ]
      },
      {
        id: 'cPc2',
        anchors: [
          { id: 'a7', ref: { item: 'pc2', port: 'port-1' } },
          { id: 'a8', ref: { item: 'sw', port: 'port-bottom-4' } }
        ]
      }
    ];

    const result = routeDensityGroupBuses({
      items,
      modelItems: modelItems as never,
      connectors
    });

    const horizY = (path: { x: number; y: number }[]) => {
      let bestY = path[0].y;
      let bestLen = 0;
      for (let i = 1; i < path.length; i += 1) {
        if (path[i].y === path[i - 1].y) {
          const len = Math.abs(path[i].x - path[i - 1].x);
          if (len > bestLen) {
            bestLen = len;
            bestY = path[i].y;
          }
        }
      }
      return bestY;
    };

    const ys = ['cPh1', 'cPh2', 'cPc1', 'cPc2'].map((id) => {
      return horizY(result.routes[id]);
    });
    // Every cable owns a distinct horizontal lane (no overlap).
    expect(new Set(ys).size).toBe(4);
    // Band stays tight under the top stub line.
    expect(Math.max(...ys) - Math.min(...ys)).toBe(3);
  });

  test('swaps so earlier ports sit top / exit-near (right) — no forced crosses', () => {
    // Phones on top with late ports, PCs on bottom with early ports → swap rows
    // and mirror within the row (right column gets the earlier port).
    const items = [
      { id: 'ph1', tile: { x: 0, y: 0 } },
      { id: 'ph2', tile: { x: w, y: 0 } },
      { id: 'pc1', tile: { x: 0, y: h } },
      { id: 'pc2', tile: { x: w, y: h } },
      { id: 'sw', tile: { x: w * 2 + 14, y: h * 2 + 6 } }
    ];
    const modelItems = [
      { id: 'ph1', icon: SHAPE_2D_PC_ID, name: 'ph1' },
      { id: 'ph2', icon: SHAPE_2D_PC_ID, name: 'ph2' },
      { id: 'pc1', icon: SHAPE_2D_PC_ID, name: 'pc1' },
      { id: 'pc2', icon: SHAPE_2D_PC_ID, name: 'pc2' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'c1',
        anchors: [
          { id: 'a1', ref: { item: 'pc1', port: 'port-1' } },
          { id: 'a2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'c2',
        anchors: [
          { id: 'a3', ref: { item: 'pc2', port: 'port-1' } },
          { id: 'a4', ref: { item: 'sw', port: 'port-bottom-2' } }
        ]
      },
      {
        id: 'c3',
        anchors: [
          { id: 'a5', ref: { item: 'ph1', port: 'port-1' } },
          { id: 'a6', ref: { item: 'sw', port: 'port-bottom-3' } }
        ]
      },
      {
        id: 'c4',
        anchors: [
          { id: 'a7', ref: { item: 'ph2', port: 'port-1' } },
          { id: 'a8', ref: { item: 'sw', port: 'port-bottom-4' } }
        ]
      }
    ];

    const result = routeDensityGroupBuses({
      items,
      modelItems: modelItems as never,
      connectors
    });

    // Slots for right exit: (w,0), (0,0), (w,h), (0,h) ← port order 1..4.
    expect(result.targets.pc1).toEqual({ x: w, y: 0 });
    expect(result.targets.pc2).toEqual({ x: 0, y: 0 });
    expect(result.targets.ph1).toEqual({ x: w, y: h });
    expect(result.targets.ph2).toEqual({ x: 0, y: h });
    expect(result.cableCount).toBe(4);

    // After placement, earlier-port leaf is exit-near → upper bus lane (no cross).
    const horizY = (path: { x: number; y: number }[]) => {
      let bestY = path[0].y;
      let bestLen = 0;
      for (let i = 1; i < path.length; i += 1) {
        if (path[i].y === path[i - 1].y) {
          const len = Math.abs(path[i].x - path[i - 1].x);
          if (len > bestLen) {
            bestLen = len;
            bestY = path[i].y;
          }
        }
      }
      return bestY;
    };
    expect(horizY(result.routes.c1)).toBeLessThan(horizY(result.routes.c2));
  });
});
