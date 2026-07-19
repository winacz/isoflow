import { InitialData, DeviceTemplate, Connector, ModelItem } from 'src/types';
import {
  DEFAULT_COLOR,
  SHAPES_2D,
  SHAPE_2D_SWITCH_ID,
  SHAPE_2D_PC_ID,
  SHAPE_2D_CABINET_ID,
  PC_2D_SIZE,
  SWITCH_2D_SIZE,
  getCabinetSize
} from 'src/config';
import { generateId, layoutDeviceTemplate, getCabinetSlotTile } from 'src/utils';

/** Shared 48-port RACK template (access + core). */
export const RACK_48_TEMPLATE: DeviceTemplate = {
  id: 'tpl-rack-48',
  name: 'Switch 48p RACK',
  kind: 'SWITCH',
  formFactor: 'RACK',
  numbering: 'ROWS_LTR',
  sections: [{ id: 'gi', media: 'RJ45', ports: 48, rows: 2 }]
};

/** Small DIN edge switch (meeting room / floor). */
export const DIN_8_TEMPLATE: DeviceTemplate = {
  id: 'tpl-din-8',
  name: 'Switch 8p DIN',
  kind: 'SWITCH',
  formFactor: 'DIN',
  numbering: 'ROWS_LTR',
  sections: [{ id: 'gi', media: 'RJ45', ports: 8, rows: 2 }]
};

const VLAN = {
  users: { id: '10', color: '#3b82f6' },
  voice: { id: '20', color: '#a855f7' },
  servers: { id: '30', color: '#22c55e' },
  iot: { id: '40', color: '#f59e0b' }
} as const;

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

