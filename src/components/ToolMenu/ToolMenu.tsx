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
import { generateId, removeMidWaypointsByIds, isPlanProjection } from 'src/utils';
import { AlgorithmsToolButton } from 'src/components/AlgorithmsPopup/AlgorithmsPopup';

export const ToolMenu = ({
  /** Render without card chrome — for embedding in the plan sidebar header. */
  embedded = false
}: {
  embedded?: boolean;
} = {}) => {
  const {
    createTextBox,
    undo,
    connectors,
    updateConnector,
    beginHistoryTransaction,
    endHistoryTransaction
  } = useScene();
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
  const selectedWaypointIds = useUiStateStore((state) => {
    return state.selectedWaypointIds;
  });
  const uiStateStoreActions = useUiStateStore((state) => {
    return state.actions;
  });
  const mousePosition = useUiStateStore((state) => {
    return state.mouse.position.tile;
  });

  const isTwoD = projectionMode === 'TWO_D';
  const isPlan = isPlanProjection(projectionMode);
  const isEditable = editorMode === 'EDITABLE';

  const onUndo = useCallback(() => {
    if (!isEditable || !canUndo) return;
    undo();
  }, [isEditable, canUndo, undo]);

  useEffect(() => {
    if (!isEditable) return undefined;

    const isTypingTarget = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        Boolean(target?.isContentEditable)
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e)) return;

      const isUndo =
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'z';

      if (isUndo) {
        e.preventDefault();
        undo();
        return;
      }

      const isDelete = e.key === 'Delete' || e.key === 'Backspace';
      if (
        !isDelete ||
        !isTwoD ||
        selectedWaypointIds.length === 0 ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      ) {
        return;
      }

      e.preventDefault();

      const toRemove = new Set(selectedWaypointIds);
      let changed = false;

      beginHistoryTransaction();
      connectors.forEach((connector) => {
        const next = removeMidWaypointsByIds(connector.anchors, toRemove);
        if (!next) return;
        changed = true;
        updateConnector(
          connector.id,
          { anchors: next },
          { overlapResolve: 'off' }
        );
      });
      endHistoryTransaction();

      if (changed) {
        uiStateStoreActions.setSelectedWaypointIds([]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    isEditable,
    isTwoD,
    undo,
    selectedWaypointIds,
    connectors,
    updateConnector,
    beginHistoryTransaction,
    endHistoryTransaction,
    uiStateStoreActions
  ]);

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

  const tools = (
    <Stack
      direction="row"
      flexWrap="wrap"
      spacing={0}
      sx={{
        justifyContent: embedded ? 'flex-start' : undefined,
        width: embedded ? '100%' : undefined
      }}
    >
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
      {isPlan && <AlgorithmsToolButton />}
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
      )}
      <IconButton
        name="Text"
        Icon={<TitleIcon />}
        onClick={createTextBoxProxy}
        isActive={mode.type === 'TEXTBOX'}
      />
    </Stack>
  );

  if (embedded) {
    return tools;
  }

  return <UiElement>{tools}</UiElement>;
};
