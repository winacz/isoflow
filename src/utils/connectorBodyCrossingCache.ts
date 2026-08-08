import { Coords } from 'src/types';
import { splitConnectorPathByNodeBodies } from './renderer';

type StyleRun = ReturnType<typeof splitConnectorPathByNodeBodies>[number];
type FadeRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type CacheKeyParts = {
  connectorId: string;
  tiles: Coords[];
  /** Compact fingerprint of foreign node positions + icons that affect crossing. */
  foreignFingerprint: string;
  endpointItemIds: string[];
  endpointPorts: { itemId: string; portId: string }[];
  fadeCabinetRect: FadeRect | null | undefined;
};

const cache = new Map<string, StyleRun[]>();
const MAX_CACHE = 256;

const tilesKey = (tiles: Coords[]) => {
  return tiles.map((t) => `${t.x},${t.y}`).join(';');
};

const buildKey = (parts: CacheKeyParts) => {
  const fade = parts.fadeCabinetRect
    ? `${parts.fadeCabinetRect.minX},${parts.fadeCabinetRect.minY}:${parts.fadeCabinetRect.maxX},${parts.fadeCabinetRect.maxY}`
    : '';
  return [
    parts.connectorId,
    tilesKey(parts.tiles),
    parts.foreignFingerprint,
    parts.endpointItemIds.join(','),
    parts.endpointPorts.map((p) => `${p.itemId}:${p.portId}`).join(','),
    fade
  ].join('|');
};

/**
 * Fingerprint of plan items that can affect body-crossing for a cable.
 * Excludes endpoint items (they don't count as "foreign" bodies for the key).
 */
export const buildForeignNodesFingerprint = (
  items: { id: string; tile: Coords }[],
  modelItems: { id: string; icon?: string }[],
  endpointItemIds: Set<string> | string[]
) => {
  const endpoints =
    endpointItemIds instanceof Set
      ? endpointItemIds
      : new Set(endpointItemIds);
  const iconById = new Map(
    modelItems.map((item) => [item.id, item.icon ?? ''] as const)
  );

  return items
    .filter((item) => !endpoints.has(item.id))
    .map((item) => {
      return `${item.id}@${item.tile.x},${item.tile.y}:${iconById.get(item.id) ?? ''}`;
    })
    .sort()
    .join('/');
};

/**
 * Memoize expensive body-crossing splits when path + foreign node layout
 * are unchanged (common after unrelated selection/hover updates).
 */
export const getCachedConnectorBodyStyleRuns = (
  parts: CacheKeyParts,
  computeArgs: Parameters<typeof splitConnectorPathByNodeBodies>[0]
): StyleRun[] => {
  const key = buildKey(parts);
  const hit = cache.get(key);
  if (hit) return hit;

  const runs = splitConnectorPathByNodeBodies(computeArgs);
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, runs);
  return runs;
};

export const clearConnectorBodyCrossingCache = () => {
  cache.clear();
};
