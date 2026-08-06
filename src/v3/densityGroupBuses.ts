import type { Coords, ModelItem, ViewItem } from 'src/types';
import { getShape2dPorts, getShape2dSize } from 'src/config';
import { isSwitchLikeIcon } from 'src/utils/shape2dLayout';
import { computeDensityGroups, type DensityGroup } from './densityGroups';

export type DensityGroupBusResult = {
  routes: Record<string, Coords[]>;
  /** Node slot swaps applied before routing (uncross leaf↔port). */
  targets: Record<string, Coords>;
  groupCount: number;
  cableCount: number;
  swappedNodes: number;
};

type LayoutConnector = {
  id: string;
  anchors: {
    id: string;
    ref: { item?: string; tile?: Coords; port?: string };
  }[];
};

type PortSide = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';

type BusCable = {
  connectorId: string;
  leafFirst: boolean;
  leafId: string;
  leafPortWorld: Coords;
  leafPortSide: PortSide;
  switchId: string;
  switchPortWorld: Coords;
  switchPortSide: PortSide;
};

/** Side of the group the trunk sits on — facing the switch. */
export type TrunkSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * Clear runway past the switch chassis before the bus turns parallel to the
 * face — keeps horizontals off the device name / header band.
 */
export const SWITCH_PORT_RUNWAY_TILES = 3;

/** Ports can sit on fractional tiles (e.g. PC y − 2.15); bus lanes must be grid-aligned. */
const snapTile = (tile: Coords): Coords => {
  return { x: Math.round(tile.x), y: Math.round(tile.y) };
};

/**
 * Point just outside the switch body along the port's outward normal, with
 * extra runway so the turn clears the faceplate label.
 */
export const switchPortApproach = ({
  switchTile,
  switchSize,
  portWorld,
  portSide,
  laneIndex = 0,
  runway = SWITCH_PORT_RUNWAY_TILES
}: {
  switchTile: Coords;
  switchSize: { width: number; height: number };
  portWorld: Coords;
  portSide: PortSide;
  laneIndex?: number;
  runway?: number;
}): Coords => {
  const top = switchTile.y;
  const bottom = switchTile.y + switchSize.height - 1;
  const left = switchTile.x;
  const right = switchTile.x + switchSize.width - 1;
  const nest = Math.max(0, laneIndex);

  switch (portSide) {
    case 'TOP':
      return snapTile({
        x: portWorld.x,
        y: top - runway - nest
      });
    case 'BOTTOM':
      return snapTile({
        x: portWorld.x,
        y: bottom + runway + nest
      });
    case 'LEFT':
      return snapTile({
        x: left - runway - nest,
        y: portWorld.y
      });
    case 'RIGHT':
    default:
      return snapTile({
        x: right + runway + nest,
        y: portWorld.y
      });
  }
};

const cleanTiles = (tiles: Coords[]): Coords[] => {
  const snapped = tiles.map(snapTile);
  return snapped.filter((tile, index) => {
    if (index === 0) return true;
    const prev = snapped[index - 1];
    return prev.x !== tile.x || prev.y !== tile.y;
  });
};

const portStub = (port: Coords, side: PortSide): Coords => {
  const p = snapTile(port);
  switch (side) {
    case 'TOP':
      return { x: p.x, y: p.y - 1 };
    case 'LEFT':
      return { x: p.x - 1, y: p.y };
    case 'RIGHT':
      return { x: p.x + 1, y: p.y };
    case 'BOTTOM':
    default:
      return { x: p.x, y: p.y + 1 };
  }
};

const itemCenter = (
  item: ViewItem,
  iconById: Map<string, string | undefined>
): Coords => {
  const size = getShape2dSize(iconById.get(item.id) ?? '') ?? {
    width: 1,
    height: 1
  };
  return {
    x: item.tile.x + size.width / 2,
    y: item.tile.y + size.height / 2
  };
};

/**
 * Prefer a side trunk when the target is diagonal — dropping through the
 * cluster (bottom trunk) forces upper-row cables across lower-row exits.
 */
