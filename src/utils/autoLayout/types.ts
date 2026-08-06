import { Coords, ViewItem } from 'src/types';
import { Shape2dPortSide } from 'src/config';

/** Cable routing styles offered by the Auto-Układ panel. */
export type RouteStyle = 'ORTHOGONAL' | 'DIAGONAL' | 'BUS' | 'STRAIGHT';

export const ROUTE_STYLES: RouteStyle[] = [
  'ORTHOGONAL',
  'DIAGONAL',
  'BUS',
  'STRAIGHT'
];

export const ROUTE_STYLE_LABELS: Record<RouteStyle, string> = {
  ORTHOGONAL: 'Ortogonalny',
  DIAGONAL: 'Diagonalny',
  BUS: 'Magistrala',
  STRAIGHT: 'Prosty'
};

export type ModelItemRef = {
  id: string;
  icon?: string;
  /** Port config keyed by port id — carries the VLAN each jack is assigned to. */
  ports?: Record<
    string,
    { vlan?: string; allowedVlans?: string[] } | undefined
  >;
  svis?: { vlan?: string }[];
};

/** Minimal connector shape the engine needs (matches view connectors). */
export type LayoutConnector = {
  id: string;
  anchors: {
    id: string;
    ref: { item?: string; tile?: Coords; port?: string };
  }[];
};

export type Footprint = {
  id: string;
  tile: Coords;
  width: number;
  height: number;
};

/** One cable resolved down to concrete endpoints. */
export type LayoutEdge = {
  connectorId: string;
  aId: string;
  bId: string;
  aPort?: string;
  bPort?: string;
  /**
   * VLAN this link belongs to, read from the switch-side port. Endpoints like
   * PCs are not VLAN-aware, so the jack they are patched into is what actually
   * decides which VLAN the device sits in.
   */
  vlan?: string;
  /** Port offset within the owning footprint (tile-local, may be fractional). */
  aPortOffset?: Coords;
  bPortOffset?: Coords;
  aPortSide?: Shape2dPortSide;
  bPortSide?: Shape2dPortSide;
};

export interface LayoutGraph {
  /** Nodes the engine is allowed to move. */
  movableIds: string[];
  /** Every node in the view (movable or not) — obstacles for routing. */
  items: ViewItem[];
  modelItems: ModelItemRef[];
  edges: LayoutEdge[];
  adjacency: Map<string, Set<string>>;
  degree: Map<string, number>;
  /** Switch-like nodes — layout roots. */
  hubs: Set<string>;
  footprints: Map<string, Footprint>;
  /** Connected components over `movableIds`. */
  components: string[][];
}

export interface PlaceResult {
  /** Only nodes that actually moved. */
  targets: Record<string, Coords>;
}

export interface RouteResult {
  /** Mid waypoints per connector, ordered from the connector's FIRST anchor. */
  routes: Record<string, Coords[]>;
  /** Full tile paths, for metric computation. */
  paths: Coords[][];
  /** Cables A* could not route (walled-in port) — fell back to a straight line. */
  unrouted: number;
}

export interface AutoLayoutMetrics {
  crossingsBefore: number;
  crossingsAfter: number;
  overlapsBefore: number;
  overlapsAfter: number;
  cables: number;
  movedNodes: number;
  /** Cables the router could not path legally (walled-in port). */
  unrouted: number;
}

/**
 * How the engine may rearrange devices before routing.
 *
 * - `none`  — positions untouched, cables only.
 * - `swap`  — devices only trade places with each other; the set of occupied
 *             tiles is unchanged, so the drawing keeps its shape.
 * - `full`  — free placement (layering + packing).
 */
export type PlacementMode = 'none' | 'swap' | 'full';

export interface AutoLayoutOptions {
  style: RouteStyle;
  placement: PlacementMode;
  /** Snap step of the active floor grid (RACK → 9×9). */
  gridStep?: Coords;
}

export interface AutoLayoutResult {
  targets: Record<string, Coords>;
  routes: Record<string, Coords[]>;
  metrics: AutoLayoutMetrics;
}
