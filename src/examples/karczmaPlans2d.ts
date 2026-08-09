import type {
  Connector,
  DeviceTemplate,
  InitialData,
  ModelItem,
  View,
  ViewItem
} from 'src/types';
import {
  DEFAULT_COLOR,
  SHAPES_2D,
  SHAPE_2D_SWITCH_ID,
  SHAPE_2D_PC_ID,
  SHAPE_2D_AP_ID,
  SHAPE_2D_PRINTER_ID,
  SHAPE_2D_VOIP_ID,
  SHAPE_2D_CAMERA_V2_ID,
  SHAPE_2D_CABINET_ID,
  SHAPE_2D_BLANKING_ID,
  SHAPE_2D_PATCH_PANEL_ID,
  PATCH_PANEL_COLOR,
  PC_2D_SIZE,
  SWITCH_2D_SIZE,
  getCabinetSize
} from 'src/config';
import {
  generateId,
  layoutDeviceTemplate,
  getCabinetSlotTile,
  ViewKindEnum,
  defaultOrderForKind,
  ensureDeviceTemplateIcons
} from 'src/utils';
import { RACK_48_TEMPLATE, DIN_8_TEMPLATE } from './startingTopology2d';

/** Shared VLAN palette for Karczma demo plans. */
export const KARCZMA_VLANS = {
  users: { id: '10', color: '#3b82f6', name: 'Users' },
  voice: { id: '20', color: '#a855f7', name: 'Voice' },
  servers: { id: '30', color: '#22c55e', name: 'Servers' },
  iot: { id: '40', color: '#f59e0b', name: 'IoT' }
} as const;

type VlanKey = keyof typeof KARCZMA_VLANS;

const portByLabel = (template: DeviceTemplate, label: number | string) => {
  const layout = layoutDeviceTemplate(template);
  const port = layout.ports.find((item) => item.label === String(label));
  if (!port) throw new Error(`Port ${label} not found on ${template.id}`);
  return port.id;
};

const builtinSwitchPort = (portNumber: number) => {
  if (portNumber >= 1 && portNumber <= 8) return `port-top-${portNumber}`;
  if (portNumber >= 9 && portNumber <= 16) {
    return `port-bottom-${portNumber - 8}`;
  }
  throw new Error(`Invalid built-in switch port: ${portNumber}`);
};

const link = (
  colorId: string,
  a: { item: string; port: string },
  b: { item: string; port: string }
): Connector => ({
  id: generateId(),
  color: colorId,
  anchors: [
    { id: generateId(), ref: a },
    { id: generateId(), ref: b }
  ]
});

const accessPort = (vlan: string, color: string, extras?: { name?: string }) => ({
  type: 'access' as const,
  vlan,
  vlanColor: color,
  speed: '1G' as const,
  ...(extras?.name ? { name: extras.name } : {})
});

const notes = (paragraphs: string[]) =>
  paragraphs.map((p) => `<p>${p}</p>`).join('');

type HostSpec = {
  id: string;
  name: string;
  icon: string;
  color: string;
  vlan: VlanKey;
  ip?: string;
  dhcp?: boolean;
  poweredByPoe?: boolean;
  descriptionTitle?: string;
  descriptionSummary?: string;
  description?: string;
};

const makeHost = (
  name: string,
  opts: {
    icon?: string;
    color: string;
    vlan: VlanKey;
    ip?: string;
    dhcp?: boolean;
    poweredByPoe?: boolean;
    descriptionTitle?: string;
    descriptionSummary?: string;
    description?: string;
  }
): HostSpec => ({
  id: generateId(),
  name,
  icon: opts.icon ?? SHAPE_2D_PC_ID,
  color: opts.color,
  vlan: opts.vlan,
  ip: opts.ip,
  dhcp: opts.dhcp,
  poweredByPoe: opts.poweredByPoe,
  descriptionTitle: opts.descriptionTitle,
  descriptionSummary: opts.descriptionSummary,
  description: opts.description
});

const hostModel = (host: HostSpec): ModelItem => {
  const vlan = KARCZMA_VLANS[host.vlan];
  return {
    id: host.id,
    name: host.name,
    icon: host.icon,
    color: host.color,
    ip: host.dhcp ? undefined : host.ip,
    dhcp: host.dhcp || undefined,
    poweredByPoe: host.poweredByPoe || undefined,
    descriptionTitle: host.descriptionTitle,
    descriptionSummary: host.descriptionSummary,
    description: host.description,
    ports: {
      'port-1': accessPort(vlan.id, vlan.color)
    }
  };
};

type PlanBuild = {
  items: ModelItem[];
  viewItems: ViewItem[];
  connectors: Connector[];
  viewId: string;
  name: string;
  kind: typeof ViewKindEnum.PLAN_2D_V3 | typeof ViewKindEnum.PLAN_2D;
  order: number;
};

/**
 * Szafa - Schowek — enriched original demo (cabinet + edge gear).
 * ~30 devices, 4 VLANs, SVIs, descriptions, patch panel, UPS/NAS blanking.
 */
