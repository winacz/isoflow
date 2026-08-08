import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import {
  isPerfHudEnabled,
  subscribePerfSnapshot
} from 'src/utils/perfMetrics';

/**
 * Dev overlay: FPS, setMouse/frame, last mousemove handler ms.
 * Toggle: localStorage.setItem('isoflow-perf-hud', '1'); location.reload();
 */
export const PerfHud = () => {
  const [enabled] = useState(() => isPerfHudEnabled());
  const [fps, setFps] = useState(0);
  const [setMousePerFrame, setSetMousePerFrame] = useState(0);
  const [lastMousemoveMs, setLastMousemoveMs] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribePerfSnapshot((snap) => {
      setFps(snap.fps);
      setSetMousePerFrame(snap.setMousePerFrame);
      setLastMousemoveMs(snap.lastMousemoveMs);
    });
  }, [enabled]);

  if (!enabled) return null;

  return (
    <Box
      sx={{
        position: 'absolute',
        right: 8,
        bottom: 8,
        zIndex: 10000,
        pointerEvents: 'none',
        px: 1.25,
        py: 0.75,
        borderRadius: 1,
        bgcolor: 'rgba(15, 23, 42, 0.85)',
        color: '#e2e8f0',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        minWidth: 140
      }}
    >
      <Typography sx={{ fontSize: 11, lineHeight: 1.4 }}>
        FPS {fps}
      </Typography>
      <Typography sx={{ fontSize: 11, lineHeight: 1.4 }}>
        setMouse/f {setMousePerFrame}
      </Typography>
      <Typography sx={{ fontSize: 11, lineHeight: 1.4 }}>
        mousemove {lastMousemoveMs.toFixed(1)}ms
      </Typography>
    </Box>
  );
};
