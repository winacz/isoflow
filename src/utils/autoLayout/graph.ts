import { Coords, ViewItem } from 'src/types';
import { getShape2dPorts, getShape2dSize, Shape2dPort } from 'src/config';
import { isSwitchLikeIcon } from '../shape2dLayout';
import { isCabinetItem, findCabinetAtTile } from '../cabinet';
import {
  Footprint,
  LayoutConnector,
  LayoutEdge,
  LayoutGraph,
  ModelItemRef
} from './types';

const footprintOf = (
  item: ViewItem,
  iconById: Map<string, string | undefined>
): Footprint => {
  const size = getShape2dSize(iconById.get(item.id) ?? '') ?? {
    width: 1,
    height: 1
  };
  return {
    id: item.id,
    tile: { ...item.tile },
    width: Math.max(1, Math.ceil(size.width)),
    height: Math.max(1, Math.ceil(size.height))
  };
};

const findPort = (
  icon: string | undefined,
  portId: string | undefined
): Shape2dPort | undefined => {
  if (!portId) return undefined;
  return getShape2dPorts(icon ?? '').find((candidate) => {
    return candidate.id === portId;
  });
};

/**
 * Build the layout graph for a selection (or the whole view).
 *
 * Unlike `analyzeGraph` in shape2dLayout.ts, every edge carries the *port* it
 * lands on at each end. Without that the placer cannot order leaves to match
 * port order, which is the single biggest source of avoidable crossings on a
 * 48-port switch.
 */
export const buildLayoutGraph = ({
  scopeItems,
  allItems,
  modelItems,
  connectors
}: {
  /** Items in scope — the ones the engine may move. */
  scopeItems: ViewItem[];
  allItems: ViewItem[];
  modelItems: ModelItemRef[];
  connectors: LayoutConnector[];
}): LayoutGraph => {
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

  const footprints = new Map<string, Footprint>();
  allItems.forEach((item) => {
    footprints.set(item.id, footprintOf(item, iconById));
  });

  // Cabinets are containers, and anything mounted inside one is physically
  // fixed to its rack unit — neither may be relocated by the placer.
  const movableIds = scopeItems
    .filter((item) => {
      const model = modelById.get(item.id);
      if (model && isCabinetItem(model)) return false;

      const mountedIn = findCabinetAtTile({
        tile: item.tile,
        viewItems: allItems,
        modelItems
      });
      return !mountedIn;
    })
    .map((item) => {
      return item.id;
    });

  const movableSet = new Set(movableIds);
  const scopeSet = new Set(
    scopeItems.map((item) => {
      return item.id;
    })
  );

  const edges: LayoutEdge[] = [];
  const adjacency = new Map<string, Set<string>>();
  const degree = new Map<string, number>();

  scopeItems.forEach((item) => {
    adjacency.set(item.id, new Set());
    degree.set(item.id, 0);
  });

  connectors.forEach((connector) => {
    const ends = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item);
    });
    if (ends.length < 2) return;

    const first = ends[0];
    const last = ends[ends.length - 1];
    const aId = first.ref.item;
    const bId = last.ref.item;
    if (!aId || !bId || aId === bId) return;

    // A cable is in scope when at least one end is.
    if (!scopeSet.has(aId) && !scopeSet.has(bId)) return;

    const aPortDef = findPort(iconById.get(aId), first.ref.port);
    const bPortDef = findPort(iconById.get(bId), last.ref.port);

    // VLAN comes from the switch side: a PC has no VLAN of its own, it simply
    // inherits whatever the jack it is patched into is configured for.
    const portVlan = (itemId: string, portId?: string) => {
      if (!portId) return undefined;
      return modelById.get(itemId)?.ports?.[portId]?.vlan?.trim() || undefined;
    };
    const vlan = portVlan(aId, first.ref.port) ?? portVlan(bId, last.ref.port);

    edges.push({
      connectorId: connector.id,
      aId,
      bId,
      aPort: first.ref.port,
      bPort: last.ref.port,
      vlan,
      aPortOffset: aPortDef ? { ...aPortDef.tile } : undefined,
      bPortOffset: bPortDef ? { ...bPortDef.tile } : undefined,
      aPortSide: aPortDef?.side,
      bPortSide: bPortDef?.side
    });

    if (adjacency.has(aId)) {
      adjacency.get(aId)?.add(bId);
      degree.set(aId, (degree.get(aId) ?? 0) + 1);
    }
    if (adjacency.has(bId)) {
      adjacency.get(bId)?.add(aId);
      degree.set(bId, (degree.get(bId) ?? 0) + 1);
    }
  });

  const hubs = new Set<string>();
  scopeItems.forEach((item) => {
    if (isSwitchLikeIcon(iconById.get(item.id))) {
      hubs.add(item.id);
    }
  });

  // Fallback: no switch in scope → highest-degree node acts as the root.
  if (hubs.size === 0 && scopeItems.length > 0) {
    let best = scopeItems[0].id;
    scopeItems.forEach((item) => {
      if ((degree.get(item.id) ?? 0) > (degree.get(best) ?? 0)) {
        best = item.id;
      }
    });
    hubs.add(best);
  }

  // Connected components over the WHOLE graph, immovable nodes included.
  //
  // Traversing only movable nodes would cut every component apart: in a real
  // plan the switches are rack-mounted and therefore immovable, so each host
  // hangs off a node the walk refuses to cross and ends up alone in its own
  // component. Layering then has nothing to layer, and the placer degenerates
  // into shelf-packing one device per component in a single wide row.
  //
  // The immovable nodes stay in the component so they can anchor layer 0 and
  // order their leaves; they are filtered out before any position is assigned.
  const components: string[][] = [];
  const seen = new Set<string>();

  movableIds.forEach((startId) => {
    if (seen.has(startId)) return;

    const component: string[] = [];
    const stack = [startId];
    seen.add(startId);

    while (stack.length > 0) {
      const current = stack.pop() as string;
      component.push(current);

      const neighbours = adjacency.get(current);
      neighbours?.forEach((neighbour) => {
        if (seen.has(neighbour)) return;
        seen.add(neighbour);
        stack.push(neighbour);
      });
    }

    // Keep only components that actually contain something we may move.
    if (
      component.some((id) => {
        return movableSet.has(id);
      })
    ) {
      components.push(component);
    }
  });

  return {
    movableIds,
    items: allItems,
    modelItems,
    edges,
    adjacency,
    degree,
    hubs,
    footprints,
    components
  };
};

/** World-space tile of a port (top-left of item + port offset). */
export const portWorldTile = (
  itemTile: Coords,
  portOffset: Coords | undefined,
  footprint: Footprint | undefined
): Coords => {
  if (portOffset) {
    return { x: itemTile.x + portOffset.x, y: itemTile.y + portOffset.y };
  }
  const width = footprint?.width ?? 1;
  const height = footprint?.height ?? 1;
  return {
    x: itemTile.x + Math.floor(width / 2),
    y: itemTile.y + Math.floor(height / 2)
  };
};
