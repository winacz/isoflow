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
  leafId: string;
  /** Leaf port offset relative to the leaf tile origin. */
  leafPortLocal: Coords;
  /** Switch port offset relative to the switch tile origin. */
  switchPortLocal: Coords;
};

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
  /** Leaf→hub cables used to score seat cable length. */
  cableLinks: GroupTargetLink[];
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

/**
 * How many switch↔switch cables touch this node. Access leaves often have
 * high total degree (many PCs) but only one uplink; core has more switch peers.
 */
const switchPeerDegree = (
  itemId: string,
  connectors: LayoutConnector[],
  iconById: Map<string, string | undefined>
): number => {
  let n = 0;
  connectors.forEach((connector) => {
    const ends = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (ends.length < 2) return;
    const a = ends[0].ref.item!;
    const b = ends[ends.length - 1].ref.item!;
    if (a !== itemId && b !== itemId) return;
    const other = a === itemId ? b : a;
    if (isSwitchLikeIcon(iconById.get(other))) n += 1;
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

/**
 * Capsule along group→hub: straight cables (Prosty) and the bus approach
 * travel here — other group circles must stay clear.
 */
export type SpokeCorridor = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  halfWidth: number;
};

/** Extra tiles between non-overlapping layout circles (peer groups). */
export const GROUP_CIRCLE_GAP = 2;
/** Hub clearance beyond the switch circumradius (chassis only). */
export const HUB_CLEARANCE_PAD = 1;
/** Gap between child packing radius and hub chassis. */
export const HUB_CHILD_GAP = 1;
/** How far out we may push a spoke when the ring is crowded. */
const MAX_RADIUS_PUSH = 200;
/** Orthogonal magistrala lane pitch (tiles per cable). */
export const MAGISTRALA_LANE_PITCH = 1;
/** Extra tiles around the estimated bus band. */
export const MAGISTRALA_BAND_PAD = 1;
/** Fraction of group radius used as spoke half-width (cable fan). */
export const SPOKE_HALF_WIDTH_RADIUS_FACTOR = 0.4;

/** Density-circle radius without the visual pad — used for hub↔child proximity. */
export const barePackingRadius = (
  circleR: number,
  memberCount: number
): number => {
  const pad = densityCirclePadForMemberCount(memberCount);
  return Math.max(1, circleR - pad);
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

/** Distance from point P to segment AB. */
export const pointSegmentDistance = (
  p: Coords,
  a: Coords,
  b: Coords
): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Closest distance between segments AB and CD. */
export const segmentSegmentDistance = (
  a: Coords,
  b: Coords,
  c: Coords,
  d: Coords
): number => {
  // Sample endpoints + clamp projections — enough for layout clearance.
  const candidates = [
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b)
  ];
  return Math.min(...candidates);
};

/**
 * Half-width of the cable fan corridor toward the hub.
 * Wide enough that another group circle cannot sit on Prosty wires.
 */
export const estimateSpokeHalfWidth = (
  groupR: number,
  cableCount: number
): number => {
  const busHalf = estimateMagistralaThickness(cableCount) / 2;
  return (
    Math.max(groupR * SPOKE_HALF_WIDTH_RADIUS_FACTOR, busHalf) +
    MAGISTRALA_BAND_PAD
  );
};

/**
 * Capsule from the group rim (toward hub) to the hub rim — wire path.
 */
export const buildSpokeCorridor = ({
  groupCenter,
  groupR,
  hub,
  hubR,
  halfWidth
}: {
  groupCenter: Coords;
  groupR: number;
  hub: Coords;
  hubR: number;
  halfWidth: number;
}): SpokeCorridor => {
  const dx = hub.x - groupCenter.x;
  const dy = hub.y - groupCenter.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Start at inner rim of the group; end at outer rim of the hub.
  const start = Math.min(groupR, Math.max(0, len - hubR - 0.5));
  const endBack = Math.min(hubR, Math.max(0, len - start - 0.5));
  return {
    ax: groupCenter.x + ux * start,
    ay: groupCenter.y + uy * start,
    bx: hub.x - ux * endBack,
    by: hub.y - uy * endBack,
    halfWidth
  };
};

export const circleHitsSpokeCorridor = (
  circle: LayoutCircle,
  spoke: SpokeCorridor,
  gap = GROUP_CIRCLE_GAP
): boolean => {
  const d = pointSegmentDistance(
    { x: circle.cx, y: circle.cy },
    { x: spoke.ax, y: spoke.ay },
    { x: spoke.bx, y: spoke.by }
  );
  return d < circle.r + spoke.halfWidth + gap;
};

export const spokesOverlap = (
  a: SpokeCorridor,
  b: SpokeCorridor,
  gap = GROUP_CIRCLE_GAP
): boolean => {
  const d = segmentSegmentDistance(
    { x: a.ax, y: a.ay },
    { x: a.bx, y: a.by },
    { x: b.ax, y: b.ay },
    { x: b.bx, y: b.by }
  );
  return d < a.halfWidth + b.halfWidth + gap;
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

/** Angle from `hub` pointing away from `parent` (anti-uplink). */
export const spokeAngleAwayFromParent = (
  hub: Coords,
  parent: Coords
): number => {
  return Math.atan2(hub.y - parent.y, hub.x - parent.x);
};

const normalizeAngle0to2Pi = (angle: number): number => {
  let a = angle % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
};

/**
 * Port-ordered spoke angles centered on `prefer` (anti-uplink or top),
 * spread across a half-turn so children stay off the parent cable.
 */
export const spokeAnglesAroundPrefer = ({
  count,
  prefer
}: {
  count: number;
  prefer: number;
}): number[] => {
  if (count <= 0) return [];
  if (count === 1) return [normalizeAngle0to2Pi(prefer)];
  const spread = Math.PI;
  const angles: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    angles.push(normalizeAngle0to2Pi(prefer - spread / 2 + t * spread));
  }
  return angles;
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
      // the higher *switch-peer* hub (e.g. SW-FLOOR → SW-CORE). Total degree
      // is wrong here — an access leaf with many PCs outranks CORE.
      const aIn = memberSet.has(first.ref.item);
      const bIn = memberSet.has(last.ref.item);
      if (aIn === bIn) return;
      const inside = aIn ? first : last;
      const outside = aIn ? last : first;
      const inPeer = switchPeerDegree(inside.ref.item!, connectors, iconById);
      const outPeer = switchPeerDegree(outside.ref.item!, connectors, iconById);
      if (outPeer < inPeer) return;
      if (outPeer === inPeer) {
        const inDeg = connectorDegree(inside.ref.item!, connectors);
        const outDeg = connectorDegree(outside.ref.item!, connectors);
        if (outDeg <= inDeg) return;
      }
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
    const switchPort = getShape2dPorts(iconById.get(switchId) ?? '').find(
      (p) => {
        return p.id === switchAnchor.ref.port;
      }
    );
    if (!switchPort) return;

    const leafItem = itemById.get(leafId);
    if (!leafItem) return;
    const leafPort = getShape2dPorts(iconById.get(leafId) ?? '').find((p) => {
      return p.id === leafAnchor.ref.port;
    });
    const leafPortLocal = leafPort?.tile ?? { x: 0, y: 0 };

    const portWorld = snapTile({
      x: switchItem.tile.x + switchPort.tile.x,
      y: switchItem.tile.y + switchPort.tile.y
    });
    const portKey =
      switchPort.side === 'LEFT' || switchPort.side === 'RIGHT'
        ? portWorld.y
        : portWorld.x;

    links.push({
      switchId,
      portKey,
      leafId,
      leafPortLocal: { ...leafPortLocal },
      switchPortLocal: { ...switchPort.tile }
    });
  });

  return links;
};

