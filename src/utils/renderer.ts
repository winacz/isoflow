import { produce } from 'immer';
import {
  UNPROJECTED_TILE_SIZE,
  PROJECTED_TILE_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  MIN_ZOOM_2D,
  TEXTBOX_PADDING,
  CONNECTOR_SEARCH_OFFSET,
  DEFAULT_FONT_FAMILY,
  TEXTBOX_DEFAULTS,
  TEXTBOX_FONT_WEIGHT,
  PROJECT_BOUNDING_BOX_PADDING,
  TILE_SIZE_2D,
  RACK_1U_HEIGHT_TILES,
  getShape2dSize,
  getModelItemSize,
  getShape2dPorts,
  SHAPE_2D_CABINET_ID
} from 'src/config';
import {
  Coords,
  TileOrigin,
  Connector,
  Size,
  Scroll,
  Mouse,
  ConnectorAnchor,
  ItemReference,
  Rect,
  ProjectionOrientationEnum,
  BoundingBox,
  TextBox,
  SlimMouseEvent,
  View,
  AnchorPosition,
  ProjectionMode
} from 'src/types';
import {
  CoordsUtils,
  SizeUtils,
  clamp,
  findPath,
  toPx,
  getItemByIdOrThrow
} from 'src/utils';
import { isPlanProjection } from './projection';
import { useScene } from 'src/hooks/useScene';

interface ScreenToIso {
  mouse: Coords;
  zoom: number;
  scroll: Scroll;
  rendererSize: Size;
}

// converts a mouse position to a tile position
export const screenToIso = ({
  mouse,
  zoom,
  scroll,
  rendererSize
}: ScreenToIso) => {
  const projectedTileSize = SizeUtils.multiply(PROJECTED_TILE_SIZE, zoom);
  const halfW = projectedTileSize.width / 2;
  const halfH = projectedTileSize.height / 2;

  const projectPosition = {
    x: -rendererSize.width * 0.5 + mouse.x - scroll.position.x,
    y: -rendererSize.height * 0.5 + mouse.y - scroll.position.y
  };

  const tile = {
    x: Math.floor(
      (projectPosition.x + halfW) / projectedTileSize.width -
        projectPosition.y / projectedTileSize.height
    ),
    y: -Math.floor(
      (projectPosition.y + halfH) / projectedTileSize.height +
        projectPosition.x / projectedTileSize.width
    )
  };

  return tile;
};

export const screenToTile2dContinuous = ({
  mouse,
  zoom,
  scroll,
  rendererSize
}: ScreenToIso) => {
  const tileSize = TILE_SIZE_2D * zoom;

  const projectPosition = {
    x: -rendererSize.width * 0.5 + mouse.x - scroll.position.x,
    y: -rendererSize.height * 0.5 + mouse.y - scroll.position.y
  };

  return {
    x: projectPosition.x / tileSize,
    y: projectPosition.y / tileSize
  };
};

export const screenToTile2d = ({
  mouse,
  zoom,
  scroll,
  rendererSize
}: ScreenToIso) => {
  const continuous = screenToTile2dContinuous({
    mouse,
    zoom,
    scroll,
    rendererSize
  });

  return {
    x: Math.floor(continuous.x),
    y: Math.floor(continuous.y)
  };
};

/** Snap a fractional 2D tile position to the nearest grid cell. */
export const snapTile2dToGrid = (
  tile: Coords,
  step: { x: number; y: number } = { x: 1, y: 1 }
): Coords => {
  const sx = Math.max(1, step.x);
  const sy = Math.max(1, step.y);
  return {
    x: Math.round(tile.x / sx) * sx,
    y: Math.round(tile.y / sy) * sy
  };
};

/** Snap step for the active 2D grid style (RACK = square of switch height). */
export const getGridSnapStep = (
  gridStyle: string | undefined | null
): { x: number; y: number } => {
  if (gridStyle === 'rack') {
    return {
      x: RACK_1U_HEIGHT_TILES,
      y: RACK_1U_HEIGHT_TILES
    };
  }
  return { x: 1, y: 1 };
};

interface GetTilePosition {
  tile: Coords;
  origin?: TileOrigin;
}

export const getTilePosition2d = ({
  tile,
  origin = 'CENTER'
}: GetTilePosition) => {
  const half = TILE_SIZE_2D / 2;

  const position: Coords = {
    x: tile.x * TILE_SIZE_2D + half,
    y: tile.y * TILE_SIZE_2D + half
  };

  switch (origin) {
    case 'TOP':
      return CoordsUtils.add(position, { x: 0, y: -half });
    case 'BOTTOM':
      return CoordsUtils.add(position, { x: 0, y: half });
    case 'LEFT':
      return CoordsUtils.add(position, { x: -half, y: 0 });
    case 'RIGHT':
      return CoordsUtils.add(position, { x: half, y: 0 });
    case 'CENTER':
    default:
      return position;
  }
};

/** Top-left of a multi-tile 2D shape → pixel position of its center. */
export const getShape2dCenterPosition = (tile: Coords, size: Size): Coords => {
  return {
    x: tile.x * TILE_SIZE_2D + (size.width * TILE_SIZE_2D) / 2,
    y: tile.y * TILE_SIZE_2D + (size.height * TILE_SIZE_2D) / 2
  };
};

/** Place shape so its footprint is centered on the cursor tile. */
export const getShape2dPlacementTile = (
  cursorTile: Coords,
  size: Size
): Coords => {
  return {
    x: cursorTile.x - Math.floor(size.width / 2),
    y: cursorTile.y - Math.floor(size.height / 2)
  };
};

export const isTileInShape2dBounds = (
  tile: Coords,
  originTile: Coords,
  size: Size
) => {
  return (
    tile.x >= originTile.x &&
    tile.x < originTile.x + size.width &&
    tile.y >= originTile.y &&
    tile.y < originTile.y + size.height
  );
};

/** True when the tile sits on any 2D device footprint (body or port cell). */
export const isTileOnAnyShape2dBody = ({
  tile,
  items,
  modelItems,
  excludeItemIds,
  modelItemMap
}: {
  tile: Coords;
  items: { id: string; tile: Coords }[];
  modelItems?: { id: string; icon?: string }[];
  excludeItemIds?: Iterable<string>;
  modelItemMap?: Map<string, { id: string; icon?: string }>;
}): boolean => {
  const excluded = excludeItemIds ? new Set(excludeItemIds) : null;
  const map = modelItemMap || new Map(modelItems?.map(i => [i.id, i]) || []);

  return items.some((viewItem) => {
    if (excluded?.has(viewItem.id)) return false;

    const modelItem = map.get(viewItem.id);

    if (!modelItem?.icon) return false;
    // Cabinets are furniture under devices — cables on them stay solid.
    if (modelItem.icon === SHAPE_2D_CABINET_ID) return false;

    const size = getShape2dSize(modelItem.icon);
    if (!size) return false;

    return isTileInShape2dBounds(tile, viewItem.tile, size);
  });
};