const buildSchowekPlan = (colorId: string): PlanBuild => {
  const viewId = generateId();
  const rackPort = (n: number) => portByLabel(RACK_48_TEMPLATE, n);
  const dinPort = (n: number) => portByLabel(DIN_8_TEMPLATE, n);
  const dinSize = layoutDeviceTemplate(DIN_8_TEMPLATE).size;

  const cabinetId = generateId();
  const patchId = generateId();
  const upsId = generateId();
  const nasBlankId = generateId();
  const coreId = generateId();
  const accessId = generateId();
  const floorId = generateId();
  const labSwitchId = generateId();

  const users = Array.from({ length: 10 }, (_, i) => {
    const base = {
      color: '#e2e8f0',
      vlan: 'users' as const,
      ...(i < 7 ? { ip: `10.10.10.${20 + i}/24` } : { dhcp: true })
    };
    if (i === 0) {
      return makeHost(`PC-WS-${String(i + 1).padStart(2, '0')}`, {
        ...base,
        descriptionTitle: 'Stanowisko barmana',
        descriptionSummary: 'Kasjer / bar — stały IP w VLAN Users',
        description: notes([
          'Główne stanowisko POS przy barze.',
          'VLAN 10 (Users), gateway 10.10.10.1. Po restarcie sprawdzić drukarkę fiskalną na USB.'
        ])
      });
    }
    return makeHost(`PC-WS-${String(i + 1).padStart(2, '0')}`, base);
  });

  const phones = Array.from({ length: 4 }, (_, i) =>
    makeHost(`PHONE-${String(i + 1).padStart(2, '0')}`, {
      icon: SHAPE_2D_VOIP_ID,
      color: '#f3e8ff',
      vlan: 'voice',
      ip: `10.10.20.${10 + i}/24`,
      poweredByPoe: true,
      descriptionTitle: i === 0 ? 'Recepcja VoIP' : undefined,
      descriptionSummary: i === 0 ? 'Telefon + PoE z access SW' : undefined
    })
  );

  const printers = Array.from({ length: 3 }, (_, i) =>
    makeHost(`PRN-${String(i + 1).padStart(2, '0')}`, {
      icon: SHAPE_2D_PRINTER_ID,
      color: '#ffedd5',
      vlan: 'iot',
      ip: `10.10.40.${10 + i}/24`,
      descriptionTitle: i === 0 ? 'Drukarka kuchnia' : undefined,
      descriptionSummary: i === 0 ? 'VLAN IoT — bez dostępu do Users' : undefined
    })
  );

  const cameras = Array.from({ length: 2 }, (_, i) =>
    makeHost(`CAM-${String(i + 1).padStart(2, '0')}`, {
      icon: SHAPE_2D_CAMERA_V2_ID,
      color: '#fee2e2',
      vlan: 'iot',
      ip: `10.10.40.${30 + i}/24`,
      poweredByPoe: true
    })
  );

  const servers = [
    makeHost('SRV-DC', {
      color: '#dcfce7',
      vlan: 'servers',
      ip: '10.10.30.10/24',
      descriptionTitle: 'Kontroler domeny',
      descriptionSummary: 'AD / DNS / DHCP — VLAN Servers',
      description: notes([
        'Role: AD DS, DNS, DHCP (scope Users + Voice).',
        'Backup nocny na NAS w szafie. Po zmianie VLAN sprawdzić binding DHCP.'
      ])
    }),
    makeHost('SRV-APP', {
      color: '#dcfce7',
      vlan: 'servers',
      ip: '10.10.30.11/24',
      descriptionTitle: 'Aplikacja restauracyjna',
      descriptionSummary: 'POS backend + raporty'
    }),
    makeHost('SRV-FILE', {
      color: '#dcfce7',
      vlan: 'servers',
      ip: '10.10.30.12/24',
      dhcp: true,
      descriptionSummary: 'Pliki współdzielone — tymczasowo DHCP'
    })
  ];

  const ap = makeHost('AP-WIFI-01', {
    icon: SHAPE_2D_AP_ID,
    color: '#dbeafe',
    vlan: 'users',
    ip: '10.10.10.50/24',
    poweredByPoe: true,
    descriptionTitle: 'AP sala główna',
    descriptionSummary: 'SSID Karczma-Guest / Karczma-Staff',
    description: notes([
      'PoE z SW-ACCESS-01. Guest w VLAN Users z ACL na firewallu.',
      'Staff SSID mapowany na VLAN 10; IoT osobno (kamery).'
    ])
  });

  const mtg = Array.from({ length: 3 }, (_, i) =>
    makeHost(`PC-MTG-${String(i + 1).padStart(2, '0')}`, {
      color: '#e2e8f0',
      vlan: 'users',
      dhcp: true
    })
  );

  const labPc = makeHost('PC-LAB-01', {
    color: '#e2e8f0',
    vlan: 'users',
    ip: '10.10.10.80/24',
    descriptionTitle: 'Stanowisko serwisowe',
    descriptionSummary: 'Laptop serwisowy — lab switch'
  });

  // Count check: 10+4+3+2+3+1+3+1 hosts = 27 + 4 switches + cab + patch + 2 blank = 34 items

  const cabinetTile = { x: -40, y: -36 };
  const cabinetSize = getCabinetSize(18);
  const accessTile = getCabinetSlotTile(cabinetTile, 0);
  const patchTile = getCabinetSlotTile(cabinetTile, 1, { fullWidth: true });
  const coreTile = getCabinetSlotTile(cabinetTile, 2);
  const upsTile = getCabinetSlotTile(cabinetTile, 4, { fullWidth: true });
  const nasTile = getCabinetSlotTile(cabinetTile, 6, { fullWidth: true });

  const rightX = cabinetTile.x + cabinetSize.width + 8;
  const gap = PC_2D_SIZE.width + 3;
  const grid = (count: number, startY: number, cols = 5) =>
    Array.from({ length: count }, (_, i) => ({
      x: rightX + (i % cols) * gap,
      y: startY + Math.floor(i / cols) * (PC_2D_SIZE.height + 3)
    }));

  const userTiles = grid(10, -48, 5);
  const phoneTiles = grid(4, -28, 4);
  const prnTiles = grid(3, -28, 3).map((t, i) => ({
    ...t,
    x: rightX + (4 + i) * gap
  }));
  const camTiles = [
    { x: rightX + 7 * gap, y: -28 },
    { x: rightX + 8 * gap, y: -28 }
  ];
  const srvTiles = grid(3, -64, 3);
  const apTile = { x: rightX + 5 * gap, y: -48 };
  const floorTile = { x: rightX, y: -8 };
  const mtgTiles = grid(3, -8, 3).map((t) => ({
    ...t,
    x: t.x + dinSize.width + 4
  }));
  const labSwitchTile = { x: rightX + 4 * gap, y: -64 };
  const labPcTile = {
    x: labSwitchTile.x + SWITCH_2D_SIZE.width + 3,
    y: -64
  };

  // First 6 PCs via patch panel; rest direct to access
  const patchHosts = users.slice(0, 6);
  const directHosts = users.slice(6);

  const accessPorts: NonNullable<ModelItem['ports']> = {};
  // Patch → access ports 1–6
  for (let i = 1; i <= 6; i += 1) {
    accessPorts[rackPort(i)] = accessPort(
      KARCZMA_VLANS.users.id,
      KARCZMA_VLANS.users.color,
      { name: `pp-uplink-${i}` }
    );
  }
  directHosts.forEach((_, i) => {
    accessPorts[rackPort(7 + i)] = accessPort(
      KARCZMA_VLANS.users.id,
      KARCZMA_VLANS.users.color
    );
  });
  phones.forEach((_, i) => {
    accessPorts[rackPort(15 + i)] = accessPort(
      KARCZMA_VLANS.voice.id,
      KARCZMA_VLANS.voice.color
    );
  });
  printers.forEach((_, i) => {
    accessPorts[rackPort(20 + i)] = accessPort(
      KARCZMA_VLANS.iot.id,
      KARCZMA_VLANS.iot.color
    );
  });
  cameras.forEach((_, i) => {
    accessPorts[rackPort(24 + i)] = accessPort(
      KARCZMA_VLANS.iot.id,
      KARCZMA_VLANS.iot.color
    );
  });
  accessPorts[rackPort(28)] = accessPort(
    KARCZMA_VLANS.users.id,
    KARCZMA_VLANS.users.color
  );
  accessPorts[rackPort(30)] = {
    type: 'access',
    vlan: KARCZMA_VLANS.users.id,
    vlanColor: KARCZMA_VLANS.users.color,
    speed: '1G',
    name: 'uplink-floor'
  };
  accessPorts[rackPort(48)] = {
    type: 'trunk',
    speed: '10G',
    name: 'trunk-to-core',
    label: 'Po48'
  };

  const corePorts: NonNullable<ModelItem['ports']> = {
    [rackPort(1)]: accessPort(
      KARCZMA_VLANS.servers.id,
      KARCZMA_VLANS.servers.color
    ),
    [rackPort(2)]: accessPort(
      KARCZMA_VLANS.servers.id,
      KARCZMA_VLANS.servers.color
    ),
    [rackPort(3)]: accessPort(
      KARCZMA_VLANS.servers.id,
      KARCZMA_VLANS.servers.color
    ),
    [rackPort(5)]: {
      type: 'trunk',
      speed: '1G',
      name: 'trunk-to-lab',
      label: 'Po5'
    },
    [rackPort(48)]: {
      type: 'trunk',
      speed: '10G',
      name: 'trunk-to-access',
      label: 'Po48'
    }
  };

  const floorPorts: NonNullable<ModelItem['ports']> = {
    [dinPort(1)]: accessPort(KARCZMA_VLANS.users.id, KARCZMA_VLANS.users.color),
    [dinPort(2)]: accessPort(KARCZMA_VLANS.users.id, KARCZMA_VLANS.users.color),
    [dinPort(3)]: accessPort(KARCZMA_VLANS.users.id, KARCZMA_VLANS.users.color),
    [dinPort(8)]: {
      type: 'access',
      vlan: KARCZMA_VLANS.users.id,
      vlanColor: KARCZMA_VLANS.users.color,
      speed: '1G',
      name: 'uplink-access'
    }
  };

  const labPorts: NonNullable<ModelItem['ports']> = {
    [builtinSwitchPort(1)]: accessPort(
      KARCZMA_VLANS.users.id,
      KARCZMA_VLANS.users.color
    ),
    [builtinSwitchPort(16)]: {
      type: 'trunk',
      speed: '1G',
      name: 'uplink-core'
    }
  };

  const connectors: Connector[] = [
    link(
      colorId,
      { item: accessId, port: rackPort(48) },
      { item: coreId, port: rackPort(48) }
    ),
    // Patch bridges: host ↔ pp-N ↔ access
    ...patchHosts.flatMap((pc, i) => {
      const jack = `pp-${i + 1}`;
      return [
        link(
          colorId,
          { item: pc.id, port: 'port-1' },
          { item: patchId, port: jack }
        ),
        link(
          colorId,
          { item: patchId, port: jack },
          { item: accessId, port: rackPort(i + 1) }
        )
      ];
    }),
    ...directHosts.map((pc, i) =>
      link(
        colorId,
        { item: accessId, port: rackPort(7 + i) },
        { item: pc.id, port: 'port-1' }
      )
    ),
    ...phones.map((pc, i) =>
      link(
        colorId,
        { item: accessId, port: rackPort(15 + i) },
        { item: pc.id, port: 'port-1' }
      )
    ),
    ...printers.map((pc, i) =>
      link(
        colorId,
        { item: accessId, port: rackPort(20 + i) },
        { item: pc.id, port: 'port-1' }
      )
    ),
    ...cameras.map((pc, i) =>
      link(
        colorId,
        { item: accessId, port: rackPort(24 + i) },
        { item: pc.id, port: 'port-1' }
      )
    ),
    link(
      colorId,
      { item: accessId, port: rackPort(28) },
      { item: ap.id, port: 'port-1' }
    ),
    ...servers.map((pc, i) =>
      link(
        colorId,
        { item: coreId, port: rackPort(i + 1) },
        { item: pc.id, port: 'port-1' }
      )
    ),
    link(
      colorId,
      { item: accessId, port: rackPort(30) },
      { item: floorId, port: dinPort(8) }
    ),
    ...mtg.map((pc, i) =>
      link(
        colorId,
        { item: floorId, port: dinPort(i + 1) },
        { item: pc.id, port: 'port-1' }
      )
    ),
    link(
      colorId,
      { item: coreId, port: rackPort(5) },
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
      rackUnits: 18,
      color: '#94a3b888',
      descriptionTitle: 'IDF Schowek',
      descriptionSummary: 'Szafa 18U — access, core, patch, UPS, NAS',
      description: notes([
        'Lokalizacja: schowek przy sali głównej.',
        'U0 access · U1 patch 24p · U2 core · U4–5 UPS · U6 NAS.'
      ])
    },
    {
      id: patchId,
      name: 'PP-SCHOWEK-01',
      icon: SHAPE_2D_PATCH_PANEL_ID,
      portCount: 24,
      color: PATCH_PANEL_COLOR,
      descriptionTitle: 'Patch panel',
      descriptionSummary: 'Mostek stanowisk 1–6 do SW-ACCESS'
    },
    {
      id: upsId,
      name: 'UPS-1500',
      icon: SHAPE_2D_BLANKING_ID,
      rackUnits: 2,
      color: '#334155',
      descriptionTitle: 'UPS rack 1500VA',
      descriptionSummary: 'Zasilanie szafy IDF — zaślepka 2U z opisem',
      description: notes([
        'APC / Eaton 1500VA, runtime ~12 min przy load 50%.',
        'Podpięte: SW-ACCESS, SW-CORE, NAS. Monitoring SNMP planowany.'
      ])
    },
    {
      id: nasBlankId,
      name: 'NAS-BACKUP',
      icon: SHAPE_2D_BLANKING_ID,
      rackUnits: 1,
      color: '#1e293b',
      descriptionTitle: 'NAS backup',
      descriptionSummary: 'Synology — etykieta 1U w szafie',
      description: notes([
        'Fizycznie w szafie (zaślepka / placeholder). Adres mgmt w VLAN Servers po podłączeniu.'
      ])
    },
    {
      id: accessId,
      name: 'SW-ACCESS-01',
      icon: RACK_48_TEMPLATE.id,
      color: '#ffffff',
      ports: accessPorts,
      svis: [],
      descriptionTitle: 'Access switch',
      descriptionSummary: 'Edge VLAN 10/20/40 + uplink do core'
    },
    {
      id: coreId,
      name: 'SW-CORE-01',
      icon: RACK_48_TEMPLATE.id,
      color: '#f8fafc',
      ports: corePorts,
      descriptionTitle: 'Core / L3',
      descriptionSummary: 'SVI dla VLAN 10/20/30/40',
      description: notes([
        'Warstwa L3 dla Karczmy. Gateway’e SVI poniżej.',
        'Trunk Po48 do access, Po5 do labu.'
      ]),
      svis: [
        {
          id: generateId(),
          vlan: KARCZMA_VLANS.users.id,
          ip: '10.10.10.1/24',
          vlanColor: KARCZMA_VLANS.users.color
        },
        {
          id: generateId(),
          vlan: KARCZMA_VLANS.voice.id,
          ip: '10.10.20.1/24',
          vlanColor: KARCZMA_VLANS.voice.color
        },
        {
          id: generateId(),
          vlan: KARCZMA_VLANS.servers.id,
          ip: '10.10.30.1/24',
          vlanColor: KARCZMA_VLANS.servers.color
        },
        {
          id: generateId(),
          vlan: KARCZMA_VLANS.iot.id,
          ip: '10.10.40.1/24',
          vlanColor: KARCZMA_VLANS.iot.color
        }
      ]
    },
    {
      id: floorId,
      name: 'SW-FLOOR-MTG',
      icon: DIN_8_TEMPLATE.id,
      color: '#f1f5f9',
      ports: floorPorts,
      ip: '10.10.10.2/24',
      descriptionSummary: 'DIN sala konferencyjna'
    },
    {
      id: labSwitchId,
      name: 'SW-LAB-16',
      icon: SHAPE_2D_SWITCH_ID,
      color: '#f8fafc',
      ports: labPorts
    },
    ...users.map(hostModel),
    ...phones.map(hostModel),
    ...printers.map(hostModel),
    ...cameras.map(hostModel),
    ...servers.map(hostModel),
    hostModel(ap),
    ...mtg.map(hostModel),
    hostModel(labPc)
  ];

  const viewItems: ViewItem[] = [
    { id: cabinetId, tile: cabinetTile },
    { id: accessId, tile: accessTile, parentId: cabinetId, rackUnit: 0 },
    {
      id: patchId,
      tile: patchTile,
      parentId: cabinetId,
      rackUnit: 1
    },
    { id: coreId, tile: coreTile, parentId: cabinetId, rackUnit: 2 },
    { id: upsId, tile: upsTile, parentId: cabinetId, rackUnit: 4 },
    { id: nasBlankId, tile: nasTile, parentId: cabinetId, rackUnit: 6 },
    { id: floorId, tile: floorTile },
    { id: labSwitchId, tile: labSwitchTile },
    ...users.map((pc, i) => ({ id: pc.id, tile: userTiles[i] })),
    ...phones.map((pc, i) => ({ id: pc.id, tile: phoneTiles[i] })),
    ...printers.map((pc, i) => ({ id: pc.id, tile: prnTiles[i] })),
    ...cameras.map((pc, i) => ({ id: pc.id, tile: camTiles[i] })),
    ...servers.map((pc, i) => ({ id: pc.id, tile: srvTiles[i] })),
    { id: ap.id, tile: apTile },
    ...mtg.map((pc, i) => ({ id: pc.id, tile: mtgTiles[i] })),
    { id: labPc.id, tile: labPcTile }
  ];

  return {
    items,
    viewItems,
    connectors,
    viewId,
    name: 'Szafa - Schowek',
    kind: ViewKindEnum.PLAN_2D_V3,
    order: defaultOrderForKind(ViewKindEnum.PLAN_2D_V3)
  };
};

