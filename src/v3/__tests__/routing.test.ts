import type { ModelItem, ViewItem } from 'src/types';
import { SHAPE_2D_PC_ID, getShape2dPorts, getShape2dSize } from 'src/config';
import { routeOneCable } from 'src/utils/autoLayout/router';
import {
  buildFootprints,
  resolvePortEnd,
  routeNewConnection
} from '../routing';

const pcSize = getShape2dSize(SHAPE_2D_PC_ID) ?? { width: 9, height: 9 };
const pcPortId = getShape2dPorts(SHAPE_2D_PC_ID)[0].id;

const scene = (tiles: Record<string, [number, number]>) => {
  const items: ViewItem[] = Object.entries(tiles).map(([id, [x, y]]) => {
    return { id, tile: { x, y } };
  });
  const modelItems: ModelItem[] = Object.keys(tiles).map((id) => {
    return { id, icon: SHAPE_2D_PC_ID, name: id } as ModelItem;
  });
  return { items, modelItems };
};

describe('v3 routing', () => {
  it('derives footprints from the shape definitions', () => {
    const { items, modelItems } = scene({ a: [0, 0] });
    const footprints = buildFootprints(items, modelItems);

    expect(footprints.get('a')).toEqual({
      id: 'a',
      tile: { x: 0, y: 0 },
      width: pcSize.width,
      height: pcSize.height
    });
  });

  it('resolves a port to a world tile plus its outward face', () => {
    const { items, modelItems } = scene({ a: [10, 20] });

    const resolved = resolvePortEnd({
      end: { itemId: 'a', portId: pcPortId },
      items,
      modelItems
    });

    const port = getShape2dPorts(SHAPE_2D_PC_ID)[0];
    expect(resolved?.tile).toEqual({
      x: Math.round(10 + port.tile.x),
      y: Math.round(20 + port.tile.y)
    });
    expect(resolved?.normal).not.toBeNull();
  });

  it('returns null when an endpoint does not exist', () => {
    const { items, modelItems } = scene({ a: [0, 0] });

    expect(
      routeNewConnection({
        from: { itemId: 'a', portId: pcPortId },
        to: { itemId: 'ghost', portId: pcPortId },
        items,
        modelItems,
        existingConnectors: []
      })
    ).toBeNull();
  });

  it('materializes waypoints only at genuine path bends', () => {
    const { items, modelItems } = scene({ a: [0, 0], b: [40, 40] });

    const result = routeNewConnection({
      from: { itemId: 'a', portId: pcPortId },
      to: { itemId: 'b', portId: pcPortId },
      items,
      modelItems,
      existingConnectors: []
    });

    expect(result?.routed).toBe(true);
    expect(result!.waypoints.length).toBeGreaterThan(0);

    // Every waypoint must be a real corner: no three consecutive collinear
    // points, which is what "materialize at bends" means.
    const pts = result!.waypoints;
    for (let i = 2; i < pts.length; i += 1) {
      const collinear =
        (pts[i].x - pts[i - 1].x) * (pts[i - 1].y - pts[i - 2].y) ===
        (pts[i].y - pts[i - 1].y) * (pts[i - 1].x - pts[i - 2].x);
      expect(collinear).toBe(false);
    }
  });

  describe('§4 node traversal', () => {
    /** A start tile fully walled in by device bodies, with the goal outside. */
    const boxedIn = () => {
      const items: ViewItem[] = [];
      const modelItems: ModelItem[] = [];

      // A ring of bodies around (0,0), leaving no orthogonal gap.
      const ring: [number, number][] = [
        [-9, -9],
        [0, -9],
        [9, -9],
        [-9, 0],
        [9, 0],
        [-9, 9],
        [0, 9],
        [9, 9]
      ];
      ring.forEach(([x, y], index) => {
        const id = `wall${index}`;
        items.push({ id, tile: { x, y } });
        modelItems.push({ id, icon: SHAPE_2D_PC_ID } as ModelItem);
      });

      return { items, modelItems };
    };

    const routeOut = (walkableNodes: boolean) => {
      const { items, modelItems } = boxedIn();

      return routeOneCable({
        items,
        modelItems: modelItems.map((item) => {
          return { id: item.id, icon: item.icon };
        }),
        footprints: buildFootprints(items, modelItems),
        from: { x: 4, y: 4 },
        to: { x: 60, y: 60 },
        style: 'ORTHOGONAL',
        walkableNodes,
        maxExpansions: 60000
      });
    };

    it('escapes an enclosed pocket when nodes are walkable', () => {
      const result = routeOut(true);

      expect(result.routed).toBe(true);
      expect(result.tiles.length).toBeGreaterThan(2);
    });

    it('still prefers open space over cutting under a device', () => {
      // Two nodes side by side with a wide open corridor below them: the
      // route must go around, not straight through the bodies.
      const { items, modelItems } = scene({ a: [0, 0], b: [0, 40] });

      const result = routeOneCable({
        items,
        modelItems: modelItems.map((item) => {
          return { id: item.id, icon: item.icon };
        }),
        footprints: buildFootprints(items, modelItems),
        // Straight line from left to right passes through both bodies.
        from: { x: -20, y: 4 },
        to: { x: 40, y: 4 },
        style: 'ORTHOGONAL',
        walkableNodes: true
      });

      expect(result.routed).toBe(true);

      const bodyTiles = new Set<string>();
      for (let x = 0; x < pcSize.width; x += 1) {
        for (let y = 0; y < pcSize.height; y += 1) {
          bodyTiles.add(`${x},${y}`);
        }
      }
      const through = result.tiles.filter((tile) => {
        return bodyTiles.has(`${tile.x},${tile.y}`);
      });

      // The detour is cheaper than the under-node penalty, so it takes it.
      expect(through).toHaveLength(0);
    });
  });

  it('avoids a corridor already occupied by another cable', () => {
    const { items, modelItems } = scene({ a: [0, 0], b: [60, 0] });
    const footprints = buildFootprints(items, modelItems);
    const shared: [number, number][] = [];
    for (let x = 12; x <= 55; x += 1) shared.push([x, 4]);

    const withRival = routeOneCable({
      items,
      modelItems: modelItems.map((item) => {
        return { id: item.id, icon: item.icon };
      }),
      footprints,
      from: { x: 12, y: 4 },
      to: { x: 55, y: 4 },
      style: 'ORTHOGONAL',
      walkableNodes: true,
      existingPaths: [
        shared.map(([x, y]) => {
          return { x, y };
        })
      ]
    });

    expect(withRival.routed).toBe(true);
    // It must not lie on top of the existing straight run.
    const onTop = withRival.tiles.filter((tile) => {
      return tile.y === 4 && tile.x > 12 && tile.x < 55;
    });
    expect(onTop.length).toBeLessThan(shared.length - 2);
  });
});
