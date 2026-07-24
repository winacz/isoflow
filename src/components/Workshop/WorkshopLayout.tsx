import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';

interface Props {
  preview: React.ReactNode;
  form: React.ReactNode;
}

/** Space reserved for centered ViewModeTabs + workshop type toggles. */
const PREVIEW_TOP_CHROME = 64;

export const WorkshopLayout = ({ preview, form }: Props) => {
  const [previewHeightPercent, setPreviewHeightPercent] = useState(50);
  const isDragging = useRef(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const h = window.innerHeight;
      const ratio = (e.clientY / h) * 100;
      setPreviewHeightPercent(Math.max(20, Math.min(80, ratio)));
    };
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, []);

  return (
    <Box
      sx={{
        flex: 1,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden'
      }}
    >
      <Box
        sx={{
          height: `${previewHeightPercent}%`,
          flex: 'none',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          bgcolor: '#e2e8f0',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Clear ViewModeTabs / workshop toggles — content starts below */}
        <Box sx={{ flex: 'none', height: PREVIEW_TOP_CHROME }} />

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            position: 'relative',
            overflow: 'hidden',
            px: 3,
            pb: 2
          }}
        >
          {preview}
        </Box>
      </Box>

      <Box
        onMouseDown={handleMouseDown}
        sx={{
          height: '8px',
          bgcolor: 'divider',
          cursor: 'ns-resize',
          zIndex: 10,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          '&:hover': {
            bgcolor: 'primary.light',
            '&::after': {
              bgcolor: 'primary.main'
            }
          },
          '&::after': {
            content: '""',
            width: '40px',
            height: '4px',
            bgcolor: 'text.disabled',
            borderRadius: '2px',
            transition: 'background-color 0.2s'
          }
        }}
      />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          bgcolor: 'background.paper',
          overflowY: 'auto',
          '& .MuiTypography-root, & .MuiInputBase-input, & .MuiButton-root': {
            fontSize: '0.85rem'
          },
          '& .MuiFormLabel-root': {
            fontSize: '0.8rem'
          },
          '& .MuiMenuItem-root': {
            fontSize: '0.85rem',
            minHeight: 'auto'
          }
        }}
      >
        <Box sx={{ maxWidth: 960, mx: 'auto', py: 4, px: 4 }}>{form}</Box>
      </Box>
    </Box>
  );
};
