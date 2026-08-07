import type { Coords, ModelItem, ViewItem } from 'src/types';
import { getShape2dPorts, getShape2dSize } from 'src/config';
import { isSwitchLikeIcon } from 'src/utils/shape2dLayout';
import {
  computeDensityGroups,
  type DensityGroup,
  type DensityGroupBounds
} from './densityGroups';

/**
 * Hub-and-spoke placement of density groups around their switch targets.
 *
 * Groups are rigid circles (bbox circumcircle + pad). Spokes are straight
 * centre→hub segments ordered by switch-port key so they do not cross.
 * Preferred arc is left → top → right; bottom is avoided.
 */

export type ArrangeDensityGroupsResult = {
  targets: Record<string, Coords>;
  groupCount: number;
  movedNodes: number;
};

type LayoutConnector = {
  id: string;
  anchors: {
    id: string;
    ref: { item?: string; tile?: Coords; port?: string };
  }[];
};

type GroupTargetLink = {
  switchId: string;
  portKey: number;
};

export type LayoutCircle = {
  cx: number;
  cy: number;
  r: number;
};

/** Extra tiles between non-overlapping layout circles. */
export const GROUP_CIRCLE_GAP = 1;
/** Hub clearance beyond the switch circumradius. */
export const HUB_CLEARANCE_PAD = 2;
/** How far out we may push a spoke when the ring is crowded. */
const MAX_RADIUS_PUSH = 200;

type MovableGroup = {
  group: DensityGroup;
  memberIds: string[];
  bounds: DensityGroupBounds;
  /** Layout circle at the group's current position (before move). */
  circle: LayoutCircle;
  switchId: string;
  medianPortKey: number;
};

const snapTile = (tile: Coords): Coords => {
  return { x: Math.round(tile.x), y: Math.round(tile.y) };
};

const itemFootprint = (
  item: ViewItem,
  iconById: Map<string, string | undefined>
): DensityGroupBounds => {
  const size = getShape2dSize(iconById.get(item.id) ?? '') ?? {
    width: 1,
    height: 1
  };
  return {
    x: item.tile.x,
    y: item.tile.y,
    w: size.width,
    h: size.height
  };
};

const itemCenter = (
  item: ViewItem,
  iconById: Map<string, string | undefined>
): Coords => {
  const fp = itemFootprint(item, iconById);
  return { x: fp.x + fp.w / 2, y: fp.y + fp.h / 2 };
};

/** Circumradius of an AABB (half-diagonal). */
export const circumRadius = (w: number, h: number): number => {
  return Math.sqrt((w / 2) ** 2 + (h / 2) ** 2);
};

export const circlesOverlap = (
  a: LayoutCircle,
  b: LayoutCircle,
  gap = GROUP_CIRCLE_GAP
): boolean => {
  const dx = a.cx - b.cx;
  const dy = a.cy - b.cy;
  const minDist = a.r + b.r + gap;
  return dx * dx + dy * dy < minDist * minDist;
};

/**
 * Preferred hub-and-spoke arc: left → top → right (unwrapped π … 2π).
 * Bottom (π/2) is never in this range.
 */
export const spokeAngleForIndex = (
  index: number,
  count: number
): number => {
  if (count <= 0) return Math.PI;
  if (count === 1) return (3 * Math.PI) / 2; // single group: prefer top
  // Evenly spaced on [π, 2π] — left, through top, to right.
  return Math.PI + ((index + 0.5) / count) * Math.PI;
};

export const pointOnSpoke = (
  hub: Coords,
  angle: number,
  dist: number
): Coords => {
  return {
    x: hub.x + dist * Math.cos(angle),
    y: hub.y + dist * Math.sin(angle)
  };
};

/**
 * True when segment AB properly intersects CD (not mere endpoint touch).
 * Used to verify P2P leaf→hub wires after placement.
 */
export const segmentsProperlyIntersect = (
  a: Coords,
  b: Coords,
  c: Coords,
  d: Coords
): boolean => {
  const orient = (p: Coords, q: Coords, r: Coords) => {
    const v = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (Math.abs(v) < 1e-9) return 0;
    return v > 0 ? 1 : 2;
  };
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 === 0 || o2 === 0 || o3 === 0 || o4 === 0) return false;
  return o1 !== o2 && o3 !== o4;
};

export const countP2PCrossings = (
  spokes: Array<{ from: Coords; to: Coords }>
): number => {
  let crossings = 0;
  for (let i = 0; i < spokes.length; i += 1) {
    for (let j = i + 1; j < spokes.length; j += 1) {
      if (
        segmentsProperlyIntersect(
          spokes[i].from,
          spokes[i].to,
          spokes[j].from,
          spokes[j].to
        )
      ) {
        crossings += 1;
      }
    }
  }
  return crossings;
};

