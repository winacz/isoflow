import React, { useCallback, useEffect } from 'react';
import { Stack } from '@mui/material';
import {
  PanToolOutlined as PanToolIcon,
  NearMeOutlined as NearMeIcon,
  AddOutlined as AddIcon,
  EastOutlined as ConnectorIcon,
  CropSquareOutlined as CropSquareIcon,
  Title as TitleIcon,
  UndoOutlined as UndoIcon
} from '@mui/icons-material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useHistoryStore } from 'src/stores/historyStore';
import { IconButton } from 'src/components/IconButton/IconButton';
import { UiElement } from 'src/components/UiElement/UiElement';
import { useScene } from 'src/hooks/useScene';
import { TEXTBOX_DEFAULTS } from 'src/config';
import { generateId } from 'src/utils';

export const ToolMenu = () => {
  const { createTextBox, undo } = useScene();
  const canUndo = useHistoryStore((state) => {
    return state.canUndo;
  });
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const editorMode = useUiStateStore((state) => {
    return state.editorMode;
  });
  const uiStateStoreActions = useUiStateStore((state) => {
    return state.actions;
  });
  const mousePosition = useUiStateStore((state) => {
    return state.mouse.position.tile;
  });

  const isTwoD = projectionMode === 'TWO_D';
  const isEditable = editorMode === 'EDITABLE';

  const onUndo = useCallback(() => {
    if (!isEditable || !canUndo) return;
    undo();
  }, [isEditable, canUndo, undo]);

  useEffect(() => {
    if (!isEditable) return undefined;

    const onKeyDown = (e: KeyboardEvent) => {
      const isUndo =
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'z';

      if (!isUndo) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        target?.isContentEditable
      ) {
        return;
      }

      e.preventDefault();
      undo();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isEditable, undo]);

  const createTextBoxProxy = useCallback(() => {
    const textBoxId = generateId();

    createTextBox({
      ...TEXTBOX_DEFAULTS,
      id: textBoxId,
      tile: mousePosition
    });

    uiStateStoreActions.setMode({
      type: 'TEXTBOX',
      showCursor: false,
      id: textBoxId
    });
  }, [uiStateStoreActions, createTextBox, mousePosition]);

  const openAddMenu = useCallback(() => {
    uiStateStoreActions.setItemControls({
      type: 'ADD_ITEM'
    });
    uiStateStoreActions.setMode({
      type: 'PLACE_ICON',
      showCursor: true,
      id: null
    });
  }, [uiStateStoreActions]);

  return (
    <UiElement>
      <Stack direction="row">
        <IconButton
          name="Undo (Ctrl+Z)"
          Icon={<UndoIcon />}
          onClick={onUndo}
          disabled={!isEditable || !canUndo}
        />
        <IconButton
          name="Select"
          Icon={<NearMeIcon />}
          onClick={() => {
            uiStateStoreActions.setMode({
              type: 'CURSOR',
              showCursor: true,
              mousedownItem: null
            });
            uiStateStoreActions.setItemControls(null);
          }}
          isActive={mode.type === 'CURSOR' || mode.type === 'DRAG_ITEMS'}
        />
        <IconButton
          name="Pan"
          Icon={<PanToolIcon />}
          onClick={() => {
            uiStateStoreActions.setMode({
              type: 'PAN',
              showCursor: false
            });

            uiStateStoreActions.setItemControls(null);
          }}
          isActive={mode.type === 'PAN'}
        />
        <IconButton
          name={isTwoD ? 'Add shape' : 'Add item'}
          Icon={<AddIcon />}
          onClick={openAddMenu}
          isActive={mode.type === 'PLACE_ICON'}
        />
        <IconButton
          name="Connector"
          Icon={<ConnectorIcon />}
          onClick={() => {
            uiStateStoreActions.setMode({
              type: 'CONNECTOR',
              id: null,
              showCursor: true
            });
            uiStateStoreActions.setItemControls(null);
          }}
          isActive={mode.type === 'CONNECTOR'}
        />
        {!isTwoD && (
          <>
            <IconButton
              name="Rectangle"
              Icon={<CropSquareIcon />}
              onClick={() => {
                uiStateStoreActions.setMode({
                  type: 'RECTANGLE.DRAW',
                  showCursor: true,
                  id: null
                });
              }}
              isActive={mode.type === 'RECTANGLE.DRAW'}
            />
            <IconButton
              name="Text"
              Icon={<TitleIcon />}
              onClick={createTextBoxProxy}
              isActive={mode.type === 'TEXTBOX'}
            />
          </>
        )}
      </Stack>
    </UiElement>
  );
};
