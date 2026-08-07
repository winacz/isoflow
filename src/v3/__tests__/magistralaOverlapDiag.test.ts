import { SHAPE_2D_PC_ID, SHAPE_2D_SWITCH_ID, getModelItemSize } from 'src/config';
import {
  routeDensityGroupBuses,
  resolveOverlapsWithTargetDiagonal
} from '../densityGroupBuses';

describe('magistrala stacked vertical overlap', () => {
  test('resolve fans lower stacked drop off a shared port column', () => {
    const routes = {
      upper: [
        { x: 40, y: 2 },
        { x: 10, y: 2 },
        { x: 10, y: 5 }
      ],
      lower: [
        { x: 40, y: 1 },
        { x: 10, y: 1 },
        { x: 10, y: 14 }
      ]
    };
    const out = resolveOverlapsWithTargetDiagonal(routes);
    const port = out.lower[out.lower.length - 1];
    const prev = out.lower[out.lower.length - 2];
    expect(port).toEqual({ x: 10, y: 14 });
    expect(Math.abs(prev.x - port.x)).toBe(Math.abs(prev.y - port.y));
    expect(prev.x).not.toBe(port.x);

    let longOnPort = 0;
    for (let i = 1; i < out.lower.length; i += 1) {
      const a = out.lower[i - 1];
      const b = out.lower[i];
      if (a.x === 10 && b.x === 10) {
        longOnPort += Math.abs(b.y - a.y);
      }
    }
    expect(longOnPort).toBeLessThan(2);
  });

  test('full Magistala keeps distinct bus Y for stacked port-top-1', () => {
    const swH = getModelItemSize({ icon: SHAPE_2D_SWITCH_ID })?.height ?? 9;
    const pc = getModelItemSize({ icon: SHAPE_2D_PC_ID });
    if (!pc) throw new Error('pc');
    const { width: w } = pc;

    const items = [
      { id: 'pcA', tile: { x: 50, y: 5 } },
      { id: 'pcB', tile: { x: 50 + w + 2, y: 20 } },
      { id: 'swTop', tile: { x: 0, y: 8 } },
      { id: 'swBot', tile: { x: 0, y: 8 + swH + 2 } }
    ];
    const modelItems = [
      { id: 'pcA', icon: SHAPE_2D_PC_ID, name: 'pcA' },
      { id: 'pcB', icon: SHAPE_2D_PC_ID, name: 'pcB' },
      { id: 'swTop', icon: SHAPE_2D_SWITCH_ID, name: 'swTop' },
      { id: 'swBot', icon: SHAPE_2D_SWITCH_ID, name: 'swBot' }
    ];
    const connectors = [
      {
        id: 'cTop',
        anchors: [
          { id: '1', ref: { item: 'pcA', port: 'port-1' } },
          { id: '2', ref: { item: 'swTop', port: 'port-top-1' } }
        ]
      },
      {
        id: 'cBot',
        anchors: [
          { id: '3', ref: { item: 'pcB', port: 'port-1' } },
          { id: '4', ref: { item: 'swBot', port: 'port-top-1' } }
        ]
      }
    ];

    const result = routeDensityGroupBuses({
      items,
      modelItems: modelItems as never,
      connectors,
      exitStyle: 'orthogonal'
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

    expect(result.routes.cTop?.length).toBeGreaterThan(1);
    expect(result.routes.cBot?.length).toBeGreaterThan(1);
    expect(horizY(result.routes.cTop)).not.toBe(horizY(result.routes.cBot));
  });
});