type Shape2dRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const getShape2dRects = (
  items: { id: string; tile: Coords }[],
  modelItems?: { id: string; icon?: string }[],
  modelItemMap?: Map<string, { id: string; icon?: string }>
): Shape2dRect[] => {
  const map = modelItemMap || new Map(modelItems?.map(i => [i.id, i]) || []);
  return items.flatMap((viewItem) => {
    const modelItem = map.get(viewItem.id);

    if (!modelItem?.icon) return [];
    if (modelItem.icon === SHAPE_2D_CABINET_ID) return [];

    const size = getShape2dSize(modelItem.icon);
    if (!size) return [];

    return [
      {
        minX: viewItem.tile.x,
        minY: viewItem.tile.y,
        maxX: viewItem.tile.x + size.width,
        maxY: viewItem.tile.y + size.height
      }
    ];
  });
};

const tileCenter = (tile: Coords): Coords => {
  return { x: tile.x + 0.5, y: tile.y + 0.5 };
};

const isPointInRect = (point: Coords, rect: Shape2dRect, epsilon = 1e-6) => {
  return (
    point.x >= rect.minX - epsilon &&
    point.x <= rect.maxX + epsilon &&
    point.y >= rect.minY - epsilon &&
    point.y <= rect.maxY + epsilon
  );
};

/** First intersection of segment a→b with the boundary of `rect` (a inside, b outside). */
const exitPointOnRectEdge = (
  inside: Coords,
  outside: Coords,
  rect: Shape2dRect
): Coords => {
  const dx = outside.x - inside.x;
  const dy = outside.y - inside.y;
  let bestT = Number.POSITIVE_INFINITY;
  let best = { ...outside };
  const eps = 1e-9;

  const consider = (t: number, point: Coords, onFace: boolean) => {
    if (!onFace || t < -eps || t > 1 + eps || t >= bestT) return;
    bestT = t;
    best = point;
  };

  if (Math.abs(dx) > eps) {
    const tLeft = (rect.minX - inside.x) / dx;
    const yLeft = inside.y + tLeft * dy;
    consider(
      tLeft,
      { x: rect.minX, y: yLeft },
      yLeft >= rect.minY - eps && yLeft <= rect.maxY + eps
    );
    const tRight = (rect.maxX - inside.x) / dx;
    const yRight = inside.y + tRight * dy;
    consider(
      tRight,
      { x: rect.maxX, y: yRight },
      yRight >= rect.minY - eps && yRight <= rect.maxY + eps
    );
  }

  if (Math.abs(dy) > eps) {
    const tTop = (rect.minY - inside.y) / dy;
    const xTop = inside.x + tTop * dx;
    consider(
      tTop,
      { x: xTop, y: rect.minY },
      xTop >= rect.minX - eps && xTop <= rect.maxX + eps
    );
    const tBottom = (rect.maxY - inside.y) / dy;
    const xBottom = inside.x + tBottom * dx;
    consider(
      tBottom,
      { x: xBottom, y: rect.maxY },
      xBottom >= rect.minX - eps && xBottom <= rect.maxX + eps
    );
  }

  return best;
};

const findRectContainingTile = (
  tile: Coords,
  rects: Shape2dRect[]
): Shape2dRect | null => {
  const center = tileCenter(tile);
  return (
    rects.find((rect) => {
      return isPointInRect(center, rect);
    }) ?? null
  );
};

export type ConnectorPathStyleRun = {
  /** Continuous tile-space points (tile centers use +.5; edges sit on node AABB). */
  points: Coords[];
  /** Dashed only while crossing a foreign device body (not own endpoints). */
  throughNode: boolean;
};

/** Entry/exit points where segment a→b tunnels through foreign rects (t ∈ (0,1)). */
const segmentTunnelEdges = (
  a: Coords,
  b: Coords,
  rects: Shape2dRect[]
): Coords[] => {
  const hits: { t: number; point: Coords }[] = [];
  const eps = 1e-9;

  rects.forEach((rect) => {
    if (isPointInRect(a, rect) || isPointInRect(b, rect)) return;

    const edgeHits: { t: number; point: Coords }[] = [];
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    const consider = (t: number, x: number, y: number, onFace: boolean) => {
      if (!onFace || t <= eps || t >= 1 - eps) return;
      edgeHits.push({ t, point: { x, y } });
    };

    if (Math.abs(dx) > eps) {
      const tLeft = (rect.minX - a.x) / dx;
      const yLeft = a.y + tLeft * dy;
      consider(
        tLeft,
        rect.minX,
        yLeft,
        yLeft >= rect.minY - eps && yLeft <= rect.maxY + eps
      );
      const tRight = (rect.maxX - a.x) / dx;
      const yRight = a.y + tRight * dy;
      consider(
        tRight,
        rect.maxX,
        yRight,
        yRight >= rect.minY - eps && yRight <= rect.maxY + eps
      );
    }
    if (Math.abs(dy) > eps) {
      const tTop = (rect.minY - a.y) / dy;
      const xTop = a.x + tTop * dx;
      consider(
        tTop,
        xTop,
        rect.minY,
        xTop >= rect.minX - eps && xTop <= rect.maxX + eps
      );
      const tBottom = (rect.maxY - a.y) / dy;
      const xBottom = a.x + tBottom * dx;
      consider(
        tBottom,
        xBottom,
        rect.maxY,
        xBottom >= rect.minX - eps && xBottom <= rect.maxX + eps
      );
    }

    edgeHits.sort((left, right) => left.t - right.t);
    const unique: { t: number; point: Coords }[] = [];
    edgeHits.forEach((hit) => {
      const prev = unique[unique.length - 1];
      if (prev && Math.abs(prev.t - hit.t) < 1e-6) return;
      unique.push(hit);
    });

    if (unique.length >= 2) {
      hits.push(unique[0], unique[unique.length - 1]);
    }
  });

  hits.sort((left, right) => left.t - right.t);
  return hits.map((hit) => hit.point);
};

/**
 * Split a connector path into solid / through-node (dashed) runs.
 * Transition sits exactly on the device outer edge (not tile centers before/after).
 * Endpoint devices stay solid — dash only when crossing a foreign node body.
 * Sparse A↔B previews still dash mid-segment when the chord tunnels a body.
 */
