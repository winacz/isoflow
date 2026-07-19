import React from 'react';
import { Box, Slider, Stack, Typography } from '@mui/material';
import { useRectangle } from 'src/hooks/useRectangle';
import { ColorSelector } from 'src/components/ColorSelector/ColorSelector';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import { ControlsContainer } from '../components/ControlsContainer';
import { Section } from '../components/Section';
import { DeleteButton } from '../components/DeleteButton';

interface Props {
  id: string;
}

const DEFAULT_OPACITY = 0.25;

export const RectangleControls = ({ id }: Props) => {
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const rectangle = useRectangle(id);
  const { updateRectangle, deleteRectangle } = useScene();
  const opacity = rectangle.opacity ?? DEFAULT_OPACITY;
  const kindLabel =
    rectangle.kind === 'building' ? 'Budynek' : 'Obszar / kształt';

  return (
    <ControlsContainer>
      <Section>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4,
            color: 'text.secondary',
            textTransform: 'uppercase',
            mb: 1
          }}
        >
          {kindLabel}
        </Typography>
        <ColorSelector
          onChange={(color) => {
            updateRectangle(rectangle.id, { color });
          }}
          activeColor={rectangle.color}
        />
      </Section>
      <Section>
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.4,
            color: 'text.secondary',
            textTransform: 'uppercase',
            mb: 0.5
          }}
        >
          Przezroczystość
        </Typography>
        <Slider
          size="small"
          min={5}
          max={90}
          value={Math.round(opacity * 100)}
          onChange={(_, value) => {
            const next = (Array.isArray(value) ? value[0] : value) / 100;
            updateRectangle(rectangle.id, { opacity: next });
          }}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}%`}
        />
      </Section>
      <Section>
        <Box>
          <DeleteButton
            onClick={() => {
              uiStateActions.setItemControls(null);
              deleteRectangle(rectangle.id);
            }}
          />
        </Box>
      </Section>
    </ControlsContainer>
  );
};
