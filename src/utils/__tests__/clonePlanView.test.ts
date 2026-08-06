import type { ModelItem, View } from 'src/types';
import { clonePlanViewContent } from '../clonePlanView';

const modelItems: ModelItem[] = [
  { id: 'cab', name: 'SZAFA', icon: 'shape2d-cabinet' },
  { id: 'sw', name: 'SW-CORE-01', icon: 'shape2d-switch' },
  { id: 'pc', name: 'PC-01', icon: 'shape2d-pc' }
] as ModelItem[];

const source: View = {
  id: 'plan',
  name: 'Plan',
  items: [
    { id: 'cab', tile: { x: 0, y: 0 } },
    { id: 'sw', tile: { x: 0, y: 1 }, parentId: 'cab', rackUnit: 2 },
    { id: 'pc', tile: { x: 8, y: 3 } }
  ],
  connectors: [
    {
      id: 'cable',
      anchors: [
        { id: 'a1', ref: { item: 'sw', port: 'p3' } },
        { id: 'a2', ref: { tile: { x: 4, y: 2 } } },
        { id: 'a3', ref: { item: 'pc', port: 'eth0' } }
      ]
    }
  ],
  rectangles: [],
  textBoxes: []
} as View;

describe('clonePlanViewContent', () => {
  const copy = clonePlanViewContent({ source, modelItems });

  it('copies every device onto a fresh model item id', () => {
    expect(copy.items).toHaveLength(3);
    expect(copy.modelItems).toHaveLength(3);

    const sourceIds = new Set(['cab', 'sw', 'pc']);
    copy.modelItems.forEach((item) => {
      expect(sourceIds.has(item.id)).toBe(false);
    });

    expect(
      copy.modelItems.map((item) => {
        return item.name;
      })
    ).toEqual(['SZAFA', 'SW-CORE-01', 'PC-01']);
  });

  it('keeps tiles and remaps rack mounts to the copied cabinet', () => {
    const cabinet = copy.items[0];
    const mounted = copy.items[1];

    expect(mounted.tile).toEqual({ x: 0, y: 1 });
    expect(mounted.rackUnit).toBe(2);
    expect(mounted.parentId).toBe(cabinet.id);
  });

  it('preserves the relation: same ports, endpoints repointed to the copies', () => {
    expect(copy.connectors).toHaveLength(1);

    const cable = copy.connectors![0];
    expect(cable.id).not.toBe('cable');

    const [start, waypoint, end] = cable.anchors;
    const swCopy = copy.items[1];
    const pcCopy = copy.items[2];

    expect(start.ref).toEqual({ item: swCopy.id, port: 'p3' });
    expect(end.ref).toEqual({ item: pcCopy.id, port: 'eth0' });
    // Free waypoints are geometry, not identity — they carry over untouched.
    expect(waypoint.ref).toEqual({ tile: { x: 4, y: 2 } });
  });

  it('leaves the source view and its model items untouched', () => {
    expect(source.items[1].parentId).toBe('cab');
    expect(source.connectors![0].anchors[0].ref.item).toBe('sw');
    expect(modelItems[1].id).toBe('sw');
  });
});
