import {
  Size,
  InitialData,
  MainMenuOptions,
  Icon,
  Connector,
  TextBox,
  ViewItem,
  View,
  Rectangle,
  Colors
} from 'src/types';
import { CoordsUtils } from 'src/utils';
import { customVars } from './styles/theme';

// TODO: This file could do with better organisation and convention for easier reading.
export const UNPROJECTED_TILE_SIZE = 100;
export const TILE_PROJECTION_MULTIPLIERS: Size = {
  width: 1.415,
  height: 0.819
};
export const PROJECTED_TILE_SIZE = {
  width: UNPROJECTED_TILE_SIZE * TILE_PROJECTION_MULTIPLIERS.width,
  height: UNPROJECTED_TILE_SIZE * TILE_PROJECTION_MULTIPLIERS.height
};

export const SHAPE_2D_SWITCH_ID = 'SWITCH';
export const SHAPE_2D_PC_ID = 'PC';
export const SHAPE_2D_CAMERA_ID = 'CAMERA';
export const SHAPE_2D_CAMERA_V2_ID = 'CAMERA_V2';
export const SHAPE_2D_PRINTER_ID = 'PRINTER';
export const SHAPE_2D_VOIP_ID = 'VOIP';
export const SHAPE_2D_SMARTPHONE_ID = 'SMARTPHONE';
export const SHAPE_2D_IOT_ID = 'IOT';
export const SHAPE_2D_AP_ID = 'AP';
export const SHAPE_2D_NAS_ID = 'NAS';
export const SHAPE_2D_TABLET_ID = 'TABLET';
export const SHAPE_2D_CABINET_ID = 'CABINET';
/** Non-network rack filler / label plate (UPS, blanking, …). */
export const SHAPE_2D_BLANKING_ID = 'BLANKING';
/** Passive L1 patch panel — bridges two cables per port when rack-mounted. */
export const SHAPE_2D_PATCH_PANEL_ID = 'PATCH_PANEL';

/** Default / min / max rack height for cabinets. */
export const CABINET_DEFAULT_UNITS = 12;
export const CABINET_MIN_UNITS = 4;
export const CABINET_MAX_UNITS = 42;
/** Blanking plate height in U. */
export const BLANKING_DEFAULT_UNITS = 1;
export const BLANKING_MIN_UNITS = 1;
export const BLANKING_MAX_UNITS = 12;
/** Patch panel port count (1U faceplate). */
export const PATCH_PANEL_DEFAULT_PORTS = 24;
export const PATCH_PANEL_MIN_PORTS = 4;
export const PATCH_PANEL_MAX_PORTS = 48;
/** Fixed chassis color — dark grey, distinct from switches. */
export const PATCH_PANEL_COLOR = '#3f4650';
/** Header strip above U slots (tiles). */
export const CABINET_HEADER_TILES = 3;
/** Left/right rail ears (tiles each side). */
export const CABINET_EAR_TILES = 2;
/**
 * Pixel size of one 2D grid cell (independent from isometric UNPROJECTED_TILE_SIZE).
 */
export const TILE_SIZE_2D = 40;

/** Default Plan canvas backgrounds (session theme). */
export const DIAGRAM_BG_2D_LIGHT = '#f6faff';
export const DIAGRAM_BG_2D_DARK = '#292929';
/** Isometric canvas stays white (independent from 2D dark theme). */
export const DIAGRAM_BG_ISO = '#ffffff';
/** Default grid line color in dark canvas theme. */
export const GRID_COLOR_DARK = '#b8b8b8';

/** Minimum edge-to-edge gap (tiles) when auto-laying out selected 2D nodes. */
export const SHAPE_2D_LAYOUT_GAP = 3;

/**
 * Fixed RACK 1U chassis width in tiles.
 * Sized for commercial densities (~48–52 ports), e.g. 6×8 + 2 SFP.
 */
