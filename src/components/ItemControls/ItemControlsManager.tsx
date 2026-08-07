import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelItem } from 'src/hooks/useModelItem';
import { isShape2dIcon } from 'src/config';
import { IconSelectionControls } from 'src/components/ItemControls/IconSelectionControls/IconSelectionControls';
import { ShapeSelectionControls } from 'src/components/ItemControls/ShapeSelectionControls/ShapeSelectionControls';
import { DeviceTemplateEditorControls } from 'src/components/ItemControls/DeviceCreator/DeviceTemplateEditorControls';
import { MultiNodeControls } from 'src/components/ItemControls/MultiNodeControls/MultiNodeControls';
import { isPlanProjection } from 'src/utils';
import { NodeControls } from './NodeControls/NodeControls';
import { NodeControls2d } from './NodeControls/NodeControls2d';
import { ConnectorControls } from './ConnectorControls/ConnectorControls';
import { ConnectorControls2d } from './ConnectorControls/ConnectorControls2d';
import { TextBoxControls } from './TextBoxControls/TextBoxControls';
import { RectangleControls } from './RectangleControls/RectangleControls';

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

/** 2D plan with an empty selection: hint only (layout tools live in RMB menu). */
const EmptyPlanControls = () => {
  return (
    <Box sx={{ px: 2, py: 2 }}>
      <Typography
        sx={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.6,
          color: 'text.secondary',
          textTransform: 'uppercase',
          mb: 0.5
        }}
      >
        Kontekst
      </Typography>
      <Typography
        sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.45 }}
      >
        Wybierz urządzenie na planie albo naciśnij{' '}
        <Box component="span" sx={{ fontWeight: 700 }}>
          +
        </Box>{' '}
        aby dodać nowe. Auto-Układ i grupy — PPM na planie.
      </Typography>
    </Box>
  );
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

  const Controls = useMemo(() => {
    const planMulti =
      isPlanProjection(projectionMode) && selectedItemIds.length >= 2;
    const planSingleItem =
      isPlanProjection(projectionMode) &&
      selectedItemIds.length === 1 &&
      itemControls?.type === 'ITEM';

    // Multi-select: shared color / VLAN for all selected plan nodes.
    if (planMulti) {
      return <MultiNodeControls />;
    }

    if (planSingleItem) {
      return (
        <NodeControlsSwitcher
          key={itemControls.id}
          id={itemControls.id}
          prefer2d
        />
      );
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
        return isPlanProjection(projectionMode) ? (
          <ConnectorControls2d key={itemControls.id} id={itemControls.id} />
        ) : (
          <ConnectorControls key={itemControls.id} id={itemControls.id} />
        );
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
        // Nothing selected in the 2D plan: layout tools are on the RMB menu.
        return isPlanProjection(projectionMode) ? <EmptyPlanControls /> : null;
    }
  }, [itemControls, selectedItemIds, projectionMode]);

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
