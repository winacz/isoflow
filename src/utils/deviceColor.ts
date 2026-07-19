import chroma from 'chroma-js';

/** Soft default tint when user picks a solid color without alpha. */
export const DEVICE_COLOR_DEFAULT_ALPHA = 0.28;

export const DEFAULT_DEVICE_FILL = '#ffffff';

const toHex8 = (color: chroma.Color) => {
  // chroma includes alpha as #rrggbbaa when alpha < 1
  return color.hex();
};

export const parseDeviceColor = (
  color: string | undefined | null
): { css: string; hex: string; alpha: number } => {
  if (!color?.trim()) {
    return { css: DEFAULT_DEVICE_FILL, hex: DEFAULT_DEVICE_FILL, alpha: 0 };
  }

  try {
    const parsed = chroma(color.trim());
    const alpha = parsed.alpha();
    return {
      css: parsed.css(),
      hex: parsed.alpha(1).hex(),
      alpha: Number.isFinite(alpha) ? alpha : 1
    };
  } catch {
    return { css: DEFAULT_DEVICE_FILL, hex: DEFAULT_DEVICE_FILL, alpha: 0 };
  }
};

/** Store as #RRGGBBAA for compact model JSON. */
export const toDeviceColorHex8 = (
  color: string,
  alpha = DEVICE_COLOR_DEFAULT_ALPHA
): string => {
  try {
    const parsed = chroma(color);
    const a = Number.isFinite(alpha) ? alpha : parsed.alpha();
    return toHex8(parsed.alpha(Math.min(1, Math.max(0, a))));
  } catch {
    return toHex8(chroma(DEFAULT_DEVICE_FILL).alpha(0));
  }
};

/**
 * Normalize picker output: keep alpha when present; otherwise apply a soft default
 * so chassis tints stay subtle.
 */
export const normalizeDeviceColorInput = (color: string): string => {
  try {
    const parsed = chroma(color);
    const alpha = parsed.alpha();
    if (alpha < 0.99) {
      return toHex8(parsed);
    }
    // Fully opaque pick → soften automatically (user can raise opacity slider)
    return toHex8(parsed.alpha(DEVICE_COLOR_DEFAULT_ALPHA));
  } catch {
    return toHex8(chroma(DEFAULT_DEVICE_FILL).alpha(DEVICE_COLOR_DEFAULT_ALPHA));
  }
};

export const setDeviceColorAlpha = (color: string, alpha: number): string => {
  return toDeviceColorHex8(color, alpha);
};