export const pickTrunkSideToward = ({
  groupCenter,
  targetCenter
}: {
  groupCenter: Coords;
  targetCenter: Coords;
}): TrunkSide => {
  const dx = targetCenter.x - groupCenter.x;
  const dy = targetCenter.y - groupCenter.y;
  // Soft bias to the side: side wins unless the target is clearly more
  // vertical (≈2×) than horizontal.
  if (Math.abs(dx) * 2 >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
};

/** Slot sort so leaf placement matches horizontal-bus lanes (no exit crosses). */
export const compareSlotsTowardExit = (
  a: Coords,
  b: Coords,
  trunkSide: TrunkSide
): number => {
  if (trunkSide === 'right') {
    // Top row first (bus under top stubs); within a row, exit-near (right) first
    // so the lead cable turns onto the upper lane without crossing neighbours.
    if (a.y !== b.y) return a.y - b.y;
    return b.x - a.x;
  }
  if (trunkSide === 'left') {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  }
  if (trunkSide === 'bottom') {
    // Nearest the bottom trunk first, left→right.
    if (a.y !== b.y) return b.y - a.y;
    return a.x - b.x;
  }
  // top trunk
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
};

const collectCables = ({
  connectors,
  memberSet,
  itemById,
  iconById
}: {
  connectors: LayoutConnector[];
  memberSet: Set<string>;
  itemById: Map<string, ViewItem>;
  iconById: Map<string, string | undefined>;
}): BusCable[] => {
  const cables: BusCable[] = [];

  connectors.forEach((connector) => {
    const endpointAnchors = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (endpointAnchors.length < 2) return;

    const first = endpointAnchors[0];
    const last = endpointAnchors[endpointAnchors.length - 1];
    if (!first.ref.item || !last.ref.item) return;

    const firstIsSwitch = isSwitchLikeIcon(iconById.get(first.ref.item));
    const lastIsSwitch = isSwitchLikeIcon(iconById.get(last.ref.item));

    let switchAnchor = first;
    let leafAnchor = last;
    let leafFirst = false;

    if (firstIsSwitch !== lastIsSwitch) {
      switchAnchor = firstIsSwitch ? first : last;
      leafAnchor = firstIsSwitch ? last : first;
      leafFirst = !firstIsSwitch;
    } else {
      const aIn = memberSet.has(first.ref.item);
      const bIn = memberSet.has(last.ref.item);
      if (aIn === bIn) {
        if (!aIn) return;
        switchAnchor = last;
        leafAnchor = first;
        leafFirst = true;
      } else if (aIn) {
        leafAnchor = first;
        switchAnchor = last;
        leafFirst = true;
      } else {
        leafAnchor = last;
        switchAnchor = first;
        leafFirst = false;
      }
    }

    const leafId = leafAnchor.ref.item!;
    const switchId = switchAnchor.ref.item!;
    if (!memberSet.has(leafId)) return;

    const leafItem = itemById.get(leafId);
    const switchItem = itemById.get(switchId);
    if (!leafItem || !switchItem) return;

    const leafPort = getShape2dPorts(iconById.get(leafId) ?? '').find((p) => {
      return p.id === leafAnchor.ref.port;
    });
    const switchPort = getShape2dPorts(iconById.get(switchId) ?? '').find(
      (p) => {
        return p.id === switchAnchor.ref.port;
      }
    );
    if (!leafPort || !switchPort) return;

    cables.push({
      connectorId: connector.id,
      leafFirst,
      leafId,
      leafPortWorld: snapTile({
        x: leafItem.tile.x + leafPort.tile.x,
        y: leafItem.tile.y + leafPort.tile.y
      }),
      leafPortSide: leafPort.side,
      switchId,
      switchPortWorld: snapTile({
        x: switchItem.tile.x + switchPort.tile.x,
        y: switchItem.tile.y + switchPort.tile.y
      }),
      switchPortSide: switchPort.side
    });
  });

  return cables;
};

type LeafPortLink = {
  leafId: string;
  sizeKey: string;
  portKey: number;
};

/**
 * Swap same-footprint leaves so port order maps onto slots nearer the exit
 * first (e.g. bottom row before top when the bus leaves down/right).
 */
export const untangleGroupTowardExit = ({
  groupItems,
  allItems,
  modelItems,
  connectors,
  trunkSide
}: {
  groupItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: ModelItem[];
  connectors: LayoutConnector[];
  trunkSide: TrunkSide;
}): Record<string, Coords> => {
  if (groupItems.length < 2) return {};

  const memberSet = new Set(
    groupItems.map((item) => {
      return item.id;
    })
  );
  const iconById = new Map(
    modelItems.map((item) => {
      return [item.id, item.icon] as const;
    })
  );
  const itemById = new Map(
    allItems.map((item) => {
      return [item.id, item] as const;
    })
  );

  const sizeOf = (id: string) => {
    return (
      getShape2dSize(iconById.get(id) ?? '') ?? { width: 1, height: 1 }
    );
  };

  const tiles = new Map<string, Coords>();
  groupItems.forEach((item) => {
    tiles.set(item.id, { ...item.tile });
  });

  const links: LeafPortLink[] = [];
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
    if (links.some((link) => link.leafId === leafId)) return;

    const switchItem = itemById.get(switchId);
    if (!switchItem) return;
    const port = getShape2dPorts(iconById.get(switchId) ?? '').find((p) => {
      return p.id === switchAnchor.ref.port;
    });
    if (!port) return;

    const size = sizeOf(leafId);
    // Primary key: along the switch face (usually X for bottom ports).
    const portKey =
      port.side === 'LEFT' || port.side === 'RIGHT'
        ? switchItem.tile.y + port.tile.y
        : switchItem.tile.x + port.tile.x;

    links.push({
      leafId,
      sizeKey: `${size.width}x${size.height}`,
      portKey
    });
  });

  const bySize = new Map<string, LeafPortLink[]>();
  links.forEach((link) => {
    const list = bySize.get(link.sizeKey) ?? [];
    list.push(link);
    bySize.set(link.sizeKey, list);
  });

  bySize.forEach((group) => {
    if (group.length < 2) return;

    const slots = group
      .map((link) => {
        return { ...tiles.get(link.leafId)! };
      })
      .sort((a, b) => {
        return compareSlotsTowardExit(a, b, trunkSide);
      });

    const orderedLeaves = [...group].sort((a, b) => {
      if (a.portKey !== b.portKey) return a.portKey - b.portKey;
      return a.leafId.localeCompare(b.leafId);
    });

    orderedLeaves.forEach((link, index) => {
      tiles.set(link.leafId, { ...slots[index] });
    });
  });

  const targets: Record<string, Coords> = {};
  groupItems.forEach((item) => {
    const next = tiles.get(item.id)!;
    if (next.x !== item.tile.x || next.y !== item.tile.y) {
      targets[item.id] = next;
    }
  });
  return targets;
};