const collectGroupTargetLinks = ({
  connectors,
  memberSet,
  itemById,
  iconById
}: {
  connectors: LayoutConnector[];
  memberSet: Set<string>;
  itemById: Map<string, ViewItem>;
  iconById: Map<string, string | undefined>;
}): GroupTargetLink[] => {
  const links: GroupTargetLink[] = [];

  connectors.forEach((connector) => {
    const ends = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (ends.length < 2) return;
    const first = ends[0];
    const last = ends[ends.length - 1];
    if (!first.ref.item || !last.ref.item) return;

    const firstSwitch = isSwitchLikeIcon(iconById.get(first.ref.item));
    const lastSwitch = isSwitchLikeIcon(iconById.get(last.ref.item));
    if (firstSwitch === lastSwitch) return;

    const switchAnchor = firstSwitch ? first : last;
    const leafAnchor = firstSwitch ? last : first;
    const leafId = leafAnchor.ref.item!;
    const switchId = switchAnchor.ref.item!;
    if (!memberSet.has(leafId)) return;
    if (memberSet.has(switchId)) return;

    const switchItem = itemById.get(switchId);
    if (!switchItem) return;
    const port = getShape2dPorts(iconById.get(switchId) ?? '').find((p) => {
      return p.id === switchAnchor.ref.port;
    });
    if (!port) return;

    const portWorld = snapTile({
      x: switchItem.tile.x + port.tile.x,
      y: switchItem.tile.y + port.tile.y
    });
    const portKey =
      port.side === 'LEFT' || port.side === 'RIGHT'
        ? portWorld.y
        : portWorld.x;

    links.push({ switchId, portKey });
  });

  return links;
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => {
    return a - b;
  });
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
};

const dominantSwitchId = (links: GroupTargetLink[]): string | null => {
  if (links.length === 0) return null;
  const counts = new Map<string, number>();
  links.forEach((link) => {
    counts.set(link.switchId, (counts.get(link.switchId) ?? 0) + 1);
  });
  let bestId = links[0].switchId;
  let bestCount = 0;
  counts.forEach((count, id) => {
    if (count > bestCount) {
      bestCount = count;
      bestId = id;
    }
  });
  return bestId;
};

/**
 * Push `dist` outward along the spoke until `candidate` clears all obstacles.
 */
export const findClearSpokeDistance = ({
  hub,
  angle,
  groupR,
  hubR,
  obstacles,
  gap = GROUP_CIRCLE_GAP,
  maxPush = MAX_RADIUS_PUSH
}: {
  hub: Coords;
  angle: number;
  groupR: number;
  hubR: number;
  obstacles: LayoutCircle[];
  gap?: number;
  maxPush?: number;
}): number | null => {
  let dist = hubR + groupR + gap;
  for (let guard = 0; guard <= maxPush; guard += 1) {
    const centre = pointOnSpoke(hub, angle, dist);
    const candidate: LayoutCircle = { cx: centre.x, cy: centre.y, r: groupR };
    const hits = obstacles.some((obs) => {
      return circlesOverlap(candidate, obs, gap);
    });
    if (!hits) return dist;
    dist += 1;
  }
  return null;
};

/**
 * Place density groups in a hub-and-spoke ring around each dominant switch.
 *
 * - Sort by median switch-port key → angular order left→top→right (no bottom).
 * - Centres sit on spokes; distance grows until circles do not overlap.
 * - Members translate rigidly with the group centre.
 */