export const RACK_1U_WIDTH_TILES = 60;
/**
 * Height of one rack unit (1U) in tiles — RACK switch height, PC square side,
 * and the RACK snap/grid module.
 */
export const RACK_1U_HEIGHT_TILES = 9;
/** Alias: 1U tile size (same as RACK_1U_HEIGHT_TILES). */
const UNIT_1U_TILES = RACK_1U_HEIGHT_TILES;

/**
 * Built-in 16-port switch — same 1U height as RACK; width follows ports.
 * Layout: header band + two RJ45 rows (same Y as device templates).
 */
export const SWITCH_2D_SIZE: Size = {
  width: 19,
  height: UNIT_1U_TILES
};

/** PC — square 1U × 1U with a single NIC. */
export const PC_2D_SIZE: Size = {
  width: UNIT_1U_TILES,
  height: UNIT_1U_TILES
};

export type Shape2dPortSide = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
export type Shape2dPortMedia = 'RJ45' | 'SFP';
export type Shape2dPortPoe = 'IN' | 'OUT';

export interface Shape2dPort {
  id: string;
  /** Tile offset from the shape's top-left corner */
  tile: { x: number; y: number };
  side: Shape2dPortSide;
  media?: Shape2dPortMedia;
  /** Display number / label on the jack */
  label?: string;
  sectionId?: string;
  /** PoE direction from device template (switch workshop). */
  poe?: Shape2dPortPoe;
}

/** Footprint of a cabinet for the given rack-unit height. */
export const getCabinetSize = (rackUnits = CABINET_DEFAULT_UNITS): Size => {
  const units = Math.min(
    CABINET_MAX_UNITS,
    Math.max(CABINET_MIN_UNITS, Math.round(rackUnits) || CABINET_DEFAULT_UNITS)
  );
  return {
    width: RACK_1U_WIDTH_TILES + CABINET_EAR_TILES * 2,
    height: CABINET_HEADER_TILES + units * RACK_1U_HEIGHT_TILES
  };
};

/** Footprint of a blanking / utility plate for the given U height.
 * Width includes rack ears (same outer span as a cabinet bay) so placement
 * centers the full plate, not just the chassis face.
 */
export const getBlankingSize = (rackUnits = BLANKING_DEFAULT_UNITS): Size => {
  const units = Math.min(
    BLANKING_MAX_UNITS,
    Math.max(BLANKING_MIN_UNITS, Math.round(rackUnits) || BLANKING_DEFAULT_UNITS)
  );
  return {
    width: RACK_1U_WIDTH_TILES + CABINET_EAR_TILES * 2,
    height: units * RACK_1U_HEIGHT_TILES
  };
};

export const clampBlankingUnits = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return BLANKING_DEFAULT_UNITS;
  return Math.min(
    BLANKING_MAX_UNITS,
    Math.max(BLANKING_MIN_UNITS, Math.round(n))
  );
};

/** Footprint of a 1U patch panel (full cabinet bay width, ears included). */
export const getPatchPanelSize = (): Size => {
  return {
    width: RACK_1U_WIDTH_TILES + CABINET_EAR_TILES * 2,
    height: RACK_1U_HEIGHT_TILES
  };
};

export const clampPatchPanelPorts = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return PATCH_PANEL_DEFAULT_PORTS;
  return Math.min(
    PATCH_PANEL_MAX_PORTS,
    Math.max(PATCH_PANEL_MIN_PORTS, Math.round(n))
  );
};

/**
 * Lay out N RJ45 jacks across a 1U full-width faceplate.
 * Fixed integer pitch, row centered in the chassis (pathfinding needs int tiles).
 * ≤24 → single row; more → two rows (commercial 48-port 1U style).
 */
