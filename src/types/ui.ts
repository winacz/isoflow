import {
  Coords,
  EditorModeEnum,
  MainMenuOptions,
  ProjectionMode
} from './common';
import { Icon, type ModelItem } from './model';
import { ItemReference } from './scene';

interface AddItemControls {
  type: 'ADD_ITEM';
}

interface AlgorithmsControls {
  type: 'ALGORITHMS';
}

/** Sidebar: edit a custom switch template (from device selection). */
interface EditDeviceTemplateControls {
  type: 'EDIT_DEVICE_TEMPLATE';
  templateId: string;
  /** Return to this item's controls after cancel/save. */
  returnItemId?: string;
}

export type ItemControls =
  | ItemReference
  | AddItemControls
  | AlgorithmsControls
  | EditDeviceTemplateControls;

export interface Mouse {
  position: {
    screen: Coords;
    tile: Coords;
  };
  mousedown: {
    screen: Coords;
    tile: Coords;
  } | null;
  delta: {
    screen: Coords;
    tile: Coords;
  } | null;
  /** True while Shift is held (from the latest mouse event). */
  shiftKey: boolean;
  /** True while Ctrl is held (from the latest mouse event). */
  ctrlKey: boolean;
  /** True while Meta/Cmd is held (from the latest mouse event). */
  metaKey: boolean;
}

// Mode types
export interface InteractionsDisabled {
  type: 'INTERACTIONS_DISABLED';
  showCursor: boolean;
}

export interface CursorMode {
  type: 'CURSOR';
  showCursor: boolean;
  mousedownItem: ItemReference | null;
  /** 2D marquee selection while dragging on empty canvas. */
  marquee?: { start: Coords; end: Coords } | null;
}

export interface DragItemsMode {
  type: 'DRAG_ITEMS';
  showCursor: boolean;
  items: ItemReference[];
  isInitialMovement: Boolean;
  /** View-item tiles at drag start — used for absolute 2D placement. */
  itemOrigins?: Record<string, Coords>;
  /**
   * Tile-waypoint positions at drag start — used so absolute mouse deltas
   * (from snap / path drag) are not re-applied onto already-moved anchors.
   */
  anchorOrigins?: Record<string, Coords>;
}

export interface PanMode {
  type: 'PAN';
  showCursor: boolean;
}

export interface PlaceIconMode {
  type: 'PLACE_ICON';
  showCursor: boolean;
  id: string | null;
  /**
   * When set, the next click places a deep copy of this model item
   * (right-click → Duplikuj) instead of a blank shape of `id`.
   */
  draftModelItem?: ModelItem | null;
}

export interface ConnectorMode {
  type: 'CONNECTOR';
  showCursor: boolean;
  id: string | null;
}

/**
 * 2D v3 connection lifecycle (§1).
 *
 * Deliberately separate from CONNECTOR: that mode rewrites the live connector
 * on every mousemove, which reroutes the cable dozens of times per drag. Here
 * the model is touched exactly twice — a zero-length connector at mousedown
 * and the routed result at mouseup — while the drag itself only moves
 * `preview`, a UI-only tile that renders as a straight hint line.
 */
export interface ConnectorV3Mode {
  type: 'CONNECTOR_V3';
  showCursor: boolean;
  /** Connector being drawn; null until a valid port is grabbed. */
  id: string | null;
  /** Origin port captured at mousedown. */
  start: { item: string; port: string } | null;
  /** Live cursor tile — drives the preview only, never the model. */
  preview: Coords | null;
}

export interface DrawRectangleMode {
  type: 'RECTANGLE.DRAW';
  showCursor: boolean;
  id: string | null;
  /** Area vs building — applied when the rectangle is created. */
  kind?: 'area' | 'building';
}

export const AnchorPositionOptions = {
  BOTTOM_LEFT: 'BOTTOM_LEFT',
  BOTTOM_RIGHT: 'BOTTOM_RIGHT',
  TOP_RIGHT: 'TOP_RIGHT',
  TOP_LEFT: 'TOP_LEFT',
  /** Mid-edge handles (2D rectangle resize). */
  TOP: 'TOP',
  BOTTOM: 'BOTTOM',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT'
} as const;

