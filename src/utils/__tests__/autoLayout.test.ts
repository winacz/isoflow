import { ViewItem } from 'src/types';
import {
  SHAPE_2D_SWITCH_ID,
  SHAPE_2D_PC_ID,
  SHAPE_2D_LAYOUT_GAP,
  getShape2dSize,
  getShape2dPorts
} from 'src/config';
import {
  countCrossings,
  countEdgeOverlaps,
  segmentsCross
} from '../routeGeometry';
import { buildLayoutGraph } from '../autoLayout/graph';
import {
  placeNodes,
  placeBySwapping,
  buildVlanMap,
  countBilayerCrossings
} from '../autoLayout/place';
import { routeCables } from '../autoLayout/router';
import { runAutoLayout } from '../autoLayout';
import { LayoutConnector, ModelItemRef } from '../autoLayout/types';

const item = (id: string, x: number, y: number): ViewItem => {
  return { id, tile: { x, y } } as ViewItem;
};

const model = (id: string, icon: string): ModelItemRef => {
  return { id, icon };
};

const cable = (
  id: string,
  aId: string,
  aPort: string,
  bId: string,
  bPort: string
): LayoutConnector => {
  return {
    id,
    anchors: [
      { id: `${id}-a`, ref: { item: aId, port: aPort } },
      { id: `${id}-b`, ref: { item: bId, port: bPort } }
    ]
  };
};

describe('routeGeometry', () => {
  test('segmentsCross detects a proper transversal crossing', () => {
    expect(
      segmentsCross(
        { x: 0, y: 5 },
        { x: 10, y: 5 },
        { x: 5, y: 0 },
        { x: 5, y: 10 }
      )
    ).toBe(true);
  });

  test('segmentsCross detects the diagonal "X" that shares no tile or edge', () => {
    // Two diagonals over the same cell, swapping corners.
    expect(
      segmentsCross(
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 }
      )
    ).toBe(true);
  });

  test('segmentsCross ignores a shared endpoint (fan out of one port)', () => {
    expect(
      segmentsCross(
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 5 }
      )
    ).toBe(false);
  });

  test('segmentsCross ignores parallel / collinear segments', () => {
    expect(
      segmentsCross(
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 2, y: 0 },
        { x: 7, y: 0 }
      )
    ).toBe(false);
  });

  test('countCrossings counts one crossing for a simple X', () => {
    const horizontal = [
      { x: 0, y: 5 },
      { x: 10, y: 5 }
    ];
    const vertical = [
      { x: 5, y: 0 },
      { x: 5, y: 10 }
    ];
    expect(countCrossings([horizontal, vertical])).toBe(1);
  });

  test('countEdgeOverlaps counts cables drawn on top of each other', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ];
    const b = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ];
    // Two shared edges, one duplicate cable each.
    expect(countEdgeOverlaps([a, b])).toBe(2);
    expect(countEdgeOverlaps([a])).toBe(0);
  });
});

describe('countBilayerCrossings', () => {
  const adjacency = new Map<string, Set<string>>([
    ['u1', new Set(['l2'])],
    ['u2', new Set(['l1'])]
  ]);

  test('counts an inversion between two layers', () => {
    expect(countBilayerCrossings(['u1', 'u2'], ['l1', 'l2'], adjacency)).toBe(
      1
    );
  });

  test('reports zero once the lower layer is reordered', () => {
    expect(countBilayerCrossings(['u1', 'u2'], ['l2', 'l1'], adjacency)).toBe(
      0
    );
  });
});