export const splitConnectorPathByNodeBodies = ({
  tiles,
  items,
  modelItems,
  endpointItemIds
}: {
  tiles: Coords[];
  items: { id: string; tile: Coords }[];
  modelItems: { id: string; icon?: string }[];
  /** Connector's own nodes — cable over these stays solid. */
  endpointItemIds?: Iterable<string>;
}): ConnectorPathStyleRun[] => {
  if (tiles.length === 0) return [];

  const modelItemMap = new Map(modelItems.map(i => [i.id, i]));
  const excludedSet = endpointItemIds ? new Set(endpointItemIds) : null;
  const foreignItems = excludedSet 
    ? items.filter((item) => !excludedSet.has(item.id))
    : items;
  const excludedArr = endpointItemIds ? [...endpointItemIds] : [];
  const rects = getShape2dRects(foreignItems, undefined, modelItemMap);
  const flags = tiles.map((tile) => {
    return isTileOnAnyShape2dBody({
      tile,
      items,
      modelItemMap,
      excludeItemIds: excludedArr
    });
  });

  const runs: ConnectorPathStyleRun[] = [];
  let currentPoints: Coords[] = [tileCenter(tiles[0])];
  let currentThrough = flags[0];

  const flush = () => {
    if (currentPoints.length >= 2) {
      runs.push({
        points: currentPoints,
        throughNode: currentThrough
      });
    }
  };

  for (let i = 1; i < tiles.length; i += 1) {
    const prevFlag = flags[i - 1];
    const nextFlag = flags[i];
    const prevCenter = tileCenter(tiles[i - 1]);
    const nextCenter = tileCenter(tiles[i]);

    // Both outside — chord may still tunnel through a foreign body (sparse A↔B).
    if (!prevFlag && !nextFlag && rects.length > 0) {
      const edges = segmentTunnelEdges(prevCenter, nextCenter, rects);
      if (edges.length >= 2) {
        for (let e = 0; e + 1 < edges.length; e += 2) {
          currentPoints.push(edges[e]);
          flush();
          currentThrough = true;
          currentPoints = [edges[e], edges[e + 1]];
          flush();
          currentThrough = false;
          currentPoints = [edges[e + 1]];
        }
        currentPoints.push(nextCenter);
        continue;
      }
    }

    if (prevFlag === nextFlag) {
      currentPoints.push(nextCenter);
      continue;
    }

    // Crossing a node boundary — join exactly on the outer edge
    const insideTile = prevFlag ? tiles[i - 1] : tiles[i];
    const outsideTile = prevFlag ? tiles[i] : tiles[i - 1];
    const rect =
      findRectContainingTile(insideTile, rects) ??
      findRectContainingTile(outsideTile, rects);

    const edge = rect
      ? exitPointOnRectEdge(
          tileCenter(insideTile),
          tileCenter(outsideTile),
          rect
        )
      : {
          x: (prevCenter.x + nextCenter.x) / 2,
          y: (prevCenter.y + nextCenter.y) / 2
        };

    currentPoints.push(edge);
    flush();

    currentThrough = nextFlag;
    currentPoints = [edge, nextCenter];
  }

  flush();

  return runs;
};

/** Axis-aligned footprint overlap (touching edges is OK when gap=0). */
export const doShape2dFootprintsOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  gap = 0
) => {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
};

const getItemFootprint = (
  viewItem: { id: string; tile: Coords },
  modelItems?: { id: string; icon?: string; rackUnits?: number }[],
  modelItemMap?: Map<string, { id: string; icon?: string; rackUnits?: number }>
): { x: number; y: number; width: number; height: number } => {
  const modelItem = modelItemMap ? modelItemMap.get(viewItem.id) : modelItems?.find((candidate) => candidate.id === viewItem.id);
  const size = getModelItemSize(modelItem ?? {}) ??
    getShape2dSize(modelItem?.icon ?? '') ?? {
      width: 1,
      height: 1
    };

  return {
    x: viewItem.tile.x,
    y: viewItem.tile.y,
    width: size.width,
    height: size.height
  };
};

/**
 * Whether a shape can be placed/moved to `origin` without overlapping
 * other view items (optionally excluding some, e.g. the items being dragged).
 * Cabinets do not block device placement (devices mount inside).
 */
export const isShape2dPlacementFree = ({
  origin,
  size,
  items,
  modelItems,
  excludeItemIds = [],
  /** When placing a non-cabinet, ignore cabinet footprints. */
  ignoreCabinets = true
}: {
  origin: Coords;
  size: Size;
  items: { id: string; tile: Coords }[];
  modelItems: { id: string; icon?: string; rackUnits?: number }[];
  excludeItemIds?: string[];
  ignoreCabinets?: boolean;
}): boolean => {
  const candidate = {
    x: origin.x,
    y: origin.y,
    width: size.width,
    height: size.height
  };
  const excluded = new Set(excludeItemIds);
  const map = new Map(modelItems.map(i => [i.id, i]));

  return items.every((viewItem) => {
    if (excluded.has(viewItem.id)) return true;

    const other = map.get(viewItem.id);
    if (ignoreCabinets && other?.icon === SHAPE_2D_CABINET_ID) {
      return true;
    }

    return !doShape2dFootprintsOverlap(
      candidate,
      getItemFootprint(viewItem, undefined, map)
    );
  });
};

/**
 * Resolve a drag target when the full move would overlap a neighbor.
 * Prefer the desired tile; otherwise slide on one axis so pressing into an
 * edge-touching device doesn't freeze the free axis (feels like "snap steal").
 */
export const resolveShape2dDragOrigin = ({
  desired,
  current,
  size,
  items,
  modelItems,
  excludeItemIds = [],
  ignoreCabinets = true
}: {
  desired: Coords;
  current: Coords;
  size: Size;
  items: { id: string; tile: Coords }[];
  modelItems: { id: string; icon?: string; rackUnits?: number }[];
  excludeItemIds?: string[];
  ignoreCabinets?: boolean;
}): Coords | null => {
  const placement = {
    size,
    items,
    modelItems,
    excludeItemIds,
    ignoreCabinets
  };

  if (isShape2dPlacementFree({ origin: desired, ...placement })) {
    return desired;
  }

  const slideX = { x: desired.x, y: current.y };
  const slideY = { x: current.x, y: desired.y };
  const freeX =
    !CoordsUtils.isEqual(slideX, current) &&
    isShape2dPlacementFree({ origin: slideX, ...placement });
  const freeY =
    !CoordsUtils.isEqual(slideY, current) &&
    isShape2dPlacementFree({ origin: slideY, ...placement });

  if (freeX && freeY) {
    const dx = Math.abs(desired.x - current.x);
    const dy = Math.abs(desired.y - current.y);
    return dx >= dy ? slideX : slideY;
  }

  if (freeX) return slideX;
  if (freeY) return slideY;

  return null;
};