export type AnchorPosition = keyof typeof AnchorPositionOptions;

export interface TransformRectangleMode {
  type: 'RECTANGLE.TRANSFORM';
  showCursor: boolean;
  id: string;
  selectedAnchor: AnchorPosition | null;
}

export interface TextBoxMode {
  type: 'TEXTBOX';
  showCursor: boolean;
  id: string | null;
}

export type Mode =
  | InteractionsDisabled
  | ConnectorV3Mode
  | CursorMode
  | PanMode
  | PlaceIconMode
  | ConnectorMode
  | DrawRectangleMode
  | TransformRectangleMode
  | DragItemsMode
  | TextBoxMode;
// End mode types

export interface Scroll {
  position: Coords;
  offset: Coords;
}

export interface IconCollectionState {
  id?: string;
  isExpanded: boolean;
}

export type IconCollectionStateWithIcons = IconCollectionState & {
  icons: Icon[];
};

export const DialogTypeEnum = {
  EXPORT_IMAGE: 'EXPORT_IMAGE'
} as const;

export interface ContextMenu {
  /** Target under the cursor, or EMPTY when RMB on blank plan canvas. */
  item: ItemReference | { type: 'EMPTY' };
  tile: Coords;
}

export const LayerOrderingActionOptions = {
  BRING_TO_FRONT: 'BRING_TO_FRONT',
  SEND_TO_BACK: 'SEND_TO_BACK',
  BRING_FORWARD: 'BRING_FORWARD',
  SEND_BACKWARD: 'SEND_BACKWARD'
} as const;

export type LayerOrderingAction = keyof typeof LayerOrderingActionOptions;

/** Visual density options for the Plan (2D) background grid. */
export type GridStyle = 'fine' | 'standard' | 'dense' | 'sparse' | 'rack';

/** Canvas appearance: light (default) or dark (#292929 + light grid). */
export type CanvasTheme = 'light' | 'dark';

/** Per-projection canvas prefs (session only — not saved with the model). */
export type CanvasModePrefs = {
  theme: CanvasTheme;
  backgroundColor: string | null;
  gridColor: string | null;
};

export type CanvasPrefsByMode = {
  ISOMETRIC: CanvasModePrefs;
  TWO_D: CanvasModePrefs;
  TWO_D_V2: CanvasModePrefs;
  TWO_D_V3: CanvasModePrefs;
};

/** Zoom/pan remembered per projection so switching Iso ⟷ Plan does not break the other map. */
export type ViewTransform = {
  zoom: number;
  scroll: Scroll;
};

export type ViewTransformByMode = {
  ISOMETRIC: ViewTransform;
  TWO_D: ViewTransform;
  TWO_D_V2: ViewTransform;
  TWO_D_V3: ViewTransform;
};

