import type {
  Connector,
  DeviceTemplate,
  InitialData,
  ModelItem,
  ViewItem
} from 'src/types';
import {
  DEFAULT_COLOR,
  SHAPES_2D,
  SHAPE_2D_SWITCH_ID,
  SHAPE_2D_PC_ID,
  PC_2D_SIZE,
  SWITCH_2D_SIZE
} from 'src/config';
import { generateId, layoutDeviceTemplate } from 'src/utils';
import { PLAN_2D_V3_VIEW_NAME } from 'src/utils/plan2dv2';
import { ensureDeviceTemplateIcons } from 'src/utils/deviceTemplateStorage';
import { getVlanColor } from 'src/utils/vlanColors';
import {
  RACK_48_TEMPLATE,
  DIN_8_TEMPLATE
} from 'src/examples/startingTopology2d';

/** 10 VLANs used across the stress scene. */
export const STRESS_VLANS = [
  '10',
  '20',
  '30',
  '40',
  '50',
  '60',
  '70',
  '80',
  '90',
  '100'
] as const;

const FALLBACK_VLAN_COLORS = [
  '#3b82f6',
  '#a855f7',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#6366f1'
] as const;

const vlanMeta = (vlan: string, index: number) => {
  return {
    id: vlan,
    color: getVlanColor(vlan) ?? FALLBACK_VLAN_COLORS[index % FALLBACK_VLAN_COLORS.length]
  };
};

const VLANS = STRESS_VLANS.map(vlanMeta);

const portByLabel = (template: DeviceTemplate, label: number | string) => {
  const layout = layoutDeviceTemplate(template);
  const port = layout.ports.find((item) => {
    return item.label === String(label);
  });
  if (!port) {
    throw new Error(`Port ${label} not found on ${template.id}`);
  }
  return port.id;
};

const builtinSwitchPort = (portNumber: number) => {
  if (portNumber >= 1 && portNumber <= 8) {
    return `port-top-${portNumber}`;
  }
  if (portNumber >= 9 && portNumber <= 16) {
    return `port-bottom-${portNumber - 8}`;
  }
  throw new Error(`Invalid built-in switch port: ${portNumber}`);
};

const accessPort = (vlan: string, color: string) => {
  return {
    type: 'access' as const,
    vlan,
    vlanColor: color,
    speed: '1G'
  };
};

const trunkPort = (name: string, label?: string) => {
  return {
    type: 'trunk' as const,
    speed: '10G' as const,
    name,
    ...(label ? { label } : {}),
    allowedVlans: [...STRESS_VLANS]
  };
};

const link = (
  colorId: string,
  a: { item: string; port: string },
  b: { item: string; port: string }
): Connector => {
  return {
    id: generateId(),
    color: colorId,
    anchors: [
      { id: generateId(), ref: a },
      { id: generateId(), ref: b }
    ]
  };
};

/** Tight host grid so density groups form (Chebyshev gap ≤ 1). */
const placeCluster = (
  origin: { x: number; y: number },
  count: number,
  cols: number
) => {
  const pitch = PC_2D_SIZE.width;
  return Array.from({ length: count }, (_, i) => {
    return {
      x: origin.x + (i % cols) * pitch,
      y: origin.y + Math.floor(i / cols) * pitch
    };
  });
};

type HostSpec = {
  id: string;
  name: string;
  vlan: string;
  color: string;
  tile: { x: number; y: number };
};

/**
 * Stress fixture for Plan 2D v3:
 * - 6 switches (3×48p RACK, 2×8p DIN, 1×16p builtin)
 * - 94 hosts → 100 devices total
 * - 10 VLANs with mixed access + inter-switch trunks (star + ring + edge uplinks)
 */
