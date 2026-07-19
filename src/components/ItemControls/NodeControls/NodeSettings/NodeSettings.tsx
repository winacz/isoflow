import React, { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Slider,
  Box,
  TextField,
  Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { ModelItem, ViewItem } from 'src/types';
import { MarkdownEditor } from 'src/components/MarkdownEditor/MarkdownEditor';
import { useModelItem } from 'src/hooks/useModelItem';
import { MARKDOWN_EMPTY_VALUE } from 'src/config';
import { DeleteButton } from '../../components/DeleteButton';
import { Section } from '../../components/Section';
import { NodePortalSettings } from './NodePortalSettings';

export type NodeUpdates = {
  model: Partial<ModelItem>;
  view: Partial<ViewItem>;
};

interface Props {
  node: ViewItem;
  onModelItemUpdated: (updates: Partial<ModelItem>) => void;
  onViewItemUpdated: (updates: Partial<ViewItem>) => void;
  onDeleted: () => void;
}

export const NodeSettings = ({
  node,
  onModelItemUpdated,
  onViewItemUpdated,
  onDeleted
}: Props) => {
  const modelItem = useModelItem(node.id);
  const [opisOpen, setOpisOpen] = useState(false);
  const hasDescription = Boolean(
    modelItem.description && modelItem.description !== MARKDOWN_EMPTY_VALUE
  );

  return (
    <>
      <Section title="Name">
        <TextField
          value={modelItem.name}
          onChange={(e) => {
            const text = e.target.value as string;
            if (modelItem.name !== text) onModelItemUpdated({ name: text });
          }}
        />
      </Section>
      <Section>
        <Accordion
          disableGutters
          elevation={0}
          expanded={opisOpen}
          onChange={(_, expanded) => {
            setOpisOpen(expanded);
          }}
          sx={{
            bgcolor: 'transparent',
            '&:before': { display: 'none' }
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />}
            sx={{
              px: 0,
              minHeight: 28,
              '& .MuiAccordionSummary-content': { my: 0.25 }
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              textTransform="uppercase"
            >
              Description{hasDescription ? '' : ' (empty)'}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 0, pt: 0, pb: 0.5 }}>
            <MarkdownEditor
              value={modelItem.description}
              onChange={(text) => {
                if (modelItem.description !== text)
                  onModelItemUpdated({ description: text });
              }}
            />
          </AccordionDetails>
        </Accordion>
      </Section>
      {modelItem.name && (
        <Section title="Label height">
          <Slider
            marks
            step={20}
            min={60}
            max={280}
            value={node.labelHeight}
            onChange={(e, newHeight) => {
              const labelHeight = newHeight as number;
              onViewItemUpdated({ labelHeight });
            }}
          />
        </Section>
      )}
      <NodePortalSettings
        modelItem={modelItem}
        onModelItemUpdated={onModelItemUpdated}
      />
      <Section>
        <Box>
          <DeleteButton onClick={onDeleted} />
        </Box>
      </Section>
    </>
  );
};