export interface UiState {
  view: string;
  mainMenuOptions: MainMenuOptions;
  editorMode: keyof typeof EditorModeEnum;
  iconCategoriesState: IconCollectionState[];
  mode: Mode;
  dialog: keyof typeof DialogTypeEnum | null;
  isMainMenuOpen: boolean;
  itemControls: ItemControls | null;
  /** 2D: multi-selected view item (node) ids. Source of truth for node selection. */
  selectedItemIds: string[];
  /** 2D: waypoint (tile anchor) ids selected via marquee over cables only. */
  selectedWaypointIds: string[];
  /**
   * 2D: selected port ids on the focused device (sidebar + canvas highlight).
   * Last entry is the primary port (expanded accordion / cable peer filter).
   */
  focusedPortIds: string[];
  /**
   * Brief canvas attention pulse after jumping to a port from the relation panel.
   * `token` changes every trigger so the CSS animation can restart.
   */
  portAttention: { itemId: string; portId: string; token: number } | null;
  /**
   * Picture-in-picture hover:
   * - 2Dv2 port → peer device on Plan
   * - isometric portal link → Plan item / building
   */
  portPipHover: {
    hostItemId: string;
    hostPortId: string | null;
    /** Plan device in the PiP (null when target is a rectangle/building). */
    peerItemId: string | null;
    peerPortId: string | null;
    /** Plan rectangle / building in the PiP. */
    peerRectangleId: string | null;
    /** Optional card title override. */
    title?: string;
    screen: Coords;
  } | null;
  /**
   * Plan 2D: port under cursor — drives RJ45 hover zoom + sticky hit-test.
   */
  shape2dPortHover: {
    itemId: string;
    portId: string | null;
  } | null;
  /**
   * After a port click, keep `shape2dPortHover` (blue jack + peer) until the
   * cursor moves to another port or port selection clears.
   */
  shape2dPortHoverPinned: boolean;
  /**
   * Plan 2D: node whose name-header is under the cursor (interaction-layer
   * hit-test). Drives header accent only — enlarge requires a header click.
   */
  shape2dHeaderHoverItemId: string | null;
  /**
   * Plan 2D: device under the cursor (header, body, or port).
   * Used to preview cable peers / relations without selecting.
   */
  shape2dNodeHoverItemId: string | null;
  /**
   * Plan 2D: node enlarged after a header click ("hover" / scale).
   * Cleared when selecting elsewhere or clearing selection.
   */
  shape2dEnlargedItemId: string | null;
  sviHover: {
    vlan: number;
    ip?: string;
    screen: Coords;
    color: string;
  } | null;
  contextMenu: ContextMenu | null;
  zoom: number;
  scroll: Scroll;
  mouse: Mouse;
  rendererEl: HTMLDivElement | null;
  projectionMode: ProjectionMode;
  /** Whether the background grid is drawn (logical snap grid is always active). */
  showGrid: boolean;
  showLoupe: boolean;
  animateConnectors: boolean;
  /** Plan device chassis look (ZoomControls popover). */
  nodeVisualStyle: import('src/styles/nodeVisualStyles').NodeVisualStyleId;
  /**
   * Visual density of the 2D background grid (snap is 1 tile unless `rack`).
   * - fine: every tile
   * - standard: fine + major every 5
   * - dense: fine + major every 2
   * - sparse: major every 10 only
   * - rack: square of RACK 1U height, devices snap on drop
   */
  gridStyle: GridStyle;
  /**
   * Canvas theme / temp colors per projection mode (iso ⟂ 2D).
   * Isometric background stays on the theme diagram color unless overridden.
   */
  canvasByMode: CanvasPrefsByMode;
  /** Zoom/scroll snapshot per projection mode (restored when switching tabs). */
  viewTransformByMode: ViewTransformByMode;
  /**
   * Temporary stroke for untagged / VLAN 1 cables.
   * `null` = default black (#0a0a0a).
   */
  vlan1CableColor: string | null;
  /**
   * Session-only global multiplier for 2D cable stroke width.
   * `1` = default; does not write into connector model widths.
   */
  cableWidthScale: number;
  /**
   * 2D: disable fancy pathfinding — cables are plain endpoint↔endpoint L/U.
   * Through-node dash coloring still applies.
   */
  simplePaths: boolean;
  /** Cable routing style used by the Auto-Układ panel. */
  routingStyle: 'ORTHOGONAL' | 'DIAGONAL' | 'BUS' | 'STRAIGHT';
  /** Whether the Workshop view is currently active. */
  isWorkshopOpen: boolean;
  /** Active workshop sub-section (templates creator vs IPAM). */
  workshopSection: 'templates' | 'ipam';
  /**
   * Plan (2D): right item-controls dock is visible.
   * When false, only a reopen chevron is shown on the right edge.
   */
  isRightSidebarOpen: boolean;
}

