import { Connector, Coords, ViewItem } from 'src/types';

type LayoutConnector = {
  id: string;
  anchors: {
    ref: { item?: string; port?: string; tile?: Coords };
  }[];
};

const orientation = (p: Coords, q: Coords, r: Coords) => {
  const value = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (value === 0) return 0;
  return value > 0 ? 1 : 2;
};

const onSegment = (p: Coords, q: Coords, r: Coords) => {
  return (
    q.x <= Math.max(p.x, r.x) + 1e-6 &&
    q.x >= Math.min(p.x, r.x) - 1e-6 &&
    q.y <= Math.max(p.y, r.y) + 1e-6 &&
    q.y >= Math.min(p.y, r.y) - 1e-6
  );
};

const segmentsIntersect = (a1: Coords, a2: Coords, b1: Coords, b2: Coords) => {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
};

const centerOf = (item: ViewItem): Coords => {
  return { x: item.tile.x, y: item.tile.y };
};

type StraightLink = {
  aId: string;
  bId: string;
};

const collectLinks = (
  selectedIds: Set<string>,
  connectors: LayoutConnector[]
): StraightLink[] => {
  const links: StraightLink[] = [];
  connectors.forEach((connector) => {
    const ends = connector.anchors.filter((anchor) => Boolean(anchor.ref.item));
    if (ends.length < 2) return;
    const a = ends[0].ref.item!;
    const b = ends[ends.length - 1].ref.item!;
    if (a === b) return;
    // Keep links that touch the selection (internal or to the outside world).
    if (!selectedIds.has(a) && !selectedIds.has(b)) return;
    links.push({ aId: a, bId: b });
  });
  return links;
};

const layoutCost = (
  tiles: Map<string, Coords>,
  links: StraightLink[],
  allCenters: Map<string, Coords>
): number => {
  const point = (id: string): Coords => {
    return tiles.get(id) ?? allCenters.get(id) ?? { x: 0, y: 0 };
  };

  let length = 0;
  const segments: { a: Coords; b: Coords; aId: string; bId: string }[] = [];

  links.forEach((link) => {
    const a = point(link.aId);
    const b = point(link.bId);
    length += Math.hypot(a.x - b.x, a.y - b.y);
    segments.push({ a, b, aId: link.aId, bId: link.bId });
  });

  let crossings = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const s = segments[i];
      const t = segments[j];
      if (
        s.aId === t.aId ||
        s.aId === t.bId ||
        s.bId === t.aId ||
        s.bId === t.bId
      ) {
        continue;
      }
      if (segmentsIntersect(s.a, s.b, t.a, t.b)) {
        crossings += 1;
      }
    }
  }

  return length + crossings * 1000;
};

/**
 * Arrange selected nodes inside their current bounding box by swapping
 * positions (limited simulated annealing). Optimises straight-line wire
 * length + crossing count. Returns new tile positions for selected items.
 */
export const arrangeNodesWithinSelection = ({
  selectedItems,
  allItems,
  connectors,
  iterations = 50
}: {
  selectedItems: ViewItem[];
  allItems: ViewItem[];
  connectors: LayoutConnector[] | Connector[];
  iterations?: number;
}): Record<string, Coords> => {
  if (selectedItems.length < 2) return {};

  const selectedIds = new Set(selectedItems.map((item) => item.id));
  const links = collectLinks(selectedIds, connectors as LayoutConnector[]);

  const allCenters = new Map<string, Coords>();
  allItems.forEach((item) => {
    allCenters.set(item.id, centerOf(item));
  });

  // Bounding box of current selected tiles (nodes must stay inside via swaps).
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  selectedItems.forEach((item) => {
    minX = Math.min(minX, item.tile.x);
    maxX = Math.max(maxX, item.tile.x);
    minY = Math.min(minY, item.tile.y);
    maxY = Math.max(maxY, item.tile.y);
  });

  const tiles = new Map<string, Coords>();
  selectedItems.forEach((item) => {
    tiles.set(item.id, { ...item.tile });
  });

  // Occupied slots inside the bbox (current node positions).
  const slots = selectedItems.map((item) => ({ ...item.tile }));
  const ids = selectedItems.map((item) => item.id);

  let bestCost = layoutCost(tiles, links, allCenters);
  let temperature = 1;

  // Deterministic PRNG so repeats are stable for the same selection order.
  let seed = ids.reduce((acc, id) => acc + id.length * 17, ids.length * 31);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const passes = Math.max(iterations, ids.length * 8);

  for (let step = 0; step < passes; step += 1) {
    const i = Math.floor(rand() * ids.length);
    let j = Math.floor(rand() * ids.length);
    if (i === j) j = (j + 1) % ids.length;

    const idA = ids[i];
    const idB = ids[j];
    const tileA = tiles.get(idA)!;
    const tileB = tiles.get(idB)!;

    // Swap coordinates (stay within the original slot set / bbox).
    tiles.set(idA, tileB);
    tiles.set(idB, tileA);

    // Soft bbox guard — reject if somehow outside (shouldn't happen on pure swaps).
    const a = tiles.get(idA)!;
    const b = tiles.get(idB)!;
    const outside =
      a.x < minX ||
      a.x > maxX ||
      a.y < minY ||
      a.y > maxY ||
      b.x < minX ||
      b.x > maxX ||
      b.y < minY ||
      b.y > maxY;

    if (outside) {
      tiles.set(idA, tileA);
      tiles.set(idB, tileB);
      continue;
    }

    const nextCost = layoutCost(tiles, links, allCenters);
    const accept =
      nextCost < bestCost ||
      rand() < Math.exp((bestCost - nextCost) / Math.max(temperature, 0.05));

    if (accept) {
      bestCost = nextCost;
    } else {
      tiles.set(idA, tileA);
      tiles.set(idB, tileB);
    }

    temperature *= 0.97;
  }

  // Also try assigning by port/slot sort as a final greedy polish:
  // keep best of anneal vs identity.
  void slots;

  const result: Record<string, Coords> = {};
  tiles.forEach((tile, id) => {
    const original = selectedItems.find((item) => item.id === id)?.tile;
    if (!original || original.x !== tile.x || original.y !== tile.y) {
      result[id] = tile;
    }
  });

  // Always return all selected tiles so callers can apply consistently.
  const full: Record<string, Coords> = {};
  tiles.forEach((tile, id) => {
    full[id] = tile;
  });
  return full;
};