describe('placeNodes', () => {
  const switchSize = getShape2dSize(SHAPE_2D_SWITCH_ID);
  const pcSize = getShape2dSize(SHAPE_2D_PC_ID);

  const overlaps = (
    a: { tile: { x: number; y: number }; w: number; h: number },
    b: { tile: { x: number; y: number }; w: number; h: number }
  ) => {
    return (
      a.tile.x < b.tile.x + b.w &&
      a.tile.x + a.w > b.tile.x &&
      a.tile.y < b.tile.y + b.h &&
      a.tile.y + a.h > b.tile.y
    );
  };

  test('never produces overlapping device footprints', () => {
    // Deliberately stack every node on the same tile.
    const items = [
      item('sw', 0, 0),
      item('pc1', 0, 0),
      item('pc2', 0, 0),
      item('pc3', 0, 0),
      item('pc4', 0, 0)
    ];
    const modelItems = [
      model('sw', SHAPE_2D_SWITCH_ID),
      model('pc1', SHAPE_2D_PC_ID),
      model('pc2', SHAPE_2D_PC_ID),
      model('pc3', SHAPE_2D_PC_ID),
      model('pc4', SHAPE_2D_PC_ID)
    ];
    const ports = getShape2dPorts(SHAPE_2D_SWITCH_ID);
    const connectors = [
      cable('c1', 'sw', ports[0].id, 'pc1', 'port-1'),
      cable('c2', 'sw', ports[1].id, 'pc2', 'port-1'),
      cable('c3', 'sw', ports[2].id, 'pc3', 'port-1'),
      cable('c4', 'sw', ports[3].id, 'pc4', 'port-1')
    ];

    const graph = buildLayoutGraph({
      scopeItems: items,
      allItems: items,
      modelItems,
      connectors
    });
    const { targets } = placeNodes({ graph });

    const placed = items.map((viewItem) => {
      const tile = targets[viewItem.id] ?? viewItem.tile;
      const size = viewItem.id === 'sw' ? switchSize : pcSize;
      return {
        id: viewItem.id,
        tile,
        w: size?.width ?? 1,
        h: size?.height ?? 1
      };
    });

    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        expect(overlaps(placed[i], placed[j])).toBe(false);
      }
    }
  });

  test('orders leaves by the switch port they attach to', () => {
    const items = [
      item('sw', 0, 0),
      // Reversed on purpose: pc1 (port 1) starts to the RIGHT of pc2 (port 2).
      item('pc1', 40, 30),
      item('pc2', 0, 30)
    ];
    const modelItems = [
      model('sw', SHAPE_2D_SWITCH_ID),
      model('pc1', SHAPE_2D_PC_ID),
      model('pc2', SHAPE_2D_PC_ID)
    ];
    const ports = getShape2dPorts(SHAPE_2D_SWITCH_ID);
    const connectors = [
      cable('c1', 'sw', ports[0].id, 'pc1', 'port-1'),
      cable('c2', 'sw', ports[1].id, 'pc2', 'port-1')
    ];

    const graph = buildLayoutGraph({
      scopeItems: items,
      allItems: items,
      modelItems,
      connectors
    });
    const { targets } = placeNodes({ graph });

    const pc1 = targets.pc1 ?? items[1].tile;
    const pc2 = targets.pc2 ?? items[2].tile;

    // pc1 sits on the lower port number, so it must end up left of pc2.
    expect(pc1.x).toBeLessThan(pc2.x);
  });
});

describe('VLAN grouping', () => {
  test('same VLAN sits together, a different VLAN starts a new row', () => {
    const items = [
      item('sw', 0, 100),
      item('a1', 0, 0),
      item('b1', 30, 0),
      item('a2', 60, 0),
      item('b2', 90, 0)
    ];
    const modelItems: ModelItemRef[] = [
      {
        id: 'sw',
        icon: SHAPE_2D_SWITCH_ID,
        // a* on VLAN 10, b* on VLAN 20 — deliberately interleaved by port.
        ports: {
          'port-top-1': { vlan: '10' },
          'port-top-2': { vlan: '20' },
          'port-top-3': { vlan: '10' },
          'port-top-4': { vlan: '20' }
        }
      },
      model('a1', SHAPE_2D_PC_ID),
      model('b1', SHAPE_2D_PC_ID),
      model('a2', SHAPE_2D_PC_ID),
      model('b2', SHAPE_2D_PC_ID)
    ];
    const ports = getShape2dPorts(SHAPE_2D_SWITCH_ID);
    const connectors = [
      cable('c1', 'sw', ports[0].id, 'a1', 'port-1'),
      cable('c2', 'sw', ports[1].id, 'b1', 'port-1'),
      cable('c3', 'sw', ports[2].id, 'a2', 'port-1'),
      cable('c4', 'sw', ports[3].id, 'b2', 'port-1')
    ];

    const graph = buildLayoutGraph({
      scopeItems: items,
      allItems: items,
      modelItems,
      connectors
    });

    expect(buildVlanMap(graph).get('a1')).toBe('10');
    expect(buildVlanMap(graph).get('b1')).toBe('20');

    const { targets } = placeNodes({ graph });
    const tileOf = (id: string) => {
      const original = items.find((viewItem) => {
        return viewItem.id === id;
      });
      return (targets[id] ?? original?.tile) as { x: number; y: number };
    };

    // Each VLAN gets its own row...
    expect(tileOf('a1').y).toBe(tileOf('a2').y);
    expect(tileOf('b1').y).toBe(tileOf('b2').y);
    expect(tileOf('a1').y).not.toBe(tileOf('b1').y);

    // ...and members of one VLAN sit closer than a device footprint + break.
    const pcWidth = getShape2dSize(SHAPE_2D_PC_ID)?.width ?? 9;
    expect(Math.abs(tileOf('a2').x - tileOf('a1').x)).toBeLessThanOrEqual(
      pcWidth + SHAPE_2D_LAYOUT_GAP
    );
  });
});