/** Built-in 16-port SWITCH: 1–8 top, 9–16 bottom. */
const builtinSwitchPort = (portNumber: number) => {
  if (portNumber >= 1 && portNumber <= 8) {
    return `port-top-${portNumber}`;
  }
  if (portNumber >= 9 && portNumber <= 16) {
    return `port-bottom-${portNumber - 8}`;
  }
  throw new Error(`Invalid built-in switch port: ${portNumber}`);
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

const accessPort = (vlan: string, color: string) => {
  return {
    type: 'access' as const,
    vlan,
    vlanColor: color,
    speed: '1G'
  };
};

/**
 * Demo 2D topology — rack cabinet best-practice sketch:
 * - 12U cabinet with core + access RACK switches (trunk between them)
 * - ~15 edge devices (PCs, phones, printers, AP, servers, DIN floor switch)
 * - VLANs 10/20/30/40 with SVIs on the core
 */
export const createStartingTopology2d = (): InitialData => {
  const viewId = generateId();
  const colorId = DEFAULT_COLOR.id;

  const rackPort = (label: number) => {
    return portByLabel(RACK_48_TEMPLATE, label);
  };
  const dinPort = (label: number) => {
    return portByLabel(DIN_8_TEMPLATE, label);
  };
  const dinSize = layoutDeviceTemplate(DIN_8_TEMPLATE).size;

  const cabinetId = generateId();
  const coreId = generateId();
  const accessId = generateId();
  const floorId = generateId();
  const labSwitchId = generateId();

  const host = (name: string, color?: string) => {
    const id = generateId();
    return { id, name, color };
  };

  const ws = [
    host('PC-WS-01', '#e2e8f0'),
    host('PC-WS-02', '#e2e8f0'),
    host('PC-WS-03', '#e2e8f0'),
    host('PC-WS-04', '#e2e8f0'),
    host('PC-WS-05', '#e2e8f0')
  ];
  const phones = [
    host('PHONE-01', '#f3e8ff'),
    host('PHONE-02', '#f3e8ff')
  ];
  const printers = [
    host('PRN-01', '#ffedd5'),
    host('PRN-02', '#ffedd5')
  ];
  const servers = [
    host('SRV-DC', '#dcfce7'),
    host('SRV-APP', '#dcfce7')
  ];
  const ap = host('AP-WIFI-01', '#dbeafe');
  const mtg = [host('PC-MTG-01', '#e2e8f0'), host('PC-MTG-02', '#e2e8f0')];
  const labPc = host('PC-LAB-01', '#e2e8f0');

  // —— Spatial layout (fixed — readable “real” rack plan) ——
  const cabinetTile = { x: -36, y: -28 };
  const cabinetSize = getCabinetSize(12);
  // U0 near header, skip U1, core lower — room for patch / blanking
  const accessTile = getCabinetSlotTile(cabinetTile, 0);
  const coreTile = getCabinetSlotTile(cabinetTile, 2);

  const rightX = cabinetTile.x + cabinetSize.width + 8;
  const row = (y: number, count: number, gap = PC_2D_SIZE.width + 3) => {
    return Array.from({ length: count }, (_, i) => {
      return { x: rightX + i * gap, y };
    });
  };

  const wsTiles = row(-40, 5);
  const phoneTiles = [
    { x: rightX, y: -28 },
    { x: rightX + PC_2D_SIZE.width + 3, y: -28 }
  ];
  const prnTiles = [
    {
      x: rightX + 2 * (PC_2D_SIZE.width + 3),
      y: -28
    },
    {
      x: rightX + 3 * (PC_2D_SIZE.width + 3),
      y: -28
    }
  ];
  const srvTiles = [
    { x: rightX, y: -52 },
    { x: rightX + PC_2D_SIZE.width + 3, y: -52 }
  ];
  const apTile = {
    x: rightX + 4 * (PC_2D_SIZE.width + 3),
    y: -28
  };
  const floorTile = { x: rightX, y: -8 };
  const mtgTiles = [
    { x: rightX + dinSize.width + 4, y: -8 },
    { x: rightX + dinSize.width + 4 + PC_2D_SIZE.width + 3, y: -8 }
  ];
  const labSwitchTile = {
    x: rightX + 3 * (PC_2D_SIZE.width + 3),
    y: -52
  };
  const labPcTile = {
    x: labSwitchTile.x + SWITCH_2D_SIZE.width + 3,
    y: -52
  };

  // —— Port configs (best-practice VLAN plan) ——
  const accessPorts: NonNullable<ModelItem['ports']> = {
    [rackPort(1)]: accessPort(VLAN.users.id, VLAN.users.color),
    [rackPort(2)]: accessPort(VLAN.users.id, VLAN.users.color),
    [rackPort(3)]: accessPort(VLAN.users.id, VLAN.users.color),
    [rackPort(4)]: accessPort(VLAN.users.id, VLAN.users.color),
    [rackPort(5)]: accessPort(VLAN.users.id, VLAN.users.color),
    [rackPort(7)]: accessPort(VLAN.voice.id, VLAN.voice.color),
    [rackPort(8)]: accessPort(VLAN.voice.id, VLAN.voice.color),
    [rackPort(9)]: accessPort(VLAN.iot.id, VLAN.iot.color),
    [rackPort(10)]: accessPort(VLAN.iot.id, VLAN.iot.color),
    [rackPort(11)]: accessPort(VLAN.users.id, VLAN.users.color),
    [rackPort(13)]: {
      type: 'access',
      vlan: VLAN.users.id,
      vlanColor: VLAN.users.color,
      speed: '1G',
      name: 'uplink-floor'
    },
    [rackPort(48)]: {
      type: 'trunk',
      speed: '10G',
      name: 'trunk-to-core',
      label: 'Po48'
    }
  };

  const corePorts: NonNullable<ModelItem['ports']> = {
    [rackPort(1)]: accessPort(VLAN.servers.id, VLAN.servers.color),
    [rackPort(2)]: accessPort(VLAN.servers.id, VLAN.servers.color),
    [rackPort(3)]: {
      type: 'trunk',
      speed: '1G',
      name: 'trunk-to-lab',
      label: 'Po3'
    },
    [rackPort(48)]: {
      type: 'trunk',
      speed: '10G',
      name: 'trunk-to-access',
      label: 'Po48'
    }
  };

  const floorPorts: NonNullable<ModelItem['ports']> = {
    [dinPort(1)]: accessPort(VLAN.users.id, VLAN.users.color),
    [dinPort(2)]: accessPort(VLAN.users.id, VLAN.users.color),
    [dinPort(8)]: {
      type: 'access',
      vlan: VLAN.users.id,
      vlanColor: VLAN.users.color,
      speed: '1G',
      name: 'uplink-access'
    }
  };

  const labPorts: NonNullable<ModelItem['ports']> = {
    [builtinSwitchPort(1)]: accessPort(VLAN.users.id, VLAN.users.color),
    [builtinSwitchPort(16)]: {
      type: 'trunk',
      speed: '1G',
      name: 'uplink-core'
    }
  };

  const connectors: Connector[] = [
    // Inter-switch trunk (core ↔ access)
    link(
      colorId,
      { item: accessId, port: rackPort(48) },
      { item: coreId, port: rackPort(48) }
    ),
    // Workstations → access
    ...ws.map((pc, i) => {
      return link(
        colorId,
        { item: accessId, port: rackPort(i + 1) },
        { item: pc.id, port: 'port-1' }
      );
    }),
    // Phones → access
    link(colorId, { item: accessId, port: rackPort(7) }, { item: phones[0].id, port: 'port-1' }),
    link(colorId, { item: accessId, port: rackPort(8) }, { item: phones[1].id, port: 'port-1' }),
    // Printers → access
    link(colorId, { item: accessId, port: rackPort(9) }, { item: printers[0].id, port: 'port-1' }),
    link(colorId, { item: accessId, port: rackPort(10) }, { item: printers[1].id, port: 'port-1' }),
    // AP → access
    link(colorId, { item: accessId, port: rackPort(11) }, { item: ap.id, port: 'port-1' }),
    // Servers → core
    link(colorId, { item: coreId, port: rackPort(1) }, { item: servers[0].id, port: 'port-1' }),
    link(colorId, { item: coreId, port: rackPort(2) }, { item: servers[1].id, port: 'port-1' }),
    // Floor DIN → access uplink + meeting PCs
    link(colorId, { item: accessId, port: rackPort(13) }, { item: floorId, port: dinPort(8) }),
    link(colorId, { item: floorId, port: dinPort(1) }, { item: mtg[0].id, port: 'port-1' }),
    link(colorId, { item: floorId, port: dinPort(2) }, { item: mtg[1].id, port: 'port-1' }),
    // Lab 16p switch → core trunk + lab PC
    link(
      colorId,
      { item: coreId, port: rackPort(3) },
      { item: labSwitchId, port: builtinSwitchPort(16) }
    ),
    link(
      colorId,
      { item: labSwitchId, port: builtinSwitchPort(1) },
      { item: labPc.id, port: 'port-1' }
    )
  ];

  const items: ModelItem[] = [
    {
      id: cabinetId,
      name: 'SZAFA-IDF-1',
      icon: SHAPE_2D_CABINET_ID,
      rackUnits: 12,
      color: '#94a3b888'
    },
    {
      id: accessId,
      name: 'SW-ACCESS-01',
      icon: RACK_48_TEMPLATE.id,
      color: '#ffffff',
      ports: accessPorts,
      svis: []
    },
    {
      id: coreId,
      name: 'SW-CORE-01',
      icon: RACK_48_TEMPLATE.id,
      color: '#f8fafc',
      ports: corePorts,
      svis: [
        {
          id: generateId(),
          vlan: VLAN.users.id,
          ip: '10.10.10.1/24',
          vlanColor: VLAN.users.color
        },
        {
          id: generateId(),
          vlan: VLAN.voice.id,
          ip: '10.10.20.1/24',
          vlanColor: VLAN.voice.color
        },
        {
          id: generateId(),
          vlan: VLAN.servers.id,
          ip: '10.10.30.1/24',
          vlanColor: VLAN.servers.color
        },
        {
          id: generateId(),
          vlan: VLAN.iot.id,
          ip: '10.10.40.1/24',
          vlanColor: VLAN.iot.color
        }
      ]
    },
    {
      id: floorId,
      name: 'SW-FLOOR-MTG',
      icon: DIN_8_TEMPLATE.id,
      color: '#f1f5f9',
      ports: floorPorts
    },
    {
      id: labSwitchId,
      name: 'SW-LAB-16',
      icon: SHAPE_2D_SWITCH_ID,
      color: '#f8fafc',
      ports: labPorts
    },
    ...ws.map((pc) => {
      return {
        id: pc.id,
        name: pc.name,
        icon: SHAPE_2D_PC_ID,
        color: pc.color,
        ports: {
          'port-1': accessPort(VLAN.users.id, VLAN.users.color)
        }
      };
    }),
    ...phones.map((pc) => {
      return {
        id: pc.id,
        name: pc.name,
        icon: SHAPE_2D_PC_ID,
        color: pc.color,
        ports: {
          'port-1': accessPort(VLAN.voice.id, VLAN.voice.color)
        }
      };
    }),
    ...printers.map((pc) => {
      return {
        id: pc.id,
        name: pc.name,
        icon: SHAPE_2D_PC_ID,
        color: pc.color,
        ports: {
          'port-1': accessPort(VLAN.iot.id, VLAN.iot.color)
        }
      };
    }),
    ...servers.map((pc) => {
      return {
        id: pc.id,
        name: pc.name,
        icon: SHAPE_2D_PC_ID,
        color: pc.color,
        ports: {
          'port-1': accessPort(VLAN.servers.id, VLAN.servers.color)
        }
      };
    }),
    {
      id: ap.id,
      name: ap.name,
      icon: SHAPE_2D_PC_ID,
      color: ap.color,
      ports: {
        'port-1': accessPort(VLAN.users.id, VLAN.users.color)
      }
    },
    ...mtg.map((pc) => {
      return {
        id: pc.id,
        name: pc.name,
        icon: SHAPE_2D_PC_ID,
        color: pc.color,
        ports: {
          'port-1': accessPort(VLAN.users.id, VLAN.users.color)
        }
      };
    }),
    {
      id: labPc.id,
      name: labPc.name,
      icon: SHAPE_2D_PC_ID,
      color: labPc.color,
      ports: {
        'port-1': accessPort(VLAN.users.id, VLAN.users.color)
      }
    }
  ];

  return {
    title: 'Demo — szafa IDF + VLANy',
    version: '1.0',
    fitToView: true,
    projectionMode: 'TWO_D',
    icons: SHAPES_2D,
    colors: [{ ...DEFAULT_COLOR, id: colorId }],
    deviceTemplates: [RACK_48_TEMPLATE, DIN_8_TEMPLATE],
    items,
    views: [
      {
        id: viewId,
        name: 'Plan',
        items: [
          { id: cabinetId, tile: cabinetTile },
          {
            id: accessId,
            tile: accessTile,
            parentId: cabinetId,
            rackUnit: 0
          },
          {
            id: coreId,
            tile: coreTile,
            parentId: cabinetId,
            rackUnit: 2
          },
          { id: floorId, tile: floorTile },
          { id: labSwitchId, tile: labSwitchTile },
          ...ws.map((pc, i) => {
            return { id: pc.id, tile: wsTiles[i] };
          }),
          ...phones.map((pc, i) => {
            return { id: pc.id, tile: phoneTiles[i] };
          }),
          ...printers.map((pc, i) => {
            return { id: pc.id, tile: prnTiles[i] };
          }),
          ...servers.map((pc, i) => {
            return { id: pc.id, tile: srvTiles[i] };
          }),
          { id: ap.id, tile: apTile },
          ...mtg.map((pc, i) => {
            return { id: pc.id, tile: mtgTiles[i] };
          }),
          { id: labPc.id, tile: labPcTile }
        ],
        connectors
      }
    ],
    view: viewId
  };
};
