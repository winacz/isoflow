import type { Coords, ModelItem, ViewItem } from 'src/types';
import { getShape2dPorts, getShape2dSize } from 'src/config';
import { isSwitchLikeIcon } from 'src/utils/shape2dLayout';
import { snapTile2dToGrid } from 'src/utils/renderer';
import { pickTrunkSideToward } from './densityGroupBuses';
import {
  aabbChebyshevGap,
  computeDensityGroups,
  densityCirclePadForMemberCount,
  type DensityGroup,
  type DensityGroupBounds
} from './densityGroups';

/**
 * Hub-and-spoke placement of density groups around their switch targets.
 *
 * Groups are rigid circles (bbox circumcircle + pad). Spokes are straight
 * centre→hub segments ordered by switch-port key so they do not cross.
 * Preferred arc is left → top → right; bottom is avoided.
 *
 * Before / during placement we estimate how thick each group's magistrala
 * band will be (from cable count) and reserve that corridor toward the hub
 * so later groups are not parked on an earlier bus path.
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

/** How many item↔item connectors touch this node (degree in the cable graph). */
const connectorDegree = (
  itemId: string,
  connectors: LayoutConnector[]
): number => {
  let n = 0;
  connectors.forEach((connector) => {
    const ends = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (ends.length < 2) return;
    if (
      ends[0].ref.item === itemId ||
      ends[ends.length - 1].ref.item === itemId
    ) {
      n += 1;
    }
  });
  return n;
};

export type LayoutCircle = {
  cx: number;
  cy: number;
  r: number;
};

/** Axis-aligned band reserved for a group's magistrala toward the hub. */
export type BusCorridor = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

/** Extra tiles between non-overlapping layout circles. */
export const GROUP_CIRCLE_GAP = 2;
/** Hub clearance beyond the switch circumradius. */
export const HUB_CLEARANCE_PAD = 2;
/** How far out we may push a spoke when the ring is crowded. */
const MAX_RADIUS_PUSH = 200;
/** Orthogonal magistrala lane pitch (tiles per cable). */
export const MAGISTRALA_LANE_PITCH = 1;
/** Extra tiles around the estimated bus band. */
export const MAGISTRALA_BAND_PAD = 1;

