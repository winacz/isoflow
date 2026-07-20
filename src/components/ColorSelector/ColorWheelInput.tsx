import React, { useMemo } from 'react';
import { Box, Stack, TextField, Typography } from '@mui/material';

const HEX6_RE = /^#([0-9a-fA-F]{6})$/;
const HEX3_RE = /^#([0-9a-fA-F]{3})$/;

/** Normalize to #rrggbb for native `<input type="color">`. */
export const toHex6 = (input: string, fallback = '#000000'): string => {
  const raw = (input || '').trim();
  if (HEX6_RE.test(raw)) return raw.toLowerCase();
  if (HEX3_RE.test(raw)) {
    const h = raw.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  // Strip alpha from #rrggbbaa
  if (/^#([0-9a-fA-F]{8})$/.test(raw)) {
    return raw.slice(0, 7).toLowerCase();
  }
  return fallback;
};

type Props = {
  label?: string;
  value: string;
  onChange: (hex: string) => void;
  /** Fallback when value is empty / invalid */
  fallback?: string;
};

/**
 * Compact color control: circular native color-wheel trigger + hex field.
 */
export const ColorWheelInput = ({
  label,
  value,
  onChange,
  fallback = '#000000'
}: Props) => {
  const hex6 = useMemo(() => {
    return toHex6(value, fallback);
  }, [value, fallback]);

  return (
    <Stack spacing={0.5}>
      {label && (
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
      )}
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box
          sx={{
            position: 'relative',
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '2px solid rgba(15,23,42,0.2)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35)',
            background: `
              conic-gradient(
                from 0deg,
                #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00
              )
            `,
            cursor: 'pointer'
          }}
          title="Wybierz kolor"
        >
          <Box
            sx={{
              position: 'absolute',
              inset: 6,
              borderRadius: '50%',
              bgcolor: hex6,
              border: '2px solid #fff',
              boxShadow: '0 0 0 1px rgba(15,23,42,0.25)',
              pointerEvents: 'none'
            }}
          />
          <Box
            component="input"
            type="color"
            value={hex6}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              onChange(e.target.value);
            }}
            sx={{
              position: 'absolute',
              inset: 0,
              opacity: 0,
              width: '100%',
              height: '100%',
              cursor: 'pointer',
              border: 0,
              p: 0
            }}
          />
        </Box>
        <TextField
          size="small"
          value={value}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (
              HEX6_RE.test(v) ||
              HEX3_RE.test(v) ||
              /^#([0-9a-fA-F]{8})$/.test(v)
            ) {
              onChange(v);
            }
          }}
          inputProps={{
            spellCheck: false,
            style: {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12
            }
          }}
          sx={{ flex: 1 }}
        />
      </Stack>
    </Stack>
  );
};