/** World-space tile of a port handle (center of that cell). */
export const getShape2dPortWorldTile = (
  shapeOriginTile: Coords,
  portLocalTile: Coords
): Coords => {
  return {
    x: shapeOriginTile.x + portLocalTile.x,
    y: shapeOriginTile.y + portLocalTile.y
  };
};

/** Pixel position of a port handle (exact center of its grid cell). */
export const getShape2dPortHandlePosition = (
  shapeOriginTile: Coords,
  portLocalTile: Coords
): Coords => {
  const worldTile = getShape2dPortWorldTile(shapeOriginTile, portLocalTile);

  return {
    x: worldTile.x * TILE_SIZE_2D + TILE_SIZE_2D / 2,
    y: worldTile.y * TILE_SIZE_2D + TILE_SIZE_2D / 2
  };
};

export const getTilePosition = ({
  tile,
  origin = 'CENTER'
}: GetTilePosition) => {
  const halfW = PROJECTED_TILE_SIZE.width / 2;
  const halfH = PROJECTED_TILE_SIZE.height / 2;

  const position: Coords = {
    x: halfW * tile.x - halfW * tile.y,
    y: -(halfH * tile.x + halfH * tile.y)
  };

  switch (origin) {
    case 'TOP':
      return CoordsUtils.add(position, { x: 0, y: -halfH });
    case 'BOTTOM':
      return CoordsUtils.add(position, { x: 0, y: halfH });
    case 'LEFT':
      return CoordsUtils.add(position, { x: -halfW, y: 0 });
    case 'RIGHT':
      return CoordsUtils.add(position, { x: halfW, y: 0 });
    case 'CENTER':
    default:
      return position;
  }
};

type IsoToScreen = GetTilePosition & {
  rendererSize: Size;
};

export const isoToScreen = ({ tile, origin, rendererSize }: IsoToScreen) => {
  const position = getTilePosition({ tile, origin });

  return {
    x: position.x + rendererSize.width / 2,
    y: position.y + rendererSize.height / 2
  };
};

export const sortByPosition = (tiles: Coords[]) => {
  const xSorted = [...tiles];
  const ySorted = [...tiles];
  xSorted.sort((a, b) => {
    return a.x - b.x;
  });
  ySorted.sort((a, b) => {
    return a.y - b.y;
  });

  const highest = {
    byX: xSorted[xSorted.length - 1],
    byY: ySorted[ySorted.length - 1]
  };
  const lowest = { byX: xSorted[0], byY: ySorted[0] };

  const lowX = lowest.byX.x;
  const highX = highest.byX.x;
  const lowY = lowest.byY.y;
  const highY = highest.byY.y;

  return {
    byX: xSorted,
    byY: ySorted,
    highest,
    lowest,
    lowX,
    lowY,
    highX,
    highY
  };
};

// Returns a complete set of tiles that form a grid area (takes in any number of tiles to use points to encapsulate)
export const getGridSubset = (tiles: Coords[]) => {
  const { lowX, lowY, highX, highY } = sortByPosition(tiles);

  const subset = [];

  for (let x = lowX; x < highX + 1; x += 1) {
    for (let y = lowY; y < highY + 1; y += 1) {
      subset.push({ x, y });
    }
  }

  return subset;
};

export const isWithinBounds = (tile: Coords, bounds: Coords[]) => {
  const { lowX, lowY, highX, highY } = sortByPosition(bounds);

  return tile.x >= lowX && tile.x <= highX && tile.y >= lowY && tile.y <= highY;
};

// Returns the four corners of a grid that encapsulates all tiles
// passed in (at least 1 tile needed)
export const getBoundingBox = (
  tiles: Coords[],
  offset: Coords = CoordsUtils.zero()
): BoundingBox => {
  const { lowX, lowY, highX, highY } = sortByPosition(tiles);

  return [
    { x: lowX - offset.x, y: lowY - offset.y },
    { x: highX + offset.x, y: lowY - offset.y },
    { x: highX + offset.x, y: highY + offset.y },
    { x: lowX - offset.x, y: highY + offset.y }
  ];
};

export const getBoundingBoxSize = (boundingBox: Coords[]): Size => {
  const { lowX, lowY, highX, highY } = sortByPosition(boundingBox);

  return {
    width: highX - lowX + 1,
    height: highY - lowY + 1
  };
};

const isoProjectionBaseValues = [0.707, -0.409, 0.707, 0.409, 0, -0.816];

export const getIsoMatrix = (
  orientation?: keyof typeof ProjectionOrientationEnum
) => {
  switch (orientation) {
    case ProjectionOrientationEnum.Y:
      return produce(isoProjectionBaseValues, (draft) => {
        draft[1] = -draft[1];
        draft[2] = -draft[2];
      });
    case ProjectionOrientationEnum.X:
    default:
      return isoProjectionBaseValues;
  }
};

export const getIsoProjectionCss = (
  orientation?: keyof typeof ProjectionOrientationEnum
) => {
  const matrixTransformValues = getIsoMatrix(orientation);

  return `matrix(${matrixTransformValues.join(', ')})`;
};

export const getTranslateCSS = (translate: Coords = { x: 0, y: 0 }) => {
  return `translate(${translate.x}px, ${translate.y}px)`;
};

interface GetMouse {
  interactiveElement: HTMLElement;
  zoom: number;
  scroll: Scroll;
  lastMouse: Mouse;
  mouseEvent: SlimMouseEvent;
  rendererSize: Size;
  projectionMode?: ProjectionMode;
}

export const getMouse = ({
  interactiveElement,
  zoom,
  scroll,
  lastMouse,
  mouseEvent,
  rendererSize,
  projectionMode = 'ISOMETRIC'
}: GetMouse): Mouse => {
  const componentOffset = interactiveElement.getBoundingClientRect();
  const offset: Coords = {
    x: componentOffset?.left ?? 0,
    y: componentOffset?.top ?? 0
  };

  const { clientX, clientY } = mouseEvent;

  const mousePosition = {
    x: clientX - offset.x,
    y: clientY - offset.y
  };

  const screenToTile = isPlanProjection(projectionMode)
    ? screenToTile2d
    : screenToIso;

  const newPosition: Mouse['position'] = {
    screen: mousePosition,
    tile: screenToTile({
      mouse: mousePosition,
      zoom,
      scroll,
      rendererSize
    })
  };

  const newDelta: Mouse['delta'] = {
    screen: CoordsUtils.subtract(newPosition.screen, lastMouse.position.screen),
    tile: CoordsUtils.subtract(newPosition.tile, lastMouse.position.tile)
  };

  const getMousedown = (): Mouse['mousedown'] => {
    switch (mouseEvent.type) {
      case 'mousedown':
        return newPosition;
      case 'mousemove':
        return lastMouse.mousedown;
      default:
        return null;
    }
  };

  const nextMouse: Mouse = {
    position: newPosition,
    delta: newDelta,
    mousedown: getMousedown(),
    shiftKey: Boolean(mouseEvent.shiftKey),
    ctrlKey: Boolean(mouseEvent.ctrlKey),
    metaKey: Boolean(mouseEvent.metaKey)
  };

  return nextMouse;
};

