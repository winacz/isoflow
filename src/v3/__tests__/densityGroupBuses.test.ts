import { SHAPE_2D_PC_ID, SHAPE_2D_SWITCH_ID, getModelItemSize } from 'src/config';
import {
  pickTrunkSideToward,
  routeDensityGroupBuses,
  switchPortApproach,
  findBusYOffset,
  findUpwardClearOffset,
  shiftGroupMembersUp,
  collectOccupiedHorizontals,
  bandConflictsOccupied,
  resolveOverlapsWithTargetDiagonal,
  shiftBusYWithTargetDiagonal,
  TARGET_DIAG_STUB_TILES,
  diagonalExitSideSign,
  ONE_BEND_LANE_PITCH
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
  test('returns the port tile (no chassis runway offset)', () => {
    const approach = switchPortApproach({
      switchTile: { x: 10, y: 20 },
      switchSize: { width: 19, height: 9 },
      portWorld: { x: 14.2, y: 24.7 },
      portSide: 'TOP',
      laneIndex: 0
    });
    expect(approach).toEqual({ x: 14, y: 25 });
  });
});

describe('inter-group occupancy helpers', () => {
  test('findBusYOffset prefers upward and returns null when packed', () => {
    const occupied = [
      { y: 10, x0: 0, x1: 50 },
      { y: 11, x0: 0, x1: 50 }
    ];
    expect(
      findBusYOffset({
        laneYs: [10],
        x0: 5,
        x1: 40,
        occupied,
        limit: 4
      })
    ).toBe(-2); // 10-2=8 clears pad vs 10

    const packed = [];
    for (let y = 0; y <= 40; y += 1) {
      packed.push({ y, x0: 0, x1: 100 });
    }
    expect(
      findBusYOffset({
        laneYs: [20, 21],
        x0: 10,
        x1: 90,
        occupied: packed,
        limit: 10
      })
    ).toBeNull();
    expect(
      findUpwardClearOffset({
        laneYs: [20, 21],
        x0: 10,
        x1: 90,
        occupied: packed,
        startAfter: 10,
        maxUp: 30
      })
    ).toBe(-23);
  });

  test('findUpwardClearOffset finds a hole above a packed window', () => {
    const occupied = [];
    for (let y = 5; y <= 35; y += 1) {
      occupied.push({ y, x0: 0, x1: 100 });
    }
    const offset = findUpwardClearOffset({
      laneYs: [20],
      x0: 0,
      x1: 50,
      occupied,
      startAfter: 10,
      maxUp: 40
    });
    expect(offset).toBeLessThan(-10);
    expect(
      bandConflictsOccupied({
        laneYs: [20 + (offset as number)],
        x0: 0,
        x1: 50,
        occupied
      })
    ).toBe(false);
  });

  test('shiftGroupMembersUp writes lower y tiles and skips non-members', () => {
    const itemById = new Map([
      ['a', { id: 'a', tile: { x: 10, y: 40 } }],
      ['b', { id: 'b', tile: { x: 20, y: 40 } }],
      ['sw', { id: 'sw', tile: { x: 0, y: 0 } }]
    ]);
    const iconById = new Map([
      ['a', SHAPE_2D_PC_ID],
      ['b', SHAPE_2D_PC_ID],
      ['sw', SHAPE_2D_SWITCH_ID]
    ]);
    const shifts = shiftGroupMembersUp({
      memberIds: ['a', 'b'],
      dy: -5,
      itemById: itemById as never,
      iconById
    });
    expect(shifts.a.y).toBe(35);
    expect(shifts.b.y).toBe(35);
    expect(shifts.sw).toBeUndefined();
  });

  test('collectOccupiedHorizontals reads long horizontal spans', () => {
    const segs = collectOccupiedHorizontals({
      c1: [
        { x: 0, y: 5 },
        { x: 10, y: 5 },
        { x: 10, y: 8 }
      ]
    });
    expect(segs).toEqual([{ y: 5, x0: 0, x1: 10 }]);
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

    const horizY = (path: typeof rightPath) => {
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
    // Switch below → earlier (left) port sits on the lower lane of the band.
    expect(horizY(leftPath)).toBeGreaterThan(horizY(rightPath));

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
    // Ends on the switch runway: either vertical from outside or already on its Y.
    const last = rightPath[rightPath.length - 1];
    const prev = rightPath[rightPath.length - 2];
    if (prev.x === last.x) {
      expect(prev.y).not.toBe(last.y);
    } else {
      expect(prev.y).toBe(last.y);
    }
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

  test('places shortest cable first, then stacks each next leaf above', () => {
    // Phones on top with late ports, PCs on bottom with early (shorter) ports.
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

    const pos = (id: string) => {
      return result.targets[id] ?? items.find((item) => item.id === id)!.tile;
    };

    // Shortest (pc1 → leftmost port) claims the closest slot (bottom-right).
    expect(pos('pc1')).toEqual({ x: w, y: h });
    // Next cable builds above that base (same column).
    expect(pos('pc2')).toEqual({ x: w, y: 0 });
    // Longer phones fill the far column, also bottom→top.
    expect(pos('ph1')).toEqual({ x: 0, y: h });
    expect(pos('ph2')).toEqual({ x: 0, y: 0 });
    expect(result.cableCount).toBe(4);

    // All four still get distinct bus lanes.
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
    const ys = ['c1', 'c2', 'c3', 'c4'].map((id) => horizY(result.routes[id]));
    expect(new Set(ys).size).toBe(4);
    // Switch below + bus from the left: leftmost port is the base (bottom).
    expect(horizY(result.routes.c1)).toBeGreaterThan(horizY(result.routes.c2));
    expect(horizY(result.routes.c2)).toBeGreaterThan(horizY(result.routes.c3));
    expect(horizY(result.routes.c3)).toBeGreaterThan(horizY(result.routes.c4));
  });

  test('bus from the right: rightmost port is the base (bottom of band)', () => {
    // Leaves sit to the right of the switch → trunk left; nearest port is
    // the rightmost one, so it must own the bottom lane when dropping down.
    const items = [
      { id: 'a', tile: { x: 40, y: 0 } },
      { id: 'b', tile: { x: 40 + w, y: 0 } },
      { id: 'sw', tile: { x: 0, y: h + 8 } }
    ];
    const modelItems = [
      { id: 'a', icon: SHAPE_2D_PC_ID, name: 'a' },
      { id: 'b', icon: SHAPE_2D_PC_ID, name: 'b' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'cLeftPort',
        anchors: [
          { id: 'a1', ref: { item: 'a', port: 'port-1' } },
          { id: 'a2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'cRightPort',
        anchors: [
          { id: 'a3', ref: { item: 'b', port: 'port-1' } },
          { id: 'a4', ref: { item: 'sw', port: 'port-bottom-2' } }
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

    expect(result.routes.cLeftPort?.length).toBeGreaterThan(2);
    expect(result.routes.cRightPort?.length).toBeGreaterThan(2);
    // Rightmost switch port = base at bottom of the band.
    expect(horizY(result.routes.cRightPort)).toBeGreaterThan(
      horizY(result.routes.cLeftPort)
    );
  });

  test('runway stays outward — no reverse spike into a BOTTOM port', () => {
    const items = [
      { id: 'pc', tile: { x: 0, y: 0 } },
      { id: 'sw', tile: { x: w * 2 + 14, y: 0 } }
    ];
    const modelItems = [
      { id: 'pc', icon: SHAPE_2D_PC_ID, name: 'pc' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'c1',
        anchors: [
          { id: 'a1', ref: { item: 'pc', port: 'port-1' } },
          { id: 'a2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      }
    ];

    const result = routeDensityGroupBuses({
      items,
      modelItems: modelItems as never,
      connectors
    });
    const path = result.routes.c1;
    expect(path?.length).toBeGreaterThan(2);

    // Last mid-point is the switch runway end — arrive from outside or on its line,
    // never from the inward side then out (that makes the "pik").
    const last = path[path.length - 1];
    const prev = path[path.length - 2];
    if (prev.x === last.x) {
      expect(prev.y).toBeGreaterThanOrEqual(last.y);
    } else {
      expect(prev.y).toBe(last.y);
    }
  });

  test('same-row cables keep distinct horizontal bus lanes', () => {
    const items = [
      { id: 'a', tile: { x: 0, y: 0 } },
      { id: 'b', tile: { x: w, y: 0 } },
      { id: 'sw', tile: { x: -30, y: h + 10 } }
    ];
    const modelItems = [
      { id: 'a', icon: SHAPE_2D_PC_ID, name: 'a' },
      { id: 'b', icon: SHAPE_2D_PC_ID, name: 'b' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'cA',
        anchors: [
          { id: 'a1', ref: { item: 'a', port: 'port-1' } },
          { id: 'a2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'cB',
        anchors: [
          { id: 'a3', ref: { item: 'b', port: 'port-1' } },
          { id: 'a4', ref: { item: 'sw', port: 'port-bottom-2' } }
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

    expect(horizY(result.routes.cA)).not.toBe(horizY(result.routes.cB));
  });

  test('same-row leaves toward switch above: no shared under-leaf horizontal', () => {
    // Mirrors PC-MTG side-by-side with trunk up-left — climb on port columns,
    // distinct bus lanes above the leaf runways.
    const items = [
      { id: 'a', tile: { x: 20, y: 40 } },
      { id: 'b', tile: { x: 20 + w, y: 40 } },
      { id: 'sw', tile: { x: 0, y: 0 } }
    ];
    const modelItems = [
      { id: 'a', icon: SHAPE_2D_PC_ID, name: 'a' },
      { id: 'b', icon: SHAPE_2D_PC_ID, name: 'b' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'cA',
        anchors: [
          { id: 'a1', ref: { item: 'a', port: 'port-1' } },
          { id: 'a2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'cB',
        anchors: [
          { id: 'a3', ref: { item: 'b', port: 'port-1' } },
          { id: 'a4', ref: { item: 'sw', port: 'port-bottom-2' } }
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

    const longestHorizAtY = (path: { x: number; y: number }[], y: number) => {
      let best = 0;
      for (let i = 1; i < path.length; i += 1) {
        if (path[i].y === y && path[i - 1].y === y) {
          best = Math.max(best, Math.abs(path[i].x - path[i - 1].x));
        }
      }
      return best;
    };

    expect(result.routes.cA?.length).toBeGreaterThan(2);
    expect(result.routes.cB?.length).toBeGreaterThan(2);
    expect(horizY(result.routes.cA)).not.toBe(horizY(result.routes.cB));

    // No long shared jog on either leaf's first path Y (runway end).
    const leafYa = result.routes.cA[0].y;
    const leafYb = result.routes.cB[0].y;
    expect(longestHorizAtY(result.routes.cA, leafYa)).toBe(0);
    expect(longestHorizAtY(result.routes.cB, leafYb)).toBe(0);
    expect(longestHorizAtY(result.routes.cB, leafYa)).toBe(0);
  });

  test('sources below switch: nearest port is base at TOP of the band', () => {
    // Group under the switch (left); bus goes right then up — nearest (left)
    // port must sit on the top lane so the rise does not cross longer runs.
    const items = [
      { id: 'a', tile: { x: 0, y: 40 } },
      { id: 'b', tile: { x: w, y: 40 } },
      { id: 'sw', tile: { x: w * 2 + 14, y: 0 } }
    ];
    const modelItems = [
      { id: 'a', icon: SHAPE_2D_PC_ID, name: 'a' },
      { id: 'b', icon: SHAPE_2D_PC_ID, name: 'b' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'cLeftPort',
        anchors: [
          { id: 'a1', ref: { item: 'a', port: 'port-1' } },
          { id: 'a2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'cRightPort',
        anchors: [
          { id: 'a3', ref: { item: 'b', port: 'port-1' } },
          { id: 'a4', ref: { item: 'sw', port: 'port-bottom-2' } }
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

    expect(result.routes.cLeftPort?.length).toBeGreaterThan(2);
    expect(result.routes.cRightPort?.length).toBeGreaterThan(2);
    // Leftmost port = base at top of the band (smaller Y).
    expect(horizY(result.routes.cLeftPort)).toBeLessThan(
      horizY(result.routes.cRightPort)
    );
  });

  test('second group nudges bus Y to clear the first group band', () => {
    // Two same-height leaf pairs (separate density groups) → same switch.
    // Second group's horizontal must not share Y with the first in the span.
    const gap = 3;
    const items = [
      { id: 'a1', tile: { x: 40, y: 20 } },
      { id: 'a2', tile: { x: 40 + w, y: 20 } },
      { id: 'b1', tile: { x: 40 + w * 2 + gap, y: 20 } },
      { id: 'b2', tile: { x: 40 + w * 3 + gap, y: 20 } },
      { id: 'sw', tile: { x: 0, y: 20 } }
    ];
    const modelItems = [
      { id: 'a1', icon: SHAPE_2D_PC_ID, name: 'a1' },
      { id: 'a2', icon: SHAPE_2D_PC_ID, name: 'a2' },
      { id: 'b1', icon: SHAPE_2D_PC_ID, name: 'b1' },
      { id: 'b2', icon: SHAPE_2D_PC_ID, name: 'b2' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'cA1',
        anchors: [
          { id: '1', ref: { item: 'a1', port: 'port-1' } },
          { id: '2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'cA2',
        anchors: [
          { id: '3', ref: { item: 'a2', port: 'port-1' } },
          { id: '4', ref: { item: 'sw', port: 'port-bottom-2' } }
        ]
      },
      {
        id: 'cB1',
        anchors: [
          { id: '5', ref: { item: 'b1', port: 'port-1' } },
          { id: '6', ref: { item: 'sw', port: 'port-bottom-3' } }
        ]
      },
      {
        id: 'cB2',
        anchors: [
          { id: '7', ref: { item: 'b2', port: 'port-1' } },
          { id: '8', ref: { item: 'sw', port: 'port-bottom-4' } }
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

    expect(result.routes.cA1?.length).toBeGreaterThan(2);
    expect(result.routes.cB1?.length).toBeGreaterThan(2);

    const groupA = new Set([
      horizY(result.routes.cA1),
      horizY(result.routes.cA2)
    ]);
    const groupB = new Set([
      horizY(result.routes.cB1),
      horizY(result.routes.cB2)
    ]);
    // No shared horizontal Y between groups (pad ≥ 1 tile).
    groupA.forEach((yA) => {
      groupB.forEach((yB) => {
        expect(Math.abs(yA - yB)).toBeGreaterThanOrEqual(2);
      });
    });
  });

  test('does not translate whole groups — only in-group leaf swaps', () => {
    // Two separate density groups; Magistrala may swap leaves inside a group
    // but must not move one group relative to the other.
    const gap = 3;
    const items = [
      { id: 'a1', tile: { x: 40, y: 20 } },
      { id: 'a2', tile: { x: 40 + w, y: 20 } },
      { id: 'b1', tile: { x: 40 + w * 2 + gap, y: 30 } },
      { id: 'b2', tile: { x: 40 + w * 3 + gap, y: 30 } },
      { id: 'sw', tile: { x: 0, y: 20 } }
    ];
    const modelItems = [
      { id: 'a1', icon: SHAPE_2D_PC_ID, name: 'a1' },
      { id: 'a2', icon: SHAPE_2D_PC_ID, name: 'a2' },
      { id: 'b1', icon: SHAPE_2D_PC_ID, name: 'b1' },
      { id: 'b2', icon: SHAPE_2D_PC_ID, name: 'b2' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'cA1',
        anchors: [
          { id: '1', ref: { item: 'a1', port: 'port-1' } },
          { id: '2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'cA2',
        anchors: [
          { id: '3', ref: { item: 'a2', port: 'port-1' } },
          { id: '4', ref: { item: 'sw', port: 'port-bottom-2' } }
        ]
      },
      {
        id: 'cB1',
        anchors: [
          { id: '5', ref: { item: 'b1', port: 'port-1' } },
          { id: '6', ref: { item: 'sw', port: 'port-bottom-3' } }
        ]
      },
      {
        id: 'cB2',
        anchors: [
          { id: '7', ref: { item: 'b2', port: 'port-1' } },
          { id: '8', ref: { item: 'sw', port: 'port-bottom-4' } }
        ]
      }
    ];

    const result = routeDensityGroupBuses({
      items,
      modelItems: modelItems as never,
      connectors
    });

    const tileOf = (id: string) => {
      return result.targets[id] ?? items.find((item) => item.id === id)!.tile;
    };
    const centroid = (ids: string[]) => {
      const tiles = ids.map(tileOf);
      return {
        x: tiles.reduce((s, t) => s + t.x, 0) / tiles.length,
        y: tiles.reduce((s, t) => s + t.y, 0) / tiles.length
      };
    };
    const beforeA = { x: 40 + w / 2, y: 20 };
    const beforeB = { x: 40 + w * 2.5 + gap, y: 30 };
    const afterA = centroid(['a1', 'a2']);
    const afterB = centroid(['b1', 'b2']);
    // Rigid group seats stay put (in-group swaps keep the centroid).
    expect(afterA.x).toBeCloseTo(beforeA.x, 5);
    expect(afterA.y).toBeCloseTo(beforeA.y, 5);
    expect(afterB.x).toBeCloseTo(beforeB.x, 5);
    expect(afterB.y).toBeCloseTo(beforeB.y, 5);
  });

  test('simple: empty mid-waypoints and swaps crossed leaves by port order', () => {
    // Crossed wiring: left PC → later port, right PC → earlier port.
    const items = [
      { id: 'pcLeft', tile: { x: 40, y: 20 } },
      { id: 'pcRight', tile: { x: 40 + w, y: 20 } },
      { id: 'sw', tile: { x: 0, y: 20 } }
    ];
    const modelItems = [
      { id: 'pcLeft', icon: SHAPE_2D_PC_ID, name: 'pcLeft' },
      { id: 'pcRight', icon: SHAPE_2D_PC_ID, name: 'pcRight' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'cCross',
        anchors: [
          { id: '1', ref: { item: 'pcLeft', port: 'port-1' } },
          { id: '2', ref: { item: 'sw', port: 'port-bottom-4' } }
        ]
      },
      {
        id: 'cEarly',
        anchors: [
          { id: '3', ref: { item: 'pcRight', port: 'port-1' } },
          { id: '4', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      }
    ];

    const result = routeDensityGroupBuses({
      items,
      modelItems: modelItems as never,
      connectors,
      exitStyle: 'simple'
    });

    expect(result.cableCount).toBe(2);
    expect(result.routes.cCross).toEqual([]);
    expect(result.routes.cEarly).toEqual([]);
    // Port-bottom-1 (earlier) → left slot; port-bottom-4 → right slot.
    expect(result.targets.pcLeft).toEqual({ x: 40 + w, y: 20 });
    expect(result.targets.pcRight).toEqual({ x: 40, y: 20 });
  });

  test('two stacked switches same port index: horizontals do not share Y', () => {
    // Leaves at same height; each hits port-bottom-2 on its own switch.
    // Switches stacked → port local Y matches, world bus often collides without
    // cross-bundle occupancy.
    const swH = getModelItemSize({ icon: SHAPE_2D_SWITCH_ID })?.height ?? 9;
    const items = [
      { id: 'pcA', tile: { x: 40, y: 30 } },
      { id: 'pcB', tile: { x: 40 + w + 3, y: 30 } },
      { id: 'swTop', tile: { x: 0, y: 10 } },
      { id: 'swBot', tile: { x: 0, y: 10 + swH + 2 } }
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
          { id: '2', ref: { item: 'swTop', port: 'port-bottom-2' } }
        ]
      },
      {
        id: 'cBot',
        anchors: [
          { id: '3', ref: { item: 'pcB', port: 'port-1' } },
          { id: '4', ref: { item: 'swBot', port: 'port-bottom-2' } }
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

    expect(result.routes.cTop?.length).toBeGreaterThan(2);
    expect(result.routes.cBot?.length).toBeGreaterThan(2);
    expect(Math.abs(horizY(result.routes.cTop) - horizY(result.routes.cBot))).toBeGreaterThanOrEqual(
      2
    );

    // No two horizontals may share (or sit adjacent on) the same Y.
    const segs = [
      ...collectOccupiedHorizontals({ cTop: result.routes.cTop }),
      ...collectOccupiedHorizontals({ cBot: result.routes.cBot })
    ];
    for (let i = 0; i < segs.length; i += 1) {
      for (let j = i + 1; j < segs.length; j += 1) {
        expect(Math.abs(segs[i].y - segs[j].y)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test('same group to two stacked switches on port-top-2: no shared horizontal Y', () => {
    const swH = getModelItemSize({ icon: SHAPE_2D_SWITCH_ID })?.height ?? 9;
    // Adjacent PCs = one density group; two switch targets stacked.
    const items = [
      { id: 'pcA', tile: { x: 40, y: 30 } },
      { id: 'pcB', tile: { x: 40 + w, y: 30 } },
      { id: 'swTop', tile: { x: 0, y: 5 } },
      { id: 'swBot', tile: { x: 0, y: 5 + swH + 3 } }
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
          { id: '2', ref: { item: 'swTop', port: 'port-top-2' } }
        ]
      },
      {
        id: 'cBot',
        anchors: [
          { id: '3', ref: { item: 'pcB', port: 'port-1' } },
          { id: '4', ref: { item: 'swBot', port: 'port-top-2' } }
        ]
      }
    ];

    const result = routeDensityGroupBuses({
      items,
      modelItems: modelItems as never,
      connectors
    });

    const allSegs = collectOccupiedHorizontals(result.routes);
    for (let i = 0; i < allSegs.length; i += 1) {
      for (let j = i + 1; j < allSegs.length; j += 1) {
        const a = allSegs[i];
        const b = allSegs[j];
        expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test('group shift fallback moves leaves up when band cannot nudge', () => {
    const items = [
      { id: 'wall1', tile: { x: 30, y: 10 } },
      { id: 'wall2', tile: { x: 30 + w, y: 10 } },
      { id: 'leaf1', tile: { x: 30 + w * 2 + 4, y: 10 } },
      { id: 'leaf2', tile: { x: 30 + w * 3 + 4, y: 10 } },
      { id: 'sw', tile: { x: 0, y: 8 } }
    ];
    const modelItems = [
      { id: 'wall1', icon: SHAPE_2D_PC_ID, name: 'wall1' },
      { id: 'wall2', icon: SHAPE_2D_PC_ID, name: 'wall2' },
      { id: 'leaf1', icon: SHAPE_2D_PC_ID, name: 'leaf1' },
      { id: 'leaf2', icon: SHAPE_2D_PC_ID, name: 'leaf2' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'w1',
        anchors: [
          { id: 'a', ref: { item: 'wall1', port: 'port-1' } },
          { id: 'b', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'w2',
        anchors: [
          { id: 'c', ref: { item: 'wall2', port: 'port-1' } },
          { id: 'd', ref: { item: 'sw', port: 'port-bottom-2' } }
        ]
      },
      {
        id: 'l1',
        anchors: [
          { id: 'e', ref: { item: 'leaf1', port: 'port-1' } },
          { id: 'f', ref: { item: 'sw', port: 'port-bottom-3' } }
        ]
      },
      {
        id: 'l2',
        anchors: [
          { id: 'g', ref: { item: 'leaf2', port: 'port-1' } },
          { id: 'h', ref: { item: 'sw', port: 'port-bottom-4' } }
        ]
      }
    ];

    const result = routeDensityGroupBuses({
      items,
      modelItems: modelItems as never,
      connectors
    });

    expect(result.routes.w1?.length).toBeGreaterThan(2);
    expect(result.routes.l1?.length).toBeGreaterThan(2);

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
    const wallYs = [horizY(result.routes.w1), horizY(result.routes.w2)];
    const leafYs = [horizY(result.routes.l1), horizY(result.routes.l2)];
    wallYs.forEach((wy) => {
      leafYs.forEach((ly) => {
        expect(Math.abs(wy - ly)).toBeGreaterThanOrEqual(2);
      });
    });
  });

  test('shiftBusYWithTargetDiagonal adds a 45° stub at the switch port', () => {
    const path = [
      { x: 20, y: 10 },
      { x: 5, y: 10 },
      { x: 5, y: 4 }
    ];
    const out = shiftBusYWithTargetDiagonal(path, -2);
    const port = out[out.length - 1];
    const diag = out[out.length - 2];
    expect(port).toEqual({ x: 5, y: 4 });
    expect(Math.abs(diag.x - port.x)).toBe(Math.abs(diag.y - port.y));
    expect(Math.abs(diag.x - port.x)).toBeGreaterThanOrEqual(TARGET_DIAG_STUB_TILES);
  });

  test('resolveOverlapsWithTargetDiagonal separates shared bus Y', () => {
    const routes = {
      a: [
        { x: 30, y: 8 },
        { x: 5, y: 8 },
        { x: 5, y: 2 }
      ],
      b: [
        { x: 28, y: 8 },
        { x: 6, y: 8 },
        { x: 6, y: 2 }
      ]
    };
    const out = resolveOverlapsWithTargetDiagonal(routes);
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
    expect(horizY(out.a)).not.toBe(horizY(out.b));
  });

  test('resolveOverlapsWithTargetDiagonal tolerates empty fan bend lists', () => {
    const routes = {
      short: [] as { x: number; y: number }[],
      a: [
        { x: 30, y: 8 },
        { x: 5, y: 8 },
        { x: 5, y: 2 }
      ],
      b: [
        { x: 28, y: 8 },
        { x: 6, y: 8 },
        { x: 6, y: 2 }
      ]
    };
    expect(() => resolveOverlapsWithTargetDiagonal(routes)).not.toThrow();
    const out = resolveOverlapsWithTargetDiagonal(routes);
    expect(out.short).toEqual([]);
    expect(out.a.length).toBeGreaterThan(0);
    expect(out.b.length).toBeGreaterThan(0);
  });

  test('resolveOverlaps: lower target fans off occupied approach X at 45°', () => {
    // Same port column X=10 on stacked targets — Y ranges need not overlap.
    const routes = {
      upper: [
        { x: 40, y: 1 },
        { x: 10, y: 1 },
        { x: 10, y: 3 }
      ],
      lower: [
        { x: 40, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 12 }
      ]
    };
    const out = resolveOverlapsWithTargetDiagonal(routes);
    const port = out.lower[out.lower.length - 1];
    const prev = out.lower[out.lower.length - 2];
    expect(port).toEqual({ x: 10, y: 12 });
    // 45° into the lower port from a free column.
    expect(prev.x).not.toBe(port.x);
    expect(prev.y).not.toBe(port.y);
    expect(Math.abs(prev.x - port.x)).toBe(Math.abs(prev.y - port.y));
    // Long vertical must not sit on the upper cable's column.
    for (let i = 1; i < out.lower.length; i += 1) {
      const a = out.lower[i - 1];
      const b = out.lower[i];
      if (a.x === b.x && a.y !== b.y) {
        expect(a.x).not.toBe(10);
      }
    }
  });

  test('resolveOverlaps: later diagonal exits prefer the side already used', () => {
    // Upper owns x=10 and x=11. Two lower ports need fans — both should go right.
    const routes = {
      upperA: [
        { x: 40, y: 1 },
        { x: 10, y: 1 },
        { x: 10, y: 3 }
      ],
      upperB: [
        { x: 40, y: 2 },
        { x: 11, y: 2 },
        { x: 11, y: 3 }
      ],
      lowerA: [
        { x: 40, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 14 }
      ],
      lowerB: [
        { x: 40, y: 0 },
        { x: 11, y: 0 },
        { x: 11, y: 14 }
      ]
    };
    const out = resolveOverlapsWithTargetDiagonal(routes);
    const sideA = diagonalExitSideSign(out.lowerA);
    const sideB = diagonalExitSideSign(out.lowerB);
    expect(sideA).not.toBeNull();
    expect(sideB).not.toBeNull();
    expect(sideA).toBe(sideB);
  });

  test('resolveOverlaps: diagonal into the port stays ≤ TARGET_DIAG_STUB_TILES', () => {
    // Pack nearby approach columns so the old search would walk out to a long 45°.
    const routes: Record<string, { x: number; y: number }[]> = {
      upper: [
        { x: 40, y: 1 },
        { x: 10, y: 1 },
        { x: 10, y: 3 }
      ],
      lower: [
        { x: 40, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 14 }
      ]
    };
    for (let x = 8; x <= 18; x += 1) {
      if (x === 10) continue;
      routes[`block${x}`] = [
        { x: 40, y: 2 },
        { x, y: 2 },
        { x, y: 4 }
      ];
    }
    const out = resolveOverlapsWithTargetDiagonal(routes);
    const path = out.lower;
    const port = path[path.length - 1];
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1];
      const b = path[i];
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      if (dx > 0 && dy > 0) {
        expect(dx).toBe(dy);
        expect(dx).toBeLessThanOrEqual(TARGET_DIAG_STUB_TILES);
      }
    }
    expect(port).toEqual({ x: 10, y: 14 });
  });

  test('oneBend exits horizontally then diagonals to the switch port', () => {
    const items = [
      { id: 'pc', tile: { x: 40, y: 20 } },
      { id: 'sw', tile: { x: 0, y: 20 } }
    ];
    const modelItems = [
      { id: 'pc', icon: SHAPE_2D_PC_ID, name: 'pc' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'c1',
        anchors: [
          { id: 'a', ref: { item: 'pc', port: 'port-1' } },
          { id: 'b', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      }
    ];
    const result = routeDensityGroupBuses({
      items,
      modelItems: modelItems as never,
      connectors,
      exitStyle: 'oneBend'
    });
    const path = result.routes.c1;
    expect(path?.length).toBeGreaterThanOrEqual(3);
    // Sparse corners only — no grid-staircased diagonal (zigzag).
    expect(path.length).toBeLessThanOrEqual(5);
    let sawHorizontalStub = false;
    for (let i = 1; i < path.length; i += 1) {
      const prev = path[i - 1];
      const cur = path[i];
      if (prev.y === cur.y && prev.x !== cur.x) {
        sawHorizontalStub = true;
        break;
      }
    }
    expect(sawHorizontalStub).toBe(true);
    const port = path[path.length - 1];
    const before = path[path.length - 2];
    const dx = Math.abs(port.x - before.x);
    const dy = Math.abs(port.y - before.y);
    // Final approach is a single diagonal segment (possibly non-45°).
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeGreaterThan(0);
  });

  test('oneBend spaces bus lanes so the diagonal bundle does not merge', () => {
    const items = [
      { id: 'pc1', tile: { x: 50, y: 10 } },
      { id: 'pc2', tile: { x: 50 + w, y: 10 } },
      { id: 'pc3', tile: { x: 50, y: 10 + h } },
      { id: 'pc4', tile: { x: 50 + w, y: 10 + h } },
      { id: 'sw', tile: { x: 0, y: 14 } }
    ];
    const modelItems = [
      { id: 'pc1', icon: SHAPE_2D_PC_ID, name: 'pc1' },
      { id: 'pc2', icon: SHAPE_2D_PC_ID, name: 'pc2' },
      { id: 'pc3', icon: SHAPE_2D_PC_ID, name: 'pc3' },
      { id: 'pc4', icon: SHAPE_2D_PC_ID, name: 'pc4' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [1, 2, 3, 4].map((n) => {
      return {
        id: `c${n}`,
        anchors: [
          { id: `a${n}`, ref: { item: `pc${n}`, port: 'port-1' } },
          { id: `b${n}`, ref: { item: 'sw', port: `port-bottom-${n}` } }
        ]
      };
    });

    const result = routeDensityGroupBuses({
      items,
      modelItems: modelItems as never,
      connectors,
      exitStyle: 'oneBend'
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

    const ys = ['c1', 'c2', 'c3', 'c4']
      .map((id) => horizY(result.routes[id]))
      .sort((a, b) => a - b);

    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(ONE_BEND_LANE_PITCH);
    }
  });

  test('oneBend places leaves in port order to reduce crossings', () => {
    // Deliberately crossed: early ports sit on the far/bottom slots.
    const items = [
      { id: 'pc1', tile: { x: 40 + w, y: 10 + h } }, // bottom-right, port-1
      { id: 'pc2', tile: { x: 40, y: 10 + h } }, // bottom-left, port-2
      { id: 'pc3', tile: { x: 40 + w, y: 10 } }, // top-right, port-3
      { id: 'pc4', tile: { x: 40, y: 10 } }, // top-left, port-4
      { id: 'sw', tile: { x: 0, y: 12 } }
    ];
    const modelItems = [
      { id: 'pc1', icon: SHAPE_2D_PC_ID, name: 'pc1' },
      { id: 'pc2', icon: SHAPE_2D_PC_ID, name: 'pc2' },
      { id: 'pc3', icon: SHAPE_2D_PC_ID, name: 'pc3' },
      { id: 'pc4', icon: SHAPE_2D_PC_ID, name: 'pc4' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [1, 2, 3, 4].map((n) => {
      return {
        id: `c${n}`,
        anchors: [
          { id: `a${n}`, ref: { item: `pc${n}`, port: 'port-1' } },
          { id: `b${n}`, ref: { item: 'sw', port: `port-bottom-${n}` } }
        ]
      };
    });

    const result = routeDensityGroupBuses({
      items,
      modelItems: modelItems as never,
      connectors,
      exitStyle: 'oneBend'
    });

    const pos = (id: string) => {
      return result.targets[id] ?? items.find((item) => item.id === id)!.tile;
    };

    // Reading order of slots: top-left, top-right, bottom-left, bottom-right.
    // Port order 1..4 maps onto that — uncrosses the deliberate weave.
    expect(pos('pc1')).toEqual({ x: 40, y: 10 });
    expect(pos('pc2')).toEqual({ x: 40 + w, y: 10 });
    expect(pos('pc3')).toEqual({ x: 40, y: 10 + h });
    expect(pos('pc4')).toEqual({ x: 40 + w, y: 10 + h });
  });

  test('oneBend uses the same exit angle for every cable in a group', () => {
    const items = [
      { id: 'pc1', tile: { x: 40, y: 10 } },
      { id: 'pc2', tile: { x: 40 + w, y: 10 } },
      { id: 'pc3', tile: { x: 40, y: 10 + h } },
      { id: 'pc4', tile: { x: 40 + w, y: 10 + h } },
      { id: 'sw', tile: { x: 0, y: 12 } }
    ];
    const modelItems = [
      { id: 'pc1', icon: SHAPE_2D_PC_ID, name: 'pc1' },
      { id: 'pc2', icon: SHAPE_2D_PC_ID, name: 'pc2' },
      { id: 'pc3', icon: SHAPE_2D_PC_ID, name: 'pc3' },
      { id: 'pc4', icon: SHAPE_2D_PC_ID, name: 'pc4' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [1, 2, 3, 4].map((n) => {
      return {
        id: `c${n}`,
        anchors: [
          { id: `a${n}`, ref: { item: `pc${n}`, port: 'port-1' } },
          { id: `b${n}`, ref: { item: 'sw', port: `port-bottom-${n}` } }
        ]
      };
    });

    const result = routeDensityGroupBuses({
      items,
      modelItems: modelItems as never,
      connectors,
      exitStyle: 'oneBend'
    });

    const anglesDeg = ['c1', 'c2', 'c3', 'c4'].map((id) => {
      const path = result.routes[id];
      expect(path?.length).toBeGreaterThanOrEqual(2);
      const port = path[path.length - 1];
      const bend = path[path.length - 2];
      const dx = port.x - bend.x;
      const dy = port.y - bend.y;
      expect(dx).not.toBe(0);
      return (Math.atan2(dy, dx) * 180) / Math.PI;
    });

    const ref = anglesDeg[0];
    anglesDeg.forEach((angle) => {
      // Rounding + trunk-side bend clamp can nudge a few degrees on outer lanes.
      expect(Math.abs(angle - ref)).toBeLessThan(10);
    });
  });

  test('oneBend near overlapping target keeps all knees on the trunk side', () => {
    // 2×3 group whose X span overlaps the switch face — old per-leaf toward
    // flipped mid-group and sharedSlope shot bends to the far side.
    const sw = getModelItemSize({ icon: SHAPE_2D_SWITCH_ID });
    if (!sw) throw new Error('switch size');
    const groupX = Math.max(2, sw.width - 4);
    const items = [
      { id: 'a1', tile: { x: groupX, y: 0 } },
      { id: 'a2', tile: { x: groupX + w, y: 0 } },
      { id: 'a3', tile: { x: groupX + 2 * w, y: 0 } },
      { id: 'b1', tile: { x: groupX, y: h } },
      { id: 'b2', tile: { x: groupX + w, y: h } },
      { id: 'b3', tile: { x: groupX + 2 * w, y: h } },
      { id: 'sw', tile: { x: 0, y: 2 } }
    ];
    const modelItems = [
      ...['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].map((id) => {
        return { id, icon: SHAPE_2D_PC_ID, name: id };
      }),
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].map((id, i) => {
      return {
        id: `c${i}`,
        anchors: [
          { id: `l${i}`, ref: { item: id, port: 'port-1' } },
          { id: `s${i}`, ref: { item: 'sw', port: `port-bottom-${i + 1}` } }
        ]
      };
    });

    const result = routeDensityGroupBuses({
      items,
      modelItems: modelItems as never,
      connectors,
      exitStyle: 'oneBend'
    });

    const ids = connectors.map((c) => c.id);
    ids.forEach((id) => {
      expect(result.routes[id]?.length).toBeGreaterThanOrEqual(2);
    });

    // Trunk is left (group to the right of switch origin): every knee must
    // sit at or to the right of its port — never shoot past the chassis left.
    ids.forEach((id) => {
      const path = result.routes[id];
      const port = path[path.length - 1];
      const bend = path[path.length - 2];
      expect(bend.x).toBeGreaterThanOrEqual(port.x);
      // And never far past the group to the right as a wild sharedSlope spike.
      const groupRight = groupX + 3 * w + 8;
      expect(bend.x).toBeLessThanOrEqual(groupRight);
    });
  });
});
