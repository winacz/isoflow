import { SHAPE_2D_PC_ID, SHAPE_2D_SWITCH_ID, getModelItemSize } from 'src/config';
import {
  arrangeDensityGroups,
  buildBusCorridor,
  buildSpokeCorridor,
  circlesOverlap,
  circleHitsCorridor,
  circleHitsSpokeCorridor,
  countP2PCrossings,
  estimateMagistralaThickness,
  estimateSpokeHalfWidth,
  findClearSpokeDistance,
  pointOnSpoke,
  snapGroupTranslation,
  spokeAngleForIndex,
  GROUP_CIRCLE_GAP
} from '../densityGroupLayout';
import { computeDensityGroups, densityCirclePadForMemberCount } from '../densityGroups';

describe('spokeAngleForIndex', () => {
  test('single group prefers top (3π/2)', () => {
    expect(spokeAngleForIndex(0, 1)).toBeCloseTo((3 * Math.PI) / 2);
  });

  test('angles stay on left→top→right arc (never bottom)', () => {
    const n = 5;
    for (let i = 0; i < n; i += 1) {
      const a = spokeAngleForIndex(i, n);
      expect(a).toBeGreaterThanOrEqual(Math.PI);
      expect(a).toBeLessThanOrEqual(2 * Math.PI);
      const y = Math.sin(a);
      expect(y).toBeLessThanOrEqual(1e-9);
    }
  });

  test('low index is more leftward than high index', () => {
    const a0 = spokeAngleForIndex(0, 4);
    const a3 = spokeAngleForIndex(3, 4);
    expect(Math.cos(a0)).toBeLessThan(Math.cos(a3));
  });
});

describe('magistrala thickness / corridors', () => {
  test('estimateMagistralaThickness grows with cable count', () => {
    expect(estimateMagistralaThickness(1)).toBeLessThan(
      estimateMagistralaThickness(4)
    );
    expect(estimateMagistralaThickness(4)).toBe(4 + 1);
  });

  test('buildBusCorridor makes a horizontal band below a left-side group', () => {
    const corridor = buildBusCorridor({
      groupBounds: { x: 0, y: 10, w: 18, h: 9 },
      groupCenter: { x: 9, y: 14.5 },
      hub: { x: 40, y: 30 },
      hubR: 8,
      thickness: 6
    });
    expect(corridor.x1).toBeGreaterThan(corridor.x0);
    // Switch below → band starts at the bottom face of the group.
    expect(corridor.y0).toBeGreaterThanOrEqual(10 + 9 - 1);
    expect(corridor.y1 - corridor.y0).toBeGreaterThanOrEqual(6);
  });

  test('findClearSpokeDistance skips a corridor blocking the spoke', () => {
    const hub = { x: 50, y: 50 };
    const angle = Math.PI; // left
    const groupR = 4;
    const hubR = 5;
    const corridors = [{ x0: 20, y0: 40, x1: 45, y1: 60 }];
    const dist = findClearSpokeDistance({
      hub,
      angle,
      groupR,
      hubR,
      obstacles: [{ cx: hub.x, cy: hub.y, r: hubR }],
      corridors
    });
    expect(dist).not.toBeNull();
    const centre = pointOnSpoke(hub, angle, dist!);
    expect(
      circleHitsCorridor({ cx: centre.x, cy: centre.y, r: groupR }, corridors[0])
    ).toBe(false);
  });

  test('findClearSpokeDistance skips a spoke wire capsule', () => {
    const hub = { x: 50, y: 50 };
    const angle = Math.PI; // left
    const groupR = 4;
    const hubR = 5;
    // Outer group already claimed the left spoke toward the hub.
    const spoke = buildSpokeCorridor({
      groupCenter: { x: 10, y: 50 },
      groupR: 8,
      hub,
      hubR,
      halfWidth: estimateSpokeHalfWidth(8, 4)
    });
    const dist = findClearSpokeDistance({
      hub,
      angle,
      groupR,
      hubR,
      obstacles: [{ cx: hub.x, cy: hub.y, r: hubR }],
      spokeCorridors: [spoke]
    });
    expect(dist).not.toBeNull();
    const centre = pointOnSpoke(hub, angle, dist!);
    expect(
      circleHitsSpokeCorridor(
        { cx: centre.x, cy: centre.y, r: groupR },
        spoke
      )
    ).toBe(false);
  });
});