export const getPatchPanelPorts = (portCount = PATCH_PANEL_DEFAULT_PORTS): Shape2dPort[] => {
  const count = clampPatchPanelPorts(portCount);
  const size = getPatchPanelSize();
  const ear = CABINET_EAR_TILES;
  const chassisW = size.width - ear * 2;
  const rows = count > 24 ? 2 : 1;
  const perRow = Math.ceil(count / rows);
  /** Integer pitch — snug one-after-another; keeps A* grid sizes valid. */
  const pitch = 2;
  const yRows =
    rows === 1
      ? [Math.floor(size.height / 2)]
      : [3, size.height - 3];

  const ports: Shape2dPort[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const rowCount = row === rows - 1 ? count - perRow * (rows - 1) : perRow;
    const groupWidth = Math.max(0, (rowCount - 1) * pitch);
    const startX = ear + Math.round((chassisW - groupWidth) / 2);
    const x = startX + col * pitch;
    ports.push({
      id: `pp-${i + 1}`,
      tile: { x, y: yRows[row] ?? yRows[0] },
      side: row === 0 ? 'TOP' : 'BOTTOM',
      media: 'RJ45',
      label: String(i + 1)
    });
  }
  return ports;
};

/** Soft cap for custom switch templates (typical commercial max). */
export const MAX_SWITCH_TEMPLATE_PORTS = 52;

const SWITCH_2D_PORTS: Shape2dPort[] = [
  ...Array.from({ length: 8 }, (_, index) => {
    return {
      id: `port-top-${index + 1}`,
      tile: { x: 2 + index * 2, y: 4 },
      side: 'TOP' as const,
      label: String(index + 1)
    };
  }),
  ...Array.from({ length: 8 }, (_, index) => {
    return {
      id: `port-bottom-${index + 1}`,
      tile: { x: 2 + index * 2, y: 7 },
      side: 'BOTTOM' as const,
      label: String(index + 9)
    };
  })
];

const PC_2D_PORTS: Shape2dPort[] = [
  {
    id: 'port-1',
    // Bottom band — slightly above bottom edge so the 2.25-tile jack stays in-chassis.
    tile: { x: Math.floor(UNIT_1U_TILES / 2), y: UNIT_1U_TILES - 2.15 },
    side: 'BOTTOM',
    label: '1'
  }
];

const CAMERA_2D_PORTS: Shape2dPort[] = [
  {
    id: 'port-poe',
    tile: { x: 0, y: 3 },
    side: 'LEFT',
    label: 'PoE'
  }
];

/** Footprint of 2D shapes in grid cells (for ports / connections later). */
const SHAPE_2D_SIZES: Record<string, Size> = {
  [SHAPE_2D_SWITCH_ID]: SWITCH_2D_SIZE,
  [SHAPE_2D_PC_ID]: PC_2D_SIZE,
  [SHAPE_2D_CAMERA_ID]: { width: 6, height: 6 },
  [SHAPE_2D_CAMERA_V2_ID]: PC_2D_SIZE,
  [SHAPE_2D_PRINTER_ID]: PC_2D_SIZE,
  [SHAPE_2D_VOIP_ID]: PC_2D_SIZE,
  [SHAPE_2D_SMARTPHONE_ID]: PC_2D_SIZE,
  [SHAPE_2D_IOT_ID]: PC_2D_SIZE,
  [SHAPE_2D_AP_ID]: PC_2D_SIZE,
  [SHAPE_2D_NAS_ID]: PC_2D_SIZE,
  [SHAPE_2D_TABLET_ID]: PC_2D_SIZE,
  [SHAPE_2D_CABINET_ID]: getCabinetSize(CABINET_DEFAULT_UNITS),
  [SHAPE_2D_BLANKING_ID]: getBlankingSize(BLANKING_DEFAULT_UNITS),
  [SHAPE_2D_PATCH_PANEL_ID]: getPatchPanelSize()
};

