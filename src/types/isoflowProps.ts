import type { EditorModeEnum, MainMenuOptions, ProjectionMode } from './common';
import type { Model } from './model';
import type { RendererProps } from './rendererProps';

export type InitialData = Model & {
  fitToView?: boolean;
  view?: string;
  /** Open this projection when the model loads */
  projectionMode?: ProjectionMode;
};

export interface IsoflowProps {
  initialData?: InitialData;
  mainMenuOptions?: MainMenuOptions;
  onModelUpdated?: (Model: Model) => void;
  width?: number | string;
  height?: number | string;
  editorMode?: keyof typeof EditorModeEnum;
  renderer?: RendererProps;
}
