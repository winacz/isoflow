import { Coords, ViewItem } from 'src/types';
import { getShape2dPorts, Shape2dPortSide } from 'src/config';
import { cleanRouteTiles, edgeKey, pathBendWaypoints } from '../routeGeometry';
import { isBlankingItem, isCabinetItem } from '../cabinet';
import { MinHeap } from './minHeap';
import { portWorldTile } from './graph';
import { LayoutEdge, LayoutGraph, RouteResult, RouteStyle } from './types';

/**
 * Cost knobs, in units where one straight step costs 10.
 *
 * `crossing` and `sharedEdge` are deliberately huge: they must outweigh any
 * plausible detour, otherwise the router "buys" a crossing whenever going
 * around would cost more than a few dozen tiles — which, on a rack-sized plan,
 * is nearly always. Readability is the goal here, not the shortest cable.
 */
const COST = {
  step: 10,
  diagonalStep: 14,
  bendOrthogonal: 26,
  // Not much cheaper than the orthogonal bend on purpose: with 8 directions a
  // near-free bend spawns swarms of equal-cost staircases, and the search
  // spent tens of seconds per plan exploring them.
  bendDiagonal: 20,
  /** Running along a tile another cable already uses. */
  sharedTile: 50,
  /** Running along the SAME grid edge — cables drawn on top of each other. */
  sharedEdge: 1000,
  /** Cutting transversally across another cable. */
  crossing: 500,
  /** Squeezing along a device wall. */
  nearNode: 6,
  /**
   * Running *under* a device body, when the field allows it. Priced as a path
   * of last resort: ~40 straight steps, so A* only buys it when going around
   * would cost more than that — a walled-in port, or a fully enclosed pocket.
   */
  underNode: 400
} as const;

/**
 * Wall-clock budgets. These are explicit "optimise my plan" actions behind a
 * busy indicator, so quality wins over latency — but the worst case still has
 * to be bounded, or a big plan locks the tab for minutes.
 */
const INITIAL_ROUTE_BUDGET_MS = 15000;

/** Rip-up is pure polish on an already-legal result, so it gets far less. */
const RIPUP_BUDGET_MS = 4000;

const DIRS_4 = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

const DIRS_8 = [
  ...DIRS_4,
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 }
];

const key = (x: number, y: number) => {
  return `${x},${y}`;
};

const sideNormal = (side: Shape2dPortSide | undefined): Coords | null => {
  switch (side) {
    case 'TOP':
      return { x: 0, y: -1 };
    case 'BOTTOM':
      return { x: 0, y: 1 };
    case 'LEFT':
      return { x: -1, y: 0 };
    case 'RIGHT':
      return { x: 1, y: 0 };
    default:
      return null;
  }
};

/**
 * Shared occupancy state across all cables in one run.
 *
 * `tiles`/`edges` make cables avoid stacking; `diagonals` records which cell
 * corner-to-corner diagonals are taken so the diagonal "X" crossing — which
 * shares neither a tile nor an edge — is still detected.
 */
class RoutingField {
  blocked = new Set<string>();

  nearNode = new Set<string>();

  /** Device body cells that are walkable but heavily penalised. */
  underNode = new Set<string>();

  tiles = new Map<string, number>();

  edges = new Map<string, number>();

  /** cellKey -> set of diagonal orientations ('/' or '\') in use. */
  diagonals = new Map<string, Set<string>>();