export const getAllAnchors = (connectors: Connector[]) => {
  return connectors.reduce((acc, connector) => {
    return [...acc, ...connector.anchors];
  }, [] as ConnectorAnchor[]);
};

export const getAnchorTile = (
  anchor: ConnectorAnchor,
  view: View,
  modelItems?: { id: string; icon?: string }[],
  /** Live tiles during node drag (model still has the pre-drag positions). */
  tileOverrides?: Record<string, Coords>,
  modelItemMap?: Map<string, { id: string; icon?: string }>
): Coords => {
  if (anchor.ref.item) {
    const viewItem = getItemByIdOrThrow(view.items, anchor.ref.item).value;
    const tile = tileOverrides?.[anchor.ref.item] ?? viewItem.tile;

    if (anchor.ref.port && modelItems) {
      const modelItem = modelItemMap
        ? modelItemMap.get(anchor.ref.item)
        : modelItems.find((item) => {
            return item.id === anchor.ref.item;
          });
      const port = getShape2dPorts(modelItem?.icon ?? '').find((candidate) => {
        return candidate.id === anchor.ref.port;
      });

      if (port) {
        return getShape2dPortWorldTile(tile, port.tile);
      }
    }

    return tile;
  }

  if (anchor.ref.anchor) {
    const allAnchors = getAllAnchors(view.connectors ?? []);
    const nextAnchor = getItemByIdOrThrow(allAnchors, anchor.ref.anchor).value;

    return getAnchorTile(nextAnchor, view, modelItems, tileOverrides);
  }

  if (anchor.ref.tile) {
    return anchor.ref.tile;
  }

  throw new Error('Could not get anchor tile.');
};

interface NormalisePositionFromOrigin {
  position: Coords;
  origin: Coords;
}

export const normalisePositionFromOrigin = ({
  position,
  origin
}: NormalisePositionFromOrigin) => {
  return CoordsUtils.subtract(origin, position);
};

interface GetConnectorPath {
  anchors: ConnectorAnchor[];
  view: View;
  modelItems?: { id: string; icon?: string }[];
  /** Prefer 90° routing (no diagonal steps). */
  orthogonal?: boolean;
}

export const getConnectorPath = ({
  anchors,
  view,
  modelItems,
  orthogonal = false
}: GetConnectorPath): {
  tiles: Coords[];
  rectangle: Rect;
} => {
  if (anchors.length < 2)
    throw new Error(
      `Connector needs at least two anchors (receieved: ${anchors.length})`
    );

  const anchorPosition = anchors.map((anchor) => {
    return getAnchorTile(anchor, view, modelItems);
  });

  // Overall rectangle for path storage / rendering (covers every via).
  const searchArea = getBoundingBox(anchorPosition, CONNECTOR_SEARCH_OFFSET);
  const sorted = sortByPosition(searchArea);
  const rectangle = {
    from: { x: sorted.highX, y: sorted.highY },
    to: { x: sorted.lowX, y: sorted.lowY }
  };

  const toPathLocal = (global: Coords): Coords => {
    return normalisePositionFromOrigin({
      position: global,
      origin: rectangle.from
    });
  };

  // Pathfind each consecutive pair in its own bbox so moving anchors on
  // one side of a (locked) via cannot rewrite tiles on the other side.
  const tiles = anchorPosition.reduce<Coords[]>((acc, _position, i) => {
    if (i === 0) return acc;

    const fromGlobal = anchorPosition[i - 1];
    const toGlobal = anchorPosition[i];

    const segmentArea = getBoundingBox(
      [fromGlobal, toGlobal],
      CONNECTOR_SEARCH_OFFSET
    );
    const segmentSorted = sortByPosition(segmentArea);
    const segmentOrigin = {
      x: segmentSorted.highX,
      y: segmentSorted.highY
    };
    const segmentSize = getBoundingBoxSize(segmentArea);

    const segmentPath = findPath({
      from: normalisePositionFromOrigin({
        position: fromGlobal,
        origin: segmentOrigin
      }),
      to: normalisePositionFromOrigin({
        position: toGlobal,
        origin: segmentOrigin
      }),
      gridSize: segmentSize,
      orthogonal
    }).map((tile) => {
      const global = CoordsUtils.subtract(segmentOrigin, tile);
      return toPathLocal(global);
    });

    if (acc.length === 0) {
      return segmentPath;
    }

    return [...acc, ...segmentPath.slice(1)];
  }, []);

  return { tiles, rectangle };
};

/**
 * Drag-time path: only the consecutive anchor tiles (no A* / no L-fill).
 * Cheap O(anchors) preview — call getConnectorPath on mouseup for the real route.
 */
export const getConnectorPathPreview = ({
  anchors,
  view,
  modelItems,
  tileOverrides
}: {
  anchors: ConnectorAnchor[];
  view: View;
  modelItems?: { id: string; icon?: string }[];
  tileOverrides?: Record<string, Coords>;
}): {
  tiles: Coords[];
  rectangle: Rect;
} => {
  if (anchors.length < 2) {
    throw new Error(
      `Connector needs at least two anchors (receieved: ${anchors.length})`
    );
  }

  const anchorPosition = anchors.map((anchor) => {
    return getAnchorTile(anchor, view, modelItems, tileOverrides);
  });

  const searchArea = getBoundingBox(anchorPosition, CONNECTOR_SEARCH_OFFSET);
  const sorted = sortByPosition(searchArea);
  const rectangle = {
    from: { x: sorted.highX, y: sorted.highY },
    to: { x: sorted.lowX, y: sorted.lowY }
  };

  const tiles: Coords[] = [];
  anchorPosition.forEach((position) => {
    const local = normalisePositionFromOrigin({
      position,
      origin: rectangle.from
    });
    const prev = tiles[tiles.length - 1];
    if (prev && CoordsUtils.isEqual(prev, local)) return;
    tiles.push(local);
  });

  return { tiles, rectangle };
};

type GetRectangleFromSize = (
  from: Coords,
  size: Size
) => { from: Coords; to: Coords };

export const getRectangleFromSize: GetRectangleFromSize = (from, size) => {
  return {
    from,
    to: { x: from.x + size.width, y: from.y + size.height }
  };
};

export const hasMovedTile = (mouse: Mouse) => {
  if (!mouse.delta) return false;

  return !CoordsUtils.isEqual(mouse.delta.tile, CoordsUtils.zero());
};

