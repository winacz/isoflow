import { getConnectorPathPreview } from 'src/utils/renderer';
import * as pathfinder from 'src/utils/pathfinder';
import { View, ConnectorAnchor } from 'src/types';

const emptyView = (anchors: ConnectorAnchor[]): View => {
  return {
    id: 'v',
    name: 'v',
    items: [
      { id: 'a', tile: { x: 0, y: 0 } },
      { id: 'b', tile: { x: 10, y: 0 } }
    ],
    connectors: [
      {
        id: 'c1',
        anchors
      }
    ],
    rectangles: [],
    textBoxes: []
  };
};

describe('connector routing hot path', () => {
  it('getConnectorPathPreview does not call findPath (A*)', () => {
    const anchors: ConnectorAnchor[] = [
      { id: '1', ref: { item: 'a' } },
      { id: '2', ref: { item: 'b' } }
    ];
    const view = emptyView(anchors);
    const modelItems = [
      { id: 'a', icon: 'PC' },
      { id: 'b', icon: 'PC' }
    ];

    const spy = jest.spyOn(pathfinder, 'findPath');

    getConnectorPathPreview({
      anchors,
      view,
      modelItems
    });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
