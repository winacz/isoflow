import {
  SHAPE_2D_PC_ID,
  SHAPE_2D_PRINTER_ID,
  SHAPE_2D_SWITCH_ID,
  getModelItemSize
} from 'src/config';
import {
  buildVlanMemberGroups,
  clusterItemsByVlan,
  densityGroupsFromVlanMembers,
  hubSwitchIdForLeaf,
  primaryVlanKeyForItem
} from '../vlanSortLayout';
import { computeDensityGroups } from '../densityGroups';
import type { Connector, ModelItem, ViewItem } from 'src/types';

const pcSize = getModelItemSize({ icon: SHAPE_2D_PC_ID }) ?? {
  width: 2,
  height: 2
};
const prnSize = getModelItemSize({ icon: SHAPE_2D_PRINTER_ID }) ?? {
  width: 2,
  height: 2
};

describe('vlanSortLayout 2v grouping', () => {
  const switchItem: ModelItem = {
    id: 'sw',
    name: 'SW',
    icon: SHAPE_2D_SWITCH_ID,
    ports: {
      'port-bottom-1': { type: 'access', vlan: '10' },
      'port-bottom-2': { type: 'access', vlan: '10' },
      'port-bottom-3': { type: 'access', vlan: '20' },
      'port-bottom-4': { type: 'access', vlan: '10' },
      'port-bottom-5': { type: 'access', vlan: '10' },
      'port-bottom-6': { type: 'access', vlan: '20' }
    }
  };

  const modelItems: ModelItem[] = [
    switchItem,
    { id: 'pc-a', name: 'A', icon: SHAPE_2D_PC_ID },
    { id: 'pc-b', name: 'B', icon: SHAPE_2D_PC_ID },
    { id: 'prn-c', name: 'C', icon: SHAPE_2D_PRINTER_ID },
    { id: 'pc-d', name: 'D', icon: SHAPE_2D_PC_ID },
    { id: 'ap-ish', name: 'AP', icon: SHAPE_2D_PC_ID },
    { id: 'prn-e', name: 'E', icon: SHAPE_2D_PRINTER_ID }
  ];

  // Interleaved around the switch like the user screenshot:
  // blue, blue, SW, blue, orange, blue, orange
  const items: ViewItem[] = [
    { id: 'pc-a', tile: { x: 0, y: 0 } },
    { id: 'pc-b', tile: { x: pcSize.width, y: 0 } },
    { id: 'sw', tile: { x: pcSize.width * 2, y: 0 } },
    { id: 'pc-d', tile: { x: pcSize.width * 2 + 8, y: 0 } },
    {
      id: 'prn-c',
      tile: { x: pcSize.width * 2 + 8 + pcSize.width, y: 0 }
    },
    {
      id: 'ap-ish',
      tile: {
        x: pcSize.width * 2 + 8 + pcSize.width + prnSize.width,
        y: 0
      }
    },
    {
      id: 'prn-e',
      tile: {
        x: pcSize.width * 2 + 8 + pcSize.width + prnSize.width + pcSize.width,
        y: 0
      }
    }
  ];

  const connectors: Connector[] = [
    {
      id: 'c1',
      anchors: [
        { id: 'a1', ref: { item: 'pc-a', port: 'port-1' } },
        { id: 'a2', ref: { item: 'sw', port: 'port-bottom-1' } }
      ]
    },
    {
      id: 'c2',
      anchors: [
        { id: 'b1', ref: { item: 'pc-b', port: 'port-1' } },
        { id: 'b2', ref: { item: 'sw', port: 'port-bottom-2' } }
      ]
    },
    {
      id: 'c3',
      anchors: [
        { id: 'c1a', ref: { item: 'prn-c', port: 'port-1' } },
        { id: 'c2a', ref: { item: 'sw', port: 'port-bottom-3' } }
      ]
    },
    {
      id: 'c4',
      anchors: [
        { id: 'd1', ref: { item: 'pc-d', port: 'port-1' } },
        { id: 'd2', ref: { item: 'sw', port: 'port-bottom-4' } }
      ]
    },
    {
      id: 'c5',
      anchors: [
        { id: 'e1', ref: { item: 'ap-ish', port: 'port-1' } },
        { id: 'e2', ref: { item: 'sw', port: 'port-bottom-5' } }
      ]
    },
    {
      id: 'c6',
      anchors: [
        { id: 'f1', ref: { item: 'prn-e', port: 'port-1' } },
        { id: 'f2', ref: { item: 'sw', port: 'port-bottom-6' } }
      ]
    }
  ];

  test('hubSwitchIdForLeaf finds the uplink switch', () => {
    expect(
      hubSwitchIdForLeaf({
        itemId: 'pc-a',
        modelItems,
        connectors
      })
    ).toBe('sw');
  });

  test('primaryVlanKeyForItem reads peer switch access VLAN', () => {
    expect(
      primaryVlanKeyForItem({
        itemId: 'pc-a',
        modelItem: modelItems.find((m) => m.id === 'pc-a'),
        modelItems,
        connectors
      })
    ).toBe('10');
    expect(
      primaryVlanKeyForItem({
        itemId: 'prn-c',
        modelItem: modelItems.find((m) => m.id === 'prn-c'),
        modelItems,
        connectors
      })
    ).toBe('20');
  });

  test('buildVlanMemberGroups(perHub) splits VLAN 10 vs 20 on one switch', () => {
    const groups = buildVlanMemberGroups({
      items,
      modelItems,
      connectors,
      perHub: true
    });

    const byVlan = new Map(
      groups.map((g) => [g.vlan, [...g.memberIds].sort()] as const)
    );
    expect([...byVlan.keys()].sort()).toEqual(['10', '20']);
    expect(byVlan.get('10')).toEqual(
      ['ap-ish', 'pc-a', 'pc-b', 'pc-d'].sort()
    );
    expect(byVlan.get('20')).toEqual(['prn-c', 'prn-e'].sort());
  });

  test('clusterItemsByVlan(perHub) packs VLAN blocks without interleaving', () => {
    const clustered = clusterItemsByVlan({
      items,
      modelItems,
      connectors,
      perHub: true
    });

    expect(clustered.vlanGroupCount).toBe(2);
    expect(clustered.movedNodes).toBeGreaterThan(0);

    const placed = items.map((item) => {
      const tile = clustered.targets[item.id] ?? item.tile;
      return { ...item, tile };
    });

    const vlanGroups = buildVlanMemberGroups({
      items,
      modelItems,
      connectors,
      perHub: true
    });
    const density = densityGroupsFromVlanMembers({
      vlanGroups,
      items: placed,
      modelItems
    });
    expect(density).toHaveLength(2);

    // Proximity grouping must also see two separate clusters (gap ≥ 4).
    const proximity = computeDensityGroups({
      items: placed.filter((item) => item.id !== 'sw'),
      modelItems
    });
    const memberSets = proximity
      .map((g) => [...g.memberIds].sort().join(','))
      .sort();
    expect(memberSets).toContain(
      ['ap-ish', 'pc-a', 'pc-b', 'pc-d'].sort().join(',')
    );
    expect(memberSets).toContain(['prn-c', 'prn-e'].sort().join(','));
  });
});