describe('placeBySwapping', () => {
  // Two PCs wired to switch ports in the opposite order to their positions:
  // the only fix that does not move anything is to trade their places.
  const buildInverted = () => {
    const items = [item('sw', 0, 0), item('pc1', 40, 30), item('pc2', 0, 30)];
    const modelItems = [
      model('sw', SHAPE_2D_SWITCH_ID),
      model('pc1', SHAPE_2D_PC_ID),
      model('pc2', SHAPE_2D_PC_ID)
    ];
    const ports = getShape2dPorts(SHAPE_2D_SWITCH_ID);
    const connectors = [
      cable('c1', 'sw', ports[0].id, 'pc1', 'port-1'),
      cable('c2', 'sw', ports[1].id, 'pc2', 'port-1')
    ];
    return { items, modelItems, connectors };
  };

  test('only permutes existing tiles — never invents new positions', () => {
    const { items, modelItems, connectors } = buildInverted();
    const graph = buildLayoutGraph({
      scopeItems: items,
      allItems: items,
      modelItems,
      connectors
    });

    const { targets } = placeBySwapping({ graph });

    const originalTiles = new Set(
      items.map((viewItem) => {
        return `${viewItem.tile.x},${viewItem.tile.y}`;
      })
    );

    Object.values(targets).forEach((tile) => {
      expect(originalTiles.has(`${tile.x},${tile.y}`)).toBe(true);
    });

    // The multiset of occupied tiles must be unchanged.
    const after = items
      .map((viewItem) => {
        const tile = targets[viewItem.id] ?? viewItem.tile;
        return `${tile.x},${tile.y}`;
      })
      .sort();
    const before = items
      .map((viewItem) => {
        return `${viewItem.tile.x},${viewItem.tile.y}`;
      })
      .sort();
    expect(after).toEqual(before);
  });

  test('swaps the inverted pair so the cables stop crossing', () => {
    const { items, modelItems, connectors } = buildInverted();

    const result = runAutoLayout({
      scopeItems: items,
      allItems: items,
      modelItems,
      connectors,
      options: { style: 'STRAIGHT', placement: 'swap' }
    });

    expect(result.metrics.crossingsAfter).toBeLessThan(
      result.metrics.crossingsBefore
    );
    // pc1 (port 1) ends up on the tile pc2 used to hold, and vice versa.
    expect(result.targets.pc1).toEqual({ x: 0, y: 30 });
    expect(result.targets.pc2).toEqual({ x: 40, y: 30 });
  });

  test('puts a row of devices into switch-port order', () => {
    // A row above the switch (like the 2D plan), wired in scrambled port
    // order: port 1 → rightmost device, port 4 → leftmost. Every cable then
    // has to cross its neighbours on the way down to the rack.
    const items = [
      item('sw', 0, 100),
      item('d1', 0, 0),
      item('d2', 30, 0),
      item('d3', 60, 0),
      item('d4', 90, 0)
    ];
    const modelItems = [
      model('sw', SHAPE_2D_SWITCH_ID),
      model('d1', SHAPE_2D_PC_ID),
      model('d2', SHAPE_2D_PC_ID),
      model('d3', SHAPE_2D_PC_ID),
      model('d4', SHAPE_2D_PC_ID)
    ];
    const ports = getShape2dPorts(SHAPE_2D_SWITCH_ID);
    const connectors = [
      cable('c1', 'sw', ports[3].id, 'd1', 'port-1'),
      cable('c2', 'sw', ports[2].id, 'd2', 'port-1'),
      cable('c3', 'sw', ports[1].id, 'd3', 'port-1'),
      cable('c4', 'sw', ports[0].id, 'd4', 'port-1')
    ];

    const graph = buildLayoutGraph({
      scopeItems: items,
      allItems: items,
      modelItems,
      connectors
    });
    const { targets } = placeBySwapping({ graph });

    const xOf = (id: string) => {
      const original = items.find((viewItem) => {
        return viewItem.id === id;
      });
      return (targets[id] ?? original?.tile)?.x as number;
    };

    // Lowest port number must end up leftmost, so the fan never crosses.
    expect(xOf('d4')).toBeLessThan(xOf('d3'));
    expect(xOf('d3')).toBeLessThan(xOf('d2'));
    expect(xOf('d2')).toBeLessThan(xOf('d1'));

    // Still a pure permutation of the original slots.
    const after = items
      .map((viewItem) => {
        const tile = targets[viewItem.id] ?? viewItem.tile;
        return `${tile.x},${tile.y}`;
      })
      .sort();
    const before = items
      .map((viewItem) => {
        return `${viewItem.tile.x},${viewItem.tile.y}`;
      })
      .sort();
    expect(after).toEqual(before);
  });

  test('leaves a plan alone when nothing can be improved', () => {
    const items = [item('sw', 0, 0), item('pc1', 0, 30)];
    const modelItems = [
      model('sw', SHAPE_2D_SWITCH_ID),
      model('pc1', SHAPE_2D_PC_ID)
    ];
    const ports = getShape2dPorts(SHAPE_2D_SWITCH_ID);
    const connectors = [cable('c1', 'sw', ports[0].id, 'pc1', 'port-1')];

    const graph = buildLayoutGraph({
      scopeItems: items,
      allItems: items,
      modelItems,
      connectors
    });

    expect(placeBySwapping({ graph }).targets).toEqual({});
  });
});