const dominantSwitchForGroup = ({
  cables,
  itemById,
  iconById,
  group
}: {
  cables: BusCable[];
  itemById: Map<string, ViewItem>;
  iconById: Map<string, string | undefined>;
  group: DensityGroup;
}): { switchId: string; trunkSide: TrunkSide } | null => {
  if (cables.length === 0) return null;

  const counts = new Map<string, number>();
  cables.forEach((cable) => {
    counts.set(cable.switchId, (counts.get(cable.switchId) ?? 0) + 1);
  });
  let bestId = cables[0].switchId;
  let bestCount = 0;
  counts.forEach((count, id) => {
    if (count > bestCount) {
      bestCount = count;
      bestId = id;
    }
  });

  const switchItem = itemById.get(bestId);
  if (!switchItem) return null;

  const groupCenter = {
    x: group.bounds.x + group.bounds.w / 2,
    y: group.bounds.y + group.bounds.h / 2
  };
  const trunkSide = pickTrunkSideToward({
    groupCenter,
    targetCenter: itemCenter(switchItem, iconById)
  });
  return { switchId: bestId, trunkSide };
};

/**
 * Bundle exits the group on parallel horizontal lanes (one cable per Y — no
 * co-linear overlap). Upper stubs set the top of the band; lower leaves climb
 * beside their node into their lane, then drop at the port column.
 */
