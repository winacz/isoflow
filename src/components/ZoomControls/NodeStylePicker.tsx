import React, { useState } from 'react';
import {
  Popover,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Typography,
  Box,
  Divider
} from '@mui/material';
import { Gradient as GradientIcon } from '@mui/icons-material';
import { UiElement } from 'src/components/UiElement/UiElement';
import { IconButton } from 'src/components/IconButton/IconButton';
import { useUiStateStore } from 'src/stores/uiStateStore';
import {
  NODE_VISUAL_STYLE_OPTIONS,
  type NodeVisualStyleId
} from 'src/styles/nodeVisualStyles';

/**
 * Expandable control: pick one node chassis look via checkboxes.
 */
export const NodeStylePicker = () => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const nodeVisualStyle = useUiStateStore((state) => state.nodeVisualStyle);
  const setNodeVisualStyle = useUiStateStore(
    (state) => state.actions.setNodeVisualStyle
  );
  const open = Boolean(anchorEl);
  const isCustom = nodeVisualStyle !== 'default';

  const onToggle = (id: NodeVisualStyleId, checked: boolean) => {
    if (checked) {
      setNodeVisualStyle(id);
      return;
    }
    // Unchecking the active style returns to default.
    if (nodeVisualStyle === id) {
      setNodeVisualStyle('default');
    }
  };

  return (
    <>
      <UiElement>
        <IconButton
          name="Styl node’ów"
          Icon={<GradientIcon />}
          isActive={isCustom || open}
          onClick={(e) => {
            setAnchorEl(e.currentTarget);
          }}
        />
      </UiElement>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        PaperProps={{
          sx: {
            mt: -1,
            minWidth: 260,
            maxWidth: 300,
            px: 1.5,
            py: 1.25,
            borderRadius: 2,
            boxShadow: '0 12px 32px rgba(15,23,42,0.18)'
          }
        }}
      >
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.2,
            color: 'text.secondary',
            mb: 0.75,
            px: 0.5
          }}
        >
          Styl urządzeń
        </Typography>
        <Divider sx={{ mb: 0.75 }} />
        <FormGroup>
          {NODE_VISUAL_STYLE_OPTIONS.map((option) => {
            const checked = nodeVisualStyle === option.id;
            return (
              <FormControlLabel
                key={option.id}
                sx={{
                  mx: 0,
                  px: 0.5,
                  py: 0.35,
                  borderRadius: 1,
                  alignItems: 'flex-start',
                  bgcolor: checked ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: 'action.hover' }
                }}
                control={
                  <Checkbox
                    size="small"
                    checked={checked}
                    onChange={(_, next) => onToggle(option.id, next)}
                    sx={{ pt: 0.25 }}
                  />
                }
                label={
                  <Box sx={{ py: 0.15 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
                      {option.label}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 11,
                        color: 'text.secondary',
                        lineHeight: 1.25,
                        mt: 0.15
                      }}
                    >
                      {option.description}
                    </Typography>
                  </Box>
                }
              />
            );
          })}
        </FormGroup>
      </Popover>
    </>
  );
};
