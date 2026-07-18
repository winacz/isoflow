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

/**
 * Pixel size of one 2D grid cell (independent from isometric UNPROJECTED_TILE_SIZE).
 */
export const TILE_SIZE_2D = 40;

/**
 * 16-port switch footprint (tiles) — card layout:
 * - rows 0..2: header (name)
 * - row 3: divider / spacer
 * - row 4: 8 top RJ45 (cols 2,4,6,8,10,12,14,16)
 * - rows 5..6: spacer
 * - row 7: 8 bottom RJ45
 * - row 8: bottom padding
 */
export const SWITCH_2D_SIZE: Size = { width: 20, height: 9 };

/** PC card — same visual language, single NIC port. */
export const PC_2D_SIZE: Size = { width: 8, height: 7 };

export type Shape2dPortSide = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';

export interface Shape2dPort {
  id: string;
  /** Tile offset from the shape's top-left corner */
  tile: { x: number; y: number };
  side: Shape2dPortSide;
}

export const SWITCH_2D_PORTS: Shape2dPort[] = [
  ...Array.from({ length: 8 }, (_, index) => {
    return {
      id: `port-top-${index + 1}`,
      tile: { x: 2 + index * 2, y: 4 },
      side: 'TOP' as const
    };
  }),
  ...Array.from({ length: 8 }, (_, index) => {
    return {
      id: `port-bottom-${index + 1}`,
      tile: { x: 2 + index * 2, y: 7 },
      side: 'BOTTOM' as const
    };
  })
];

export const PC_2D_PORTS: Shape2dPort[] = [
  {
    id: 'port-1',
    tile: { x: 3, y: 5 },
    side: 'BOTTOM'
  }
];

/** Footprint of 2D shapes in grid cells (for ports / connections later). */
export const SHAPE_2D_SIZES: Record<string, Size> = {
  [SHAPE_2D_SWITCH_ID]: SWITCH_2D_SIZE,
  [SHAPE_2D_PC_ID]: PC_2D_SIZE
};

export const SHAPE_2D_PORTS: Record<string, Shape2dPort[]> = {
  [SHAPE_2D_SWITCH_ID]: SWITCH_2D_PORTS,
  [SHAPE_2D_PC_ID]: PC_2D_PORTS
};

export const SHAPES_2D: Icon[] = [
  {
    id: SHAPE_2D_SWITCH_ID,
    name: 'Switch',
    url: '',
    collection: 'Shapes',
    isIsometric: false
  },
  {
    id: SHAPE_2D_PC_ID,
    name: 'PC',
    url: '',
    collection: 'Shapes',
    isIsometric: false
  }
];

export const getShape2dSize = (shapeId: string): Size | null => {
  return SHAPE_2D_SIZES[shapeId] ?? null;
};

export const getShape2dPorts = (shapeId: string): Shape2dPort[] => {
  return SHAPE_2D_PORTS[shapeId] ?? [];
};

export const isShape2dIcon = (iconId: string | undefined | null): boolean => {
  if (!iconId) return false;

  return SHAPE_2D_SIZES[iconId] !== undefined;
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

export const VIEW_ITEM_DEFAULTS: Required<Omit<ViewItem, 'id' | 'tile'>> = {
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

export const RECTANGLE_DEFAULTS: Required<
  Omit<Rectangle, 'id' | 'from' | 'to' | 'color'>
> = {};

export const ZOOM_INCREMENT = 0.2;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 1;
export const TRANSFORM_ANCHOR_SIZE = 30;
export const TRANSFORM_CONTROLS_COLOR = '#0392ff';
export const INITIAL_DATA: InitialData = {
  title: 'Untitled',
  version: '',
  icons: [],
  colors: [DEFAULT_COLOR],
  items: [],
  views: [],
  fitToView: false
};
export const INITIAL_UI_STATE = {
  zoom: 1,
  scroll: {
    position: CoordsUtils.zero(),
    offset: CoordsUtils.zero()
  },
  projectionMode: 'ISOMETRIC' as const
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
  'LINK.DISCORD',
  'LINK.GITHUB',
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
