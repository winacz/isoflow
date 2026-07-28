import React from 'react';
import { ProjectionOrientationEnum } from 'src/types';
import {
  Box,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Slider,
  Select,
  MenuItem
} from '@mui/material';
import { 
  TextRotationNone as TextRotationNoneIcon,
  FormatAlignLeft as FormatAlignLeftIcon,
  FormatAlignCenter as FormatAlignCenterIcon,
  FormatAlignRight as FormatAlignRightIcon,
  FormatBold as FormatBoldIcon
} from '@mui/icons-material';
import { useTextBox } from 'src/hooks/useTextBox';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { getIsoProjectionCss } from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { ColorSelector } from 'src/components/ColorSelector/ColorSelector';
import { TEXTBOX_DEFAULTS } from 'src/config';
import { ControlsContainer } from '../components/ControlsContainer';
import { Section } from '../components/Section';
import { DeleteButton } from '../components/DeleteButton';

interface Props {
  id: string;
}

export const TextBoxControls = ({ id }: Props) => {
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const textBox = useTextBox(id);
  const { updateTextBox, deleteTextBox } = useScene();

  return (
    <ControlsContainer>
      <Section>
        <TextField
          value={textBox.content}
          onChange={(e) => {
            updateTextBox(textBox.id, { content: e.target.value as string });
          }}
        />
      </Section>
      <Section title="Text size">
        <Slider
          marks={false}
          step={0.1}
          min={0.2}
          max={5.0}
          value={textBox.fontSize}
          onChange={(e, newSize) => {
            updateTextBox(textBox.id, { fontSize: newSize as number });
          }}
        />
      </Section>
      <Section title="Orientation">
        <ToggleButtonGroup
          value={textBox.orientation}
          exclusive
          onChange={(e, orientation) => {
            if (textBox.orientation === orientation || orientation === null)
              return;

            updateTextBox(textBox.id, { orientation });
          }}
        >
          <ToggleButton value={ProjectionOrientationEnum.X}>
            <TextRotationNoneIcon sx={{ transform: getIsoProjectionCss() }} />
          </ToggleButton>
          <ToggleButton value={ProjectionOrientationEnum.Y}>
            <TextRotationNoneIcon
              sx={{
                transform: `scale(-1, 1) ${getIsoProjectionCss()} scale(-1, 1)`
              }}
            />
          </ToggleButton>
        </ToggleButtonGroup>
      </Section>
      <Section title="Font Family">
        <Select
          value={textBox.fontFamily || TEXTBOX_DEFAULTS.fontFamily}
          onChange={(e) => {
            updateTextBox(textBox.id, { fontFamily: e.target.value as string });
          }}
          size="small"
          fullWidth
        >
          <MenuItem value="Roboto, Arial, sans-serif">Roboto / Arial</MenuItem>
          <MenuItem value="Courier New, monospace">Courier New</MenuItem>
          <MenuItem value="Times New Roman, serif">Times New Roman</MenuItem>
        </Select>
      </Section>
      <Section title="Text Alignment">
        <ToggleButtonGroup
          value={textBox.textAlign || TEXTBOX_DEFAULTS.textAlign}
          exclusive
          onChange={(e, textAlign) => {
            if (textAlign) {
              updateTextBox(textBox.id, { textAlign });
            }
          }}
        >
          <ToggleButton value="left"><FormatAlignLeftIcon /></ToggleButton>
          <ToggleButton value="center"><FormatAlignCenterIcon /></ToggleButton>
          <ToggleButton value="right"><FormatAlignRightIcon /></ToggleButton>
        </ToggleButtonGroup>
      </Section>
      <Section title="Style">
        <ToggleButtonGroup
          value={textBox.fontWeight || TEXTBOX_DEFAULTS.fontWeight}
          exclusive
          onChange={(e, fontWeight) => {
            if (fontWeight) {
              updateTextBox(textBox.id, { fontWeight });
            }
          }}
        >
          <ToggleButton value="normal">Normal</ToggleButton>
          <ToggleButton value="bold"><FormatBoldIcon /></ToggleButton>
        </ToggleButtonGroup>
      </Section>
      <Section title="Color">
        <ColorSelector
          activeColor={textBox.color}
          onChange={(color) => {
            updateTextBox(textBox.id, { color });
          }}
        />
      </Section>
      <Section>
        <Box>
          <DeleteButton
            onClick={() => {
              uiStateActions.setItemControls(null);
              deleteTextBox(textBox.id);
            }}
          />
        </Box>
      </Section>
    </ControlsContainer>
  );
};
