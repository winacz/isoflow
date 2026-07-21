import chroma from 'chroma-js';
import { produce } from 'immer';
import { Icon, EditorModeEnum, Mode, Coords, Scroll } from 'src/types';
import { v4 as uuid } from 'uuid';
import { CoordsUtils } from './CoordsUtils';

export const generateId = () => {
  return uuid();
};

export const clamp = (num: number, min: number, max: number) => {
  return Math.max(Math.min(num, max), min);
};

interface GetColorVariantOpts {
  alpha?: number;
  grade?: number;
}

export const getColorVariant = (
  color: string,
  variant: 'light' | 'dark',
  { alpha = 1, grade = 1 }: GetColorVariantOpts
) => {
  switch (variant) {
    case 'light':
      return chroma(color).brighten(grade).alpha(alpha).css();
    case 'dark':
      return chroma(color).darken(grade).saturate(grade).alpha(alpha).css();
    default:
      return chroma(color).alpha(alpha).css();
  }
};

export const setWindowCursor = (cursor: string) => {
  window.document.body.style.cursor = cursor;
};

/** Black reticle for connector placement (hotspot at center). */
export const BLACK_CROSSHAIR_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M12 1v8M12 15v8M1 12h8M15 12h8" stroke="#000" stroke-width="2" fill="none"/>
    <circle cx="12" cy="12" r="2.5" stroke="#000" stroke-width="2" fill="none"/>
  </svg>`
)}") 12 12, crosshair`;

export const getPanScrollFromDelta = (
  scroll: Scroll,
  deltaScreen: Coords | null | undefined
): Scroll => {
  return produce(scroll, (draft) => {
    draft.position = deltaScreen
      ? CoordsUtils.add(draft.position, deltaScreen)
      : draft.position;
  });
};

export const toPx = (value: number | string) => {
  return `${value}px`;
};

export const categoriseIcons = (icons: Icon[]) => {
  const categories: { name?: string; icons: Icon[] }[] = [];

  icons.forEach((icon) => {
    const collection = categories.find((cat) => {
      return cat.name === icon.collection;
    });

    if (!collection) {
      categories.push({ name: icon.collection, icons: [icon] });
    } else {
      collection.icons.push(icon);
    }
  });

  return categories;
};

export const getStartingMode = (
  editorMode: keyof typeof EditorModeEnum
): Mode => {
  switch (editorMode) {
    case 'EDITABLE':
      return { type: 'CURSOR', showCursor: true, mousedownItem: null };
    case 'EXPLORABLE_READONLY':
      return { type: 'PAN', showCursor: false };
    case 'NON_INTERACTIVE':
      return { type: 'INTERACTIONS_DISABLED', showCursor: false };
    default:
      throw new Error('Invalid editor mode.');
  }
};

export function getItemByIdOrThrow<T extends { id: string }>(
  values: T[],
  id: string
): { value: T; index: number } {
  const index = values.findIndex((val) => {
    return val.id === id;
  });

  if (index === -1) {
    throw new Error(`Item with id "${id}" not found.`);
  }

  return { value: values[index], index };
}