export const connectorPathTileToGlobal = (
  tile: Coords,
  origin: Coords
): Coords => {
  return CoordsUtils.subtract(
    CoordsUtils.subtract(origin, CONNECTOR_SEARCH_OFFSET),
    CoordsUtils.subtract(tile, CONNECTOR_SEARCH_OFFSET)
  );
};

export const getTextBoxEndTile = (textBox: TextBox, size: Size) => {
  if (textBox.orientation === ProjectionOrientationEnum.X) {
    return CoordsUtils.add(textBox.tile, {
      x: size.width,
      y: 0
    });
  }

  return CoordsUtils.add(textBox.tile, {
    x: 0,
    y: -size.width
  });
};

interface GetItemAtTile {
  tile: Coords;
  scene: ReturnType<typeof useScene>;
}

interface GetShape2dItemAtTile {
  tile: Coords;
  scene: ReturnType<typeof useScene>;
  modelItems: { id: string; icon?: string }[];
}

export const getShape2dItemAtTile = ({
  tile,
  scene,
  modelItems
}: GetShape2dItemAtTile): ItemReference | null => {
  type Hit = {
    id: string;
    area: number;
    isCabinet: boolean;
    hasParent: boolean;
  };

  const hits: Hit[] = [];
  const map = new Map(modelItems.map(i => [i.id, i]));

  scene.items.forEach((item) => {
    const modelItem = map.get(item.id);

    if (!modelItem?.icon) return;

    const size =
      getModelItemSize(modelItem) ?? getShape2dSize(modelItem.icon);

    if (!size) return;

    if (!isTileInShape2dBounds(tile, item.tile, size)) return;

    hits.push({
      id: item.id,
      area: size.width * size.height,
      isCabinet: modelItem.icon === SHAPE_2D_CABINET_ID,
      hasParent: Boolean(item.parentId)
    });
  });

  if (hits.length > 0) {
    // Prefer mounted devices (switches in a rack) over the cabinet body,
    // then smaller footprints — otherwise clicks always hit the szafa.
    hits.sort((a, b) => {
      if (a.isCabinet !== b.isCabinet) {
        return a.isCabinet ? 1 : -1;
      }
      if (a.hasParent !== b.hasParent) {
        return a.hasParent ? -1 : 1;
      }
      return a.area - b.area;
    });

    return {
      type: 'ITEM',
      id: hits[0].id
    };
  }

  let hitConnectorId: string | null = null;
  for (const con of scene.connectors) {
    for (const pathTile of con.path.tiles) {
      const globalPathTile = connectorPathTileToGlobal(
        pathTile,
        con.path.rectangle.from
      );
      if (globalPathTile.x === tile.x && globalPathTile.y === tile.y) {
        hitConnectorId = con.id;
        break;
      }
    }
    if (hitConnectorId) break;
  }

  if (hitConnectorId) {
    return {
      type: 'CONNECTOR',
      id: hitConnectorId
    };
  }

  const rectangle = scene.rectangles.find(({ from, to }) => {
    return isWithinBounds(tile, [from, to]);
  });

  if (rectangle) {
    return {
      type: 'RECTANGLE',
      id: rectangle.id
    };
  }

  return null;
};

export interface Shape2dPortHit {
  itemId: string;
  portId: string;
  /** Local tile offset of the port within the shape */
  portTile: Coords;
  /** Absolute world tile of the port handle */
  worldTile: Coords;
}

/** Max Chebyshev tile distance for connector port snap. */
export const SHAPE_2D_PORT_SNAP_DISTANCE = 3;

/**
 * Visual RJ45/SFP box size in grid tiles (matches DeviceShape2d `portTileSize`).
 * Hit-testing uses this AABB so clicks on the frosted jack — not only the
 * single grid cell center — select the port.
 */
export const SHAPE_2D_PORT_VISUAL_SIZE_TILES = 2.25;

/** Whether any connector anchor already uses this item+port pair. */
export const isShape2dPortInUse = ({
  itemId,
  portId,
  connectors,
  excludeConnectorId,
  excludeAnchorId
}: {
  itemId: string;
  portId: string;
  connectors: Pick<Connector, 'id' | 'anchors'>[];
  excludeConnectorId?: string | null;
  excludeAnchorId?: string | null;
}): boolean => {
  return connectors.some((connector) => {
    if (excludeConnectorId && connector.id === excludeConnectorId) {
      return false;
    }

    return connector.anchors.some((anchor) => {
      if (excludeAnchorId && anchor.id === excludeAnchorId) {
        return false;
      }

      return anchor.ref.item === itemId && anchor.ref.port === portId;
    });
  });
};

/**
 * Port under a continuous tile-space point (visual jack box, not just cell).
 * When several ports overlap, the nearest jack center wins.
 */
export const getShape2dPortAtPoint = ({
  point,
  scene,
  modelItems,
  isPortAvailable
}: {
  point: Coords;
  scene: GetShape2dItemAtTile['scene'];
  modelItems: GetShape2dItemAtTile['modelItems'];
  isPortAvailable?: (hit: Shape2dPortHit) => boolean;
}): Shape2dPortHit | null => {
  const half = SHAPE_2D_PORT_VISUAL_SIZE_TILES / 2;
  let best: Shape2dPortHit | null = null;
  let bestDistSq = Infinity;

  const map = new Map(modelItems.map(i => [i.id, i]));
  for (const viewItem of scene.items) {
    const modelItem = map.get(viewItem.id);

    if (!modelItem?.icon) continue;

    const ports = getShape2dPorts(modelItem.icon);

    for (const port of ports) {
      const worldTile = getShape2dPortWorldTile(viewItem.tile, port.tile);
      const cx = worldTile.x + 0.5;
      const cy = worldTile.y + 0.5;
      const dx = Math.abs(point.x - cx);
      const dy = Math.abs(point.y - cy);

      if (dx > half || dy > half) continue;

      const distSq = dx * dx + dy * dy;
      if (distSq >= bestDistSq) continue;

      const hit: Shape2dPortHit = {
        itemId: viewItem.id,
        portId: port.id,
        portTile: port.tile,
        worldTile
      };

      if (isPortAvailable && !isPortAvailable(hit)) continue;

      bestDistSq = distSq;
      best = hit;
    }
  }

  return best;
};

export const getShape2dPortAtTile = ({
  tile,
  scene,
  modelItems,
  isPortAvailable,
  point
}: GetShape2dItemAtTile & {
  isPortAvailable?: (hit: Shape2dPortHit) => boolean;
  /** Continuous tile coords — preferred for accurate visual hits. */
  point?: Coords;
}): Shape2dPortHit | null => {
  return getShape2dPortAtPoint({
    point: point ?? { x: tile.x + 0.5, y: tile.y + 0.5 },
    scene,
    modelItems,
    isPortAvailable
  });
};

