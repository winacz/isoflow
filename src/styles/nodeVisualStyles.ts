import { SxProps, Theme } from '@mui/material';

export type NodeVisualStyleId =
  | 'default'
  | 'gradient'
  | 'glass'
  | 'card'
  | 'outline'
  | 'glow'
  | 'metal'
  | 'ink';

export type NodeVisualStyleOption = {
  id: NodeVisualStyleId;
  label: string;
  description: string;
};

/** Presets shown in the ZoomControls popover (checkboxes). */
export const NODE_VISUAL_STYLE_OPTIONS: NodeVisualStyleOption[] = [
  {
    id: 'default',
    label: 'Domyślny',
    description: 'Płaska biała obudowa'
  },
  {
    id: 'gradient',
    label: 'Gradient',
    description: 'Miękki przejście — białe też czytelne'
  },
  {
    id: 'glass',
    label: 'Szkło',
    description: 'Matowe szkło z rozmycciem tła'
  },
  {
    id: 'card',
    label: 'Karta',
    description: 'Lekkie uniesienie i zaokrąglenie'
  },
  {
    id: 'outline',
    label: 'Kontur',
    description: 'Schematyczny, wyraźna ramka'
  },
  {
    id: 'glow',
    label: 'Poświata',
    description: 'Delikatny zewnętrzny blask'
  },
  {
    id: 'metal',
    label: 'Metal',
    description: 'Szczotkowana stal'
  },
  {
    id: 'ink',
    label: 'Atrament',
    description: 'Ciemniejsza obudowa, wysoki kontrast'
  }
];

type Tint = {
  hex: string;
  alpha: number;
};

export type NodeChassisVisual = {
  sx: SxProps<Theme>;
  borderColor: string;
  outerFilter?: string;
  /** When true, skip solid device-color overlay (style owns the fill). */
  skipTintOverlay: boolean;
};

const clamp = (n: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, n));
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const raw = hex.replace('#', '').trim();
  if (raw.length === 3) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16)
    };
  }
  if (raw.length >= 6) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16)
    };
  }
  return null;
};

