import { Model, ModelItem, View, ViewItem, Connector } from 'src/types';
import {
  DEFAULT_COLOR,
  SHAPES_2D,
  SHAPE_2D_SWITCH_ID,
  SHAPE_2D_PC_ID
} from 'src/config';
import { colors } from './colors';

export type PerfLoadSize = 'S' | 'M' | 'L';

type PerfLoadSpec = {
  devices: number;
  cables: number;
  title: string;
};

const SPECS: Record<PerfLoadSize, PerfLoadSpec> = {
  S: { devices: 20, cables: 30, title: 'Perf fixture S' },
  M: { devices: 80, cables: 150, title: 'Perf fixture M' },
  L: { devices: 200, cables: 400, title: 'Perf fixture L' }
};

/** Built-in 16-port SWITCH port ids (matches config layout). */
const switchPort = (n: number) => {
  if (n >= 1 && n <= 8) return `port-top-${n}`;
  return `port-bottom-${n - 8}`;
};

const pcPort = (n: number) => {
  return n === 1 ? 'port-left' : 'port-right';
};

/**
 * Synthetic plan diagrams for performance budgets (S/M/L).
 * Mix of switches (dense DOM) and PCs; cables use real port anchors.
 */
export const buildPerfLoadModel = (size: PerfLoadSize): Model => {
  const spec = SPECS[size];
  const cols = Math.ceil(Math.sqrt(spec.devices * 1.4));
  const items: ModelItem[] = [];
  const viewItems: ViewItem[] = [];
  const palette = colors.length > 0 ? colors : [DEFAULT_COLOR];

  for (let i = 0; i < spec.devices; i += 1) {
    const id = `perf-device-${i}`;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const isSwitch = i % 8 === 0;
    items.push({
      id,
      name: isSwitch ? `Switch ${i}` : `PC ${i}`,
      icon: isSwitch ? SHAPE_2D_SWITCH_ID : SHAPE_2D_PC_ID
    });
    viewItems.push({
      id,
      tile: { x: col * 10, y: row * 8 }
    });
  }

  const connectors: Connector[] = [];
  for (let i = 0; i < spec.cables; i += 1) {
    const a = i % spec.devices;
    const b = (i + 1 + (i % 7)) % spec.devices;
    if (a === b) continue;

    const aIsSwitch = a % 8 === 0;
    const bIsSwitch = b % 8 === 0;
    const aPort = aIsSwitch ? switchPort((i % 16) + 1) : pcPort((i % 2) + 1);
    const bPort = bIsSwitch
      ? switchPort(((i + 3) % 16) + 1)
      : pcPort(((i + 1) % 2) + 1);

    connectors.push({
      id: `perf-cable-${i}`,
      color: palette[i % palette.length].id,
      anchors: [
        {
          id: `perf-a-${i}`,
          ref: { item: `perf-device-${a}`, port: aPort }
        },
        {
          id: `perf-b-${i}`,
          ref: { item: `perf-device-${b}`, port: bPort }
        }
      ]
    });
  }

  const view: View = {
    id: 'perf-plan',
    name: 'Plan',
    kind: 'PLAN_2D',
    items: viewItems,
    connectors,
    rectangles: [],
    textBoxes: []
  };

  return {
    version: '1.0.0',
    title: spec.title,
    description: `Synthetic ${size} load: ~${spec.devices} devices, ~${spec.cables} cables`,
    colors: [...palette],
    icons: [...SHAPES_2D],
    items,
    views: [view]
  };
};

export const PERF_LOAD_BUDGETS = {
  idleHoverFps: 55,
  panZoomFpsM: 50,
  dragNodeFpsM: 50,
  connectorDrawFpsM: 50,
  zoomOutPanFpsL: 45,
  gestureLongTaskMs: 50,
  mouseupRouteSpikeMsM: 150
} as const;