/**
 * Biuro — dwa racki, ~30 endpointów, 2× RACK48, bez patchy.
 */
const buildBiuroPlan = (colorId: string): PlanBuild => {
  const viewId = generateId();
  const rackPort = (n: number) => portByLabel(RACK_48_TEMPLATE, n);

  const cabA = generateId();
  const cabB = generateId();
  const swA = generateId();
  const swB = generateId();
  const upsA = generateId();

  const hosts: HostSpec[] = [];
  for (let i = 1; i <= 16; i += 1) {
    hosts.push(
      makeHost(`PC-B-${String(i).padStart(2, '0')}`, {
        color: '#e2e8f0',
        vlan: 'users',
        ip: i <= 12 ? `10.20.10.${20 + i}/24` : undefined,
        dhcp: i > 12,
        descriptionTitle: i === 1 ? 'Recepcja biura' : undefined,
        descriptionSummary: i === 1 ? 'Pierwsze stanowisko — stały IP' : undefined,
        description:
          i === 1
            ? notes([
                'Recepcja Karczma Biuro.',
                'Drukarka PRN-B-01 w VLAN IoT; ten PC tylko Users.'
              ])
            : undefined
      })
    );
  }
  for (let i = 1; i <= 4; i += 1) {
    hosts.push(
      makeHost(`PHONE-B-${String(i).padStart(2, '0')}`, {
        icon: SHAPE_2D_VOIP_ID,
        color: '#f3e8ff',
        vlan: 'voice',
        ip: `10.20.20.${10 + i}/24`,
        poweredByPoe: true
      })
    );
  }
  for (let i = 1; i <= 4; i += 1) {
    hosts.push(
      makeHost(`PRN-B-${String(i).padStart(2, '0')}`, {
        icon: SHAPE_2D_PRINTER_ID,
        color: '#ffedd5',
        vlan: 'iot',
        ip: `10.20.40.${10 + i}/24`
      })
    );
  }
  for (let i = 1; i <= 3; i += 1) {
    hosts.push(
      makeHost(`CAM-B-${String(i).padStart(2, '0')}`, {
        icon: SHAPE_2D_CAMERA_V2_ID,
        color: '#fee2e2',
        vlan: 'iot',
        dhcp: true,
        poweredByPoe: true
      })
    );
  }
  hosts.push(
    makeHost('AP-B-01', {
      icon: SHAPE_2D_AP_ID,
      color: '#dbeafe',
      vlan: 'users',
      ip: '10.20.10.50/24',
      poweredByPoe: true,
      descriptionTitle: 'AP biuro',
      descriptionSummary: 'Pokrycie open space'
    }),
    makeHost('SRV-B-FILE', {
      color: '#dcfce7',
      vlan: 'servers',
      ip: '10.20.30.10/24',
      descriptionTitle: 'File server biuro',
      descriptionSummary: 'Udziały księgowość / HR'
    }),
    makeHost('SRV-B-APP', {
      color: '#dcfce7',
      vlan: 'servers',
      ip: '10.20.30.11/24'
    })
  );

  // 16+4+4+3+1+2 = 30 hosts + 2 SW + 2 cab + 1 ups = 35

  const tileA = { x: -80, y: -20 };
  const tileB = { x: -10, y: -20 };
  const sizeA = getCabinetSize(12);
  const gap = PC_2D_SIZE.width + 3;
  const hostOrigin = {
    x: tileB.x + getCabinetSize(12).width + 10,
    y: -48
  };
  const hostTiles = hosts.map((_, i) => ({
    x: hostOrigin.x + (i % 6) * gap,
    y: hostOrigin.y + Math.floor(i / 6) * (PC_2D_SIZE.height + 3)
  }));

  const portsA: NonNullable<ModelItem['ports']> = {
    [rackPort(48)]: {
      type: 'trunk',
      speed: '10G',
      name: 'trunk-to-B'
    }
  };
  const portsB: NonNullable<ModelItem['ports']> = {
    [rackPort(48)]: {
      type: 'trunk',
      speed: '10G',
      name: 'trunk-to-A'
    }
  };

  // SW-A: first 16 user PCs + phones on B mostly — split load
  hosts.slice(0, 16).forEach((h, i) => {
    const vlan = KARCZMA_VLANS[h.vlan];
    portsA[rackPort(i + 1)] = accessPort(vlan.id, vlan.color);
  });
  hosts.slice(16).forEach((h, i) => {
    const vlan = KARCZMA_VLANS[h.vlan];
    portsB[rackPort(i + 1)] = accessPort(vlan.id, vlan.color);
  });

  const connectors: Connector[] = [
    link(
      colorId,
      { item: swA, port: rackPort(48) },
      { item: swB, port: rackPort(48) }
    ),
    ...hosts.slice(0, 16).map((h, i) =>
      link(
        colorId,
        { item: swA, port: rackPort(i + 1) },
        { item: h.id, port: 'port-1' }
      )
    ),
    ...hosts.slice(16).map((h, i) =>
      link(
        colorId,
        { item: swB, port: rackPort(i + 1) },
        { item: h.id, port: 'port-1' }
      )
    )
  ];

  const items: ModelItem[] = [
    {
      id: cabA,
      name: 'SZAFA-BIURO-A',
      icon: SHAPE_2D_CABINET_ID,
      rackUnits: 12,
      color: '#94a3b888',
      descriptionTitle: 'Rack A',
      descriptionSummary: 'Access SW + UPS'
    },
    {
      id: cabB,
      name: 'SZAFA-BIURO-B',
      icon: SHAPE_2D_CABINET_ID,
      rackUnits: 12,
      color: '#94a3b888',
      descriptionTitle: 'Rack B',
      descriptionSummary: 'Drugi access / serwery biurowe'
    },
    {
      id: upsA,
      name: 'UPS-BIURO',
      icon: SHAPE_2D_BLANKING_ID,
      rackUnits: 2,
      color: '#334155',
      descriptionTitle: 'UPS biuro',
      descriptionSummary: '2U — zasilanie rack A',
      description: notes(['Runtime ok. 15 min. Podpięty SW-BIURO-A.'])
    },
    {
      id: swA,
      name: 'SW-BIURO-A',
      icon: RACK_48_TEMPLATE.id,
      color: '#fff',
      ports: portsA,
      svis: [
        {
          id: generateId(),
          vlan: KARCZMA_VLANS.users.id,
          ip: '10.20.10.1/24',
          vlanColor: KARCZMA_VLANS.users.color
        },
        {
          id: generateId(),
          vlan: KARCZMA_VLANS.voice.id,
          ip: '10.20.20.1/24',
          vlanColor: KARCZMA_VLANS.voice.color
        }
      ]
    },
    {
      id: swB,
      name: 'SW-BIURO-B',
      icon: RACK_48_TEMPLATE.id,
      color: '#f8fafc',
      ports: portsB,
      svis: [
        {
          id: generateId(),
          vlan: KARCZMA_VLANS.servers.id,
          ip: '10.20.30.1/24',
          vlanColor: KARCZMA_VLANS.servers.color
        },
        {
          id: generateId(),
          vlan: KARCZMA_VLANS.iot.id,
          ip: '10.20.40.1/24',
          vlanColor: KARCZMA_VLANS.iot.color
        }
      ],
      descriptionTitle: 'L3 biuro (część SVI)',
      descriptionSummary: 'SVI Servers + IoT'
    },
    ...hosts.map(hostModel)
  ];

  void sizeA;

  const viewItems: ViewItem[] = [
    { id: cabA, tile: tileA },
    { id: cabB, tile: tileB },
    {
      id: upsA,
      tile: getCabinetSlotTile(tileA, 0, { fullWidth: true }),
      parentId: cabA,
      rackUnit: 0
    },
    {
      id: swA,
      tile: getCabinetSlotTile(tileA, 2),
      parentId: cabA,
      rackUnit: 2
    },
    {
      id: swB,
      tile: getCabinetSlotTile(tileB, 0),
      parentId: cabB,
      rackUnit: 0
    },
    ...hosts.map((h, i) => ({ id: h.id, tile: hostTiles[i] }))
  ];

  return {
    items,
    viewItems,
    connectors,
    viewId,
    name: 'Biuro - Open space',
    kind: ViewKindEnum.PLAN_2D_V3,
    order: defaultOrderForKind(ViewKindEnum.PLAN_2D_V3) + 1
  };
};

