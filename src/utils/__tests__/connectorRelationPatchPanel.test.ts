jest.mock('src/utils/nodeHighlightScale', () => ({
  getNodeHighlightScale: () => 1,
  SCALE_REF_AREA: 171
}));

import {
  SHAPE_2D_PATCH_PANEL_ID,
  SHAPE_2D_PC_ID
} from 'src/config';
import { getConnectorRelationSummary } from '../vlanColors';

describe('getConnectorRelationSummary — patch panel VIA', () => {
  const modelItems = [
    {
      id: 'sw',
      name: 'SW-CORE-01',
      icon: 'RACK_48',
      ports: {
        'port-2': { type: 'access' as const, vlan: '30', vlanColor: '#a16207' }
      },
      svis: [{ id: 'svi-30', vlan: '30', ip: '10.10.30.1/24' }]
    },
    {
      id: 'srv',
      name: 'SRV-APP',
      icon: SHAPE_2D_PC_ID,
      ip: '10.10.30.11/24',
      ports: {
        'port-1': { type: 'access' as const, vlan: '1' }
      }
    },
    {
      id: 'pp',
      name: 'PP-SCHOWEK-01',
      icon: SHAPE_2D_PATCH_PANEL_ID,
      portCount: 24
    }
  ] as Parameters<typeof getConnectorRelationSummary>[0]['modelItems'];

  const connectors = [
    {
      id: 'c-host-pp',
      anchors: [
        { id: 'a1', ref: { item: 'srv', port: 'port-1' } },
        { id: 'a2', ref: { item: 'pp', port: 'pp-8' } }
      ]
    },
    {
      id: 'c-pp-sw',
      anchors: [
        { id: 'a3', ref: { item: 'pp', port: 'pp-8' } },
        { id: 'a4', ref: { item: 'sw', port: 'port-2' } }
      ]
    }
  ];

  test('host↔panel cable shows source → VIA panel → switch', () => {
    const summary = getConnectorRelationSummary({
      anchors: connectors[0].anchors,
      modelItems,
      connectors,
      connectorId: 'c-host-pp'
    });

    expect(summary.endpoints.map((e) => [e.itemName, e.role ?? 'endpoint'])).toEqual([
      ['SRV-APP', 'endpoint'],
      ['PP-SCHOWEK-01', 'via'],
      ['SW-CORE-01', 'endpoint']
    ]);
    expect(summary.vlanLabel).toBe('VLAN 30');
  });

  test('panel↔switch cable shows the same three-hop path', () => {
    const summary = getConnectorRelationSummary({
      anchors: connectors[1].anchors,
      modelItems,
      connectors,
      connectorId: 'c-pp-sw'
    });

    const hops = summary.endpoints.map((e) => [e.itemName, e.role ?? 'endpoint']);
    expect(hops).toHaveLength(3);
    expect(hops[1]).toEqual(['PP-SCHOWEK-01', 'via']);
    expect(hops.map((h) => h[0]).sort()).toEqual([
      'PP-SCHOWEK-01',
      'SRV-APP',
      'SW-CORE-01'
    ]);
  });
});
