import { Size, Coords } from 'src/types';
import {
  buildDiagonalAwareTiles,
  buildOrthogonalTiles,
  getOrthogonalHint,
  isOrthogonalPathRequested
} from './pathOptions';

interface Args {
  gridSize: Size;
  from: Coords;
  to: Coords;
  /** When true, only horizontal/vertical routing (L/U, no staircase). */
  orthogonal?: boolean;
}

/**
 * Tile path between two points.
 *
 * Uses geometric fills (orthogonal L/U or smooth diagonal+stub). An empty-grid
 * A* used to emit orthogonal staircases that render as zigzags through tile
 * centres — that pathfinder is intentionally not used here.
 */
export const findPath = ({
  from,
  to,
  orthogonal = false
}: Args): Coords[] => {
  const useOrthogonal = orthogonal || isOrthogonalPathRequested();

  const fromTile = {
    x: Math.round(from.x),
    y: Math.round(from.y)
  };
  const toTile = {
    x: Math.round(to.x),
    y: Math.round(to.y)
  };

  if (useOrthogonal) {
    return buildOrthogonalTiles(fromTile, toTile, getOrthogonalHint());
  }

  return buildDiagonalAwareTiles(fromTile, toTile);
};
