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
export const SHAPE_2D_CABINET_ID = 'CABINET';

/** Default / min / max rack height for cabinets. */
export const CABINET_DEFAULT_UNITS = 12;
export const CABINET_MIN_UNITS = 4;
export const CABINET_MAX_UNITS = 42;
/** Header strip above U slots (tiles). */
export const CABINET_HEADER_TILES = 3;
/** Left/right rail ears (tiles each side). */
export const CABINET_EAR_TILES = 2;
/**
 * Pixel size of one 2D grid cell (independent from isometric UNPROJECTED_TILE_SIZE).
 */
export const TILE_SIZE_2D = 40;

/**
 * Visual 2D grid spacing in logical tiles.
 * Snapping / connectors still use every tile (TILE_SIZE_2D); only drawing is coarser.
 */
export const GRID_2D_VISUAL_STEP = 5;

/** Minimum edge-to-edge gap (tiles) when auto-laying out selected 2D nodes. */
export const SHAPE_2D_LAYOUT_GAP = 3;

/**
 * Fixed RACK 1U chassis width in tiles.
 * Sized for commercial densities (~48–52 ports), e.g. 6×8 + 2 SFP.
 */
export const RACK_1U_WIDTH_TILES = 60;
export const RACK_1U_HEIGHT_TILES = 9;

/**
 * Built-in 16-port switch — same 1U height as RACK; width follows ports.
 * Layout: header band + two RJ45 rows (same Y as device templates).
 */
export const SWITCH_2D_SIZE: Size = {
  width: 19,
  height: RACK_1U_HEIGHT_TILES
};

/** PC card — same 1U height as RACK; single NIC at switch port scale. */
export const PC_2D_SIZE: Size = {
  width: 12,
  height: RACK_1U_HEIGHT_TILES
};

export type Shape2dPortSide = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
export type Shape2dPortMedia = 'RJ45' | 'SFP';

export interface Shape2dPort {
  id: string;
  /** Tile offset from the shape's top-left corner */
  tile: { x: number; y: number };
  side: Shape2dPortSide;
  media?: Shape2dPortMedia;
  /** Display number / label on the jack */
  label?: string;
  sectionId?: string;
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

/** Soft cap for custom switch templates (typical commercial max). */
export const MAX_SWITCH_TEMPLATE_PORTS = 52;

export const SWITCH_2D_PORTS: Shape2dPort[] = [
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

export const PC_2D_PORTS: Shape2dPort[] = [
  {
    id: 'port-1',
    tile: { x: 5, y: 7 },
    side: 'BOTTOM',
    label: '1'
  }
];

/** Footprint of 2D shapes in grid cells (for ports / connections later). */
export const SHAPE_2D_SIZES: Record<string, Size> = {
  [SHAPE_2D_SWITCH_ID]: SWITCH_2D_SIZE,
  [SHAPE_2D_PC_ID]: PC_2D_SIZE,
  [SHAPE_2D_CABINET_ID]: getCabinetSize(CABINET_DEFAULT_UNITS)
};

export const SHAPE_2D_PORTS: Record<string, Shape2dPort[]> = {
  [SHAPE_2D_SWITCH_ID]: SWITCH_2D_PORTS,
  [SHAPE_2D_PC_ID]: PC_2D_PORTS,
  [SHAPE_2D_CABINET_ID]: []
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
    name: 'PC',
    url: '',
    collection: 'Stacje',
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
  if (SHAPE_2D_SIZES[shapeId]) return SHAPE_2D_SIZES[shapeId];

  // Lazy require avoids circular import (registry → layout → config).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getDeviceTemplateSize } = require('src/utils/deviceTemplateRegistry') as {
    getDeviceTemplateSize: (id: string) => Size | null;
  };
  return getDeviceTemplateSize(shapeId);
};

/** Footprint for a placed model item (cabinet uses rackUnits). */
export const getModelItemSize = (item: {
  icon?: string;
  rackUnits?: number;
}): Size | null => {
  if (!item.icon) return null;
  if (item.icon === SHAPE_2D_CABINET_ID) {
    return getCabinetSize(item.rackUnits ?? CABINET_DEFAULT_UNITS);
  }
  return getShape2dSize(item.icon);
};

export const getShape2dPorts = (
  shapeId: string | undefined | null
): Shape2dPort[] => {
  if (!shapeId) return [];
  if (SHAPE_2D_PORTS[shapeId]) return SHAPE_2D_PORTS[shapeId];

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getDeviceTemplatePorts } = require('src/utils/deviceTemplateRegistry') as {
    getDeviceTemplatePorts: (id: string) => Shape2dPort[] | null;
  };
  return getDeviceTemplatePorts(shapeId) ?? [];
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
  items: [],
  connectors: [],
  rectangles: [],
  textBoxes: []
};

export const VIEW_ITEM_DEFAULTS: Required<
  Omit<ViewItem, 'id' | 'tile' | 'parentId' | 'rackUnit' | 'labelScale'>
> = {
  labelHeight: 80
};

export const CONNECTOR_DEFAULTS: Required<Omit<Connector, 'id' | 'color'>> = {
  width: 10,
  description: '',
  anchors: [],
  style: 'SOLID'
};

// The boundaries of the search area for the pathfinder algorithm
// is the grid that encompasses the two nodes + the offset below.
export const CONNECTOR_SEARCH_OFFSET = { x: 1, y: 1 };

export const TEXTBOX_DEFAULTS: Required<Omit<TextBox, 'id' | 'tile'>> = {
  orientation: 'X',
  fontSize: 0.6,
  content: 'Text'
};

export const TEXTBOX_PADDING = 0.2;
export const TEXTBOX_FONT_WEIGHT = 'bold';

export const RECTANGLE_DEFAULTS: Partial<
  Omit<Rectangle, 'id' | 'from' | 'to'>
> = {};

/** Zoom step as a fraction (0.1 = 10%). */
export const ZOOM_INCREMENT = 0.1;
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
  showGrid: true,
  diagramBackgroundColor: null as string | null,
  vlan1CableColor: null as string | null,
  simplePaths: false
};
export const INITIAL_SCENE_STATE = {
  connectors: {},
  textBoxes: {}
};
export const MAIN_MENU_OPTIONS: MainMenuOptions = [
  'ACTION.OPEN',
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
