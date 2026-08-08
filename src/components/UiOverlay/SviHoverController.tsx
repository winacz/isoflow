import React, { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';

type SviTooltipPayload = {
  vlan: number | string;
  ip?: string;
  color: string;
};

/**
 * SVI tooltip — store subscribe + rAF (not React re-render on every mouse px).
 * Tooltip attribute is parsed only when the hovered element changes.
 */
export const SviHoverController = () => {
  const setSviHover = useUiStateStore((state) => state.actions.setSviHover);
  const sviHover = useUiStateStore((state) => state.sviHover);
  const store = useUiStateStoreApi();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const lastHoverKeyRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const runHitTest = () => {
      rafRef.current = null;
      const mouse = store.getState().mouse;
      const interactionLayer = document.querySelector(
        '.isoflow-interaction-layer'
      ) as HTMLElement | null;

      if (!interactionLayer) {
        if (lastHoverKeyRef.current !== null) {
          lastHoverKeyRef.current = null;
          setSviHover(null);
        }
        return;
      }

      const originalEvents = interactionLayer.style.pointerEvents;
      interactionLayer.style.pointerEvents = 'none';
      const target = document.elementFromPoint(
        mouse.position.screen.x,
        mouse.position.screen.y
      );
      interactionLayer.style.pointerEvents = originalEvents;

      const hoverable = target?.closest('.svi-hoverable') as HTMLElement | null;
      if (!hoverable) {
        if (lastHoverKeyRef.current !== null) {
          lastHoverKeyRef.current = null;
          setSviHover(null);
        }
        return;
      }

      const tooltipData = hoverable.getAttribute('data-svi-tooltip');
      if (!tooltipData) {
        if (lastHoverKeyRef.current !== null) {
          lastHoverKeyRef.current = null;
          setSviHover(null);
        }
        return;
      }

      const hoverKey = tooltipData;
      let parsed: SviTooltipPayload | null = null;
      try {
        parsed = JSON.parse(tooltipData) as SviTooltipPayload;
      } catch {
        parsed = null;
      }

      if (!parsed) {
        if (lastHoverKeyRef.current !== null) {
          lastHoverKeyRef.current = null;
          setSviHover(null);
        }
        return;
      }

      // Always update screen position; skip JSON re-parse identity churn when same key.
      lastHoverKeyRef.current = hoverKey;
      setSviHover({
        vlan: typeof parsed.vlan === 'number' ? parsed.vlan : Number(parsed.vlan) || 0,
        ip: parsed.ip,
        color: parsed.color,
        screen: {
          x: mouse.position.screen.x,
          y: mouse.position.screen.y
        }
      });
    };

    const schedule = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(runHitTest);
    };

    const unsub = store.subscribe((state, prev) => {
      if (
        state.mouse.position.screen.x === prev.mouse.position.screen.x &&
        state.mouse.position.screen.y === prev.mouse.position.screen.y
      ) {
        return;
      }
      schedule();
    });

    return () => {
      unsub();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [store, setSviHover]);

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