export interface UiStateActions {
  setView: (view: string) => void;
  setMainMenuOptions: (options: MainMenuOptions) => void;
  setEditorMode: (mode: keyof typeof EditorModeEnum) => void;
  setIconCategoriesState: (iconCategoriesState: IconCollectionState[]) => void;
  resetUiState: () => void;
  setMode: (mode: Mode) => void;
  incrementZoom: () => void;
  decrementZoom: () => void;
  setIsMainMenuOpen: (isOpen: boolean) => void;
  setDialog: (dialog: keyof typeof DialogTypeEnum | null) => void;
  setZoom: (zoom: number) => void;
  /** Continuous zoom from mouse wheel / trackpad pinch (scroll stays put unless focal point provided). */
  adjustZoomByWheel: (deltaY: number, deltaMode?: number, focalFromCenter?: Coords) => void;
  /** Pan canvas from trackpad two-finger scroll / mouse wheel tilt. */
  panByWheel: (deltaX: number, deltaY: number, deltaMode?: number) => void;
  setScroll: (scroll: Scroll) => void;
  setItemControls: (itemControls: ItemControls | null) => void;
  setSelectedItemIds: (ids: string[]) => void;
  toggleSelectedItemId: (id: string) => void;
  clearSelectedItemIds: () => void;
  setSelectedWaypointIds: (ids: string[]) => void;
  setFocusedPortIds: (portIds: string[]) => void;
  /** Replace selection with a single port (or clear). */
  setFocusedPortId: (portId: string | null) => void;
  /** Ctrl/Cmd toggle a port in the multi-selection. */
  toggleFocusedPortId: (portId: string) => void;
  /** Pulse a port on the canvas (relation-panel jump). Clears itself after ~1s. */
  setPortAttention: (
    attention: { itemId: string; portId: string } | null
  ) => void;
  setPortPipHover: (
    hover: UiState['portPipHover']
  ) => void;
  setShape2dPortHover: (
    hover: UiState['shape2dPortHover']
  ) => void;
  /** Lock blue port hover after a canvas port click. */
  pinShape2dPortHover: (hover: { itemId: string; portId: string }) => void;
  setShape2dHeaderHoverItemId: (itemId: string | null) => void;
  setShape2dNodeHoverItemId: (itemId: string | null) => void;
  setShape2dEnlargedItemId: (itemId: string | null) => void;
  setSviHover: (
    hover: UiState['sviHover']
  ) => void;
  setContextMenu: (contextMenu: ContextMenu | null) => void;
  setMouse: (mouse: Mouse) => void;
  /** Imperative read — lets event handlers avoid subscribing to every mousemove. */
  getMouse: () => Mouse;
  setRendererEl: (el: HTMLDivElement) => void;
  setProjectionMode: (projectionMode: ProjectionMode) => void;
  setShowGrid: (showGrid: boolean) => void;
  setShowLoupe: (showLoupe: boolean) => void;
  toggleShowGrid: () => void;
  toggleShowLoupe: () => void;
  toggleAnimateConnectors: () => void;
  setNodeVisualStyle: (
    style: import('src/styles/nodeVisualStyles').NodeVisualStyleId
  ) => void;
  setGridStyle: (gridStyle: GridStyle) => void;
  /** Temporary: override grid line color for the active projection mode. */
  setGridColor: (color: string | null) => void;
  setCanvasTheme: (theme: CanvasTheme) => void;
  toggleCanvasTheme: () => void;
  /** Temporary: override canvas background for the active projection mode. */
  setDiagramBackgroundColor: (color: string | null) => void;
  /** Temporary: override VLAN 1 / untagged cable color, or null to reset. */
  setVlan1CableColor: (color: string | null) => void;
  /** Temporary: global 2D cable width multiplier (1 = default). */
  setCableWidthScale: (scale: number) => void;
  setSimplePaths: (enabled: boolean) => void;
  toggleSimplePaths: () => void;
  setRoutingStyle: (style: UiState['routingStyle']) => void;
  setWorkshopOpen: (isWorkshopOpen: boolean) => void;
  setWorkshopSection: (section: UiState['workshopSection']) => void;
  setRightSidebarOpen: (isOpen: boolean) => void;
  toggleRightSidebar: () => void;
}

export type UiStateStore = UiState & {
  actions: UiStateActions;
};