const luminance = (hex: string) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const mixToward = (
  hex: string,
  toward: { r: number; g: number; b: number },
  amount: number
) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const t = clamp(amount, 0, 1);
  const r = Math.round(rgb.r + (toward.r - rgb.r) * t);
  const g = Math.round(rgb.g + (toward.g - rgb.g) * t);
  const b = Math.round(rgb.b + (toward.b - rgb.b) * t);
  return `#${[r, g, b]
    .map((c) => clamp(c, 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
};

const lighten = (hex: string, amount: number) => {
  return mixToward(hex, { r: 255, g: 255, b: 255 }, amount);
};

const darken = (hex: string, amount: number) => {
  return mixToward(hex, { r: 15, g: 23, b: 42 }, amount);
};

const resolveBase = (tint?: Tint | null) => {
  const hasTint = Boolean(tint && tint.alpha > 0.08 && tint.hex);
  const base = hasTint ? tint!.hex : '#f1f5f9';
  const lum = luminance(base);
  const isPale = !hasTint || lum > 0.86;
  return { hasTint, base, lum, isPale };
};

const buildGradient = (tint?: Tint | null): NodeChassisVisual => {
  const { base, lum, isPale } = resolveBase(tint);
  const top = isPale ? '#ffffff' : lighten(base, 0.42);
  const mid = isPale ? '#e8eef6' : lighten(base, 0.12);
  const bottom = isPale ? '#c5d0de' : darken(base, 0.18);
  const borderColor = isPale
    ? '#64748b'
    : darken(base, clamp(0.22 + (1 - lum) * 0.15, 0.18, 0.4));

  return {
    skipTintOverlay: true,
    borderColor,
    outerFilter: 'drop-shadow(0 4px 10px rgba(15,23,42,0.14))',
    sx: {
      bgcolor: mid,
      backgroundImage: `linear-gradient(155deg, ${top} 0%, ${mid} 48%, ${bottom} 100%)`,
      boxShadow: isPale
        ? 'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(15,23,42,0.06), 0 4px 14px rgba(15,23,42,0.12)'
        : `inset 0 1px 0 ${lighten(base, 0.55)}aa, 0 6px 16px rgba(15,23,42,0.16)`
    }
  };
};

const buildGlass = (tint?: Tint | null): NodeChassisVisual => {
  const { base, isPale } = resolveBase(tint);
  const wash = isPale
    ? 'rgba(255,255,255,0.42)'
    : `${lighten(base, 0.35)}66`;
  return {
    skipTintOverlay: true,
    borderColor: isPale ? 'rgba(148,163,184,0.75)' : darken(base, 0.2),
    outerFilter: 'drop-shadow(0 6px 14px rgba(15,23,42,0.16))',
    sx: {
      bgcolor: wash,
      backgroundImage:
        'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.28) 100%)',
      backdropFilter: 'blur(12px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
      boxShadow:
        'inset 0 1px 0 rgba(255,255,255,0.8), 0 10px 28px rgba(15,23,42,0.14)'
    }
  };
};

const buildCard = (tint?: Tint | null): NodeChassisVisual => {
  const { base, isPale } = resolveBase(tint);
  const fill = isPale ? '#f8fafc' : lighten(base, 0.2);
  return {
    skipTintOverlay: true,
    borderColor: isPale ? '#94a3b8' : darken(base, 0.15),
    outerFilter: 'drop-shadow(0 8px 18px rgba(15,23,42,0.18))',
    sx: {
      bgcolor: fill,
      backgroundImage: isPale
        ? 'linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)'
        : `linear-gradient(180deg, ${lighten(base, 0.35)} 0%, ${fill} 100%)`,
      boxShadow:
        '0 1px 0 rgba(255,255,255,0.9) inset, 0 10px 24px rgba(15,23,42,0.14), 0 2px 4px rgba(15,23,42,0.08)'
    }
  };
};

const buildOutline = (tint?: Tint | null): NodeChassisVisual => {
  const { base, isPale } = resolveBase(tint);
  return {
    skipTintOverlay: true,
    borderColor: isPale ? '#334155' : darken(base, 0.35),
    outerFilter: undefined,
    sx: {
      bgcolor: isPale ? '#ffffff' : lighten(base, 0.45),
      backgroundImage: 'none',
      boxShadow: 'none'
    }
  };
};

const buildGlow = (tint?: Tint | null): NodeChassisVisual => {
  const { base, isPale } = resolveBase(tint);
  const glow = isPale ? 'rgba(59,130,246,0.45)' : `${base}99`;
  return {
    skipTintOverlay: true,
    borderColor: isPale ? '#60a5fa' : lighten(base, 0.15),
    outerFilter: `drop-shadow(0 0 10px ${glow}) drop-shadow(0 4px 12px rgba(15,23,42,0.12))`,
    sx: {
      bgcolor: isPale ? '#f8fbff' : lighten(base, 0.28),
      backgroundImage: isPale
        ? 'linear-gradient(160deg, #ffffff 0%, #eff6ff 100%)'
        : `linear-gradient(160deg, ${lighten(base, 0.4)} 0%, ${lighten(base, 0.1)} 100%)`,
      boxShadow: `0 0 0 1px ${glow}, 0 0 18px ${glow}`
    }
  };
};

const buildMetal = (): NodeChassisVisual => {
  return {
    skipTintOverlay: true,
    borderColor: '#64748b',
    outerFilter: 'drop-shadow(0 5px 12px rgba(15,23,42,0.2))',
    sx: {
      bgcolor: '#c0c7d1',
      backgroundImage:
        'linear-gradient(180deg, #f1f5f9 0%, #d5dde8 18%, #aeb8c6 42%, #e2e8f0 58%, #94a3b8 82%, #cbd5e1 100%)',
      boxShadow:
        'inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(15,23,42,0.18)'
    }
  };
};

const buildInk = (tint?: Tint | null): NodeChassisVisual => {
  const { base, isPale } = resolveBase(tint);
  const fill = isPale ? '#1e293b' : darken(base, 0.45);
  return {
    skipTintOverlay: true,
    borderColor: isPale ? '#0f172a' : darken(base, 0.55),
    outerFilter: 'drop-shadow(0 6px 14px rgba(15,23,42,0.35))',
    sx: {
      bgcolor: fill,
      backgroundImage: isPale
        ? 'linear-gradient(155deg, #334155 0%, #1e293b 55%, #0f172a 100%)'
        : `linear-gradient(155deg, ${lighten(base, 0.05)} 0%, ${fill} 100%)`,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)'
    }
  };
};

export const buildNodeChassisVisual = (
  style: NodeVisualStyleId,
  tint?: Tint | null
): NodeChassisVisual | null => {
  switch (style) {
    case 'gradient':
      return buildGradient(tint);
    case 'glass':
      return buildGlass(tint);
    case 'card':
      return buildCard(tint);
    case 'outline':
      return buildOutline(tint);
    case 'glow':
      return buildGlow(tint);
    case 'metal':
      return buildMetal();
    case 'ink':
      return buildInk(tint);
    case 'default':
    default:
      return null;
  }
};
