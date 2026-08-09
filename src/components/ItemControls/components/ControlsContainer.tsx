import React from 'react';
import { Box, Divider } from '@mui/material';

interface Props {
  header?: React.ReactNode;
  children: React.ReactNode;
}

export const ControlsContainer = ({ header, children }: Props) => {
  return (
    <Box
      sx={{
        position: 'relative',
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        pb: 2,
        bgcolor: 'transparent'
      }}
    >
      {header && (
        <Box
          sx={{
            width: '100%',
            zIndex: 1,
            position: 'sticky',
            bgcolor: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(6px)',
            top: 0
          }}
        >
          {header}
          <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.35)' }} />
        </Box>
      )}
      <Box
        sx={{
          width: '100%',
          flexGrow: 1
        }}
      >
        <Box sx={{ width: '100%' }}>{children}</Box>
      </Box>
    </Box>
  );
};
