import PF from 'pathfinding';
import { Size, Coords } from 'src/types';
import {
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

export const findPath = ({
  gridSize,
  from,
  to,
  orthogonal = false
}: Args): Coords[] => {
  const useOrthogonal = orthogonal || isOrthogonalPathRequested();

  if (useOrthogonal) {
    return buildOrthogonalTiles(from, to, getOrthogonalHint());
  }

  const grid = new PF.Grid(gridSize.width, gridSize.height);
  const finder = new PF.AStarFinder({
    heuristic: PF.Heuristic.manhattan,
    diagonalMovement: PF.DiagonalMovement.Always
  });
  const path = finder.findPath(from.x, from.y, to.x, to.y, grid);

  return path.map((tile) => {
    return {
      x: tile[0],
      y: tile[1]
    };
  });
};