const SHAPE_2D_PORTS: Record<string, Shape2dPort[]> = {
  [SHAPE_2D_SWITCH_ID]: SWITCH_2D_PORTS,
  [SHAPE_2D_PC_ID]: PC_2D_PORTS,
  [SHAPE_2D_CAMERA_ID]: CAMERA_2D_PORTS,
  [SHAPE_2D_CAMERA_V2_ID]: PC_2D_PORTS,
  [SHAPE_2D_PRINTER_ID]: PC_2D_PORTS,
  [SHAPE_2D_VOIP_ID]: PC_2D_PORTS,
  [SHAPE_2D_SMARTPHONE_ID]: PC_2D_PORTS,
  [SHAPE_2D_IOT_ID]: PC_2D_PORTS,
  [SHAPE_2D_AP_ID]: PC_2D_PORTS,
  [SHAPE_2D_NAS_ID]: PC_2D_PORTS,
  [SHAPE_2D_TABLET_ID]: PC_2D_PORTS,
  [SHAPE_2D_CABINET_ID]: [],
  [SHAPE_2D_BLANKING_ID]: [],
  [SHAPE_2D_PATCH_PANEL_ID]: getPatchPanelPorts(PATCH_PANEL_DEFAULT_PORTS)
};

export const SHAPES_2D: Icon[] = [
  {
    id: SHAPE_2D_SWITCH_ID,
    name: 'Switch 16-port',
    url: '',
    collection: 'Switches',
    isIsometric: false
  },
  {
    id: SHAPE_2D_PC_ID,
    name: 'Node',
    url: '',
    collection: 'Stacje',
    isIsometric: false
  },
  {
    id: SHAPE_2D_BLANKING_ID,
    name: 'Zaślepka',
    url: '',
    collection: 'RACK Utilities',
    isIsometric: false
  },
  {
    id: SHAPE_2D_PATCH_PANEL_ID,
    name: 'Patch panel',
    url: '',
    collection: 'RACK Utilities',
    isIsometric: false
  },
  {
    id: SHAPE_2D_CABINET_ID,
    name: 'Szafa rack',
    url: '',
    collection: 'Obiekty',
    isIsometric: false
  }
];

export const getShape2dSize = (shapeId: string | undefined | null): Size | null => {
  if (!shapeId) return null;
  if (shapeId === SHAPE_2D_CABINET_ID) {
    return getCabinetSize(CABINET_DEFAULT_UNITS);
  }
  if (shapeId === SHAPE_2D_BLANKING_ID) {
    return getBlankingSize(BLANKING_DEFAULT_UNITS);
  }
  if (shapeId === SHAPE_2D_PATCH_PANEL_ID) {
    return getPatchPanelSize();
  }
  if (SHAPE_2D_SIZES[shapeId]) return SHAPE_2D_SIZES[shapeId];

  // Lazy require avoids circular import (registry → layout → config).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getDeviceTemplateSize } = require('src/utils/deviceTemplateRegistry') as {
    getDeviceTemplateSize: (id: string) => Size | null;
  };
  return getDeviceTemplateSize(shapeId);
};

/** Footprint for a placed model item (cabinet / blanking use rackUnits). */
export const getModelItemSize = (item: {
  icon?: string;
  rackUnits?: number;
}): Size | null => {
  if (!item.icon) return null;
  if (item.icon === SHAPE_2D_CABINET_ID) {
    return getCabinetSize(item.rackUnits ?? CABINET_DEFAULT_UNITS);
  }
  if (item.icon === SHAPE_2D_BLANKING_ID) {
    return getBlankingSize(item.rackUnits ?? BLANKING_DEFAULT_UNITS);
  }
  if (item.icon === SHAPE_2D_PATCH_PANEL_ID) {
    return getPatchPanelSize();
  }
  return getShape2dSize(item.icon);
};

