import { produce } from 'immer';
import { ModeActions } from 'src/types';
import {
  generateId,
  getItemAtTile,
  getShape2dItemAtTile,
  getShape2dPlacementTile,
  isShape2dPlacementFree,
  snapTile2dToGrid,
  getGridSnapStep,
  findCabinetAtTile,
  resolveCabinetSnap,
  isRackFormFactorItem,
  isFullWidthRackItem,
  getRackSpanUnits
} from 'src/utils';
import {
  VIEW_ITEM_DEFAULTS,
  SHAPES_2D,
  getShape2dSize,
  getModelItemSize,
  SHAPE_2D_SWITCH_ID,
  SHAPE_2D_PC_ID,
  SHAPE_2D_CAMERA_V2_ID,
  SHAPE_2D_PRINTER_ID,
  SHAPE_2D_VOIP_ID,
  SHAPE_2D_SMARTPHONE_ID,
  SHAPE_2D_IOT_ID,
  SHAPE_2D_AP_ID,
  SHAPE_2D_NAS_ID,
  SHAPE_2D_TABLET_ID,
  SHAPE_2D_CABINET_ID,
  SHAPE_2D_BLANKING_ID,
  SHAPE_2D_PATCH_PANEL_ID,
  CABINET_DEFAULT_UNITS,
  BLANKING_DEFAULT_UNITS,
  PATCH_PANEL_DEFAULT_PORTS,
  PATCH_PANEL_COLOR
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
      const isBlanking = iconId === SHAPE_2D_BLANKING_ID;
      const isPatchPanel = iconId === SHAPE_2D_PATCH_PANEL_ID;
      const draftModel = {
        icon: iconId,
        ...(isCabinet || isBlanking
          ? {
              rackUnits: isCabinet
                ? CABINET_DEFAULT_UNITS
                : BLANKING_DEFAULT_UNITS
            }
          : {}),
        ...(isPatchPanel ? { portCount: PATCH_PANEL_DEFAULT_PORTS } : {})
      };
      const shapeSize =
        getModelItemSize(draftModel) ??
        getShape2dSize(iconId) ?? { width: 1, height: 1 };

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

      let tile =
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

      let parentId: string | undefined;
      let rackUnit: number | undefined;

      // Drop rack gear straight into a cabinet slot (same as drag-mount).
      if (
        uiState.projectionMode === 'TWO_D' &&
        !isCabinet &&
        isRackFormFactorItem(draftModel)
      ) {
        const cabinet = findCabinetAtTile({
          tile: uiState.mouse.position.tile,
          viewItems: scene.items,
          modelItems: model.items
        });
        if (cabinet) {
          const snap = resolveCabinetSnap({
            cursorTile: uiState.mouse.position.tile,
            cabinetViewItem: cabinet.viewItem,
            cabinetModelItem: cabinet.modelItem,
            viewItems: scene.items,
            modelItems: model.items,
            fullWidth: isFullWidthRackItem(draftModel),
            spanUnits: getRackSpanUnits(draftModel)
          });
          if (snap) {
            tile = snap.tile;
            parentId = cabinet.viewItem.id;
            rackUnit = snap.rackUnit;
          }
        }
      }

      if (
        !parentId &&
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
      } else if (iconId === SHAPE_2D_CAMERA_V2_ID) {
        defaultName = `CAM-V2-${String(existingOfType + 1).padStart(2, '0')}`;
      } else if (iconId === SHAPE_2D_PRINTER_ID) {
        defaultName = `PRN-${String(existingOfType + 1).padStart(2, '0')}`;
      } else if (iconId === SHAPE_2D_VOIP_ID) {
        defaultName = `TEL-${String(existingOfType + 1).padStart(2, '0')}`;
      } else if (iconId === SHAPE_2D_SMARTPHONE_ID) {
        defaultName = `MOB-${String(existingOfType + 1).padStart(2, '0')}`;
      } else if (iconId === SHAPE_2D_IOT_ID) {
        defaultName = `IOT-${String(existingOfType + 1).padStart(2, '0')}`;
      } else if (iconId === SHAPE_2D_AP_ID) {
        defaultName = `AP-${String(existingOfType + 1).padStart(2, '0')}`;
      } else if (iconId === SHAPE_2D_NAS_ID) {
        defaultName = `NAS-${String(existingOfType + 1).padStart(2, '0')}`;
      } else if (iconId === SHAPE_2D_TABLET_ID) {
        defaultName = `TERM-${String(existingOfType + 1).padStart(2, '0')}`;
      } else if (isCabinet) {
        defaultName = `SZAFA-${String(existingOfType + 1).padStart(2, '0')}`;
      } else if (isBlanking) {
        defaultName = 'ZAŚLEPKA';
      } else if (isPatchPanel) {
        defaultName = `PP-${String(existingOfType + 1).padStart(2, '0')}`;
      }

      scene.beginHistoryTransaction();
      scene.createModelItem({
        id: modelItemId,
        name: defaultName,
        icon: iconId,
        ...(isCabinet ? { rackUnits: CABINET_DEFAULT_UNITS } : {}),
        ...(isBlanking ? { rackUnits: BLANKING_DEFAULT_UNITS } : {}),
        ...(isPatchPanel
          ? {
              portCount: PATCH_PANEL_DEFAULT_PORTS,
              color: PATCH_PANEL_COLOR
            }
          : {})
      });

      scene.createViewItem({
        ...VIEW_ITEM_DEFAULTS,
        id: modelItemId,
        tile,
        ...(parentId !== undefined && rackUnit !== undefined
          ? { parentId, rackUnit }
          : {})
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