describe('routeCables', () => {
  const buildStar = () => {
    const items = [
      item('sw', 0, 0),
      item('pc1', 0, 30),
      item('pc2', 20, 30),
      item('pc3', 40, 30)
    ];
    const modelItems = [
      model('sw', SHAPE_2D_SWITCH_ID),
      model('pc1', SHAPE_2D_PC_ID),
      model('pc2', SHAPE_2D_PC_ID),
      model('pc3', SHAPE_2D_PC_ID)
    ];
    const ports = getShape2dPorts(SHAPE_2D_SWITCH_ID);
    const connectors = [
      cable('c1', 'sw', ports[0].id, 'pc1', 'port-1'),
      cable('c2', 'sw', ports[1].id, 'pc2', 'port-1'),
      cable('c3', 'sw', ports[2].id, 'pc3', 'port-1')
    ];
    return { items, modelItems, connectors };
  };

  test('routes never enter a device footprint', () => {
    const { items, modelItems, connectors } = buildStar();
    const graph = buildLayoutGraph({
      scopeItems: items,
      allItems: items,
      modelItems,
      connectors
    });

    const { paths } = routeCables({ graph, items, style: 'ORTHOGONAL' });
    expect(paths.length).toBe(3);

    // Tiles a cable may legally occupy inside a device: the port itself and
    // the straight exit channel running out through the chassis face. Anything
    // else inside a footprint means the route cut through hardware.
    const normals: Record<string, { x: number; y: number }> = {
      TOP: { x: 0, y: -1 },
      BOTTOM: { x: 0, y: 1 },
      LEFT: { x: -1, y: 0 },
      RIGHT: { x: 1, y: 0 }
    };

    const portTiles = new Set<string>();
    items.forEach((viewItem) => {
      const modelItem = modelItems.find((m) => {
        return m.id === viewItem.id;
      });
      const size = getShape2dSize(modelItem?.icon ?? '');
      if (!size) return;

      getShape2dPorts(modelItem?.icon ?? '').forEach((port) => {
        const px = Math.round(viewItem.tile.x + port.tile.x);
        const py = Math.round(viewItem.tile.y + port.tile.y);
        portTiles.add(`${px},${py}`);

        const normal = normals[port.side];
        if (!normal) return;

        let cx = px;
        let cy = py;
        for (let step = 0; step < size.width + size.height + 2; step += 1) {
          cx += normal.x;
          cy += normal.y;
          portTiles.add(`${cx},${cy}`);
          const outside =
            cx < viewItem.tile.x ||
            cx > viewItem.tile.x + size.width - 1 ||
            cy < viewItem.tile.y ||
            cy > viewItem.tile.y + size.height - 1;
          if (outside) break;
        }
      });
    });

    const blocked = new Set<string>();
    items.forEach((viewItem) => {
      const modelItem = modelItems.find((m) => {
        return m.id === viewItem.id;
      });
      const size = getShape2dSize(modelItem?.icon ?? '');
      if (!size) return;
      for (let x = 0; x < size.width; x += 1) {
        for (let y = 0; y < size.height; y += 1) {
          const k = `${viewItem.tile.x + x},${viewItem.tile.y + y}`;
          if (!portTiles.has(k)) blocked.add(k);
        }
      }
    });

    paths.forEach((path) => {
      path.forEach((tile) => {
        expect(blocked.has(`${tile.x},${tile.y}`)).toBe(false);
      });
    });
  });

  test('cables are not drawn on top of each other', () => {
    const { items, modelItems, connectors } = buildStar();
    const graph = buildLayoutGraph({
      scopeItems: items,
      allItems: items,
      modelItems,
      connectors
    });

    const { paths } = routeCables({ graph, items, style: 'ORTHOGONAL' });
    expect(countEdgeOverlaps(paths)).toBe(0);
  });
});

