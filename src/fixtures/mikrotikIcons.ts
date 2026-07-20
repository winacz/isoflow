import { Icon, Size } from 'src/types';

import svg00 from 'src/assets/mikrotik/mikrotik-ccr1009-7g-1c-pc.svg';
import svg01 from 'src/assets/mikrotik/mikrotik-ccr1009-8g-1s-1s.svg';
import svg02 from 'src/assets/mikrotik/mikrotik-ccr1016-12g.svg';
import svg03 from 'src/assets/mikrotik/mikrotik-ccr1016-12s-1s.svg';
import svg04 from 'src/assets/mikrotik/mikrotik-ccr1036-12g-4s.svg';
import svg05 from 'src/assets/mikrotik/mikrotik-ccr1036-8g-2s.svg';
import svg06 from 'src/assets/mikrotik/mikrotik-ccr1072-1g-8s.svg';
import svg07 from 'src/assets/mikrotik/mikrotik-ccr2004-1g-12s-2xs.svg';
import svg08 from 'src/assets/mikrotik/mikrotik-crs125-24g-1s-rm.svg';
import svg09 from 'src/assets/mikrotik/mikrotik-crs317-1g-16s.svg';
import svg10 from 'src/assets/mikrotik/mikrotik-crs326-24g-2s-rm.svg';
import svg11 from 'src/assets/mikrotik/mikrotik-crs326-24s-2q-rm.svg';
import svg12 from 'src/assets/mikrotik/mikrotik-crs354-48g-4s-2q-rm.svg';
import svg13 from 'src/assets/mikrotik/mikrotik-rb1100ahx4.svg';
import svg14 from 'src/assets/mikrotik/mikrotik-rb2011uias-2hnd-in.svg';
import svg15 from 'src/assets/mikrotik/mikrotik-rb2011uias-in.svg';
import svg16 from 'src/assets/mikrotik/mikrotik-rb2011uias-rm.svg';
import svg17 from 'src/assets/mikrotik/mikrotik-rb3011uias-rm.svg';

export const MIKROTIK_COLLECTION = "Mikrotik's";

/**
 * Full rack faceplate width — same as cabinet outer width
 * (bay + mounting ears). Keep in sync with
 * RACK_1U_WIDTH_TILES + CABINET_EAR_TILES * 2 in config.ts.
 */
export const MIKROTIK_RACK_SIZE: Size = {
  width: 64,
  height: 9
};

export const MIKROTIK_SHAPE_SIZES: Record<string, Size> = {
  'mikrotik-ccr1009-7g-1c-pc': MIKROTIK_RACK_SIZE,
  'mikrotik-ccr1009-8g-1s-1s': MIKROTIK_RACK_SIZE,
  'mikrotik-ccr1016-12g': MIKROTIK_RACK_SIZE,
  'mikrotik-ccr1016-12s-1s': MIKROTIK_RACK_SIZE,
  'mikrotik-ccr1036-12g-4s': MIKROTIK_RACK_SIZE,
  'mikrotik-ccr1036-8g-2s': MIKROTIK_RACK_SIZE,
  'mikrotik-ccr1072-1g-8s': MIKROTIK_RACK_SIZE,
  'mikrotik-ccr2004-1g-12s-2xs': MIKROTIK_RACK_SIZE,
  'mikrotik-crs125-24g-1s-rm': MIKROTIK_RACK_SIZE,
  'mikrotik-crs317-1g-16s': MIKROTIK_RACK_SIZE,
  'mikrotik-crs326-24g-2s-rm': MIKROTIK_RACK_SIZE,
  'mikrotik-crs326-24s-2q-rm': MIKROTIK_RACK_SIZE,
  'mikrotik-crs354-48g-4s-2q-rm': MIKROTIK_RACK_SIZE,
  'mikrotik-rb1100ahx4': MIKROTIK_RACK_SIZE,
  'mikrotik-rb2011uias-2hnd-in': MIKROTIK_RACK_SIZE,
  'mikrotik-rb2011uias-in': MIKROTIK_RACK_SIZE,
  'mikrotik-rb2011uias-rm': MIKROTIK_RACK_SIZE,
  'mikrotik-rb3011uias-rm': MIKROTIK_RACK_SIZE
};

export const isMikrotikIcon = (iconId: string | undefined | null): boolean => {
  return Boolean(iconId && iconId.startsWith('mikrotik-'));
};

/** SVG rack switches from github.com/solustic/stencils/mikrotik. */
export const MIKROTIK_ICONS: Icon[] = [
  {
    id: 'mikrotik-ccr1009-7g-1c-pc',
    name: 'CCR1009-7G-1C-PC',
    url: svg00,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-ccr1009-8g-1s-1s',
    name: 'CCR1009-8G-1S-1S+',
    url: svg01,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-ccr1016-12g',
    name: 'CCR1016-12G',
    url: svg02,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-ccr1016-12s-1s',
    name: 'CCR1016-12S-1S+',
    url: svg03,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-ccr1036-12g-4s',
    name: 'CCR1036-12G-4S',
    url: svg04,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-ccr1036-8g-2s',
    name: 'CCR1036-8G-2S+',
    url: svg05,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-ccr1072-1g-8s',
    name: 'CCR1072-1G-8S+',
    url: svg06,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-ccr2004-1g-12s-2xs',
    name: 'CCR2004-1G-12S+2XS',
    url: svg07,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-crs125-24g-1s-rm',
    name: 'CRS125-24G-1S-RM',
    url: svg08,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-crs317-1g-16s',
    name: 'CRS317-1G-16S+',
    url: svg09,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-crs326-24g-2s-rm',
    name: 'CRS326-24G-2S+RM',
    url: svg10,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-crs326-24s-2q-rm',
    name: 'CRS326-24S+2Q+RM',
    url: svg11,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-crs354-48g-4s-2q-rm',
    name: 'CRS354-48G-4S+2Q+RM',
    url: svg12,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-rb1100ahx4',
    name: 'RB1100AHx4',
    url: svg13,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-rb2011uias-2hnd-in',
    name: 'RB2011UiAS-2HnD-IN',
    url: svg14,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-rb2011uias-in',
    name: 'RB2011UiAS-IN',
    url: svg15,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-rb2011uias-rm',
    name: 'RB2011UiAS-RM',
    url: svg16,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  },
  {
    id: 'mikrotik-rb3011uias-rm',
    name: 'RB3011UiAS-RM',
    url: svg17,
    collection: MIKROTIK_COLLECTION,
    isIsometric: false
  }
];

export const getMikrotikIcon = (
  iconId: string | undefined | null
): Icon | null => {
  if (!iconId) return null;
  const fromV1 =
    MIKROTIK_ICONS.find((icon) => {
      return icon.id === iconId;
    }) ?? null;
  if (fromV1) return fromV1;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getMikrotikV2Icon } = require('src/fixtures/mikrotikV2Icons') as {
    getMikrotikV2Icon: (id: string) => Icon | null;
  };
  return getMikrotikV2Icon(iconId);
};

export const ensureMikrotikIcons = (icons: Icon[]): Icon[] => {
  const byId = new Map(
    icons.map((icon) => {
      return [icon.id, icon] as const;
    })
  );
  MIKROTIK_ICONS.forEach((icon) => {
    byId.set(icon.id, icon);
  });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MIKROTIK_V2_ICONS } = require('src/fixtures/mikrotikV2Icons') as {
    MIKROTIK_V2_ICONS: Icon[];
  };
  MIKROTIK_V2_ICONS.forEach((icon) => {
    byId.set(icon.id, icon);
  });

  return Array.from(byId.values());
};
