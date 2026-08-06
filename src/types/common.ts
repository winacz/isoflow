export interface Coords {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  from: Coords;
  to: Coords;
}

export const ProjectionOrientationEnum = {
  X: 'X',
  Y: 'Y'
} as const;

export const ProjectionModeEnum = {
  ISOMETRIC: 'ISOMETRIC',
  TWO_D: 'TWO_D',
  TWO_D_V2: 'TWO_D_V2',
  TWO_D_V3: 'TWO_D_V3'
} as const;

export type ProjectionMode = keyof typeof ProjectionModeEnum;

export type BoundingBox = [Coords, Coords, Coords, Coords];

export type SlimMouseEvent = Pick<
  MouseEvent,
  | 'clientX'
  | 'clientY'
  | 'target'
  | 'type'
  | 'preventDefault'
  | 'button'
  | 'shiftKey'
  | 'ctrlKey'
  | 'metaKey'
>;

export const EditorModeEnum = {
  NON_INTERACTIVE: 'NON_INTERACTIVE',
  EXPLORABLE_READONLY: 'EXPLORABLE_READONLY',
  EDITABLE: 'EDITABLE'
} as const;

export const MainMenuOptionsEnum = {
  'ACTION.NEW_PROJECT': 'ACTION.NEW_PROJECT',
  'ACTION.RENAME_PROJECT': 'ACTION.RENAME_PROJECT',
  'ACTION.OPEN': 'ACTION.OPEN',
  'ACTION.SAVE_PROJECT': 'ACTION.SAVE_PROJECT',
  'EXPORT.JSON': 'EXPORT.JSON',
  'EXPORT.PNG': 'EXPORT.PNG',
  'ACTION.CLEAR_CANVAS': 'ACTION.CLEAR_CANVAS',
  'LINK.GITHUB': 'LINK.GITHUB',
  'LINK.DISCORD': 'LINK.DISCORD',
  VERSION: 'VERSION'
} as const;

export type MainMenuOptions = (keyof typeof MainMenuOptionsEnum)[];