describe('circlesOverlap / findClearSpokeDistance', () => {
  test('detects overlapping circles', () => {
    expect(
      circlesOverlap({ cx: 0, cy: 0, r: 5 }, { cx: 8, cy: 0, r: 5 }, 0)
    ).toBe(true);
    expect(
      circlesOverlap({ cx: 0, cy: 0, r: 5 }, { cx: 12, cy: 0, r: 5 }, 0)
    ).toBe(false);
  });

  test('pushes outward until clear of an obstacle on the spoke', () => {
    const hub = { x: 0, y: 0 };
    const angle = Math.PI;
    const groupR = 5;
    const hubR = 4;
    const obstacles = [{ cx: -15, cy: 0, r: 4 }];
    const dist = findClearSpokeDistance({
      hub,
      angle,
      groupR,
      hubR,
      obstacles,
      gap: GROUP_CIRCLE_GAP
    });
    expect(dist).not.toBeNull();
    const centre = pointOnSpoke(hub, angle, dist!);
    expect(
      circlesOverlap({ cx: centre.x, cy: centre.y, r: groupR }, obstacles[0])
    ).toBe(false);
    expect(dist!).toBeGreaterThan(hubR + groupR);
  });
});

describe('arrangeDensityGroups hub-and-spoke', () => {
  const pc = getModelItemSize({ icon: SHAPE_2D_PC_ID });
  const sw = getModelItemSize({ icon: SHAPE_2D_SWITCH_ID });
  if (!pc || !sw) throw new Error('sizes missing');
  const { width: w, height: h } = pc;

  test('circles use dynamic pad by member count', () => {
    expect(densityCirclePadForMemberCount(1)).toBe(4);
    expect(densityCirclePadForMemberCount(10)).toBe(7);
    expect(densityCirclePadForMemberCount(20)).toBe(7);
    expect(densityCirclePadForMemberCount(1)).toBeLessThan(
      densityCirclePadForMemberCount(5)
    );
    const items = [
      { id: 'a', tile: { x: 0, y: 0 } },
      { id: 'b', tile: { x: w, y: 0 } }
    ];
    const modelItems = items.map((item) => {
      return { id: item.id, icon: SHAPE_2D_PC_ID };
    });
    const [group] = computeDensityGroups({ items, modelItems });
    const bare = Math.sqrt((group.bounds.w / 2) ** 2 + (group.bounds.h / 2) ** 2);
    expect(group.circle.r).toBeCloseTo(
      bare + densityCirclePadForMemberCount(2),
      5
    );
  });

  test('orders by port key on left→top→right arc without P2P crossings', () => {
    const items = [
      { id: 'a1', tile: { x: 0, y: 0 } },
      { id: 'a2', tile: { x: w, y: 0 } },
      { id: 'b1', tile: { x: 0, y: h + 5 } },
      { id: 'b2', tile: { x: w, y: h + 5 } },
      { id: 'sw', tile: { x: w * 2 + 30, y: 20 } }
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
          { id: '2', ref: { item: 'sw', port: 'port-bottom-7' } }
        ]
      },
      {
        id: 'cA2',
        anchors: [
          { id: '3', ref: { item: 'a2', port: 'port-1' } },
          { id: '4', ref: { item: 'sw', port: 'port-bottom-8' } }
        ]
      },
      {
        id: 'cB1',
        anchors: [
          { id: '5', ref: { item: 'b1', port: 'port-1' } },
          { id: '6', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'cB2',
        anchors: [
          { id: '7', ref: { item: 'b2', port: 'port-1' } },
          { id: '8', ref: { item: 'sw', port: 'port-bottom-2' } }
        ]
      }
    ];

    const result = arrangeDensityGroups({
      items,
      modelItems: modelItems as never,
      connectors
    });
    expect(result.groupCount).toBe(2);
    expect(result.movedNodes).toBeGreaterThan(0);

    const tileOf = (id: string) => {
      return result.targets[id] ?? items.find((item) => item.id === id)!.tile;
    };
    const placed = items.map((item) => {
      return { ...item, tile: tileOf(item.id) };
    });
    const after = computeDensityGroups({ items: placed, modelItems });
    const groupOf = (id: string) => {
      return after.find((g) => g.memberIds.includes(id));
    };
    const groupA = groupOf('a1')!;
    const groupB = groupOf('b1')!;
    expect(groupA).toBeDefined();
    expect(groupB).toBeDefined();

    expect(groupB.circle.cx).toBeLessThan(groupA.circle.cx);
    expect(
      circlesOverlap(groupA.circle, groupB.circle, GROUP_CIRCLE_GAP)
    ).toBe(false);

    const swItem = placed.find((i) => i.id === 'sw')!;
    const hub = {
      x: swItem.tile.x + sw.width / 2,
      y: swItem.tile.y + sw.height / 2
    };
    const hubR = Math.sqrt((sw.width / 2) ** 2 + (sw.height / 2) ** 2) + 2;
    const corridorA = buildBusCorridor({
      groupBounds: groupA.bounds,
      groupCenter: { x: groupA.circle.cx, y: groupA.circle.cy },
      hub,
      hubR,
      thickness: estimateMagistralaThickness(2)
    });
    const corridorB = buildBusCorridor({
      groupBounds: groupB.bounds,
      groupCenter: { x: groupB.circle.cx, y: groupB.circle.cy },
      hub,
      hubR,
      thickness: estimateMagistralaThickness(2)
    });
    expect(circleHitsCorridor(groupA.circle, corridorB)).toBe(false);
    expect(circleHitsCorridor(groupB.circle, corridorA)).toBe(false);

    expect(groupA.circle.cy).toBeLessThanOrEqual(hub.y + 1);
    expect(groupB.circle.cy).toBeLessThanOrEqual(hub.y + 1);

    expect(
      countP2PCrossings([
        { from: { x: groupA.circle.cx, y: groupA.circle.cy }, to: hub },
        { from: { x: groupB.circle.cx, y: groupB.circle.cy }, to: hub }
      ])
    ).toBe(0);
  });

  test('wide magistrala forces the other group off its corridor', () => {
    const items = [
      { id: 'f1', tile: { x: 0, y: 0 } },
      { id: 'f2', tile: { x: w, y: 0 } },
      { id: 'f3', tile: { x: 0, y: h } },
      { id: 'f4', tile: { x: w, y: h } },
      { id: 't1', tile: { x: 80, y: 0 } },
      { id: 'sw', tile: { x: 50, y: 40 } }
    ];
    const modelItems = [
      { id: 'f1', icon: SHAPE_2D_PC_ID, name: 'f1' },
      { id: 'f2', icon: SHAPE_2D_PC_ID, name: 'f2' },
      { id: 'f3', icon: SHAPE_2D_PC_ID, name: 'f3' },
      { id: 'f4', icon: SHAPE_2D_PC_ID, name: 'f4' },
      { id: 't1', icon: SHAPE_2D_PC_ID, name: 't1' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'cf1',
        anchors: [
          { id: '1', ref: { item: 'f1', port: 'port-1' } },
          { id: '2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'cf2',
        anchors: [
          { id: '3', ref: { item: 'f2', port: 'port-1' } },
          { id: '4', ref: { item: 'sw', port: 'port-bottom-2' } }
        ]
      },
      {
        id: 'cf3',
        anchors: [
          { id: '5', ref: { item: 'f3', port: 'port-1' } },
          { id: '6', ref: { item: 'sw', port: 'port-bottom-3' } }
        ]
      },
      {
        id: 'cf4',
        anchors: [
          { id: '7', ref: { item: 'f4', port: 'port-1' } },
          { id: '8', ref: { item: 'sw', port: 'port-bottom-4' } }
        ]
      },
      {
        id: 'ct1',
        anchors: [
          { id: '9', ref: { item: 't1', port: 'port-1' } },
          { id: '10', ref: { item: 'sw', port: 'port-bottom-8' } }
        ]
      }
    ];

    const result = arrangeDensityGroups({
      items,
      modelItems: modelItems as never,
      connectors
    });
    expect(result.groupCount).toBe(2);

    const tileOf = (id: string) => {
      return result.targets[id] ?? items.find((item) => item.id === id)!.tile;
    };
    const placed = items.map((item) => {
      return { ...item, tile: tileOf(item.id) };
    });
    const after = computeDensityGroups({ items: placed, modelItems });
    const fat = after.find((g) => g.memberIds.includes('f1'))!;
    const thin = after.find((g) => g.memberIds.includes('t1'))!;
    expect(fat).toBeDefined();
    expect(thin).toBeDefined();

    const swItem = placed.find((i) => i.id === 'sw')!;
    const hub = {
      x: swItem.tile.x + sw.width / 2,
      y: swItem.tile.y + sw.height / 2
    };
    const hubR = Math.sqrt((sw.width / 2) ** 2 + (sw.height / 2) ** 2) + 2;
    const fatCorridor = buildBusCorridor({
      groupBounds: fat.bounds,
      groupCenter: { x: fat.circle.cx, y: fat.circle.cy },
      hub,
      hubR,
      thickness: estimateMagistralaThickness(4)
    });
    expect(circleHitsCorridor(thin.circle, fatCorridor)).toBe(false);
  });

  test('keeps relative layout inside a group (rigid translate)', () => {
    const items = [
      { id: 'a1', tile: { x: 0, y: 0 } },
      { id: 'a2', tile: { x: w, y: 0 } },
      { id: 'sw', tile: { x: w * 2 + 40, y: 20 } }
    ];
    const modelItems = [
      { id: 'a1', icon: SHAPE_2D_PC_ID, name: 'a1' },
      { id: 'a2', icon: SHAPE_2D_PC_ID, name: 'a2' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'c1',
        anchors: [
          { id: '1', ref: { item: 'a1', port: 'port-1' } },
          { id: '2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'c2',
        anchors: [
          { id: '3', ref: { item: 'a2', port: 'port-1' } },
          { id: '4', ref: { item: 'sw', port: 'port-bottom-2' } }
        ]
      }
    ];

    const result = arrangeDensityGroups({
      items,
      modelItems: modelItems as never,
      connectors
    });
    const t1 = result.targets.a1 ?? items[0].tile;
    const t2 = result.targets.a2 ?? items[1].tile;
    expect(t2.x - t1.x).toBe(w);
    expect(t2.y - t1.y).toBe(0);
    // All placed tiles sit on the integer grid.
    Object.values(result.targets).forEach((tile) => {
      expect(Number.isInteger(tile.x)).toBe(true);
      expect(Number.isInteger(tile.y)).toBe(true);
    });
  });

  test('snaps group translation to gridStep', () => {
    const snapped = snapGroupTranslation({
      bounds: { x: 0, y: 0, w: 18, h: 9 },
      rawDx: 10.4,
      rawDy: -3.7,
      gridStep: { x: 1, y: 1 }
    });
    expect(snapped).toEqual({ dx: 10, dy: -4 });
    const rack = snapGroupTranslation({
      bounds: { x: 0, y: 0, w: 18, h: 9 },
      rawDx: 14,
      rawDy: 20,
      gridStep: { x: 9, y: 9 }
    });
    expect(rack.dx % 9).toBe(0);
    expect(rack.dy % 9).toBe(0);
  });

  test('leaf switch group and PC group circles do not overlap', () => {
    // Mirrors the SZAFA scene: SW-FLOOR (leaf switch) + PC pair → same core hub.
    const items = [
      { id: 'floor', tile: { x: 30, y: 20 } },
      { id: 'pc1', tile: { x: 70, y: 20 } },
      { id: 'pc2', tile: { x: 70 + w, y: 20 } },
      { id: 'core', tile: { x: 0, y: 20 } }
    ];
    const modelItems = [
      { id: 'floor', icon: SHAPE_2D_SWITCH_ID, name: 'floor' },
      { id: 'pc1', icon: SHAPE_2D_PC_ID, name: 'pc1' },
      { id: 'pc2', icon: SHAPE_2D_PC_ID, name: 'pc2' },
      { id: 'core', icon: SHAPE_2D_SWITCH_ID, name: 'core' }
    ];
    const connectors = [
      {
        id: 'cFloor',
        anchors: [
          { id: '1', ref: { item: 'floor', port: 'port-bottom-1' } },
          { id: '2', ref: { item: 'core', port: 'port-bottom-8' } }
        ]
      },
      {
        id: 'cPc1',
        anchors: [
          { id: '3', ref: { item: 'pc1', port: 'port-1' } },
          { id: '4', ref: { item: 'core', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'cPc2',
        anchors: [
          { id: '5', ref: { item: 'pc2', port: 'port-1' } },
          { id: '6', ref: { item: 'core', port: 'port-bottom-2' } }
        ]
      }
    ];

    const result = arrangeDensityGroups({
      items,
      modelItems: modelItems as never,
      connectors
    });
    expect(result.groupCount).toBeGreaterThanOrEqual(2);

    const tileOf = (id: string) => {
      return result.targets[id] ?? items.find((item) => item.id === id)!.tile;
    };
    const placed = items.map((item) => {
      return { ...item, tile: tileOf(item.id) };
    });
    const after = computeDensityGroups({ items: placed, modelItems });
    const floorG = after.find((g) => g.memberIds.includes('floor'))!;
    const pcs = after.find((g) => g.memberIds.includes('pc1'))!;
    expect(floorG).toBeDefined();
    expect(pcs).toBeDefined();
    expect(floorG.memberIds.sort().join()).not.toBe(pcs.memberIds.sort().join());
    expect(circlesOverlap(floorG.circle, pcs.circle, GROUP_CIRCLE_GAP)).toBe(
      false
    );
  });

  test('PC group around leaf switch sits opposite the uplink (above FLOOR)', () => {
    // Mirrors the screenshot: CORE below, FLOOR leaf, PC-MTG under FLOOR today.
    // After arrange, PCs must sit on the anti-uplink side (above FLOOR) so
    // FLOOR→CORE and PC→FLOOR cables do not weave.
    const items = [
      { id: 'floor', tile: { x: 40, y: 30 } },
      { id: 'pc1', tile: { x: 55, y: 70 } },
      { id: 'pc2', tile: { x: 55 + w, y: 70 } },
      { id: 'labSw', tile: { x: 90, y: 40 } },
      { id: 'labPc', tile: { x: 90 + sw.width + 2, y: 40 } },
      { id: 'core', tile: { x: 50, y: 90 } }
    ];
    const modelItems = [
      { id: 'floor', icon: SHAPE_2D_SWITCH_ID, name: 'floor' },
      { id: 'pc1', icon: SHAPE_2D_PC_ID, name: 'pc1' },
      { id: 'pc2', icon: SHAPE_2D_PC_ID, name: 'pc2' },
      { id: 'labSw', icon: SHAPE_2D_SWITCH_ID, name: 'labSw' },
      { id: 'labPc', icon: SHAPE_2D_PC_ID, name: 'labPc' },
      { id: 'core', icon: SHAPE_2D_SWITCH_ID, name: 'core' }
    ];
    const connectors = [
      {
        id: 'cFloorCore',
        anchors: [
          { id: '1', ref: { item: 'floor', port: 'port-bottom-1' } },
          { id: '2', ref: { item: 'core', port: 'port-bottom-8' } }
        ]
      },
      {
        id: 'cPc1',
        anchors: [
          { id: '3', ref: { item: 'pc1', port: 'port-1' } },
          { id: '4', ref: { item: 'floor', port: 'port-bottom-2' } }
        ]
      },
      {
        id: 'cPc2',
        anchors: [
          { id: '5', ref: { item: 'pc2', port: 'port-1' } },
          { id: '6', ref: { item: 'floor', port: 'port-bottom-3' } }
        ]
      },
      {
        id: 'cLab',
        anchors: [
          { id: '7', ref: { item: 'labSw', port: 'port-bottom-1' } },
          { id: '8', ref: { item: 'core', port: 'port-bottom-4' } }
        ]
      },
      {
        id: 'cLabPc',
        anchors: [
          { id: '9', ref: { item: 'labPc', port: 'port-1' } },
          { id: '10', ref: { item: 'labSw', port: 'port-bottom-2' } }
        ]
      }
    ];

    const result = arrangeDensityGroups({
      items,
      modelItems: modelItems as never,
      connectors
    });
    expect(result.groupCount).toBeGreaterThanOrEqual(2);

    const tileOf = (id: string) => {
      return result.targets[id] ?? items.find((item) => item.id === id)!.tile;
    };
    // CORE must stay put (hub); FLOOR is the movable leaf — never invert.
    expect(result.targets.core).toBeUndefined();
    expect(result.targets.floor).toBeTruthy();
    expect(result.targets.pc1 || result.targets.pc2).toBeTruthy();

    const floorY = tileOf('floor').y;
    const pcsY = (tileOf('pc1').y + tileOf('pc2').y) / 2;
    // Screen Y grows downward — "above FLOOR" means smaller Y than FLOOR.
    expect(pcsY).toBeLessThan(floorY);
  });

  test('inner group is not left on outer group wire path to hub', () => {
    // Outer 4-node cluster + small 2-node cluster start co-linear with the hub
    // (same Y). After arrange, neither circle may sit on the other's spoke.
    const items = [
      { id: 'o1', tile: { x: 0, y: 0 } },
      { id: 'o2', tile: { x: w, y: 0 } },
      { id: 'o3', tile: { x: 0, y: h } },
      { id: 'o4', tile: { x: w, y: h } },
      { id: 'i1', tile: { x: 50, y: 2 } },
      { id: 'i2', tile: { x: 50 + w, y: 2 } },
      { id: 'sw', tile: { x: 100, y: 0 } }
    ];
    const modelItems = [
      { id: 'o1', icon: SHAPE_2D_PC_ID, name: 'o1' },
      { id: 'o2', icon: SHAPE_2D_PC_ID, name: 'o2' },
      { id: 'o3', icon: SHAPE_2D_PC_ID, name: 'o3' },
      { id: 'o4', icon: SHAPE_2D_PC_ID, name: 'o4' },
      { id: 'i1', icon: SHAPE_2D_PC_ID, name: 'i1' },
      { id: 'i2', icon: SHAPE_2D_PC_ID, name: 'i2' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'co1',
        anchors: [
          { id: '1', ref: { item: 'o1', port: 'port-1' } },
          { id: '2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'co2',
        anchors: [
          { id: '3', ref: { item: 'o2', port: 'port-1' } },
          { id: '4', ref: { item: 'sw', port: 'port-bottom-2' } }
        ]
      },
      {
        id: 'co3',
        anchors: [
          { id: '5', ref: { item: 'o3', port: 'port-1' } },
          { id: '6', ref: { item: 'sw', port: 'port-bottom-3' } }
        ]
      },
      {
        id: 'co4',
        anchors: [
          { id: '7', ref: { item: 'o4', port: 'port-1' } },
          { id: '8', ref: { item: 'sw', port: 'port-bottom-4' } }
        ]
      },
      {
        id: 'ci1',
        anchors: [
          { id: '9', ref: { item: 'i1', port: 'port-1' } },
          { id: '10', ref: { item: 'sw', port: 'port-bottom-5' } }
        ]
      },
      {
        id: 'ci2',
        anchors: [
          { id: '11', ref: { item: 'i2', port: 'port-1' } },
          { id: '12', ref: { item: 'sw', port: 'port-bottom-6' } }
        ]
      }
    ];

    const result = arrangeDensityGroups({
      items,
      modelItems: modelItems as never,
      connectors
    });
    expect(result.groupCount).toBe(2);

    const tileOf = (id: string) => {
      return result.targets[id] ?? items.find((item) => item.id === id)!.tile;
    };
    const placed = items.map((item) => {
      return { ...item, tile: tileOf(item.id) };
    });
    const after = computeDensityGroups({ items: placed, modelItems });
    const outer = after.find((g) => g.memberIds.includes('o1'))!;
    const inner = after.find((g) => g.memberIds.includes('i1'))!;
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();

    const swItem = placed.find((item) => item.id === 'sw')!;
    const hub = {
      x: swItem.tile.x + sw.width / 2,
      y: swItem.tile.y + sw.height / 2
    };
    const hubR = 8;
    const outerSpoke = buildSpokeCorridor({
      groupCenter: { x: outer.circle.cx, y: outer.circle.cy },
      groupR: outer.circle.r,
      hub,
      hubR,
      halfWidth: estimateSpokeHalfWidth(outer.circle.r, 4)
    });
    const innerSpoke = buildSpokeCorridor({
      groupCenter: { x: inner.circle.cx, y: inner.circle.cy },
      groupR: inner.circle.r,
      hub,
      hubR,
      halfWidth: estimateSpokeHalfWidth(inner.circle.r, 2)
    });
    expect(circleHitsSpokeCorridor(inner.circle, outerSpoke)).toBe(false);
    expect(circleHitsSpokeCorridor(outer.circle, innerSpoke)).toBe(false);
  });

  test('skips locked groups', () => {
    const items = [
      { id: 'a1', tile: { x: 0, y: 0 }, locked: true },
      { id: 'a2', tile: { x: w, y: 0 }, locked: true },
      { id: 'sw', tile: { x: w * 2 + 40, y: 0 } }
    ];
    const modelItems = [
      { id: 'a1', icon: SHAPE_2D_PC_ID, name: 'a1' },
      { id: 'a2', icon: SHAPE_2D_PC_ID, name: 'a2' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'c1',
        anchors: [
          { id: '1', ref: { item: 'a1', port: 'port-1' } },
          { id: '2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      }
    ];
    const result = arrangeDensityGroups({
      items,
      modelItems: modelItems as never,
      connectors
    });
    expect(result.groupCount).toBe(0);
    expect(result.movedNodes).toBe(0);
  });

  test('pushes past an obstacle so circles stay clear', () => {
    const items = [
      { id: 'a1', tile: { x: 0, y: 40 } },
      { id: 'a2', tile: { x: w, y: 40 } },
      { id: 'obs', tile: { x: 0, y: 0 } },
      { id: 'sw', tile: { x: w * 2 + 30, y: 20 } }
    ];
    const modelItems = [
      { id: 'a1', icon: SHAPE_2D_PC_ID, name: 'a1' },
      { id: 'a2', icon: SHAPE_2D_PC_ID, name: 'a2' },
      { id: 'obs', icon: SHAPE_2D_PC_ID, name: 'obs' },
      { id: 'sw', icon: SHAPE_2D_SWITCH_ID, name: 'sw' }
    ];
    const connectors = [
      {
        id: 'c1',
        anchors: [
          { id: '1', ref: { item: 'a1', port: 'port-1' } },
          { id: '2', ref: { item: 'sw', port: 'port-bottom-1' } }
        ]
      },
      {
        id: 'c2',
        anchors: [
          { id: '3', ref: { item: 'a2', port: 'port-1' } },
          { id: '4', ref: { item: 'sw', port: 'port-bottom-2' } }
        ]
      }
    ];

    const result = arrangeDensityGroups({
      items,
      modelItems: modelItems as never,
      connectors
    });
    const tileOf = (id: string) => {
      return result.targets[id] ?? items.find((item) => item.id === id)!.tile;
    };
    const placed = items.map((item) => {
      return { ...item, tile: tileOf(item.id) };
    });
    const groups = computeDensityGroups({ items: placed, modelItems });
    const leaf = groups.find((g) => g.memberIds.includes('a1'))!;
    const obstacle = groups.find((g) => g.memberIds.includes('obs'))!;
    expect(leaf).toBeDefined();
    expect(obstacle).toBeDefined();
    expect(circlesOverlap(leaf.circle, obstacle.circle, GROUP_CIRCLE_GAP)).toBe(
      false
    );
  });
});