export const getShape2dPorts = (
  shapeId: string | undefined | null,
  options?: { portCount?: number }
): Shape2dPort[] => {
  if (!shapeId) return [];
  if (shapeId === SHAPE_2D_PATCH_PANEL_ID) {
    return getPatchPanelPorts(options?.portCount ?? PATCH_PANEL_DEFAULT_PORTS);
  }
  if (SHAPE_2D_PORTS[shapeId]) return SHAPE_2D_PORTS[shapeId];

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getDeviceTemplatePorts } = require('src/utils/deviceTemplateRegistry') as {
    getDeviceTemplatePorts: (id: string) => Shape2dPort[] | null;
  };
  return getDeviceTemplatePorts(shapeId) ?? [];
};

/** Ports for a placed item (patch panel uses dynamic portCount). */
export const getModelItemPorts = (item: {
  icon?: string;
  portCount?: number;
}): Shape2dPort[] => {
  return getShape2dPorts(item.icon, { portCount: item.portCount });
};

/**
 * Display label for a 2D shape port (1, 2, 3, …).
 * Prefer port.label when present (sequential numbering from templates).
 */
export const getShape2dPortIfaceName = (
  shapeId: string,
  portId: string
): string => {
  const ports = getShape2dPorts(shapeId);
  const port = ports.find((candidate) => {
    return candidate.id === portId;
  });

  if (port?.label) {
    return port.label;
  }

  const index = ports.findIndex((candidate) => {
    return candidate.id === portId;
  });

  if (index < 0) {
    return '1';
  }

  return String(index + 1);
};

export const isShape2dIcon = (iconId: string | undefined | null): boolean => {
  if (!iconId) return false;
  if (SHAPE_2D_SIZES[iconId] !== undefined) return true;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { isDeviceTemplateId } = require('src/utils/deviceTemplateRegistry') as {
    isDeviceTemplateId: (id: string) => boolean;
  };
  return isDeviceTemplateId(iconId);
};

export const DEFAULT_COLOR: Colors[0] = {
  id: '__DEFAULT__',
  value: customVars.customPalette.defaultColor
};

export const DEFAULT_FONT_FAMILY = 'Roboto, Arial, sans-serif';

export const VIEW_DEFAULTS: Required<
  Omit<View, 'id' | 'description' | 'lastUpdated'>
> = {
  name: 'Untitled view',
  kind: 'PLAN_2D',
  order: 0,
  items: [],
  connectors: [],
  rectangles: [],
  textBoxes: []
};

export const VIEW_ITEM_DEFAULTS: Required<
  Omit<
    ViewItem,
    | 'id'
    | 'tile'
    | 'parentId'
    | 'rackUnit'
    | 'labelScale'
    | 'labelOffset'
    | 'showDescriptionLabel'
  >
> = {
  labelHeight: 80,
  locked: false
};

/**
 * Plan description callout size. Former max (10×) is now the minimum —
 * bubbles were unreadably small at the old 3× floor. Steps of 10 keep
 * size changes obvious on screen.
 */
export const NODE_LABEL_SCALE_MIN = 10;
export const NODE_LABEL_SCALE_MAX = 40;
export const NODE_LABEL_SCALE_STEP = 10;
export const NODE_LABEL_SCALE_DEFAULT = NODE_LABEL_SCALE_MIN;

export const clampNodeLabelScale = (value: number | undefined | null) => {
  const raw = value ?? NODE_LABEL_SCALE_DEFAULT;
  const clamped = Math.min(
    NODE_LABEL_SCALE_MAX,
    Math.max(NODE_LABEL_SCALE_MIN, raw)
  );
  // Snap to the configured step so legacy fractional scales land cleanly.
  const stepped =
    Math.round((clamped - NODE_LABEL_SCALE_MIN) / NODE_LABEL_SCALE_STEP) *
      NODE_LABEL_SCALE_STEP +
    NODE_LABEL_SCALE_MIN;
  return Math.min(NODE_LABEL_SCALE_MAX, Math.max(NODE_LABEL_SCALE_MIN, stepped));
};