export const arrangeDensityGroups = ({
  items,
  modelItems,
  connectors
}: {
  items: ViewItem[];
  modelItems: ModelItem[];
  connectors: LayoutConnector[];
}): ArrangeDensityGroupsResult => {
  const groups = computeDensityGroups({ items, modelItems });
  if (groups.length === 0) {
    return { targets: {}, groupCount: 0, movedNodes: 0 };
  }

  const iconById = new Map(
    modelItems.map((item) => {
      return [item.id, item.icon] as const;
    })
  );
  const itemById = new Map(
    items.map((item) => {
      return [item.id, item] as const;
    })
  );

  const movable: MovableGroup[] = [];
  const movableMemberIds = new Set<string>();

  groups.forEach((group) => {
    const members = group.memberIds
      .map((id) => {
        return itemById.get(id);
      })
      .filter((item): item is ViewItem => {
        return Boolean(item);
      });
    if (members.length === 0) return;

    if (
      members.some((item) => {
        return isSwitchLikeIcon(iconById.get(item.id)) || item.locked;
      })
    ) {
      return;
    }

    const memberSet = new Set(group.memberIds);
    const links = collectGroupTargetLinks({
      connectors,
      memberSet,
      itemById,
      iconById
    });
    const switchId = dominantSwitchId(links);
    if (!switchId) return;
    if (!itemById.get(switchId)) return;

    const portKeys = links
      .filter((link) => {
        return link.switchId === switchId;
      })
      .map((link) => {
        return link.portKey;
      });

    movable.push({
      group,
      memberIds: group.memberIds,
      bounds: { ...group.bounds },
      circle: { ...group.circle },
      switchId,
      medianPortKey: median(portKeys)
    });
    group.memberIds.forEach((id) => {
      movableMemberIds.add(id);
    });
  });

  if (movable.length === 0) {
    return { targets: {}, groupCount: 0, movedNodes: 0 };
  }

  const bySwitch = new Map<string, MovableGroup[]>();
  movable.forEach((entry) => {
    const list = bySwitch.get(entry.switchId) ?? [];
    list.push(entry);
    bySwitch.set(entry.switchId, list);
  });

  const workingItems = items.map((item) => {
    return { ...item, tile: { ...item.tile } };
  });
  const workingById = new Map(
    workingItems.map((item) => {
      return [item.id, item] as const;
    })
  );
  const targets: Record<string, Coords> = {};

  // Static obstacle circles: everything not being moved in this pass.
  const staticObstacles: LayoutCircle[] = [];
  groups.forEach((group) => {
    const isMovable = group.memberIds.every((id) => {
      return movableMemberIds.has(id);
    });
    if (isMovable) return;
    // Skip pure-switch groups — they become hubs below.
    const onlySwitches = group.memberIds.every((id) => {
      return isSwitchLikeIcon(iconById.get(id));
    });
    if (onlySwitches) return;
    staticObstacles.push({ ...group.circle });
  });
  // Lone free-standing nodes that did not form a multi-member group still
  // need a footprint circle if they are not movable.
  items.forEach((item) => {
    if (movableMemberIds.has(item.id)) return;
    if (item.parentId) return;
    const inSomeGroup = groups.some((g) => {
      return g.memberIds.includes(item.id);
    });
    if (inSomeGroup) return;
    const fp = itemFootprint(item, iconById);
    staticObstacles.push({
      cx: fp.x + fp.w / 2,
      cy: fp.y + fp.h / 2,
      r: circumRadius(fp.w, fp.h)
    });
  });

  /** Circles already placed by earlier hub clusters. */
  const settledCircles: LayoutCircle[] = [];

  bySwitch.forEach((cluster, switchId) => {
    const switchItem = workingById.get(switchId);
    if (!switchItem) return;
    const hub = itemCenter(switchItem, iconById);
    const switchFp = itemFootprint(switchItem, iconById);
    const hubR =
      circumRadius(switchFp.w, switchFp.h) + HUB_CLEARANCE_PAD;

    const ordered = [...cluster].sort((a, b) => {
      if (a.medianPortKey !== b.medianPortKey) {
        return a.medianPortKey - b.medianPortKey;
      }
      return a.group.id.localeCompare(b.group.id);
    });

    const placedCircles: LayoutCircle[] = [];

    ordered.forEach((entry, index) => {
      const angle = spokeAngleForIndex(index, ordered.length);
      const obstacles = [
        { cx: hub.x, cy: hub.y, r: hubR },
        ...staticObstacles,
        ...settledCircles,
        ...placedCircles
      ];
      const dist = findClearSpokeDistance({
        hub,
        angle,
        groupR: entry.circle.r,
        hubR,
        obstacles
      });
      if (dist === null) return;

      const nextCentre = pointOnSpoke(hub, angle, dist);
      const dx = nextCentre.x - entry.circle.cx;
      const dy = nextCentre.y - entry.circle.cy;

      entry.memberIds.forEach((id) => {
        const item = workingById.get(id);
        if (!item) return;
        const next = {
          x: Math.round(item.tile.x + dx),
          y: Math.round(item.tile.y + dy)
        };
        item.tile = next;
        const original = itemById.get(id);
        if (
          original &&
          (original.tile.x !== next.x || original.tile.y !== next.y)
        ) {
          targets[id] = { ...next };
        }
      });

      placedCircles.push({
        cx: nextCentre.x,
        cy: nextCentre.y,
        r: entry.circle.r
      });
    });

    settledCircles.push(...placedCircles);
  });

  return {
    targets,
    groupCount: movable.length,
    movedNodes: Object.keys(targets).length
  };
};