/** Nearest port within `maxDistance` (Chebyshev / king-move tiles). */
export const getNearestShape2dPort = ({
  tile,
  scene,
  modelItems,
  maxDistance = SHAPE_2D_PORT_SNAP_DISTANCE,
  isPortAvailable
}: GetShape2dItemAtTile & {
  maxDistance?: number;
  isPortAvailable?: (hit: Shape2dPortHit) => boolean;
}): Shape2dPortHit | null => {
  let best: Shape2dPortHit | null = null;
  let bestDistance = Infinity;

  const map = new Map(modelItems.map(i => [i.id, i]));
  for (const viewItem of scene.items) {
    const modelItem = map.get(viewItem.id);

    if (!modelItem?.icon) continue;

    const ports = getShape2dPorts(modelItem.icon);

    for (const port of ports) {
      const worldTile = getShape2dPortWorldTile(viewItem.tile, port.tile);
      const distance = Math.max(
        Math.abs(worldTile.x - tile.x),
        Math.abs(worldTile.y - tile.y)
      );

      if (distance > maxDistance || distance >= bestDistance) continue;

      const hit: Shape2dPortHit = {
        itemId: viewItem.id,
        portId: port.id,
        portTile: port.tile,
        worldTile
      };

      if (isPortAvailable && !isPortAvailable(hit)) continue;

      bestDistance = distance;
      best = hit;
    }
  }

  return best;
};

export const getItemAtTile = ({
  tile,
  scene
}: GetItemAtTile): ItemReference | null => {
  const viewItem = scene.items.find((item) => {
    return CoordsUtils.isEqual(item.tile, tile);
  });

  if (viewItem) {
    return {
      type: 'ITEM',
      id: viewItem.id
    };
  }

  const textBox = scene.textBoxes.find((tb) => {
    const textBoxTo = getTextBoxEndTile(tb, tb.size);
    const textBoxBounds = getBoundingBox([
      tb.tile,
      {
        x: Math.ceil(textBoxTo.x),
        y:
          tb.orientation === 'X'
            ? Math.ceil(textBoxTo.y)
            : Math.floor(textBoxTo.y)
      }
    ]);

    return isWithinBounds(tile, textBoxBounds);
  });

  if (textBox) {
    return {
      type: 'TEXTBOX',
      id: textBox.id
    };
  }

  let hitConnectorId: string | null = null;
  for (const con of scene.connectors) {
    for (const pathTile of con.path.tiles) {
      const globalPathTile = connectorPathTileToGlobal(
        pathTile,
        con.path.rectangle.from
      );
      if (globalPathTile.x === tile.x && globalPathTile.y === tile.y) {
        hitConnectorId = con.id;
        break;
      }
    }
    if (hitConnectorId) break;
  }

  if (hitConnectorId) {
    return {
      type: 'CONNECTOR',
      id: hitConnectorId
    };
  }

  const rectangle = scene.rectangles.find(({ from, to }) => {
    return isWithinBounds(tile, [from, to]);
  });

  if (rectangle) {
    return {
      type: 'RECTANGLE',
      id: rectangle.id
    };
  }

  return null;
};

interface FontProps {
  fontWeight: number | string;
  fontSize: number;
  fontFamily: string;
}

export const getTextWidth = (text: string, fontProps: FontProps) => {
  if (!text) return 0;

  const paddingX = TEXTBOX_PADDING * UNPROJECTED_TILE_SIZE;
  const fontSizePx = toPx(fontProps.fontSize * UNPROJECTED_TILE_SIZE);
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not get canvas context');
  }

  context.font = `${fontProps.fontWeight} ${fontSizePx} ${fontProps.fontFamily}`;
  const metrics = context.measureText(text);

  canvas.remove();

  return (metrics.width + paddingX * 2) / UNPROJECTED_TILE_SIZE - 0.8;
};

export const getTextBoxDimensions = (textBox: TextBox): Size => {
  const width = getTextWidth(textBox.content, {
    fontSize: textBox.fontSize ?? TEXTBOX_DEFAULTS.fontSize,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontWeight: TEXTBOX_FONT_WEIGHT
  });
  const height = 1;

  return { width, height };
};

export const outermostCornerPositions: TileOrigin[] = [
  'BOTTOM',
  'RIGHT',
  'TOP',
  'LEFT'
];

export const convertBoundsToNamedAnchors = (
  boundingBox: BoundingBox
): {
  [key in AnchorPosition]: Coords;
} => {
  const bottomLeft = boundingBox[0];
  const bottomRight = boundingBox[1];
  const topRight = boundingBox[2];
  const topLeft = boundingBox[3];

  return {
    BOTTOM_LEFT: bottomLeft,
    BOTTOM_RIGHT: bottomRight,
    TOP_RIGHT: topRight,
    TOP_LEFT: topLeft,
    TOP: {
      x: Math.round((topLeft.x + topRight.x) / 2),
      y: topLeft.y
    },
    BOTTOM: {
      x: Math.round((bottomLeft.x + bottomRight.x) / 2),
      y: bottomLeft.y
    },
    LEFT: {
      x: topLeft.x,
      y: Math.round((topLeft.y + bottomLeft.y) / 2)
    },
    RIGHT: {
      x: topRight.x,
      y: Math.round((topRight.y + bottomRight.y) / 2)
    }
  };
};

export const getAnchorAtTile = (
  tile: Coords,
  anchors: ConnectorAnchor[],
  view?: View,
  modelItems?: { id: string; icon?: string }[]
) => {
  return anchors.find((anchor) => {
    if (anchor.ref.tile && CoordsUtils.isEqual(anchor.ref.tile, tile)) {
      return true;
    }

    if (view) {
      try {
        const resolved = getAnchorTile(anchor, view, modelItems);
        return CoordsUtils.isEqual(resolved, tile);
      } catch {
        return false;
      }
    }

    return false;
  });
};

export const getAnchorParent = (anchorId: string, connectors: Connector[]) => {
  const connector = connectors.find((con) => {
    return con.anchors.find((anchor) => {
      return anchor.id === anchorId;
    });
  });

  if (!connector) {
    throw new Error(`Could not find connector with anchor id ${anchorId}`);
  }

  return connector;
};

export const getTileScrollPosition = (
  tile: Coords,
  origin?: TileOrigin
): Coords => {
  const tilePosition = getTilePosition({ tile, origin });

  return {
    x: -tilePosition.x,
    y: -tilePosition.y
  };
};

export const getConnectorsByViewItem = (
  viewItemId: string,
  connectors: Connector[]
) => {
  return connectors.filter((connector) => {
    return connector.anchors.some((anchor) => {
      return anchor.ref.item === viewItemId;
    });
  });
};

