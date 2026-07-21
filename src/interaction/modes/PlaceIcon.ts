import { produce } from 'immer';
import { ModeActions } from 'src/types';
import {
  generateId,
  getItemAtTile,
  getShape2dItemAtTile,
  getShape2dPlacementTile,
  isShape2dPlacementFree,
  snapTile2dToGrid,
  getGridSnapStep
} from 'src/utils';
import {
  VIEW_ITEM_DEFAULTS,
  SHAPES_2D,
  getShape2dSize,
  getModelItemSize,
  SHAPE_2D_SWITCH_ID,
  SHAPE_2D_PC_ID,
  SHAPE_2D_CABINET_ID,
  CABINET_DEFAULT_UNITS
} from 'src/config';

export const PlaceIcon: ModeActions = {
  mousemove: () => {},
  mousedown: ({ uiState, scene, model, isRendererInteraction }) => {
    if (uiState.mode.type !== 'PLACE_ICON' || !isRendererInteraction) return;

    if (!uiState.mode.id) {
      const itemAtTile =
        uiState.projectionMode === 'TWO_D'
          ? getShape2dItemAtTile({
              tile: uiState.mouse.position.tile,
              scene,
              modelItems: model.items
            })
          : getItemAtTile({
              tile: uiState.mouse.position.tile,
              scene
            });

      uiState.actions.setMode({
        type: 'CURSOR',
        mousedownItem: itemAtTile,
        showCursor: true
      });

      uiState.actions.setItemControls(null);
    }
  },
  mouseup: ({ uiState, scene, model }) => {
    if (uiState.mode.type !== 'PLACE_ICON') return;

    const iconId = uiState.mode.id;

    if (iconId !== null) {
      const modelItemId = generateId();
      const shape =
        SHAPES_2D.find((item) => {
          return item.id === iconId;
        }) ??
        model.icons.find((item) => {
          return item.id === iconId;
        });
      const isCabinet = iconId === SHAPE_2D_CABINET_ID;
      const shapeSize =
        (isCabinet
          ? getModelItemSize({
              icon: iconId,
              rackUnits: CABINET_DEFAULT_UNITS
            })
          : getShape2dSize(iconId)) ?? { width: 1, height: 1 };

      if (
        shape &&
        !model.icons.some((icon) => {
          return icon.id === shape.id;
        })
      ) {
        model.actions.set({
          icons: [...model.icons, shape]
        });
      }

      const tile =
        uiState.projectionMode === 'TWO_D'
          ? snapTile2dToGrid(
              getShape2dPlacementTile(uiState.mouse.position.tile, shapeSize),
              getGridSnapStep(uiState.gridStyle)
            )
          : uiState.mouse.position.tile;

      const placingPlanShape = Boolean(getShape2dSize(iconId));
      if (uiState.projectionMode === 'TWO_D' !== placingPlanShape) {
        return;
      }

      if (
        !isShape2dPlacementFree({
          origin: tile,
          size: shapeSize,
          items: scene.items,
          modelItems: model.items,
          ignoreCabinets: !isCabinet
        })
      ) {
        return;
      }

      const existingOfType = model.items.filter((item) => {
        return item.icon === iconId;
      }).length;

      let defaultName = shape?.name ?? 'Untitled';

      if (iconId === SHAPE_2D_SWITCH_ID) {
        defaultName = `SW-CORE-${String(existingOfType + 1).padStart(2, '0')}`;
      } else if (iconId === SHAPE_2D_PC_ID) {
        defaultName = `PC-${String(existingOfType + 1).padStart(2, '0')}`;
      } else if (isCabinet) {
        defaultName = `SZAFA-${String(existingOfType + 1).padStart(2, '0')}`;
      }

      scene.beginHistoryTransaction();
      scene.createModelItem({
        id: modelItemId,
        name: defaultName,
        icon: iconId,
        ...(isCabinet ? { rackUnits: CABINET_DEFAULT_UNITS } : {})
      });

      scene.createViewItem({
        ...VIEW_ITEM_DEFAULTS,
        id: modelItemId,
        tile
      });
      scene.endHistoryTransaction();
    }

    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        draft.id = null;
      })
    );
  }
};
