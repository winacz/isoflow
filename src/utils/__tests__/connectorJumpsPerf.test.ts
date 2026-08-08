import {
  buildConnectorTileIndex,
  findConnectorIdAtTile,
  findConnectorJumpsById,
  findConnectorJumpsIncremental
} from '../connectorJumps';

describe('connectorJumps perf helpers', () => {
  test('tile index finds topmost cable', () => {
    const connectors = [
      {
        id: 'bottom',
        tiles: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 }
        ]
      },
      {
        id: 'top',
        tiles: [
          { x: 1, y: -1 },
          { x: 1, y: 0 },
          { x: 1, y: 1 }
        ]
      }
    ];

    const index = buildConnectorTileIndex(connectors);

    expect(index.get('1,0')).toEqual(['bottom', 'top']);
    expect(findConnectorIdAtTile(index, { x: 1, y: 0 })).toBe('top');
    expect(findConnectorIdAtTile(index, { x: 0, y: 0 })).toBe('bottom');
    expect(findConnectorIdAtTile(index, { x: 9, y: 9 })).toBeNull();
  });

  test('incremental jumps match full recompute when one cable changes', () => {
    const base = [
      {
        id: 'a',
        tiles: [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
          { x: 3, y: 1 }
        ]
      },
      {
        id: 'b',
        tiles: [
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 1, y: 2 },
          { x: 1, y: 3 }
        ]
      },
      {
        id: 'c',
        tiles: [
          { x: 3, y: 0 },
          { x: 3, y: 1 },
          { x: 3, y: 2 },
          { x: 3, y: 3 }
        ]
      }
    ];

    const prevJumps = findConnectorJumpsById(base);

    const next = [
      {
        ...base[0],
        tiles: [
          { x: 0, y: 2 },
          { x: 1, y: 2 },
          { x: 2, y: 2 },
          { x: 3, y: 2 }
        ]
      },
      base[1],
      base[2]
    ];

    const incremental = findConnectorJumpsIncremental(
      prevJumps,
      base,
      next,
      new Set(['a'])
    );
    const full = findConnectorJumpsById(next);

    expect(incremental).toEqual(full);
  });
});
