import React from 'react';
import { Box, Button } from '@mui/material';

export type Props = {
  hex: string;
  isActive?: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement> | undefined;
};

export const ColorSwatch = ({ hex, onClick, isActive }: Props) => {
  return (
    <Button
      onClick={onClick}
      variant="text"
      size="small"
      sx={{ width: 40, height: 40, minWidth: 'auto' }}
    >
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: '100%',
          border: '1px solid',
          borderColor: 'grey.600',
          transform: `scale(${isActive ? 1.25 : 1})`,
          transformOrigin: 'center',
          overflow: 'hidden',
          // Checkerboard so alpha is visible
          backgroundImage:
            'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
          backgroundSize: '8px 8px',
          backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0'
        }}
      >
        <Box
          sx={{
            width: '100%',
            height: '100%',
            bgcolor: hex || 'transparent'
          }}
        />
      </Box>
    </Button>
  );
};
