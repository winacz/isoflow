import React, { MouseEvent } from 'react';
import { Button as MuiButton, SxProps } from '@mui/material';
import {
  ExpandMore as ReadMoreIcon,
  ExpandLess as ReadLessIcon
} from '@mui/icons-material';

interface Props {
  isExpanded: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  sx?: SxProps;
}

export const ExpandButton = ({ isExpanded, onClick, sx }: Props) => {
  return (
    <MuiButton
      sx={{
        px: 0.4,
        py: 0.15,
        minWidth: 0,
        height: 'auto',
        fontSize: '0.7em',
        color: 'grey.700',
        bgcolor: 'rgba(255,255,255,0.95)',
        border: '1px solid',
        borderColor: 'grey.400',
        borderRadius: 1,
        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
        '&:hover': {
          bgcolor: 'grey.100'
        },
        ...sx
      }}
      onMouseDown={(e) => {
        // Keep interaction manager from treating this as a canvas click
        e.stopPropagation();
      }}
      onClick={onClick}
    >
      {isExpanded ? (
        <ReadLessIcon sx={{ fontSize: 18, color: 'grey.700' }} />
      ) : (
        <ReadMoreIcon sx={{ fontSize: 18, color: 'grey.700' }} />
      )}
    </MuiButton>
  );
};