export const buildStressV3Model = (): InitialData => {
  const viewId = generateId();
  const colorId = DEFAULT_COLOR.id;
  const rackPort = (label: number) => {
    return portByLabel(RACK_48_TEMPLATE, label);
  };
  const dinPort = (label: number) => {
    return portByLabel(DIN_8_TEMPLATE, label);
  };
  const rackSize = layoutDeviceTemplate(RACK_48_TEMPLATE).size;
  const dinSize = layoutDeviceTemplate(DIN_8_TEMPLATE).size;

  const coreId = generateId();
  const accAId = generateId();
  const accBId = generateId();
  const edgeAId = generateId();
  const edgeBId = generateId();
  const labId = generateId();

  // Spread clusters so density tools see several groups.
  const coreTile = { x: 0, y: 0 };
  const accATile = { x: -110, y: -50 };
  const accBTile = { x: 110, y: -50 };
  const edgeATile = { x: -110, y: 70 };
  const edgeBTile = { x: 110, y: 70 };
  const labTile = { x: 0, y: 90 };

  const hostCounts = {
    core: 10,
    accA: 29,
    accB: 29,
    edgeA: 6,
    edgeB: 6,
    lab: 14
  } as const;
  // 10+29+29+6+6+14 = 94 hosts + 6 switches = 100

  const makeHosts = (
    prefix: string,
    count: number,
    origin: { x: number; y: number },
    cols: number,
    vlanOffset: number
  ): HostSpec[] => {
    const tiles = placeCluster(origin, count, cols);
    return tiles.map((tile, i) => {
      const vlanIndex = (i + vlanOffset) % VLANS.length;
      const vlan = VLANS[vlanIndex];
      return {
        id: generateId(),
        name: `${prefix}-${String(i + 1).padStart(2, '0')}`,
        vlan: vlan.id,
        color: vlan.color,
        tile
      };
    });
  };

  const coreHosts = makeHosts(
    'SRV',
    hostCounts.core,
    {
      x: coreTile.x,
      y: coreTile.y + rackSize.height + 2
    },
    5,
    2
  );
  const accAHosts = makeHosts(
    'PC-A',
    hostCounts.accA,
    {
      x: accATile.x - 5 * PC_2D_SIZE.width - 2,
      y: accATile.y
    },
    5,
    0
  );
  const accBHosts = makeHosts(
    'PC-B',
    hostCounts.accB,
    {
      x: accBTile.x + rackSize.width + 2,
      y: accBTile.y
    },
    5,
    3
  );
  const edgeAHosts = makeHosts(
    'EDGE-A',
    hostCounts.edgeA,
    {
      x: edgeATile.x - 3 * PC_2D_SIZE.width - 2,
      y: edgeATile.y
    },
    3,
    1
  );
  const edgeBHosts = makeHosts(
    'EDGE-B',
    hostCounts.edgeB,
    {
      x: edgeBTile.x + dinSize.width + 2,
      y: edgeBTile.y
    },
    3,
    4
  );
  const labHosts = makeHosts(
    'LAB',
    hostCounts.lab,
    {
      x: labTile.x + SWITCH_2D_SIZE.width + 2,
      y: labTile.y
    },
    7,
    5
  );

  // —— Switch port maps ——
  const corePorts: NonNullable<ModelItem['ports']> = {};
  coreHosts.forEach((host, i) => {
    corePorts[rackPort(i + 1)] = accessPort(host.vlan, host.color);
  });
  corePorts[rackPort(46)] = trunkPort('trunk-to-lab', 'Po46');
  corePorts[rackPort(47)] = trunkPort('trunk-to-acc-a', 'Po47');
  corePorts[rackPort(48)] = trunkPort('trunk-to-acc-b', 'Po48');

  const accAPorts: NonNullable<ModelItem['ports']> = {};
  accAHosts.forEach((host, i) => {
    accAPorts[rackPort(i + 1)] = accessPort(host.vlan, host.color);
  });
  accAPorts[rackPort(46)] = trunkPort('uplink-edge-a', 'Po46');
  accAPorts[rackPort(47)] = trunkPort('trunk-to-acc-b', 'Po47');
  accAPorts[rackPort(48)] = trunkPort('trunk-to-core', 'Po48');

  const accBPorts: NonNullable<ModelItem['ports']> = {};
  accBHosts.forEach((host, i) => {
    accBPorts[rackPort(i + 1)] = accessPort(host.vlan, host.color);
  });
  accBPorts[rackPort(46)] = trunkPort('uplink-edge-b', 'Po46');
  accBPorts[rackPort(47)] = trunkPort('trunk-to-acc-a', 'Po47');
  accBPorts[rackPort(48)] = trunkPort('trunk-to-core', 'Po48');

  const edgeAPorts: NonNullable<ModelItem['ports']> = {};
  edgeAHosts.forEach((host, i) => {
    edgeAPorts[dinPort(i + 1)] = accessPort(host.vlan, host.color);
  });
  edgeAPorts[dinPort(8)] = trunkPort('uplink-acc-a', 'Po8');

  const edgeBPorts: NonNullable<ModelItem['ports']> = {};
  edgeBHosts.forEach((host, i) => {
    edgeBPorts[dinPort(i + 1)] = accessPort(host.vlan, host.color);
  });
  edgeBPorts[dinPort(8)] = trunkPort('uplink-acc-b', 'Po8');

  const labPorts: NonNullable<ModelItem['ports']> = {};
  labHosts.forEach((host, i) => {
    labPorts[builtinSwitchPort(i + 1)] = accessPort(host.vlan, host.color);
  });
  labPorts[builtinSwitchPort(16)] = trunkPort('uplink-core', 'Po16');

  const allHosts = [
    ...coreHosts,
    ...accAHosts,
    ...accBHosts,
    ...edgeAHosts,
    ...edgeBHosts,
    ...labHosts
  ];

  const connectors: Connector[] = [
    // Core star
    link(
      colorId,
      { item: coreId, port: rackPort(47) },
      { item: accAId, port: rackPort(48) }
    ),
    link(
      colorId,
      { item: coreId, port: rackPort(48) },
      { item: accBId, port: rackPort(48) }
    ),
    // Access ring
    link(
      colorId,
      { item: accAId, port: rackPort(47) },
      { item: accBId, port: rackPort(47) }
    ),
    // Edge uplinks
    link(
      colorId,
      { item: accAId, port: rackPort(46) },
      { item: edgeAId, port: dinPort(8) }
    ),
    link(
      colorId,
      { item: accBId, port: rackPort(46) },
      { item: edgeBId, port: dinPort(8) }
    ),
    // Lab uplink
    link(
      colorId,
      { item: coreId, port: rackPort(46) },
      { item: labId, port: builtinSwitchPort(16) }
    ),
    // Host access links
    ...coreHosts.map((host, i) => {
      return link(
        colorId,
        { item: coreId, port: rackPort(i + 1) },
        { item: host.id, port: 'port-1' }
      );
    }),
    ...accAHosts.map((host, i) => {
      return link(
        colorId,
        { item: accAId, port: rackPort(i + 1) },
        { item: host.id, port: 'port-1' }
      );
    }),
    ...accBHosts.map((host, i) => {
      return link(
        colorId,
        { item: accBId, port: rackPort(i + 1) },
        { item: host.id, port: 'port-1' }
      );
    }),
    ...edgeAHosts.map((host, i) => {
      return link(
        colorId,
        { item: edgeAId, port: dinPort(i + 1) },
        { item: host.id, port: 'port-1' }
      );
    }),
    ...edgeBHosts.map((host, i) => {
      return link(
        colorId,
        { item: edgeBId, port: dinPort(i + 1) },
        { item: host.id, port: 'port-1' }
      );
    }),
    ...labHosts.map((host, i) => {
      return link(
        colorId,
        { item: labId, port: builtinSwitchPort(i + 1) },
        { item: host.id, port: 'port-1' }
      );
    })
  ];

  const items: ModelItem[] = [
    {
      id: coreId,
      name: 'SW-CORE-01',
      icon: RACK_48_TEMPLATE.id,
      color: '#f8fafc',
      ports: corePorts,
      svis: VLANS.map((vlan, i) => {
        return {
          id: generateId(),
          vlan: vlan.id,
          ip: `10.${10 + i}.0.1/24`,
          vlanColor: vlan.color
        };
      })
    },
    {
      id: accAId,
      name: 'SW-ACC-A',
      icon: RACK_48_TEMPLATE.id,
      color: '#ffffff',
      ports: accAPorts,
      svis: []
    },
    {
      id: accBId,
      name: 'SW-ACC-B',
      icon: RACK_48_TEMPLATE.id,
      color: '#ffffff',
      ports: accBPorts,
      svis: []
    },
    {
      id: edgeAId,
      name: 'SW-EDGE-A',
      icon: DIN_8_TEMPLATE.id,
      color: '#f1f5f9',
      ports: edgeAPorts
    },
    {
      id: edgeBId,
      name: 'SW-EDGE-B',
      icon: DIN_8_TEMPLATE.id,
      color: '#f1f5f9',
      ports: edgeBPorts
    },
    {
      id: labId,
      name: 'SW-LAB-16',
      icon: SHAPE_2D_SWITCH_ID,
      color: '#f8fafc',
      ports: labPorts
    },
    ...allHosts.map((host) => {
      return {
        id: host.id,
        name: host.name,
        icon: SHAPE_2D_PC_ID,
        color: '#e2e8f0',
        ports: {
          'port-1': accessPort(host.vlan, host.color)
        }
      };
    })
  ];

  const viewItems: ViewItem[] = [
    { id: coreId, tile: coreTile },
    { id: accAId, tile: accATile },
    { id: accBId, tile: accBTile },
    { id: edgeAId, tile: edgeATile },
    { id: edgeBId, tile: edgeBTile },
    { id: labId, tile: labTile },
    ...allHosts.map((host) => {
      return { id: host.id, tile: host.tile };
    })
  ];

  const deviceTemplates = [RACK_48_TEMPLATE, DIN_8_TEMPLATE];
  // modelSchema validates icon refs before load() can inject template icons.
  const icons = ensureDeviceTemplateIcons([...SHAPES_2D], deviceTemplates);

  return {
    title: 'Stress 2D v3 — 100 urządzeń',
    version: '1.0',
    description:
      '6 switchy · 94 hosty · 10 VLAN · trunki (star+ring+edge) — fixture do testów v3',
    fitToView: true,
    projectionMode: 'TWO_D_V3',
    icons,
    colors: [{ ...DEFAULT_COLOR, id: colorId }],
    deviceTemplates,
    items,
    views: [
      {
        id: viewId,
        name: PLAN_2D_V3_VIEW_NAME,
        kind: 'PLAN_2D_V3',
        items: viewItems,
        connectors,
        rectangles: [],
        textBoxes: []
      }
    ],
    view: viewId
  };
};