/**
 * Serwerownia — 1 duża szafa, 3 switche, patch panel, ~30 urządzeń.
 */
const buildSerwerowniaPlan = (colorId: string): PlanBuild => {
  const viewId = generateId();
  const rackPort = (n: number) => portByLabel(RACK_48_TEMPLATE, n);

  const cabId = generateId();
  const coreId = generateId();
  const accId = generateId();
  const aggId = generateId();
  const ppId = generateId();
  const upsId = generateId();
  const blankId = generateId();

  const servers: HostSpec[] = Array.from({ length: 8 }, (_, i) =>
    makeHost(`SRV-DC-${String(i + 1).padStart(2, '0')}`, {
      color: '#dcfce7',
      vlan: 'servers',
      ip: `10.30.30.${10 + i}/24`,
      descriptionTitle: i === 0 ? 'Hypervisor 01' : undefined,
      descriptionSummary: i === 0 ? 'Proxmox / VMs POS' : undefined,
      description:
        i === 0
          ? notes([
              'Cluster node 1. Mgmt w VLAN Servers.',
              'Backup snapshotów na NAS-BACKUP (Schowek) — osobna sieć planowana.'
            ])
          : undefined
    })
  );

  const users: HostSpec[] = Array.from({ length: 12 }, (_, i) =>
    makeHost(`PC-NOC-${String(i + 1).padStart(2, '0')}`, {
      color: '#e2e8f0',
      vlan: 'users',
      ip: i < 8 ? `10.30.10.${20 + i}/24` : undefined,
      dhcp: i >= 8
    })
  );

  const iot: HostSpec[] = [
    ...Array.from({ length: 4 }, (_, i) =>
      makeHost(`CAM-SRV-${String(i + 1).padStart(2, '0')}`, {
        icon: SHAPE_2D_CAMERA_V2_ID,
        color: '#fee2e2',
        vlan: 'iot',
        poweredByPoe: true,
        dhcp: true
      })
    ),
    ...Array.from({ length: 3 }, (_, i) =>
      makeHost(`SENS-${String(i + 1).padStart(2, '0')}`, {
        icon: SHAPE_2D_PC_ID,
        color: '#ffedd5',
        vlan: 'iot',
        ip: `10.30.40.${20 + i}/24`,
        descriptionTitle: i === 0 ? 'Czujnik klimatu' : undefined,
        descriptionSummary: i === 0 ? 'Temp/RH w serwerowni' : undefined
      })
    ),
    makeHost('AP-SRV-01', {
      icon: SHAPE_2D_AP_ID,
      color: '#dbeafe',
      vlan: 'users',
      ip: '10.30.10.50/24',
      poweredByPoe: true
    }),
    makeHost('PHONE-NOC-01', {
      icon: SHAPE_2D_VOIP_ID,
      color: '#f3e8ff',
      vlan: 'voice',
      ip: '10.30.20.10/24',
      poweredByPoe: true,
      descriptionTitle: 'Telefon NOC',
      descriptionSummary: 'Dyżur techniczny'
    })
  ];

  // 8+12+4+3+1+1 = 29 hosts

  const cabTile = { x: -30, y: -40 };
  const cabSize = getCabinetSize(24);
  const gap = PC_2D_SIZE.width + 3;
  const rightX = cabTile.x + cabSize.width + 10;

  const srvTiles = servers.map((_, i) => ({
    x: rightX + (i % 4) * gap,
    y: -64 + Math.floor(i / 4) * (PC_2D_SIZE.height + 3)
  }));
  const userTiles = users.map((_, i) => ({
    x: rightX + (i % 6) * gap,
    y: -40 + Math.floor(i / 6) * (PC_2D_SIZE.height + 3)
  }));
  const iotTiles = iot.map((_, i) => ({
    x: rightX + (i % 5) * gap,
    y: -16 + Math.floor(i / 5) * (PC_2D_SIZE.height + 3)
  }));

  // Patch: first 8 NOC PCs through panel
  const patchUsers = users.slice(0, 8);
  const directUsers = users.slice(8);

  const accPorts: NonNullable<ModelItem['ports']> = {
    [rackPort(48)]: { type: 'trunk', speed: '10G', name: 'to-agg' }
  };
  patchUsers.forEach((_, i) => {
    accPorts[rackPort(i + 1)] = accessPort(
      KARCZMA_VLANS.users.id,
      KARCZMA_VLANS.users.color,
      { name: `from-pp-${i + 1}` }
    );
  });
  directUsers.forEach((_, i) => {
    accPorts[rackPort(10 + i)] = accessPort(
      KARCZMA_VLANS.users.id,
      KARCZMA_VLANS.users.color
    );
  });
  iot.forEach((h, i) => {
    const vlan = KARCZMA_VLANS[h.vlan];
    accPorts[rackPort(20 + i)] = accessPort(vlan.id, vlan.color);
  });

  const corePorts: NonNullable<ModelItem['ports']> = {
    [rackPort(48)]: { type: 'trunk', speed: '10G', name: 'to-agg' }
  };
  servers.forEach((_, i) => {
    corePorts[rackPort(i + 1)] = accessPort(
      KARCZMA_VLANS.servers.id,
      KARCZMA_VLANS.servers.color
    );
  });

  const aggPorts: NonNullable<ModelItem['ports']> = {
    [rackPort(47)]: { type: 'trunk', speed: '10G', name: 'to-access' },
    [rackPort(48)]: { type: 'trunk', speed: '10G', name: 'to-core' }
  };

  const connectors: Connector[] = [
    link(
      colorId,
      { item: accId, port: rackPort(48) },
      { item: aggId, port: rackPort(47) }
    ),
    link(
      colorId,
      { item: coreId, port: rackPort(48) },
      { item: aggId, port: rackPort(48) }
    ),
    ...patchUsers.flatMap((h, i) => {
      const jack = `pp-${i + 1}`;
      return [
        link(
          colorId,
          { item: h.id, port: 'port-1' },
          { item: ppId, port: jack }
        ),
        link(
          colorId,
          { item: ppId, port: jack },
          { item: accId, port: rackPort(i + 1) }
        )
      ];
    }),
    ...directUsers.map((h, i) =>
      link(
        colorId,
        { item: accId, port: rackPort(10 + i) },
        { item: h.id, port: 'port-1' }
      )
    ),
    ...iot.map((h, i) =>
      link(
        colorId,
        { item: accId, port: rackPort(20 + i) },
        { item: h.id, port: 'port-1' }
      )
    ),
    ...servers.map((h, i) =>
      link(
        colorId,
        { item: coreId, port: rackPort(i + 1) },
        { item: h.id, port: 'port-1' }
      )
    )
  ];

  const items: ModelItem[] = [
    {
      id: cabId,
      name: 'SZAFA-SERWEROWNIA',
      icon: SHAPE_2D_CABINET_ID,
      rackUnits: 24,
      color: '#64748b88',
      descriptionTitle: 'Serwerownia 24U',
      descriptionSummary: 'Core / agg / access + patch + UPS',
      description: notes([
        'Klimatyzacja niezależna. Dostęp kartą.',
        'U0 UPS · U2 blank · U3 patch · U4 access · U6 agg · U8 core.'
      ])
    },
    {
      id: upsId,
      name: 'UPS-3000',
      icon: SHAPE_2D_BLANKING_ID,
      rackUnits: 2,
      color: '#0f172a',
      descriptionTitle: 'UPS 3000VA',
      descriptionSummary: 'Główne zasilanie serwerowni',
      description: notes([
        'Online UPS, bypass serwisowy. Podłączone wszystkie switche w szafie.'
      ])
    },
    {
      id: blankId,
      name: 'ZAŚLEPKA',
      icon: SHAPE_2D_BLANKING_ID,
      rackUnits: 1,
      color: '#cbd5e1',
      descriptionSummary: 'Wentylacja / filler 1U'
    },
    {
      id: ppId,
      name: 'PP-SRV-01',
      icon: SHAPE_2D_PATCH_PANEL_ID,
      portCount: 24,
      color: PATCH_PANEL_COLOR,
      descriptionTitle: 'Patch NOC',
      descriptionSummary: 'Stanowiska NOC 1–8 przez patch'
    },
    {
      id: accId,
      name: 'SW-SRV-ACC',
      icon: RACK_48_TEMPLATE.id,
      color: '#fff',
      ports: accPorts
    },
    {
      id: aggId,
      name: 'SW-SRV-AGG',
      icon: RACK_48_TEMPLATE.id,
      color: '#f1f5f9',
      ports: aggPorts,
      descriptionTitle: 'Aggregation',
      descriptionSummary: 'Trunk access ↔ core'
    },
    {
      id: coreId,
      name: 'SW-SRV-CORE',
      icon: RACK_48_TEMPLATE.id,
      color: '#f8fafc',
      ports: corePorts,
      descriptionTitle: 'Core L3 serwerowni',
      descriptionSummary: 'SVI 10.30.x.0/24',
      svis: [
        {
          id: generateId(),
          vlan: KARCZMA_VLANS.users.id,
          ip: '10.30.10.1/24',
          vlanColor: KARCZMA_VLANS.users.color
        },
        {
          id: generateId(),
          vlan: KARCZMA_VLANS.voice.id,
          ip: '10.30.20.1/24',
          vlanColor: KARCZMA_VLANS.voice.color
        },
        {
          id: generateId(),
          vlan: KARCZMA_VLANS.servers.id,
          ip: '10.30.30.1/24',
          vlanColor: KARCZMA_VLANS.servers.color
        },
        {
          id: generateId(),
          vlan: KARCZMA_VLANS.iot.id,
          ip: '10.30.40.1/24',
          vlanColor: KARCZMA_VLANS.iot.color,
          dhcp: true
        }
      ]
    },
    ...servers.map(hostModel),
    ...users.map(hostModel),
    ...iot.map(hostModel)
  ];

  const viewItems: ViewItem[] = [
    { id: cabId, tile: cabTile },
    {
      id: upsId,
      tile: getCabinetSlotTile(cabTile, 0, { fullWidth: true }),
      parentId: cabId,
      rackUnit: 0
    },
    {
      id: blankId,
      tile: getCabinetSlotTile(cabTile, 2, { fullWidth: true }),
      parentId: cabId,
      rackUnit: 2
    },
    {
      id: ppId,
      tile: getCabinetSlotTile(cabTile, 3, { fullWidth: true }),
      parentId: cabId,
      rackUnit: 3
    },
    {
      id: accId,
      tile: getCabinetSlotTile(cabTile, 4),
      parentId: cabId,
      rackUnit: 4
    },
    {
      id: aggId,
      tile: getCabinetSlotTile(cabTile, 6),
      parentId: cabId,
      rackUnit: 6
    },
    {
      id: coreId,
      tile: getCabinetSlotTile(cabTile, 8),
      parentId: cabId,
      rackUnit: 8
    },
    ...servers.map((h, i) => ({ id: h.id, tile: srvTiles[i] })),
    ...users.map((h, i) => ({ id: h.id, tile: userTiles[i] })),
    ...iot.map((h, i) => ({ id: h.id, tile: iotTiles[i] }))
  ];

  return {
    items,
    viewItems,
    connectors,
    viewId,
    name: 'Serwerownia',
    kind: ViewKindEnum.PLAN_2D_V3,
    order: defaultOrderForKind(ViewKindEnum.PLAN_2D_V3) + 2
  };
};

