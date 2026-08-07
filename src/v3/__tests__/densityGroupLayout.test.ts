import { SHAPE_2D_PC_ID, SHAPE_2D_SWITCH_ID, getModelItemSize } from 'src/config';
import {
  arrangeDensityGroups,
  circlesOverlap,
  countP2PCrossings,
  findClearSpokeDistance,
  pointOnSpoke,
  spokeAngleForIndex,
  GROUP_CIRCLE_GAP
} from '../densityGroupLayout';
import { computeDensityGroups, DENSITY_CIRCLE_PAD_TILES } from '../densityGroups';

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
      // Bottom would be π/2 — not in this range.
      const y = Math.sin(a);
      // Top half: sin ≤ 0 in standard maths (Y up); with Y-down screen, sin(3π/2)=-1 is up.
      expect(y).toBeLessThanOrEqual(1e-9);
    }
  });

  test('low index is more leftward than high index', () => {
    const a0 = spokeAngleForIndex(0, 4);
    const a3 = spokeAngleForIndex(3, 4);
    expect(Math.cos(a0)).toBeLessThan(Math.cos(a3));
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
    const angle = Math.PI; // left
    const groupR = 5;
    const hubR = 4;
    // Obstacle sitting on the left spoke just outside the hub.
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

  test('circles are larger with the layout pad', () => {
    expect(DENSITY_CIRCLE_PAD_TILES).toBeGreaterThanOrEqual(3);
    const items = [
      { id: 'a', tile: { x: 0, y: 0 } },
      { id: 'b', tile: { x: w, y: 0 } }
    ];
    const modelItems = items.map((item) => {
      return { id: item.id, icon: SHAPE_2D_PC_ID };
    });
    const [group] = computeDensityGroups({ items, modelItems });
    const bare = Math.sqrt((group.bounds.w / 2) ** 2 + (group.bounds.h / 2) ** 2);
    expect(group.circle.r).toBeGreaterThanOrEqual(bare + 3);
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
    // Crossed wiring: top group → high ports; bottom group → low ports.
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

    // Low ports (B) → earlier spoke (more left); high ports (A) → more right.
    expect(groupB.circle.cx).toBeLessThan(groupA.circle.cx);

    // Circles must not overlap.
    expect(
      circlesOverlap(groupA.circle, groupB.circle, GROUP_CIRCLE_GAP)
    ).toBe(false);

    // Neither group prefers the bottom of the hub (centres not below switch).
    const swItem = placed.find((i) => i.id === 'sw')!;
    const hubY = swItem.tile.y + sw.height / 2;
    expect(groupA.circle.cy).toBeLessThanOrEqual(hubY + 1);
    expect(groupB.circle.cy).toBeLessThanOrEqual(hubY + 1);

    // Straight P2P group-centre → hub must not cross.
    const hub = {
      x: swItem.tile.x + sw.width / 2,
      y: hubY
    };
    expect(
      countP2PCrossings([
        { from: { x: groupA.circle.cx, y: groupA.circle.cy }, to: hub },
        { from: { x: groupB.circle.cx, y: groupB.circle.cy }, to: hub }
      ])
    ).toBe(0);
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