const routeBundleToSwitch = ({
  cables,
  group,
  switchItem,
  iconById,
  itemById,
  trunkSide
}: {
  cables: BusCable[];
  group: DensityGroup;
  switchItem: ViewItem;
  iconById: Map<string, string | undefined>;
  itemById: Map<string, ViewItem>;
  trunkSide: TrunkSide;
}): Record<string, Coords[]> => {
  if (cables.length === 0) return {};

  const groupCenter = {
    x: group.bounds.x + group.bounds.w / 2,
    y: group.bounds.y + group.bounds.h / 2
  };
  const targetCenter = itemCenter(switchItem, iconById);
  const bbox = group.bounds;
  const routes: Record<string, Coords[]> = {};

  if (trunkSide === 'right' || trunkSide === 'left') {
    const trunkRight = trunkSide === 'right';
    const towardY = Math.sign(targetCenter.y - groupCenter.y);
    const nestDir = towardY !== 0 ? towardY : 1;

    const stubs = cables.map((cable) => {
      return {
        cable,
        stub: portStub(cable.leafPortWorld, cable.leafPortSide)
      };
    });
    const busY = Math.min(
      ...stubs.map(({ stub }) => {
        return stub.y;
      })
    );

    // Unique lane per cable, ordered by switch port X so drops do not cross.
    const ordered = [...stubs].sort((a, b) => {
      if (a.cable.switchPortWorld.x !== b.cable.switchPortWorld.x) {
        return a.cable.switchPortWorld.x - b.cable.switchPortWorld.x;
      }
      const ya = itemById.get(a.cable.leafId)?.tile.y ?? 0;
      const yb = itemById.get(b.cable.leafId)?.tile.y ?? 0;
      if (ya !== yb) return ya - yb;
      const xa = itemById.get(a.cable.leafId)?.tile.x ?? 0;
      const xb = itemById.get(b.cable.leafId)?.tile.x ?? 0;
      return trunkRight ? xb - xa : xa - xb;
    });

    // Climb columns also unique — offset past the leaf so verticals do not stack.
    const usedClimbXs = new Set<number>();

    ordered.forEach(({ cable, stub }, laneIndex) => {
      const runY = busY + nestDir * laneIndex;
      const switchSize = getShape2dSize(iconById.get(switchItem.id) ?? '') ?? {
        width: 1,
        height: 1
      };
      const approach = switchPortApproach({
        switchTile: switchItem.tile,
        switchSize,
        portWorld: cable.switchPortWorld,
        portSide: cable.switchPortSide,
        laneIndex: 0
      });

      const tiles: Coords[] = [stub];

      if (stub.y !== runY) {
        if (stub.y > runY) {
          const leaf = itemById.get(cable.leafId);
          const leafSize = getShape2dSize(iconById.get(cable.leafId) ?? '') ?? {
            width: 1,
            height: 1
          };
          let climbX = leaf
            ? trunkRight
              ? leaf.tile.x + leafSize.width
              : leaf.tile.x - 1
            : stub.x;
          // Nudge until this climb column is free (no stacked verticals).
          while (usedClimbXs.has(climbX)) {
            climbX += trunkRight ? 1 : -1;
          }
          usedClimbXs.add(climbX);
          tiles.push({ x: climbX, y: stub.y });
          tiles.push({ x: climbX, y: runY });
        } else {
          tiles.push({ x: stub.x, y: runY });
        }
      }

      tiles.push({ x: approach.x, y: runY });
      tiles.push({ x: approach.x, y: approach.y });

      routes[cable.connectorId] = cleanTiles(
        cable.leafFirst ? tiles : [...tiles].reverse()
      );
    });
  } else {
    const trunkBelow = trunkSide === 'bottom';
    const trunkBaseY = trunkBelow ? bbox.y + bbox.h + 1 : bbox.y - 2;
    const towardX = Math.sign(targetCenter.x - groupCenter.x);

    const ordered = [...cables].sort((a, b) => {
      const xa = itemById.get(a.leafId)?.tile.x ?? 0;
      const xb = itemById.get(b.leafId)?.tile.x ?? 0;
      if (xa !== xb) {
        if (towardX > 0) return xb - xa; // switch right → right column first
        if (towardX < 0) return xa - xb;
        return xa - xb;
      }
      const ya = itemById.get(a.leafId)?.tile.y ?? 0;
      const yb = itemById.get(b.leafId)?.tile.y ?? 0;
      return trunkBelow ? yb - ya : ya - yb;
    });

    ordered.forEach((cable, laneIndex) => {
      const laneY = trunkBelow
        ? trunkBaseY + laneIndex
        : trunkBaseY - laneIndex;
      const stub = portStub(cable.leafPortWorld, cable.leafPortSide);
      const nestDir =
        towardX !== 0
          ? towardX
          : cable.leafPortSide === 'LEFT'
            ? -1
            : 1;
      const runX = stub.x + nestDir * laneIndex;
      const switchSize = getShape2dSize(iconById.get(switchItem.id) ?? '') ?? {
        width: 1,
        height: 1
      };
      const approach = switchPortApproach({
        switchTile: switchItem.tile,
        switchSize,
        portWorld: cable.switchPortWorld,
        portSide: cable.switchPortSide,
        laneIndex
      });

      // Side detour first when the leaf is far from the trunk edge, so upper
      // rows reach a bottom trunk via the side instead of dropping through
      // lower neighbours.
      const needsSideDetour =
        trunkBelow &&
        stub.y < bbox.y + bbox.h - 1 &&
        Math.abs(stub.x - (towardX >= 0 ? bbox.x + bbox.w : bbox.x)) >
          bbox.w / 3;
      const sideX =
        towardX >= 0
          ? bbox.x + bbox.w + 1 + laneIndex
          : bbox.x - 2 - laneIndex;

      const tiles: Coords[] = needsSideDetour
        ? [
            stub,
            { x: sideX, y: stub.y },
            { x: sideX, y: approach.y },
            { x: approach.x, y: approach.y }
          ]
        : [
            stub,
            { x: runX, y: stub.y },
            { x: runX, y: approach.y },
            { x: approach.x, y: approach.y }
          ];

      // If the shared trunk lane is farther out than the port approach
      // (e.g. bottom trunk below a TOP-port approach), keep the lane detour.
      if (
        (trunkBelow && laneY > approach.y) ||
        (!trunkBelow && laneY < approach.y)
      ) {
        const withLane: Coords[] = needsSideDetour
          ? [
              stub,
              { x: sideX, y: stub.y },
              { x: sideX, y: laneY },
              { x: approach.x, y: laneY },
              { x: approach.x, y: approach.y }
            ]
          : [
              stub,
              { x: runX, y: stub.y },
              { x: runX, y: laneY },
              { x: approach.x, y: laneY },
              { x: approach.x, y: approach.y }
            ];
        routes[cable.connectorId] = cleanTiles(
          cable.leafFirst ? withLane : [...withLane].reverse()
        );
        return;
      }

      routes[cable.connectorId] = cleanTiles(
        cable.leafFirst ? tiles : [...tiles].reverse()
      );
    });
  }

  return routes;
};