/** Sum of leaf-port → switch-port distances after a rigid group translation. */
export const estimateGroupCableLength = ({
  links,
  dx,
  dy,
  itemById
}: {
  links: GroupTargetLink[];
  dx: number;
  dy: number;
  itemById: Map<string, ViewItem>;
}): number => {
  let sum = 0;
  links.forEach((link) => {
    const leaf = itemById.get(link.leafId);
    const sw = itemById.get(link.switchId);
    if (!leaf || !sw) return;
    const lx = leaf.tile.x + dx + link.leafPortLocal.x;
    const ly = leaf.tile.y + dy + link.leafPortLocal.y;
    const sx = sw.tile.x + link.switchPortLocal.x;
    const sy = sw.tile.y + link.switchPortLocal.y;
    sum += Math.hypot(lx - sx, ly - sy);
  });
  return sum;
};

/**
 * Extra cost when a seat sits on the parent-uplink side of the hub
 * (between leaf switch and CORE) — keeps children on the short/clear side.
 */
export const parentSidePenalty = ({
  hub,
  parentHub,
  seat,
  weight = 12
}: {
  hub: Coords;
  parentHub: Coords | null;
  seat: Coords;
  weight?: number;
}): number => {
  if (!parentHub) return 0;
  const px = parentHub.x - hub.x;
  const py = parentHub.y - hub.y;
  const sx = seat.x - hub.x;
  const sy = seat.y - hub.y;
  const parentLen = Math.hypot(px, py);
  if (parentLen < 1e-6) return 0;
  const align = (px * sx + py * sy) / parentLen;
  // align > 0 → seat is toward the parent (bad for length / crossings).
  return align > 0 ? weight + align * 0.35 : 0;
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
 * obstacles, reserved magistrala bands, and spoke wire capsules.
 */
export const findClearSpokeDistance = ({
  hub,
  angle,
  groupR,
  hubR,
  obstacles,
  corridors = [],
  spokeCorridors = [],
  gap = GROUP_CIRCLE_GAP,
  maxPush = MAX_RADIUS_PUSH
}: {
  hub: Coords;
  angle: number;
  groupR: number;
  hubR: number;
  obstacles: LayoutCircle[];
  corridors?: BusCorridor[];
  spokeCorridors?: SpokeCorridor[];
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
    const hitsSpoke = spokeCorridors.some((spoke) => {
      return circleHitsSpokeCorridor(candidate, spoke, gap);
    });
    if (!hitsCircle && !hitsCorridor && !hitsSpoke) return dist;
    dist += 1;
  }
  return null;
};

/**
 * Place density groups in a hub-and-spoke ring around each dominant switch.
 *
 * - Sort by median switch-port key; angles prefer anti-uplink (or top).
 * - Reserve spoke wire capsules (group→hub) so later groups are not parked on
 *   Prosty / bus cable paths; also keep thin magistrala AABB bands.
 * - Centres sit on spokes; among clear seats pick shortest leaf→port cables
 *   (with anti-uplink / upper-half bias so groups stay off parent trunks).
 * - Members translate rigidly with the group centre.
 * - Runs internal passes until positions stabilize so one click converges
 *   (re-click is a no-op).
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
  const originalTiles = new Map(
    items.map((item) => {
      return [item.id, { ...item.tile }] as const;
    })
  );
  let workingItems = items.map((item) => {
    return { ...item, tile: { ...item.tile } };
  });
  let groupCount = 0;

  for (let pass = 0; pass < MAX_ARRANGE_PASSES; pass += 1) {
    const passResult = arrangeDensityGroupsPass({
      items: workingItems,
      modelItems,
      connectors,
      gridStep
    });
    groupCount = passResult.groupCount;
    if (passResult.movedNodes === 0) break;

    const moved = new Map(Object.entries(passResult.targets));
    workingItems = workingItems.map((item) => {
      const tile = moved.get(item.id);
      return tile ? { ...item, tile: { ...tile } } : item;
    });
  }

  const targets: Record<string, Coords> = {};
  workingItems.forEach((item) => {
    const original = originalTiles.get(item.id);
    if (
      original &&
      (original.x !== item.tile.x || original.y !== item.tile.y)
    ) {
      targets[item.id] = { ...item.tile };
    }
  });

  return {
    targets,
    groupCount,
    movedNodes: Object.keys(targets).length
  };
};

/** How many converge passes one button click may run. */
const MAX_ARRANGE_PASSES = 6;

const arrangeDensityGroupsPass = ({
  items,
  modelItems,
  connectors,
  gridStep = { x: 1, y: 1 }
}: {
  items: ViewItem[];
  modelItems: ModelItem[];
  connectors: LayoutConnector[];
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
      busThickness: estimateMagistralaThickness(cableCount),
      cableLinks: switchLinks
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
  const dependsOn = new Map<string, string>();
  movable.forEach((entry) => {
    entry.memberIds.forEach((id) => {
      if (bySwitch.has(id) && id !== entry.switchId) {
        dependsOn.set(id, entry.switchId);
      }
    });
  });
  const orderedHubIds = (() => {
    const hubIds = [...bySwitch.keys()];
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

  const settledCircles: ObstacleCircle[] = [];
  const settledBoundsList: DensityGroupBounds[] = [];
  const settledCorridors: BusCorridor[] = [];
  const settledSpokes: SpokeCorridor[] = [];

  orderedHubIds.forEach((switchId) => {
    const cluster = bySwitch.get(switchId);
    if (!cluster) return;
    const switchItem = workingById.get(switchId);
    if (!switchItem) return;
    const hub = itemCenter(switchItem, iconById);
    const switchFp = itemFootprint(switchItem, iconById);
    const hubR =
      circumRadius(switchFp.w, switchFp.h) + HUB_CLEARANCE_PAD;

    const parentId = dependsOn.get(switchId);
    const parentItem = parentId ? workingById.get(parentId) : undefined;
    const preferAngle = parentItem
      ? spokeAngleAwayFromParent(hub, itemCenter(parentItem, iconById))
      : (3 * Math.PI) / 2;

    const ordered = [...cluster].sort((a, b) => {
      if (a.medianPortKey !== b.medianPortKey) {
        return a.medianPortKey - b.medianPortKey;
      }
      return a.group.id.localeCompare(b.group.id);
    });

    const preferredAngles = spokeAnglesAroundPrefer({
      count: ordered.length,
      prefer: preferAngle
    });
    const angleById = new Map<string, number>();
    ordered.forEach((entry, index) => {
      angleById.set(entry.group.id, preferredAngles[index] ?? preferAngle);
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

    const placedCircles: ObstacleCircle[] = [];
    const placedBoundsList: DensityGroupBounds[] = [];
    const placedCorridors: BusCorridor[] = [];
    const placedSpokes: SpokeCorridor[] = [];

    const clusterStatic = staticObstacles.filter((obs) => {
      return !(obs.memberIds.length === 1 && obs.memberIds[0] === switchId);
    });

    placeOrder.forEach((entry) => {
      const baseAngle = angleById.get(entry.group.id)!;
      const bareR = barePackingRadius(
        entry.circle.r,
        entry.memberIds.length
      );
      // Peer groups keep full density circles; the hub itself is chassis-only
      // so children can sit close (density rings may overlap the hub ring).
      const peerObstacles: LayoutCircle[] = [
        ...clusterStatic,
        ...settledCircles.filter((circle) => {
          return !circle.memberIds.includes(switchId);
        }),
        ...placedCircles
      ];
      const corridors = [...settledCorridors, ...placedCorridors];
      const spokes = [...settledSpokes, ...placedSpokes];
      const minHubDist = hubR + bareR + HUB_CHILD_GAP;

      // Dense angle samples: assigned spoke + anti-uplink fan + full compass
      // so we can pick the shortest clear seat, not just the first.
      const angleCandidates: number[] = [];
      const seenAngles = new Set<number>();
      const pushAngle = (angle: number) => {
        const n = normalizeAngle0to2Pi(angle);
        const key = Math.round(n * 64);
        if (seenAngles.has(key)) return;
        seenAngles.add(key);
        angleCandidates.push(n);
      };
      pushAngle(baseAngle);
      pushAngle(preferAngle);
      for (let i = 0; i < 16; i += 1) {
        pushAngle((i * Math.PI) / 8);
      }
      for (let k = 1; k <= 10; k += 1) {
        const delta = (k * Math.PI) / 24;
        pushAngle(baseAngle - delta);
        pushAngle(baseAngle + delta);
        pushAngle(preferAngle - delta);
        pushAngle(preferAngle + delta);
      }

      type ScoredSeat = {
        dist: number;
        centre: Coords;
        corridor: BusCorridor;
        spoke: SpokeCorridor;
        dx: number;
        dy: number;
        placedBounds: DensityGroupBounds;
        placedCircle: ObstacleCircle;
        score: number;
        cableLength: number;
      };

      const evaluateSeat = (dx: number, dy: number): ScoredSeat | null => {
        const placedBounds: DensityGroupBounds = {
          x: entry.bounds.x + dx,
          y: entry.bounds.y + dy,
          w: entry.bounds.w,
          h: entry.bounds.h
        };
        const placedCircle: ObstacleCircle = {
          ...layoutCircleFromBounds(placedBounds, entry.memberIds.length),
          memberIds: [...entry.memberIds]
        };
        const barePlacedR = barePackingRadius(
          placedCircle.r,
          entry.memberIds.length
        );
        const hitsHub = circlesOverlap(
          { cx: placedCircle.cx, cy: placedCircle.cy, r: barePlacedR },
          { cx: hub.x, cy: hub.y, r: hubR },
          HUB_CHILD_GAP
        );
        const hitsPeer = peerObstacles.some((obs) => {
          return circlesOverlap(placedCircle, obs);
        });
        const hitsCorridor = corridors.some((band) => {
          return circleHitsCorridor(placedCircle, band);
        });
        const hitsSpoke = spokes.some((spoke) => {
          return circleHitsSpokeCorridor(placedCircle, spoke);
        });
        const hitsBounds = [...settledBoundsList, ...placedBoundsList].some(
          (other, index) => {
            // settledBoundsList is parallel to settledCircles in push order —
            // skip the hub group's own footprint so children can nest close.
            const settledCount = settledBoundsList.length;
            if (index < settledCount) {
              const circle = settledCircles[index];
              if (circle?.memberIds.includes(switchId)) return false;
            }
            return aabbChebyshevGap(placedBounds, other) < 2;
          }
        );
        if (hitsHub || hitsPeer || hitsCorridor || hitsSpoke || hitsBounds) {
          return null;
        }

        const groupCenter = {
          x: placedCircle.cx,
          y: placedCircle.cy
        };
        const corridor = buildBusCorridor({
          groupBounds: placedBounds,
          groupCenter,
          hub,
          hubR,
          thickness: entry.busThickness
        });
        const spoke = buildSpokeCorridor({
          groupCenter,
          groupR: placedCircle.r,
          hub,
          hubR,
          halfWidth: estimateSpokeHalfWidth(placedCircle.r, entry.cableCount)
        });
        const peerCircles = [...settledCircles, ...placedCircles].filter(
          (circle) => {
            return !circle.memberIds.includes(switchId);
          }
        );
        const corridorBlocked =
          peerCircles.some((circle) => {
            return (
              circleHitsCorridor(circle, corridor) ||
              circleHitsSpokeCorridor(circle, spoke)
            );
          }) ||
          corridors.some((band) => {
            return corridorsOverlap(corridor, band);
          });
        if (corridorBlocked) return null;

        const cableLength = estimateGroupCableLength({
          links: entry.cableLinks,
          dx,
          dy,
          itemById: workingById
        });
        const parentHub = parentItem
          ? itemCenter(parentItem, iconById)
          : null;
        const dist = Math.hypot(groupCenter.x - hub.x, groupCenter.y - hub.y);
        // Soft pull-in: among similar cable lengths, prefer seats closer to hub.
        const score =
          cableLength +
          parentSidePenalty({ hub, parentHub, seat: groupCenter }) +
          dist * 0.35;

        return {
          dist,
          centre: groupCenter,
          corridor,
          spoke,
          dx,
          dy,
          placedBounds,
          placedCircle,
          score,
          cableLength
        };
      };

      const candidates: ScoredSeat[] = [];
      const consider = (seat: ScoredSeat | null) => {
        if (seat) candidates.push(seat);
      };

      consider(evaluateSeat(0, 0));

      for (const angle of angleCandidates) {
        let dist = minHubDist;
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

          const seat = evaluateSeat(dx, dy);
          if (seat) {
            consider(seat);
            // First clear on this ray is the shortest for this angle.
            break;
          }
          dist += 1;
        }
      }

      if (candidates.length === 0) return;

      const parentHubCoords = parentItem
        ? itemCenter(parentItem, iconById)
        : null;
      // Root hubs: keep left→top→right bias. Leaf hubs: heavily prefer the
      // anti-uplink half-plane, then shortest leaf→port cables.
      const pool = candidates.filter((seat) => {
        if (parentHubCoords) return true;
        return seat.centre.y <= hub.y + 0.5 || candidates.every((other) => {
          return other.centre.y > hub.y + 0.5;
        });
      });
      const ranked = (pool.length > 0 ? pool : candidates).slice();
      ranked.sort((a, b) => {
        const pa = parentSidePenalty({
          hub,
          parentHub: parentHubCoords,
          seat: a.centre,
          weight: 48
        });
        const pb = parentSidePenalty({
          hub,
          parentHub: parentHubCoords,
          seat: b.centre,
          weight: 48
        });
        const scoreA = a.cableLength + pa;
        const scoreB = b.cableLength + pb;
        if (Math.abs(scoreA - scoreB) > 0.25) return scoreA - scoreB;
        const aStay = a.dx === 0 && a.dy === 0 ? 0 : 1;
        const bStay = b.dx === 0 && b.dy === 0 ? 0 : 1;
        if (aStay !== bStay) return aStay - bStay;
        return a.dist - b.dist;
      });
      const chosen = ranked[0];

      entry.memberIds.forEach((id) => {
        const item = workingById.get(id);
        if (!item) return;
        if (chosen.dx === 0 && chosen.dy === 0) return;
        const next = snapTile2dToGrid(
          {
            x: item.tile.x + chosen.dx,
            y: item.tile.y + chosen.dy
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
      placedSpokes.push(chosen.spoke);
    });

    settledCircles.push(...placedCircles);
    settledBoundsList.push(...placedBoundsList);
    settledCorridors.push(...placedCorridors);
    settledSpokes.push(...placedSpokes);
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

        // Hub group ↔ its leaf children may nest (density rings overlap); only
        // peer groups around the same / different hubs must stay apart.
        const hubChild =
          a.entry.memberIds.includes(b.entry.switchId) ||
          b.entry.memberIds.includes(a.entry.switchId);
        if (hubChild) continue;

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
