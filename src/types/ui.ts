import {
  Coords,
  EditorModeEnum,
  MainMenuOptions,
  ProjectionMode
} from './common';
import { Icon } from './model';
import { ItemReference } from './scene';

interface AddItemControls {
  type: 'ADD_ITEM';
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
}

export interface ConnectorMode {
  type: 'CONNECTOR';
  showCursor: boolean;
  id: string | null;
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
  item: ItemReference;
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
  contextMenu: ContextMenu | null;
  zoom: number;
  scroll: Scroll;
  mouse: Mouse;
  rendererEl: HTMLDivElement | null;
  enableDebugTools: boolean;
  projectionMode: ProjectionMode;
  /** Whether the background grid is drawn (logical snap grid is always active). */
  showGrid: boolean;
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
   * 2D: disable fancy pathfinding — cables are plain endpoint↔endpoint L/U.
   * Through-node dash coloring still applies.
   */
  simplePaths: boolean;
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
  /** Continuous zoom from mouse wheel / trackpad pinch (scroll stays put). */
  adjustZoomByWheel: (deltaY: number, deltaMode?: number) => void;
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
  setContextMenu: (contextMenu: ContextMenu | null) => void;
  setMouse: (mouse: Mouse) => void;
  /** Imperative read — lets event handlers avoid subscribing to every mousemove. */
  getMouse: () => Mouse;
  setRendererEl: (el: HTMLDivElement) => void;
  setEnableDebugTools: (enabled: boolean) => void;
  setProjectionMode: (projectionMode: ProjectionMode) => void;
  setShowGrid: (showGrid: boolean) => void;
  toggleShowGrid: () => void;
  setGridStyle: (gridStyle: GridStyle) => void;
  /** Temporary: override grid line color for the active projection mode. */
  setGridColor: (color: string | null) => void;
  setCanvasTheme: (theme: CanvasTheme) => void;
  toggleCanvasTheme: () => void;
  /** Temporary: override canvas background for the active projection mode. */
  setDiagramBackgroundColor: (color: string | null) => void;
  /** Temporary: override VLAN 1 / untagged cable color, or null to reset. */
  setVlan1CableColor: (color: string | null) => void;
  setSimplePaths: (enabled: boolean) => void;
  toggleSimplePaths: () => void;
}

export type UiStateStore = UiState & {
  actions: UiStateActions;
};
