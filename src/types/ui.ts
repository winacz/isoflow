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
  /** 2D: port id to expand in the device sidebar when an ITEM is selected. */
  focusedPortId: string | null;
  contextMenu: ContextMenu | null;
  zoom: number;
  scroll: Scroll;
  mouse: Mouse;
  rendererEl: HTMLDivElement | null;
  enableDebugTools: boolean;
  projectionMode: ProjectionMode;
  /** Whether the background grid is drawn (logical snap grid is always active). */
  showGrid: boolean;
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
  /** Continuous zoom from mouse wheel / trackpad. */
  adjustZoomByWheel: (deltaY: number, deltaMode?: number) => void;
  setScroll: (scroll: Scroll) => void;
  setItemControls: (itemControls: ItemControls | null) => void;
  setSelectedItemIds: (ids: string[]) => void;
  toggleSelectedItemId: (id: string) => void;
  clearSelectedItemIds: () => void;
  setSelectedWaypointIds: (ids: string[]) => void;
  setFocusedPortId: (portId: string | null) => void;
  setContextMenu: (contextMenu: ContextMenu | null) => void;
  setMouse: (mouse: Mouse) => void;
  setRendererEl: (el: HTMLDivElement) => void;
  setEnableDebugTools: (enabled: boolean) => void;
  setProjectionMode: (projectionMode: ProjectionMode) => void;
  setShowGrid: (showGrid: boolean) => void;
  toggleShowGrid: () => void;
}

export type UiStateStore = UiState & {
  actions: UiStateActions;
};
