import { InitialData } from 'src/types';
import {
  DEFAULT_COLOR,
  SHAPES_2D,
  SHAPE_2D_SWITCH_ID,
  SHAPE_2D_PC_ID,
  SWITCH_2D_SIZE,
  PC_2D_SIZE
} from 'src/config';
import { generateId } from 'src/utils';

/** Switch port numbers → port ids (1–8 top, 9–16 bottom). */
const switchPortId = (portNumber: number) => {
  if (portNumber >= 1 && portNumber <= 8) {
    return `port-top-${portNumber}`;
  }

  if (portNumber >= 9 && portNumber <= 16) {
    return `port-bottom-${portNumber - 8}`;
  }

  throw new Error(`Invalid switch port: ${portNumber}`);
};

const randomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const overlaps = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  gap = 2
) => {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
};

const randomTileAwayFrom = (
  placed: { x: number; y: number; w: number; h: number }[],
  size: { width: number; height: number },
  area: { minX: number; maxX: number; minY: number; maxY: number }
) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const tile = {
      x: randomInt(area.minX, area.maxX),
      y: randomInt(area.minY, area.maxY)
    };
    const box = {
      x: tile.x,
      y: tile.y,
      w: size.width,
      h: size.height
    };

    if (
      placed.every((other) => {
        return !overlaps(box, other);
      })
    ) {
      placed.push(box);
      return tile;
    }
  }

  // Fallback: offset from last placed
  const last = placed[placed.length - 1];
  const tile = {
    x: (last?.x ?? 0) + (last?.w ?? 0) + 4,
    y: (last?.y ?? 0) + randomInt(-6, 6)
  };
  placed.push({
    x: tile.x,
    y: tile.y,
    w: size.width,
    h: size.height
  });
  return tile;
};

const PC_PORTS = [1, 3, 9, 11, 16] as const;

/**
 * Practice starting topology: 1 Switch + 5 PCs on ports 1, 3, 9, 11, 16.
 * Positions are randomized on each call (Clear canvas / reload).
 */
export const createStartingTopology2d = (): InitialData => {
  const viewId = generateId();
  const switchId = generateId();
  const colorId = DEFAULT_COLOR.id;

  const placed: { x: number; y: number; w: number; h: number }[] = [];

  const switchTile = randomTileAwayFrom(placed, SWITCH_2D_SIZE, {
    minX: -12,
    maxX: -4,
    minY: -6,
    maxY: 0
  });

  const pcs = PC_PORTS.map((portNumber, index) => {
    const id = generateId();
    const tile = randomTileAwayFrom(placed, PC_2D_SIZE, {
      minX: -20,
      maxX: 24,
      minY: -18,
      maxY: 16
    });

    return {
      id,
      portNumber,
      tile,
      name: `PC-${index + 1}`
    };
  });

  return {
    title: 'Practice topology',
    version: '1.0',
    fitToView: true,
    projectionMode: 'TWO_D',
    icons: SHAPES_2D,
    colors: [{ ...DEFAULT_COLOR, id: colorId }],
    items: [
      {
        id: switchId,
        name: 'Switch',
        icon: SHAPE_2D_SWITCH_ID
      },
      ...pcs.map((pc) => {
        return {
          id: pc.id,
          name: pc.name,
          icon: SHAPE_2D_PC_ID
        };
      })
    ],
    views: [
      {
        id: viewId,
        name: 'Plan',
        items: [
          { id: switchId, tile: switchTile },
          ...pcs.map((pc) => {
            return { id: pc.id, tile: pc.tile };
          })
        ],
        connectors: pcs.map((pc) => {
          return {
            id: generateId(),
            color: colorId,
            anchors: [
              {
                id: generateId(),
                ref: {
                  item: switchId,
                  port: switchPortId(pc.portNumber)
                }
              },
              {
                id: generateId(),
                ref: {
                  item: pc.id,
                  port: 'port-1'
                }
              }
            ]
          };
        })
      }
    ],
    view: viewId
  };
};