export type KarczmaPlansBundle = {
  items: ModelItem[];
  views: View[];
  deviceTemplates: DeviceTemplate[];
  icons: InitialData['icons'];
  colors: InitialData['colors'];
};

/** All Karczma 2D practice plans (Schowek + Biuro + Serwerownia). */
export const createKarczmaPlansBundle = (
  connectorColorId: string = DEFAULT_COLOR.id
): KarczmaPlansBundle => {
  const schowek = buildSchowekPlan(connectorColorId);
  const biuro = buildBiuroPlan(connectorColorId);
  const serwerownia = buildSerwerowniaPlan(connectorColorId);

  const paint = (connectors: Connector[]) =>
    connectors.map((c) => ({ ...c, color: connectorColorId }));

  const plans = [schowek, biuro, serwerownia];
  const deviceTemplates = [RACK_48_TEMPLATE, DIN_8_TEMPLATE];

  return {
    items: plans.flatMap((p) => p.items),
    views: plans.map((p) => ({
      id: p.viewId,
      name: p.name,
      kind: p.kind,
      order: p.order,
      items: p.viewItems,
      connectors: paint(p.connectors),
      rectangles: [],
      textBoxes: []
    })),
    deviceTemplates,
    icons: ensureDeviceTemplateIcons([...SHAPES_2D], deviceTemplates),
    colors: [{ ...DEFAULT_COLOR, id: connectorColorId }]
  };
};