type MovableGroup = {
  group: DensityGroup;
  memberIds: string[];
  bounds: DensityGroupBounds;
  /** Layout circle at the group's current position (before move). */
  circle: LayoutCircle;
  switchId: string;
  medianPortKey: number;
  /** Cables from this group to its dominant switch. */
  cableCount: number;
  /** Estimated magistrala band thickness (tiles). */
  busThickness: number;
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

const boundsFromMembers = ({
  memberIds,
  workingById,
  iconById
}: {
  memberIds: string[];
  workingById: Map<string, ViewItem>;
  iconById: Map<string, string | undefined>;
}): DensityGroupBounds | null => {
  const fps = memberIds
    .map((id) => {
      const item = workingById.get(id);
      return item ? itemFootprint(item, iconById) : null;
    })
    .filter((fp): fp is DensityGroupBounds => {
      return Boolean(fp);
    });
  if (fps.length === 0) return null;
  const x = Math.min(...fps.map((fp) => fp.x));
  const y = Math.min(...fps.map((fp) => fp.y));
  const right = Math.max(...fps.map((fp) => fp.x + fp.w));
  const bottom = Math.max(...fps.map((fp) => fp.y + fp.h));
  return { x, y, w: right - x, h: bottom - y };
};

const layoutCircleFromBounds = (
  bounds: DensityGroupBounds,
  memberCount: number
): LayoutCircle => {
  const pad = densityCirclePadForMemberCount(memberCount);
  return {
    cx: bounds.x + bounds.w / 2,
    cy: bounds.y + bounds.h / 2,
    r: circumRadius(bounds.w, bounds.h) + pad
  };
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
 * How tall/wide the magistrala lane stack will be for `cableCount` leaves.
 * Matches orthogonal bus packing (`laneCount * pitch` + pad for stubs).
 */
export const estimateMagistralaThickness = (
  cableCount: number,
  pitch = MAGISTRALA_LANE_PITCH,
  pad = MAGISTRALA_BAND_PAD
): number => {
  const n = Math.max(1, cableCount);
  return n * pitch + pad;
};

/**
 * Reserve the band a magistrala would occupy between the group and the hub.
 *
 * Side trunks → horizontal band just outside the leaf face (below the group
 * when the switch is below, above when above), spanning to the hub — same
 * geometry Magistrala uses for lane stacks. Top/bottom trunks → vertical band.
 */
export const buildBusCorridor = ({
  groupBounds,
  groupCenter,
  hub,
  hubR,
  thickness,
  pad = MAGISTRALA_BAND_PAD
}: {
  groupBounds: DensityGroupBounds;
  groupCenter: Coords;
  hub: Coords;
  hubR: number;
  thickness: number;
  pad?: number;
}): BusCorridor => {
  const trunk = pickTrunkSideToward({
    groupCenter,
    targetCenter: hub
  });
  const switchBelow = hub.y >= groupCenter.y;
  const switchRight = hub.x >= groupCenter.x;

  if (trunk === 'left' || trunk === 'right') {
    let y0: number;
    let y1: number;
    if (switchBelow) {
      y0 = groupBounds.y + groupBounds.h;
      y1 = y0 + thickness;
    } else {
      y1 = groupBounds.y;
      y0 = y1 - thickness;
    }
    const faceX =
      trunk === 'right' ? groupBounds.x + groupBounds.w : groupBounds.x;
    const hubEdgeX = switchRight ? hub.x - hubR : hub.x + hubR;
    return {
      x0: Math.min(faceX, hubEdgeX) - pad,
      x1: Math.max(faceX, hubEdgeX) + pad,
      y0: y0 - pad,
      y1: y1 + pad
    };
  }

  // Vertical trunk: band just outside the facing edge, thickness in X.
  let x0: number;
  let x1: number;
  if (switchRight) {
    x0 = groupBounds.x + groupBounds.w;
    x1 = x0 + thickness;
  } else {
    x1 = groupBounds.x;
    x0 = x1 - thickness;
  }
  const faceY =
    trunk === 'bottom' ? groupBounds.y + groupBounds.h : groupBounds.y;
  const hubEdgeY = switchBelow ? hub.y - hubR : hub.y + hubR;
  return {
    x0: x0 - pad,
    x1: x1 + pad,
    y0: Math.min(faceY, hubEdgeY) - pad,
    y1: Math.max(faceY, hubEdgeY) + pad
  };
};

/** True when the circle overlaps the corridor AABB (with optional gap). */
export const circleHitsCorridor = (
  circle: LayoutCircle,
  corridor: BusCorridor,
  gap = GROUP_CIRCLE_GAP
): boolean => {
  const nearestX = Math.max(corridor.x0, Math.min(circle.cx, corridor.x1));
  const nearestY = Math.max(corridor.y0, Math.min(circle.cy, corridor.y1));
  const dx = circle.cx - nearestX;
  const dy = circle.cy - nearestY;
  const lim = circle.r + gap;
  return dx * dx + dy * dy < lim * lim;
};

/** True when two magistrala corridors overlap (with optional gap). */
export const corridorsOverlap = (
  a: BusCorridor,
  b: BusCorridor,
  gap = GROUP_CIRCLE_GAP
): boolean => {
  return !(
    a.x1 + gap <= b.x0 ||
    b.x1 + gap <= a.x0 ||
    a.y1 + gap <= b.y0 ||
    b.y1 + gap <= a.y0
  );
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
 * Snap a rigid group translation so the bounds origin (and thus all members
 * that were already on-grid) land on `gridStep`.
 */
export const snapGroupTranslation = ({
  bounds,
  rawDx,
  rawDy,
  gridStep = { x: 1, y: 1 }
}: {
  bounds: DensityGroupBounds;
  rawDx: number;
  rawDy: number;
  gridStep?: { x: number; y: number };
}): { dx: number; dy: number } => {
  const desiredOrigin = {
    x: bounds.x + rawDx,
    y: bounds.y + rawDy
  };
  const snapped = snapTile2dToGrid(desiredOrigin, gridStep);
  return {
    dx: snapped.x - bounds.x,
    dy: snapped.y - bounds.y
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

    let switchAnchor = first;
    let leafAnchor = last;

    if (firstSwitch !== lastSwitch) {
      switchAnchor = firstSwitch ? first : last;
      leafAnchor = firstSwitch ? last : first;
    } else if (firstSwitch && lastSwitch) {
      // Switch ↔ switch: inside group is leaf only when the outside switch is
      // the higher-degree hub (e.g. SW-FLOOR → SW-CORE). Same degree → skip
      // so we never treat CORE as a leaf of FLOOR.
      const aIn = memberSet.has(first.ref.item);
      const bIn = memberSet.has(last.ref.item);
      if (aIn === bIn) return;
      const inside = aIn ? first : last;
      const outside = aIn ? last : first;
      const inDeg = connectorDegree(inside.ref.item!, connectors);
      const outDeg = connectorDegree(outside.ref.item!, connectors);
      if (outDeg <= inDeg) return;
      leafAnchor = inside;
      switchAnchor = outside;
    } else {
      return;
    }

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
 * Push `dist` outward along the spoke until `candidate` clears circle
 * obstacles and reserved magistrala corridors.
 */
export const findClearSpokeDistance = ({
  hub,
  angle,
  groupR,
  hubR,
  obstacles,
  corridors = [],
  gap = GROUP_CIRCLE_GAP,
  maxPush = MAX_RADIUS_PUSH
}: {
  hub: Coords;
  angle: number;
  groupR: number;
  hubR: number;
  obstacles: LayoutCircle[];
  corridors?: BusCorridor[];
  gap?: number;
  maxPush?: number;
}): number | null => {
  let dist = hubR + groupR + gap;
  for (let guard = 0; guard <= maxPush; guard += 1) {
    const centre = pointOnSpoke(hub, angle, dist);
    const candidate: LayoutCircle = { cx: centre.x, cy: centre.y, r: groupR };
    const hitsCircle = obstacles.some((obs) => {
      return circlesOverlap(candidate, obs, gap);
    });
    const hitsCorridor = corridors.some((band) => {
      return circleHitsCorridor(candidate, band, gap);
    });
    if (!hitsCircle && !hitsCorridor) return dist;
    dist += 1;
  }
  return null;
};

/**
 * Place density groups in a hub-and-spoke ring around each dominant switch.
 *
 * - Sort by median switch-port key → angular order left→top→right (no bottom).
 * - Estimate magistrala thickness from cable count; reserve corridors to the hub.
 * - Centres sit on spokes; distance grows until circles clear peers and corridors.
 * - Members translate rigidly with the group centre.
 */
export const arrangeDensityGroups = ({
  items,
  modelItems,
  connectors,
  gridStep = { x: 1, y: 1 }
}: {
  items: ViewItem[];
  modelItems: ModelItem[];
  connectors: LayoutConnector[];
  /** Active 2D snap step (same as place/drag — e.g. RACK cell). */
  gridStep?: { x: number; y: number };
}): ArrangeDensityGroupsResult => {
  const groups = computeDensityGroups({
    items,
    modelItems
  });
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

    // Locked nodes stay put (whole group skipped). Leaf switches are movable.
    if (
      members.some((item) => {
        return item.locked;
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
    // Hub itself must sit outside the group.
    if (memberSet.has(switchId)) return;

    const switchLinks = links.filter((link) => {
      return link.switchId === switchId;
    });
    const portKeys = switchLinks.map((link) => {
      return link.portKey;
    });
    const cableCount = switchLinks.length;

    movable.push({
      group,
      memberIds: group.memberIds,
      bounds: { ...group.bounds },
      circle: { ...group.circle },
      switchId,
      medianPortKey: median(portKeys),
      cableCount,
      busThickness: estimateMagistralaThickness(cableCount)
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

  // Place parent hubs before hubs that are themselves movable leaves
  // (e.g. move SW-FLOOR around CORE before seating PCs around SW-FLOOR).
  const orderedHubIds = (() => {
    const hubIds = [...bySwitch.keys()];
    const dependsOn = new Map<string, string>();
    movable.forEach((entry) => {
      entry.memberIds.forEach((id) => {
        if (bySwitch.has(id) && id !== entry.switchId) {
          dependsOn.set(id, entry.switchId);
        }
      });
    });
    const ordered: string[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const parent = dependsOn.get(id);
      if (parent && bySwitch.has(parent)) visit(parent);
      ordered.push(id);
    };
    hubIds.forEach(visit);
    return ordered;
  })();

  const workingItems = items.map((item) => {
    return { ...item, tile: { ...item.tile } };
  });
  const workingById = new Map(
    workingItems.map((item) => {
      return [item.id, item] as const;
    })
  );
  const targets: Record<string, Coords> = {};

  type ObstacleCircle = LayoutCircle & { memberIds: string[] };

  // Every non-movable density group is an obstacle — including switches.
  const staticObstacles: ObstacleCircle[] = [];
  groups.forEach((group) => {
    const isMovable = group.memberIds.every((id) => {
      return movableMemberIds.has(id);
    });
    if (isMovable) return;
    staticObstacles.push({ ...group.circle, memberIds: [...group.memberIds] });
  });
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
      r: circumRadius(fp.w, fp.h),
      memberIds: [item.id]
    });
  });

  const settledCircles: LayoutCircle[] = [];
  const settledBoundsList: DensityGroupBounds[] = [];
  const settledCorridors: BusCorridor[] = [];

  orderedHubIds.forEach((switchId) => {
    const cluster = bySwitch.get(switchId);
    if (!cluster) return;
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

    const angleById = new Map<string, number>();
    ordered.forEach((entry, index) => {
      angleById.set(entry.group.id, spokeAngleForIndex(index, ordered.length));
    });
    const placeOrder = [...ordered].sort((a, b) => {
      if (b.busThickness !== a.busThickness) {
        return b.busThickness - a.busThickness;
      }
      if (a.medianPortKey !== b.medianPortKey) {
        return a.medianPortKey - b.medianPortKey;
      }
      return a.group.id.localeCompare(b.group.id);
    });

    const placedCircles: LayoutCircle[] = [];
    const placedBoundsList: DensityGroupBounds[] = [];
    const placedCorridors: BusCorridor[] = [];

    const clusterStatic = staticObstacles.filter((obs) => {
      return !(obs.memberIds.length === 1 && obs.memberIds[0] === switchId);
    });

    placeOrder.forEach((entry) => {
      const angle = angleById.get(entry.group.id)!;
      const obstacles: LayoutCircle[] = [
        { cx: hub.x, cy: hub.y, r: hubR },
        ...clusterStatic,
        ...settledCircles,
        ...placedCircles
      ];
      const corridors = [...settledCorridors, ...placedCorridors];

      let chosen: {
        dist: number;
        centre: Coords;
        corridor: BusCorridor;
        dx: number;
        dy: number;
        placedBounds: DensityGroupBounds;
        placedCircle: LayoutCircle;
      } | null = null;
      let dist = hubR + entry.circle.r + GROUP_CIRCLE_GAP;
      let lastSnapKey = '';
      for (let guard = 0; guard <= MAX_RADIUS_PUSH; guard += 1) {
        const rawCentre = pointOnSpoke(hub, angle, dist);
        const { dx, dy } = snapGroupTranslation({
          bounds: entry.bounds,
          rawDx: rawCentre.x - entry.circle.cx,
          rawDy: rawCentre.y - entry.circle.cy,
          gridStep
        });
        const snapKey = `${dx},${dy}`;
        if (snapKey === lastSnapKey) {
          dist += 1;
          continue;
        }
        lastSnapKey = snapKey;

        const placedBounds: DensityGroupBounds = {
          x: entry.bounds.x + dx,
          y: entry.bounds.y + dy,
          w: entry.bounds.w,
          h: entry.bounds.h
        };
        const placedCircle = layoutCircleFromBounds(
          placedBounds,
          entry.memberIds.length
        );
        const hitsCircle = obstacles.some((obs) => {
          return circlesOverlap(placedCircle, obs);
        });
        const hitsCorridor = corridors.some((band) => {
          return circleHitsCorridor(placedCircle, band);
        });
        const hitsBounds = [...settledBoundsList, ...placedBoundsList].some(
          (other) => {
            return aabbChebyshevGap(placedBounds, other) < 2;
          }
        );
        if (hitsCircle || hitsCorridor || hitsBounds) {
          dist += 1;
          continue;
        }

        const corridor = buildBusCorridor({
          groupBounds: placedBounds,
          groupCenter: {
            x: placedCircle.cx,
            y: placedCircle.cy
          },
          hub,
          hubR,
          thickness: entry.busThickness
        });
        const corridorBlocked =
          [...settledCircles, ...placedCircles].some((circle) => {
            return circleHitsCorridor(circle, corridor);
          }) ||
          corridors.some((band) => {
            return corridorsOverlap(corridor, band);
          });
        if (corridorBlocked) {
          dist += 1;
          continue;
        }

        chosen = {
          dist,
          centre: { x: placedCircle.cx, y: placedCircle.cy },
          corridor,
          dx,
          dy,
          placedBounds,
          placedCircle
        };
        break;
      }
      if (!chosen) return;

      entry.memberIds.forEach((id) => {
        const item = workingById.get(id);
        if (!item) return;
        const next = snapTile2dToGrid(
          {
            x: item.tile.x + chosen!.dx,
            y: item.tile.y + chosen!.dy
          },
          gridStep
        );
        item.tile = next;
        const original = itemById.get(id);
        if (
          original &&
          (original.tile.x !== next.x || original.tile.y !== next.y)
        ) {
          targets[id] = { ...next };
        }
      });

      placedCircles.push(chosen.placedCircle);
      placedBoundsList.push(chosen.placedBounds);
      placedCorridors.push(chosen.corridor);
    });

    settledCircles.push(...placedCircles);
    settledBoundsList.push(...placedBoundsList);
    settledCorridors.push(...placedCorridors);
  });

  // Final pass on movable member-sets (not recomputed density groups — those
  // may already have merged if seats were too close).
  separateOverlappingGroupCircles({
    movable,
    workingById,
    workingItems,
    iconById,
    itemById,
    targets,
    gridStep
  });

  return {
    targets,
    groupCount: movable.length,
    movedNodes: Object.keys(targets).length
  };
};

/**
 * Push movable density groups apart until their layout circles no longer
 * overlap (and won't merge under the density gap). Writes into `targets`.
 */
const separateOverlappingGroupCircles = ({
  movable,
  workingById,
  workingItems,
  iconById,
  itemById,
  targets,
  gridStep
}: {
  movable: MovableGroup[];
  workingById: Map<string, ViewItem>;
  workingItems: ViewItem[];
  iconById: Map<string, string | undefined>;
  itemById: Map<string, ViewItem>;
  targets: Record<string, Coords>;
  gridStep: { x: number; y: number };
}) => {
  for (let guard = 0; guard < 80; guard += 1) {
    const seats = movable
      .map((entry) => {
        const bounds = boundsFromMembers({
          memberIds: entry.memberIds,
          workingById,
          iconById
        });
        if (!bounds) return null;
        return {
          entry,
          bounds,
          circle: layoutCircleFromBounds(bounds, entry.memberIds.length)
        };
      })
      .filter(
        (
          row
        ): row is {
          entry: MovableGroup;
          bounds: DensityGroupBounds;
          circle: LayoutCircle;
        } => {
          return Boolean(row);
        }
      );

    let fixed = false;
    for (let i = 0; i < seats.length; i += 1) {
      for (let j = i + 1; j < seats.length; j += 1) {
        const a = seats[i];
        const b = seats[j];
        const circleHit = circlesOverlap(a.circle, b.circle, GROUP_CIRCLE_GAP);
        const mergeHit = aabbChebyshevGap(a.bounds, b.bounds) < 2;
        if (!circleHit && !mergeHit) continue;

        const pushSeat = a.circle.cx >= b.circle.cx ? a : b;
        const other = pushSeat === a ? b : a;
        const dx0 = pushSeat.circle.cx - other.circle.cx;
        const dy0 = pushSeat.circle.cy - other.circle.cy;
        const dist = Math.hypot(dx0, dy0);
        const need =
          pushSeat.circle.r + other.circle.r + GROUP_CIRCLE_GAP + 1;
        const ux = dist < 1e-6 ? 1 : dx0 / dist;
        const uy = dist < 1e-6 ? 0 : dy0 / dist;
        const push = Math.max(need - dist, gridStep.x);

        let { dx, dy } = snapGroupTranslation({
          bounds: pushSeat.bounds,
          rawDx: ux * push,
          rawDy: uy * push,
          gridStep
        });
        if (dx === 0 && dy === 0) {
          dx = Math.sign(ux || 1) * gridStep.x;
        }

        pushSeat.entry.memberIds.forEach((id) => {
          const item = workingById.get(id);
          if (!item) return;
          const next = snapTile2dToGrid(
            { x: item.tile.x + dx, y: item.tile.y + dy },
            gridStep
          );
          item.tile = next;
          const idx = workingItems.findIndex((row) => {
            return row.id === id;
          });
          if (idx >= 0) workingItems[idx] = item;
          const original = itemById.get(id);
          if (
            original &&
            (original.tile.x !== next.x || original.tile.y !== next.y)
          ) {
            targets[id] = { ...next };
          }
        });
        fixed = true;
        break;
      }
      if (fixed) break;
    }
    if (!fixed) break;
  }
};
