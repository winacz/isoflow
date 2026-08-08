import {
  buildForeignNodesFingerprint,
  getCachedConnectorBodyStyleRuns,
  clearConnectorBodyCrossingCache
} from '../connectorBodyCrossingCache';

describe('connectorBodyCrossingCache', () => {
  afterEach(() => {
    clearConnectorBodyCrossingCache();
  });

  test('fingerprint ignores endpoint items', () => {
    const items = [
      { id: 'a', tile: { x: 0, y: 0 } },
      { id: 'b', tile: { x: 5, y: 0 } },
      { id: 'c', tile: { x: 2, y: 2 } }
    ];
    const modelItems = [
      { id: 'a', icon: 'PC' },
      { id: 'b', icon: 'PC' },
      { id: 'c', icon: 'SWITCH' }
    ];

    const fp = buildForeignNodesFingerprint(items, modelItems, ['a', 'b']);
    expect(fp).toContain('c@');
    expect(fp).not.toContain('a@');
    expect(fp).not.toContain('b@');
  });

  test('returns stable cached style runs for identical inputs', () => {
    const tiles = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 }
    ];
    const items = [
      { id: 'a', tile: { x: 0, y: 0 } },
      { id: 'b', tile: { x: 3, y: 0 } },
      { id: 'wall', tile: { x: 1, y: -1 } }
    ];
    const modelItems = [
      { id: 'a', icon: 'PC' },
      { id: 'b', icon: 'PC' },
      { id: 'wall', icon: 'PC' }
    ];
    const endpointItemIds = ['a', 'b'];
    const endpointPorts = [
      { itemId: 'a', portId: 'port-right' },
      { itemId: 'b', portId: 'port-left' }
    ];
    const foreignFingerprint = buildForeignNodesFingerprint(
      items,
      modelItems,
      endpointItemIds
    );
    const args = {
      tiles,
      items,
      modelItems,
      endpointItemIds,
      endpointPorts,
      fadeCabinetRect: null
    };

    const first = getCachedConnectorBodyStyleRuns(
      {
        connectorId: 'c1',
        tiles,
        foreignFingerprint,
        endpointItemIds,
        endpointPorts,
        fadeCabinetRect: null
      },
      args
    );
    const second = getCachedConnectorBodyStyleRuns(
      {
        connectorId: 'c1',
        tiles,
        foreignFingerprint,
        endpointItemIds,
        endpointPorts,
        fadeCabinetRect: null
      },
      args
    );

    expect(second).toBe(first);
  });
});
