import type { Shape2dPort } from 'src/config';
import { isMikrotikIcon } from 'src/fixtures/mikrotikIcons';

const STORAGE_KEY = 'isoflow.mikrotikPorts.v1';

export type MikrotikPortLayouts = Record<string, Shape2dPort[]>;

let cache: MikrotikPortLayouts | null = null;
let version = 0;
const listeners = new Set<() => void>();

const notify = () => {
  version += 1;
  listeners.forEach((listener) => {
    listener();
  });
};

const readStorage = (): MikrotikPortLayouts => {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as MikrotikPortLayouts;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeStorage = (layouts: MikrotikPortLayouts) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // ignore quota
  }
};

const getDefaultPorts = (iconId: string): Shape2dPort[] => {
  // Lazy require avoids circular import with fixtures.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MIKROTIK_V2_DEFAULT_PORTS, isMikrotikV2Icon } =
    require('src/fixtures/mikrotikV2Icons') as {
      MIKROTIK_V2_DEFAULT_PORTS: Record<string, Shape2dPort[]>;
      isMikrotikV2Icon: (id: string) => boolean;
    };
  if (!isMikrotikV2Icon(iconId)) return [];
  return MIKROTIK_V2_DEFAULT_PORTS[iconId] ?? [];
};

export const getMikrotikPortLayouts = (): MikrotikPortLayouts => {
  if (!cache) {
    cache = readStorage();
  }
  return cache;
};

export const getMikrotikPorts = (
  iconId: string | undefined | null
): Shape2dPort[] => {
  if (!isMikrotikIcon(iconId) || !iconId) return [];
  const layouts = getMikrotikPortLayouts();
  if (Object.prototype.hasOwnProperty.call(layouts, iconId)) {
    return layouts[iconId] ?? [];
  }
  return getDefaultPorts(iconId);
};

export const setMikrotikPorts = (
  iconId: string,
  ports: Shape2dPort[]
): void => {
  if (!isMikrotikIcon(iconId)) return;
  const next = {
    ...getMikrotikPortLayouts(),
    [iconId]: ports
  };
  cache = next;
  writeStorage(next);
  notify();
};

/** Clears local override — V2 icons fall back to Visio-extracted defaults. */
export const clearMikrotikPorts = (iconId: string): void => {
  const layouts = { ...getMikrotikPortLayouts() };
  delete layouts[iconId];
  cache = layouts;
  writeStorage(layouts);
  notify();
};

/** For useSyncExternalStore — re-render when port layouts change. */
export const subscribeMikrotikPorts = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getMikrotikPortsVersion = (): number => {
  return version;
};