  addPath(path: Coords[], delta: number) {
    path.forEach((tile) => {
      const k = key(tile.x, tile.y);
      const next = (this.tiles.get(k) ?? 0) + delta;
      if (next <= 0) this.tiles.delete(k);
      else this.tiles.set(k, next);
    });

    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1];
      const b = path[i];
      const ek = edgeKey(a, b);
      const next = (this.edges.get(ek) ?? 0) + delta;
      if (next <= 0) this.edges.delete(ek);
      else this.edges.set(ek, next);

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx !== 0 && dy !== 0) {
        const cell = key(Math.min(a.x, b.x), Math.min(a.y, b.y));
        const orientation = dx === dy ? '\\' : '/';
        const set = this.diagonals.get(cell) ?? new Set<string>();
        if (delta > 0) set.add(orientation);
        else set.delete(orientation);
        if (set.size === 0) this.diagonals.delete(cell);
        else this.diagonals.set(cell, set);
      }
    }
  }

  /** Extra cost for stepping a→b, beyond raw distance. */
  stepPenalty(a: Coords, b: Coords): number {
    let penalty = 0;

    const tileUse = this.tiles.get(key(b.x, b.y)) ?? 0;
    if (tileUse > 0) penalty += COST.sharedTile * tileUse;

    if ((this.edges.get(edgeKey(a, b)) ?? 0) > 0) {
      penalty += COST.sharedEdge;
    }

    if (this.nearNode.has(key(b.x, b.y))) penalty += COST.nearNode;
    if (this.underNode.has(key(b.x, b.y))) penalty += COST.underNode;

    const dx = b.x - a.x;
    const dy = b.y - a.y;

    if (dx !== 0 && dy !== 0) {
      // Diagonal step: the opposite diagonal over the same cell is an X cross.
      const cell = key(Math.min(a.x, b.x), Math.min(a.y, b.y));
      const orientation = dx === dy ? '\\' : '/';
      const opposite = orientation === '\\' ? '/' : '\\';
      if (this.diagonals.get(cell)?.has(opposite)) {
        penalty += COST.crossing;
      }
      // Also crosses the two axis edges spanning the cell.
      const corners = [
        { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
        { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
        { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
        { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }
      ];
      if (
        (this.edges.get(edgeKey(corners[0], corners[1])) ?? 0) > 0 ||
        (this.edges.get(edgeKey(corners[2], corners[3])) ?? 0) > 0 ||
        (this.edges.get(edgeKey(corners[0], corners[2])) ?? 0) > 0 ||
        (this.edges.get(edgeKey(corners[1], corners[3])) ?? 0) > 0
      ) {
        penalty += COST.crossing;
      }
    } else if (dx !== 0) {
      // Horizontal step through a tile another cable traverses vertically.
      const here = { x: b.x, y: b.y };
      const above = { x: b.x, y: b.y - 1 };
      const below = { x: b.x, y: b.y + 1 };
      const spanning =
        (this.edges.get(edgeKey(above, here)) ?? 0) > 0 &&
        (this.edges.get(edgeKey(here, below)) ?? 0) > 0;
      if (spanning) penalty += COST.crossing;
      // Also catch a cable that merely turns on this tile: crossing its corner
      // still reads as an intersection on screen.
      else if (
        (this.edges.get(edgeKey(above, here)) ?? 0) > 0 ||
        (this.edges.get(edgeKey(here, below)) ?? 0) > 0
      ) {
        penalty += COST.crossing / 2;
      }
    } else if (dy !== 0) {
      const here = { x: b.x, y: b.y };
      const left = { x: b.x - 1, y: b.y };
      const right = { x: b.x + 1, y: b.y };
      const spanning =
        (this.edges.get(edgeKey(left, here)) ?? 0) > 0 &&
        (this.edges.get(edgeKey(here, right)) ?? 0) > 0;
      if (spanning) penalty += COST.crossing;
      else if (
        (this.edges.get(edgeKey(left, here)) ?? 0) > 0 ||
        (this.edges.get(edgeKey(here, right)) ?? 0) > 0
      ) {
        penalty += COST.crossing / 2;
      }
    }

    return penalty;
  }
}

const buildField = ({
  items,
  modelItems,
  footprints,
  walkableNodes = false
}: {
  items: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  footprints: LayoutGraph['footprints'];
  /**
   * Let cables pass *under* device bodies at a steep cost instead of treating
   * them as walls. Opt-in (2D v3) — the classic plan keeps hard obstacles.
   */
  walkableNodes?: boolean;
}): RoutingField => {
  const field = new RoutingField();
  const iconById = new Map(
    modelItems.map((item) => {
      return [item.id, item.icon] as const;
    })
  );
  const modelById = new Map(
    modelItems.map((item) => {
      return [item.id, item] as const;
    })
  );

  const portTiles = new Set<string>();

  items.forEach((item) => {
    const footprint = footprints.get(item.id);
    if (!footprint) return;

    // Cabinets are containers drawn *around* their mounted devices, and
    // blanking plates are cosmetic rack filler — neither is equipment a cable
    // must avoid. Blocking them walls in every rack-mounted switch (the same
    // reason isShape2dPlacementFree defaults to ignoreCabinets).
    const model = modelById.get(item.id);
    if (model && (isCabinetItem(model) || isBlankingItem(model))) return;

    const fw = Math.max(1, Math.ceil(footprint.width));
    const fh = Math.max(1, Math.ceil(footprint.height));
    for (let x = 0; x < fw; x += 1) {
      for (let y = 0; y < fh; y += 1) {
        const k = key(item.tile.x + x, item.tile.y + y);
        if (walkableNodes) field.underNode.add(k);
        else field.blocked.add(k);
      }
    }
  });

  // Second pass, once every obstacle is known: carve an exit channel from each
  // port out through the chassis face and onward until it reaches genuinely
  // free space. A jack sits *inside* its footprint (a switch's TOP row is at
  // y=4 of a 9-tall body), and in a packed rack the tile just beyond the face
  // often belongs to the neighbour above — stopping at the face would leave
  // the port a dead end and A* would have nowhere to go.
  items.forEach((item) => {
    const footprint = footprints.get(item.id);
    if (!footprint) return;

    getShape2dPorts(iconById.get(item.id) ?? '').forEach((port) => {
      const px = Math.round(item.tile.x + port.tile.x);
      const py = Math.round(item.tile.y + port.tile.y);
      portTiles.add(key(px, py));

      const normal = sideNormal(port.side);
      if (!normal) return;

      const fw = Math.max(1, Math.ceil(footprint.width));
      const fh = Math.max(1, Math.ceil(footprint.height));
      const left = item.tile.x;
      const top = item.tile.y;
      const right = item.tile.x + fw - 1;
      const bottom = item.tile.y + fh - 1;

      let cx = px;
      let cy = py;
      // Enough to clear this body plus a stacked neighbour.
      const maxSteps = fw + fh + 12;

      for (let step = 0; step < maxSteps; step += 1) {
        cx += normal.x;
        cy += normal.y;
        portTiles.add(key(cx, cy));

        const outside = cx < left || cx > right || cy < top || cy > bottom;
        // Keep going while still inside this chassis, or while the tile beyond
        // is occupied by something else — stop at the first free tile.
        if (outside && !field.blocked.has(key(cx, cy))) break;
      }
    });
  });

  portTiles.forEach((k) => {
    field.blocked.delete(k);
    field.underNode.delete(k);
  });

  // A one-tile halo around devices is walkable but discouraged, so cables
  // prefer open corridors over hugging chassis walls.
  items.forEach((item) => {
    const footprint = footprints.get(item.id);
    if (!footprint) return;
    const model = modelById.get(item.id);
    if (model && (isCabinetItem(model) || isBlankingItem(model))) return;

    const fw = Math.max(1, Math.ceil(footprint.width));
    const fh = Math.max(1, Math.ceil(footprint.height));
    for (let x = -1; x <= fw; x += 1) {
      for (let y = -1; y <= fh; y += 1) {
        const k = key(item.tile.x + x, item.tile.y + y);
        if (!field.blocked.has(k) && !field.underNode.has(k)) {
          field.nearNode.add(k);
        }
      }
    }
  });

  return field;
};

type AStarArgs = {
  from: Coords;
  to: Coords;
  field: RoutingField;
  style: RouteStyle;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  exitDir: Coords | null;
  entryDir: Coords | null;
  maxExpansions: number;
  /**
   * Last-resort mode: obey obstacles and bends but ignore all cable-vs-cable
   * penalties. The heuristic then tracks true cost closely, so the search is
   * fast and effectively always succeeds. A merely-ugly legal route beats the
   * straight-line fallback, which ignores obstacles AND slices through every
   * cable in its way.
   */
  ignorePenalties?: boolean;
};

/**
 * A* over the routing field. State is (tile, incoming direction) so a bend
 * penalty can be applied — that is what produces clean L/U runs instead of
 * staircases.
 */
const routeAStar = ({
  from,
  to,
  field,
  style,
  bounds,
  exitDir,
  entryDir,
  maxExpansions,
  ignorePenalties = false
}: AStarArgs): Coords[] | null => {
  const dirs = style === 'DIAGONAL' ? DIRS_8 : DIRS_4;
  const bendCost =
    style === 'DIAGONAL' ? COST.bendDiagonal : COST.bendOrthogonal;

  const dirIndex = new Map<string, number>();
  dirs.forEach((dir, index) => {
    dirIndex.set(key(dir.x, dir.y), index);
  });

  const stateKey = (x: number, y: number, d: number) => {
    return `${x},${y},${d}`;
  };

  // Weighted A*: the plain distance heuristic badly underestimates true cost
  // once crossing/overlap penalties apply, which blows the frontier up. The
  // weight keeps the search focused; the rip-up passes recover the little
  // optimality this trades away.
  //
  // DIAGONAL needs a heavier weight: 8 directions with a cheap bend penalty
  // create swarms of equal-cost paths, and an unweighted search spent tens of
  // seconds per plan exploring them.
  const penalisedWeight = style === 'DIAGONAL' ? 2.4 : 1.8;
  const weight = ignorePenalties ? 1.1 : penalisedWeight;
  const heuristic = (x: number, y: number) => {
    const dx = Math.abs(x - to.x);
    const dy = Math.abs(y - to.y);
    const distance = style === 'DIAGONAL' ? Math.max(dx, dy) : dx + dy;
    return COST.step * distance * weight;
  };

  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const statePos = new Map<string, { x: number; y: number; d: number }>();
  const open = new MinHeap<{ x: number; y: number; d: number }>();

  const startStates: { x: number; y: number; d: number }[] = [];
  if (exitDir) {
    const index = dirIndex.get(key(exitDir.x, exitDir.y));
    startStates.push({ x: from.x, y: from.y, d: index ?? -1 });
  } else {
    startStates.push({ x: from.x, y: from.y, d: -1 });
  }

  startStates.forEach((state) => {
    const sk = stateKey(state.x, state.y, state.d);
    gScore.set(sk, 0);
    statePos.set(sk, state);
    open.push(heuristic(state.x, state.y), state);
  });

  let goalState: string | null = null;
  let expansions = 0;

  while (open.size > 0 && expansions < maxExpansions) {
    const current = open.pop();
    if (!current) break;
    expansions += 1;

    const currentKey = stateKey(current.x, current.y, current.d);
    const currentG = gScore.get(currentKey);
    // Stale heap entry (superseded by a cheaper route to the same state).
    // eslint-disable-next-line no-continue
    if (currentG === undefined) continue;

    if (current.x === to.x && current.y === to.y) {
      // Honour a required approach direction when one is given.
      if (!entryDir || current.d === -1) {
        goalState = currentKey;
        break;
      }
      const wanted = dirIndex.get(key(entryDir.x, entryDir.y));
      if (wanted === undefined || current.d === wanted) {
        goalState = currentKey;
        break;
      }
    }

    dirs.forEach((dir, i) => {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;

      if (nx < bounds.minX || nx > bounds.maxX) return;
      if (ny < bounds.minY || ny > bounds.maxY) return;

      const isGoal = nx === to.x && ny === to.y;
      if (!isGoal && field.blocked.has(key(nx, ny))) return;

      const isDiagonal = dir.x !== 0 && dir.y !== 0;

      // No corner-cutting between two blocked cells on a diagonal.
      if (
        isDiagonal &&
        field.blocked.has(key(current.x + dir.x, current.y)) &&
        field.blocked.has(key(current.x, current.y + dir.y))
      ) {
        return;
      }

      const a = { x: current.x, y: current.y };
      const b = { x: nx, y: ny };

      let cost = isDiagonal ? COST.diagonalStep : COST.step;
      if (!ignorePenalties) cost += field.stepPenalty(a, b);
      if (current.d !== -1 && current.d !== i) cost += bendCost;

      const neighbourKey = stateKey(nx, ny, i);
      const tentative = currentG + cost;
      const existing = gScore.get(neighbourKey);

      if (existing === undefined || tentative < existing) {
        gScore.set(neighbourKey, tentative);
        cameFrom.set(neighbourKey, currentKey);
        const state = { x: nx, y: ny, d: i };
        statePos.set(neighbourKey, state);
        open.push(tentative + heuristic(nx, ny), state);
      }
    });
  }

  if (!goalState) return null;

  const path: Coords[] = [];
  let cursor: string | undefined = goalState;
  while (cursor) {
    const state = statePos.get(cursor);
    if (!state) break;
    path.push({ x: state.x, y: state.y });
    cursor = cameFrom.get(cursor);
  }

  return cleanRouteTiles(path.reverse());
};

type CableTask = {
  edge: LayoutEdge;
  from: Coords;
  to: Coords;
  exitDir: Coords | null;
  entryDir: Coords | null;
  /** True when the connector's FIRST anchor is the `to` end. */
  reversed: boolean;
};

/**
 * Route every in-scope cable on one shared field, then rip up and re-route the
 * worst offenders so early greedy choices stop poisoning later cables.
 */
/**
 * Route ONE cable against a field seeded with the paths already on the plan.
 *
 * `routeCables` reroutes an entire graph, which is the right thing for an
 * explicit "lay out everything" action and the wrong thing for the last cable
 * a user just drew: it would rip up and redraw every other run. This routes
 * only the new pair, treating existing paths as obstacles so the fresh cable
 * settles into a free lane instead of on top of its neighbours.
 */
export const routeOneCable = ({
  items,
  modelItems,
  footprints,
  from,
  to,
  exitDir = null,
  entryDir = null,
  style = 'ORTHOGONAL',
  walkableNodes = false,
  existingPaths = [],
  maxExpansions = 120000
}: {
  items: ViewItem[];
  modelItems: { id: string; icon?: string }[];
  footprints: LayoutGraph['footprints'];
  from: Coords;
  to: Coords;
  exitDir?: Coords | null;
  entryDir?: Coords | null;
  style?: RouteStyle;
  walkableNodes?: boolean;
  /** Tile paths of cables already drawn — avoided, never modified. */
  existingPaths?: Coords[][];
  maxExpansions?: number;
}): { tiles: Coords[]; waypoints: Coords[]; routed: boolean } => {
  const field = buildField({ items, modelItems, footprints, walkableNodes });

  existingPaths.forEach((path) => {
    if (path.length > 1) field.addPath(path, 1);
  });

  let minX = Math.min(from.x, to.x);
  let minY = Math.min(from.y, to.y);
  let maxX = Math.max(from.x, to.x);
  let maxY = Math.max(from.y, to.y);

  items.forEach((item) => {
    const footprint = footprints.get(item.id);
    const width = footprint?.width ?? 1;
    const height = footprint?.height ?? 1;
    minX = Math.min(minX, item.tile.x);
    minY = Math.min(minY, item.tile.y);
    maxX = Math.max(maxX, item.tile.x + width);
    maxY = Math.max(maxY, item.tile.y + height);
  });

  const margin = 14;
  const bounds = {
    minX: Math.floor(minX) - margin,
    minY: Math.floor(minY) - margin,
    maxX: Math.ceil(maxX) + margin,
    maxY: Math.ceil(maxY) + margin
  };

  const attempt = (ignorePenalties: boolean) => {
    return routeAStar({
      from,
      to,
      field,
      style,
      bounds,
      exitDir,
      entryDir,
      maxExpansions,
      ignorePenalties
    });
  };

  // Same escalation routeCables uses: prefer a pretty route, accept an ugly
  // legal one, and only then fall back to a straight line through everything.
  const raw = attempt(false) ?? attempt(true);

  if (!raw) {
    return { tiles: [from, to], waypoints: [], routed: false };
  }

  const tiles = cleanRouteTiles(raw);

  return {
    tiles,
    waypoints: pathBendWaypoints(tiles),
    routed: true
  };
};

export const routeCables = ({
  graph,
  items,
  style,
  walkableNodes = false
}: {
  graph: LayoutGraph;
  /** Items at their FINAL positions. */
  items: ViewItem[];
  style: RouteStyle;
  /** Cables may cross under device bodies at a steep cost (2D v3). */
  walkableNodes?: boolean;
}): RouteResult => {
  const itemById = new Map(
    items.map((item) => {
      return [item.id, item] as const;
    })
  );

  const footprints = new Map(graph.footprints);
  items.forEach((item) => {
    const existing = footprints.get(item.id);
    if (existing) footprints.set(item.id, { ...existing, tile: item.tile });
  });

  const field = buildField({
    items,
    modelItems: graph.modelItems,
    footprints,
    walkableNodes
  });

  const tasks: CableTask[] = [];

  graph.edges.forEach((edge) => {
    const aItem = itemById.get(edge.aId);
    const bItem = itemById.get(edge.bId);
    if (!aItem || !bItem) return;

    const aWorld = portWorldTile(
      aItem.tile,
      edge.aPortOffset,
      footprints.get(edge.aId)
    );
    const bWorld = portWorldTile(
      bItem.tile,
      edge.bPortOffset,
      footprints.get(edge.bId)
    );

    // The cable must arrive along the destination jack's face, i.e. moving
    // opposite to that port's outward normal. Without this the router was free
    // to reach the port sideways: it dropped down a lane past the device, then
    // ran back along the chassis edge before turning in — the visible step
    // just after leaving/entering a node.
    const bNormal = sideNormal(edge.bPortSide);
    const entryDir = bNormal ? { x: -bNormal.x, y: -bNormal.y } : null;

    tasks.push({
      edge,
      from: { x: Math.round(aWorld.x), y: Math.round(aWorld.y) },
      to: { x: Math.round(bWorld.x), y: Math.round(bWorld.y) },
      exitDir: sideNormal(edge.aPortSide),
      entryDir,
      reversed: false
    });
  });

  if (tasks.length === 0) return { routes: {}, paths: [], unrouted: 0 };

  // Search bounds: everything involved, plus room to detour around it.
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  items.forEach((item) => {
    const footprint = footprints.get(item.id);
    const width = footprint?.width ?? 1;
    const height = footprint?.height ?? 1;
    minX = Math.min(minX, item.tile.x);
    minY = Math.min(minY, item.tile.y);
    maxX = Math.max(maxX, item.tile.x + width);
    maxY = Math.max(maxY, item.tile.y + height);
  });

  const margin = 14;
  const bounds = {
    minX: Math.floor(minX) - margin,
    minY: Math.floor(minY) - margin,
    maxX: Math.ceil(maxX) + margin,
    maxY: Math.ceil(maxY) + margin
  };

  const manhattan = (task: CableTask) => {
    return (
      Math.abs(task.from.x - task.to.x) + Math.abs(task.from.y - task.to.y)
    );
  };

  /**
   * Cables sharing a corridor get lanes in the order they are routed, because
   * each one pushes the next further out. Routing a hub's cables in PORT order
   * therefore makes the bundle nest instead of braid: port 1 keeps the inner
   * lane and lands leftmost, port 48 rides the outer lane and lands rightmost.
   *
   * Ordering purely by length (the obvious "hardest first") is what produced
   * the crossings visible in the bundle: cables entered the shared corridor in
   * an order unrelated to the ports they had to reach, so every lane had to
   * cross its neighbours again at the switch.
   */
  const hubKey = (task: CableTask): string => {
    const { edge } = task;
    if (graph.hubs.has(edge.aId)) return edge.aId;
    if (graph.hubs.has(edge.bId)) return edge.bId;
    return '';
  };

  const portRank = (task: CableTask): number => {
    const { edge } = task;
    const offset = graph.hubs.has(edge.aId)
      ? edge.aPortOffset
      : edge.bPortOffset;
    if (!offset) return Number.MAX_SAFE_INTEGER;
    // x dominates: jacks are laid out along the chassis width.
    return offset.x * 1000 + offset.y;
  };

  const ordered = [...tasks].sort((a, b) => {
    const hubA = hubKey(a);
    const hubB = hubKey(b);

    // Hub bundles first (longest bundle wins the open space), then port order
    // within each bundle; hub-less cables fall back to longest-first.
    if (hubA !== hubB) return hubA.localeCompare(hubB);
    if (hubA === '') return manhattan(b) - manhattan(a);

    const rank = portRank(a) - portRank(b);
    return rank !== 0 ? rank : manhattan(b) - manhattan(a);
  });

  const paths = new Map<string, Coords[]>();
  // Cables whose STORED path is a straight-line fallback. Tracked per cable
  // (not per attempt) because rip-up re-routes the same cable repeatedly, and
  // a failed rip-up attempt keeps the good path it already had.
  const unroutedIds = new Set<string>();

  const routeOne = (
    task: CableTask,
    cheapOnly = false
  ): { path: Coords[]; ok: boolean } => {
    // Search a window around this cable's own endpoints rather than the whole
    // diagram. A global bbox on a rack-sized plan is ~27k tiles × 4 incoming
    // directions, which exhausts the expansion budget before A* ever reaches
    // the goal. Widen progressively when a detour needs more room.
    // Attempts 0-2 widen the window with full penalties; the last one drops
    // the cable-vs-cable penalties so a legal route is essentially guaranteed.
    for (let attempt = cheapOnly ? 3 : 0; attempt < 4; attempt += 1) {
      const windowMargin = 20 + attempt * 40;
      const window = {
        minX: Math.max(
          bounds.minX,
          Math.min(task.from.x, task.to.x) - windowMargin
        ),
        minY: Math.max(
          bounds.minY,
          Math.min(task.from.y, task.to.y) - windowMargin
        ),
        maxX: Math.min(
          bounds.maxX,
          Math.max(task.from.x, task.to.x) + windowMargin
        ),
        maxY: Math.min(
          bounds.maxY,
          Math.max(task.from.y, task.to.y) + windowMargin
        )
      };

      const result = routeAStar({
        from: task.from,
        to: task.to,
        field,
        style,
        bounds: window,
        exitDir: task.exitDir,
        entryDir: task.entryDir,
        maxExpansions: 40000 + attempt * 40000,
        ignorePenalties: attempt === 3
      });

      if (result) return { path: result, ok: true };
    }

    // A* only fails when a port is walled in. The straight-line fallback keeps
    // the cable visible, but it ignores obstacles and crossings — so it is
    // counted and reported rather than passing silently.
    return { path: [task.from, task.to], ok: false };
  };

  // Once this passes, remaining cables route with the cheap penalty-free
  // search: still legal and obstacle-aware, just less tidy. Keeps a very large
  // plan responsive instead of locking the UI for minutes.
  const routeDeadline = Date.now() + INITIAL_ROUTE_BUDGET_MS;

  ordered.forEach((task) => {
    const { path, ok } = routeOne(task, Date.now() > routeDeadline);
    paths.set(task.edge.connectorId, path);
    if (!ok) unroutedIds.add(task.edge.connectorId);
    field.addPath(path, 1);
  });

  // Rip-up & reroute: re-plan the most expensive cables now that the field is
  // fully populated. Standard VLSI technique — this is what turns a greedy
  // result into a near-optimal one.
  const taskById = new Map(
    tasks.map((task) => {
      return [task.edge.connectorId, task] as const;
    })
  );

  const pathCost = (path: Coords[]) => {
    let cost = 0;
    for (let i = 1; i < path.length; i += 1) {
      cost += field.stepPenalty(path[i - 1], path[i]);
    }
    return cost;
  };

  // Wall-clock budget for the optional improvement passes. The initial routing
  // above is already complete and legal; rip-up only polishes it, so it must
  // never be allowed to hang the UI on a large plan.
  const deadline = Date.now() + RIPUP_BUDGET_MS;

  for (let pass = 0; pass < 2; pass += 1) {
    if (Date.now() > deadline) break;

    const ranked = [...paths.entries()]
      .map(([id, path]) => {
        // Temporarily remove self so we measure conflict with OTHERS only.
        field.addPath(path, -1);
        const cost = pathCost(path);
        field.addPath(path, 1);
        return { id, cost };
      })
      .filter((entry) => {
        return entry.cost > 0;
      })
      .sort((a, b) => {
        return b.cost - a.cost;
      })
      .slice(0, Math.max(4, Math.ceil(tasks.length * 0.35)));

    if (ranked.length === 0) break;

    let improved = false;
    ranked.forEach(({ id, cost }) => {
      if (Date.now() > deadline) return;

      const task = taskById.get(id);
      const current = paths.get(id);
      if (!task || !current) return;

      field.addPath(current, -1);
      const { path: candidate, ok } = routeOne(task);

      // A straight-line fallback ignores obstacles, so its measured cost can
      // look "better" than a real detour. Never let one win a rip-up.
      const candidateCost = ok ? pathCost(candidate) : Number.POSITIVE_INFINITY;

      if (ok && candidateCost < cost) {
        paths.set(id, candidate);
        unroutedIds.delete(id);
        field.addPath(candidate, 1);
        improved = true;
      } else {
        field.addPath(current, 1);
      }
    });

    if (!improved) break;
  }

  const routes: Record<string, Coords[]> = {};
  const allPaths: Coords[][] = [];

  paths.forEach((path, connectorId) => {
    const task = taskById.get(connectorId);
    if (!task) return;
    allPaths.push(path);
    routes[connectorId] = pathBendWaypoints(path);
  });

  return { routes, paths: allPaths, unrouted: unroutedIds.size };
};
