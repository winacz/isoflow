import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelItem } from 'src/hooks/useModelItem';
import { isShape2dIcon } from 'src/config';
import { IconSelectionControls } from 'src/components/ItemControls/IconSelectionControls/IconSelectionControls';
import { ShapeSelectionControls } from 'src/components/ItemControls/ShapeSelectionControls/ShapeSelectionControls';
import { DeviceTemplateEditorControls } from 'src/components/ItemControls/DeviceCreator/DeviceTemplateEditorControls';
import { MultiNodeControls } from 'src/components/ItemControls/MultiNodeControls/MultiNodeControls';
import { NodeControls } from './NodeControls/NodeControls';
import { NodeControls2d } from './NodeControls/NodeControls2d';
import { ConnectorControls } from './ConnectorControls/ConnectorControls';
import { TextBoxControls } from './TextBoxControls/TextBoxControls';
import { RectangleControls } from './RectangleControls/RectangleControls';
import { isPlanProjection } from 'src/utils';

const NodeControlsSwitcher = ({
  id,
  prefer2d
}: {
  id: string;
  prefer2d: boolean;
}) => {
  const modelItem = useModelItem(id);

  if (prefer2d && isShape2dIcon(modelItem.icon)) {
    return <NodeControls2d id={id} />;
  }

  return <NodeControls id={id} />;
};

export const ItemControlsManager = () => {
  const itemControls = useUiStateStore((state) => {
    return state.itemControls;
  });
  const selectedItemIds = useUiStateStore((state) => {
    return state.selectedItemIds;
  });
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });

  const Controls = useMemo(() => {
    if (isPlanProjection(projectionMode) && selectedItemIds.length >= 2) {
      return <MultiNodeControls />;
    }

    switch (itemControls?.type) {
      case 'ITEM':
        return (
          <NodeControlsSwitcher
            key={itemControls.id}
            id={itemControls.id}
            prefer2d={isPlanProjection(projectionMode)}
          />
        );
      case 'CONNECTOR':
        return <ConnectorControls key={itemControls.id} id={itemControls.id} />;
      case 'TEXTBOX':
        return <TextBoxControls key={itemControls.id} id={itemControls.id} />;
      case 'RECTANGLE':
        return <RectangleControls key={itemControls.id} id={itemControls.id} />;
      case 'ADD_ITEM':
        return isPlanProjection(projectionMode) ? (
          <ShapeSelectionControls />
        ) : (
          <IconSelectionControls />
        );
      case 'EDIT_DEVICE_TEMPLATE':
        return (
          <DeviceTemplateEditorControls
            key={itemControls.templateId}
            templateId={itemControls.templateId}
            returnItemId={itemControls.returnItemId}
          />
        );
      default:
        return null;
    }
  }, [itemControls, selectedItemIds, projectionMode, uiStateActions]);

  return (
    <Box
      sx={{
        width: '100%'
      }}
    >
      {Controls}
    </Box>
  );
};