export const getConnectorDirectionIcon = (connectorTiles: Coords[]) => {
  if (connectorTiles.length < 2) return null;

  const iconTile = connectorTiles[connectorTiles.length - 2];
  const lastTile = connectorTiles[connectorTiles.length - 1];

  let rotation;

  if (lastTile.x > iconTile.x) {
    if (lastTile.y > iconTile.y) {
      rotation = 135;
    } else if (lastTile.y < iconTile.y) {
      rotation = 45;
    } else {
      rotation = 90;
    }
  }

  if (lastTile.x < iconTile.x) {
    if (lastTile.y > iconTile.y) {
      rotation = -135;
    } else if (lastTile.y < iconTile.y) {
      rotation = -45;
    } else {
      rotation = -90;
    }
  }

  if (lastTile.x === iconTile.x) {
    if (lastTile.y > iconTile.y) {
      rotation = 180;
    } else if (lastTile.y < iconTile.y) {
      rotation = 0;
    } else {
      rotation = -90;
    }
  }

  return {
    x: iconTile.x * UNPROJECTED_TILE_SIZE + UNPROJECTED_TILE_SIZE / 2,
    y: iconTile.y * UNPROJECTED_TILE_SIZE + UNPROJECTED_TILE_SIZE / 2,
    rotation
  };
};

export const getProjectBounds = (
  view: View,
  padding = PROJECT_BOUNDING_BOX_PADDING,
  options?: {
    projectionMode?: ProjectionMode;
    modelItems?: { id: string; icon?: string; rackUnits?: number }[];
  }
): Coords[] => {
  const isTwoD = isPlanProjection(options?.projectionMode ?? 'ISOMETRIC');
  const modelItems = options?.modelItems ?? [];

  const map = new Map(modelItems.map(i => [i.id, i]));
  const itemTiles = view.items.flatMap((item) => {
    if (!isTwoD) {
      return [item.tile];
    }

    const modelItem = map.get(item.id);
    // Prefer model size (cabinet rackUnits, custom templates) over icon defaults.
    const size =
      (modelItem ? getModelItemSize(modelItem) : null) ??
      getShape2dSize(modelItem?.icon ?? '') ?? {
        width: 1,
        height: 1
      };

    return [
      item.tile,
      {
        x: item.tile.x + size.width,
        y: item.tile.y + size.height
      }
    ];
  });

  const connectors = view.connectors ?? [];
  const connectorTiles = connectors.reduce<Coords[]>((acc, connector) => {
    try {
      const path = getConnectorPath({
        anchors: connector.anchors,
        view,
        modelItems
      });

      return [...acc, path.rectangle.from, path.rectangle.to];
    } catch {
      return acc;
    }
  }, []);

  const rectangles = view.rectangles ?? [];
  const rectangleTiles = rectangles.reduce<Coords[]>((acc, rectangle) => {
    return [...acc, rectangle.from, rectangle.to];
  }, []);

  const textBoxes = view.textBoxes ?? [];
  const textBoxTiles = textBoxes.reduce<Coords[]>((acc, textBox) => {
    const size = getTextBoxDimensions(textBox);

    return [
      ...acc,
      textBox.tile,
      CoordsUtils.add(textBox.tile, {
        x: size.width,
        y: size.height
      })
    ];
  }, []);

  let allTiles = [
    ...itemTiles,
    ...connectorTiles,
    ...rectangleTiles,
    ...textBoxTiles
  ];

  if (allTiles.length === 0) {
    const centerTile = CoordsUtils.zero();
    allTiles = [centerTile, centerTile, centerTile, centerTile];
  }

  const corners = getBoundingBox(allTiles, {
    x: padding,
    y: padding
  });

  return corners;
};

export const getUnprojectedBounds = (
  view: View,
  options?: {
    projectionMode?: ProjectionMode;
    modelItems?: { id: string; icon?: string; rackUnits?: number }[];
  }
) => {
  const projectBounds = getProjectBounds(view, undefined, options);

  if (isPlanProjection(options?.projectionMode ?? 'ISOMETRIC')) {
    const sortedCorners = sortByPosition(projectBounds);
    const size = getBoundingBoxSize(projectBounds);

    return {
      width: Math.max(1, size.width) * TILE_SIZE_2D,
      height: Math.max(1, size.height) * TILE_SIZE_2D,
      x: sortedCorners.lowX * TILE_SIZE_2D,
      y: sortedCorners.lowY * TILE_SIZE_2D
    };
  }

  const cornerPositions = projectBounds.map((corner) => {
    return getTilePosition({
      tile: corner
    });
  });
  const sortedCorners = sortByPosition(cornerPositions);
  const topLeft = { x: sortedCorners.lowX, y: sortedCorners.lowY };
  const size = getBoundingBoxSize(cornerPositions);

  return {
    width: size.width,
    height: size.height,
    x: topLeft.x,
    y: topLeft.y
  };
};

export const getFitToViewParams = (
  view: View,
  viewportSize: Size,
  options?: {
    projectionMode?: ProjectionMode;
    modelItems?: { id: string; icon?: string; rackUnits?: number }[];
  }
) => {
  const projectBounds = getProjectBounds(view, undefined, options);
  const sortedCornerPositions = sortByPosition(projectBounds);
  const boundingBoxSize = getBoundingBoxSize(projectBounds);
  const unprojectedBounds = getUnprojectedBounds(view, options);
  const minZoom =
    isPlanProjection(options?.projectionMode ?? 'ISOMETRIC') ? MIN_ZOOM_2D : MIN_ZOOM;
  const zoom = clamp(
    Math.min(
      viewportSize.width / Math.max(1, unprojectedBounds.width),
      viewportSize.height / Math.max(1, unprojectedBounds.height)
    ),
    minZoom,
    MAX_ZOOM
  );

  if (isPlanProjection(options?.projectionMode ?? 'ISOMETRIC')) {
    const centerPx = {
      x:
        (sortedCornerPositions.lowX + boundingBoxSize.width / 2) *
        TILE_SIZE_2D,
      y:
        (sortedCornerPositions.lowY + boundingBoxSize.height / 2) *
        TILE_SIZE_2D
    };

    return {
      zoom,
      scroll: {
        x: -centerPx.x * zoom,
        y: -centerPx.y * zoom
      }
    };
  }

  const scrollTarget: Coords = {
    x: (sortedCornerPositions.lowX + boundingBoxSize.width / 2) * zoom,
    y: (sortedCornerPositions.lowY + boundingBoxSize.height / 2) * zoom
  };
  const scroll = getTileScrollPosition(scrollTarget);

  return {
    zoom,
    scroll
  };
};
