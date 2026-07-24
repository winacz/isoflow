import React, { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';

export const SviHoverController = () => {
  const mouse = useUiStateStore((state) => state.mouse);
  const setSviHover = useUiStateStore((state) => state.actions.setSviHover);
  const sviHover = useUiStateStore((state) => state.sviHover);
  
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // We only need to check when mouse moves
    const interactionLayer = document.querySelector('.isoflow-interaction-layer') as HTMLElement;
    
    if (!interactionLayer) {
      setSviHover(null);
      return;
    }

    // Micro-toggle pointer events to pierce through the interaction overlay
    const originalEvents = interactionLayer.style.pointerEvents;
    interactionLayer.style.pointerEvents = 'none';
    
    const target = document.elementFromPoint(mouse.position.screen.x, mouse.position.screen.y);
    
    interactionLayer.style.pointerEvents = originalEvents;

    const hoverable = target?.closest('.svi-hoverable');
    
    if (hoverable) {
      const tooltipData = hoverable.getAttribute('data-svi-tooltip');
      if (tooltipData) {
        try {
          const parsed = JSON.parse(tooltipData);
          setSviHover({
            vlan: parsed.vlan,
            ip: parsed.ip,
            color: parsed.color,
            screen: {
              x: mouse.position.screen.x,
              y: mouse.position.screen.y
            }
          });
          return;
        } catch (e) {
          // parse error
        }
      }
    }
    
    setSviHover(null);
  }, [mouse.position.screen.x, mouse.position.screen.y, setSviHover]);

  if (!sviHover) return null;

  return (
    <Box
      ref={tooltipRef}
      sx={{
        position: 'absolute',
        top: sviHover.screen.y,
        left: sviHover.screen.x,
        transform: 'translateX(-50%) translateY(calc(-100% - 16px))',
        pointerEvents: 'none',
        zIndex: 9999,
        px: 1.5,
        py: 1,
        bgcolor: '#1e293b',
        color: '#f1f5f9',
        borderRadius: '8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        whiteSpace: 'nowrap',
        // Arrow pointing down
        '&::after': {
          content: '""',
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          borderWidth: '5px',
          borderStyle: 'solid',
          borderColor: '#1e293b transparent transparent transparent'
        }
      }}
    >
      <Typography
        sx={{
          fontWeight: 700,
          fontSize: 12,
          lineHeight: 1.3,
          color: '#f1f5f9'
        }}
      >
        SVI — VLAN <span style={{ color: sviHover.color }}>{sviHover.vlan}</span>
      </Typography>
      {sviHover.ip && (
        <Typography
          sx={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 11,
            lineHeight: 1.3,
            color: '#94a3b8',
            mt: 0.25
          }}
        >
          IP: {sviHover.ip}
        </Typography>
      )}
    </Box>
  );
};