export const CONNECTOR_DEFAULTS: Required<Omit<Connector, 'id' | 'color'>> = {
  width: 10,
  description: '',
  anchors: [],
  style: 'SOLID',
  locked: false
};

// The boundaries of the search area for the pathfinder algorithm
// is the grid that encompasses the two nodes + the offset below.
export const CONNECTOR_SEARCH_OFFSET = { x: 1, y: 1 };

export const TEXTBOX_DEFAULTS: Required<Omit<TextBox, 'id' | 'tile'>> = {
  orientation: 'X',
  fontSize: 0.6,
  content: 'Text',
  fontWeight: 'bold',
  fontFamily: 'Roboto, Arial, sans-serif',
  textAlign: 'center',
  color: '#000000'
};

export const TEXTBOX_PADDING = 0.2;
export const TEXTBOX_FONT_WEIGHT = 'bold';

export const RECTANGLE_DEFAULTS: Partial<
  Omit<Rectangle, 'id' | 'from' | 'to'>
> = {};

export const MIN_ZOOM = 0.2;
/** 2D plans need deeper zoom-out to fit cabinets / large footprints. */
export const MIN_ZOOM_2D = 0.05;
export const MAX_ZOOM = 2.5;
export const TRANSFORM_ANCHOR_SIZE = 30;
export const TRANSFORM_CONTROLS_COLOR = '#0392ff';
export const INITIAL_DATA: InitialData = {
  title: 'Untitled',
  version: '',
  icons: [],
  colors: [DEFAULT_COLOR],
  items: [],
  views: [],
  deviceTemplates: [],
  fitToView: false
};
export const INITIAL_UI_STATE = {
  zoom: 1,
  scroll: {
    position: CoordsUtils.zero(),
    offset: CoordsUtils.zero()
  },
  projectionMode: 'ISOMETRIC' as const,
  isWorkshopOpen: false,
  isRightSidebarOpen: true,
  showGrid: true,
  gridStyle: 'rack' as const,
  canvasByMode: {
    ISOMETRIC: {
      theme: 'light' as const,
      backgroundColor: null as string | null,
      gridColor: null as string | null
    },
    TWO_D: {
      theme: 'light' as const,
      backgroundColor: null as string | null,
      gridColor: null as string | null
    },
    TWO_D_V2: {
      theme: 'light' as const,
      backgroundColor: null as string | null,
      gridColor: null as string | null
    }
  },
  viewTransformByMode: {
    ISOMETRIC: {
      zoom: 1,
      scroll: {
        position: CoordsUtils.zero(),
        offset: CoordsUtils.zero()
      }
    },
    TWO_D: {
      zoom: 1,
      scroll: {
        position: CoordsUtils.zero(),
        offset: CoordsUtils.zero()
      }
    },
    TWO_D_V2: {
      zoom: 1,
      scroll: {
        position: CoordsUtils.zero(),
        offset: CoordsUtils.zero()
      }
    }
  },
  vlan1CableColor: null as string | null,
  simplePaths: true,
  routingStyle: 'STRAIGHT' as const
};
export const INITIAL_SCENE_STATE = {
  connectors: {},
  textBoxes: {}
};
export const MAIN_MENU_OPTIONS: MainMenuOptions = [
  'ACTION.NEW_PROJECT',
  'ACTION.RENAME_PROJECT',
  'ACTION.OPEN',
  'ACTION.SAVE_PROJECT',
  'EXPORT.JSON',
  'EXPORT.PNG',
  'ACTION.CLEAR_CANVAS',
  'VERSION'
];

export const DEFAULT_ICON: Icon = {
  id: 'default',
  name: 'block',
  isIsometric: true,
  url: ''
};

export const DEFAULT_LABEL_HEIGHT = 20;
export const PROJECT_BOUNDING_BOX_PADDING = 3;
export const MARKDOWN_EMPTY_VALUE = '<p><br></p>';