describe('runAutoLayout', () => {
  test('reports metrics and honours placement: none', () => {
    const items = [item('sw', 0, 0), item('pc1', 40, 30), item('pc2', 0, 30)];
    const modelItems = [
      model('sw', SHAPE_2D_SWITCH_ID),
      model('pc1', SHAPE_2D_PC_ID),
      model('pc2', SHAPE_2D_PC_ID)
    ];
    const ports = getShape2dPorts(SHAPE_2D_SWITCH_ID);
    const connectors = [
      cable('c1', 'sw', ports[0].id, 'pc1', 'port-1'),
      cable('c2', 'sw', ports[1].id, 'pc2', 'port-1')
    ];

    const result = runAutoLayout({
      scopeItems: items,
      allItems: items,
      modelItems,
      connectors,
      options: { style: 'ORTHOGONAL', placement: 'none' }
    });

    expect(result.targets).toEqual({});
    expect(result.metrics.movedNodes).toBe(0);
    expect(result.metrics.cables).toBe(2);
    // Cables still never share an edge, whatever the node positions.
    expect(result.metrics.overlapsAfter).toBe(0);

    // NOTE: crossingsAfter is deliberately NOT asserted <= crossingsBefore.
    // The "before" paths are straight port↔port lines that cut illegally
    // through the switch chassis, which can score 0 crossings. Legal routes
    // must leave via the port face and wrap the chassis, so with the nodes
    // pinned and the port order inverted a crossing is topologically forced.
    // Moving the nodes is what actually removes it — see the test below.
  });

  test('full run removes the crossing from a port-inverted star', () => {
    const items = [item('sw', 0, 0), item('pc1', 40, 30), item('pc2', 0, 30)];
    const modelItems = [
      model('sw', SHAPE_2D_SWITCH_ID),
      model('pc1', SHAPE_2D_PC_ID),
      model('pc2', SHAPE_2D_PC_ID)
    ];
    const ports = getShape2dPorts(SHAPE_2D_SWITCH_ID);
    const connectors = [
      cable('c1', 'sw', ports[0].id, 'pc1', 'port-1'),
      cable('c2', 'sw', ports[1].id, 'pc2', 'port-1')
    ];

    const result = runAutoLayout({
      scopeItems: items,
      allItems: items,
      modelItems,
      connectors,
      options: { style: 'ORTHOGONAL', placement: 'full' }
    });

    expect(result.metrics.crossingsAfter).toBe(0);
    expect(result.metrics.overlapsAfter).toBe(0);
  });
});