/**
 * For each density group: swap leaves so earlier switch ports sit on
 * top / exit-near slots (matches horizontal-bus lanes), then route.
 */
export const routeDensityGroupBuses = ({
  items,
  modelItems,
  connectors
}: {
  items: ViewItem[];
  modelItems: ModelItem[];
  connectors: LayoutConnector[];
}): DensityGroupBusResult => {
  const groups = computeDensityGroups({ items, modelItems });
  const targets: Record<string, Coords> = {};

  const itemById0 = new Map(
    items.map((item) => {
      return [item.id, item] as const;
    })
  );
  const iconById = new Map(
    modelItems.map((item) => {
      return [item.id, item.icon] as const;
    })
  );

  // --- Phase 1: exit-aware untangle (e.g. swap upper/lower rows).
  groups.forEach((group) => {
    if (group.memberIds.length < 2) return;
    const memberSet = new Set(group.memberIds);
    const selectedItems = items.filter((item) => {
      return memberSet.has(item.id);
    });

    const previewCables = collectCables({
      connectors,
      memberSet,
      itemById: itemById0,
      iconById
    });
    const dominant = dominantSwitchForGroup({
      cables: previewCables,
      itemById: itemById0,
      iconById,
      group
    });
    if (!dominant) return;

    const swaps = untangleGroupTowardExit({
      groupItems: selectedItems,
      allItems: items,
      modelItems,
      connectors,
      trunkSide: dominant.trunkSide
    });
    Object.assign(targets, swaps);
  });

  const placedItems = items.map((item) => {
    const tile = targets[item.id];
    return tile ? { ...item, tile } : item;
  });

  // --- Phase 2: route buses on the untangled placement.
  const routes: Record<string, Coords[]> = {};
  const itemById = new Map(
    placedItems.map((item) => {
      return [item.id, item] as const;
    })
  );

  groups.forEach((group) => {
    if (group.memberIds.length === 0) return;
    const memberSet = new Set(group.memberIds);

    const groupConnectors = connectors.filter((connector) => {
      return connector.anchors.some((anchor) => {
        return Boolean(anchor.ref.item && memberSet.has(anchor.ref.item));
      });
    });
    if (groupConnectors.length === 0) return;

    const cables = collectCables({
      connectors: groupConnectors,
      memberSet,
      itemById,
      iconById
    });
    if (cables.length === 0) return;

    const bySwitch = new Map<string, BusCable[]>();
    cables.forEach((cable) => {
      const list = bySwitch.get(cable.switchId) ?? [];
      list.push(cable);
      bySwitch.set(cable.switchId, list);
    });

    bySwitch.forEach((switchCables, switchId) => {
      const switchItem = itemById.get(switchId);
      if (!switchItem) return;
      const groupCenter = {
        x: group.bounds.x + group.bounds.w / 2,
        y: group.bounds.y + group.bounds.h / 2
      };
      const trunkSide = pickTrunkSideToward({
        groupCenter,
        targetCenter: itemCenter(switchItem, iconById)
      });
      Object.assign(
        routes,
        routeBundleToSwitch({
          cables: switchCables,
          group,
          switchItem,
          iconById,
          itemById,
          trunkSide
        })
      );
    });
  });

  return {
    routes,
    targets,
    groupCount: groups.length,
    cableCount: Object.keys(routes).length,
    swappedNodes: Object.keys(targets).length
  };
};
