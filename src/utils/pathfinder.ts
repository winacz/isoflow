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

  const width = Math.max(1, Math.round(gridSize.width));
  const height = Math.max(1, Math.round(gridSize.height));
  const clampedFrom = {
    x: Math.min(width - 1, Math.max(0, fromTile.x)),
    y: Math.min(height - 1, Math.max(0, fromTile.y))
  };
  const clampedTo = {
    x: Math.min(width - 1, Math.max(0, toTile.x)),
    y: Math.min(height - 1, Math.max(0, toTile.y))
  };

  const grid = new PF.Grid(width, height);
  const finder = new PF.AStarFinder({
    heuristic: PF.Heuristic.manhattan,
    diagonalMovement: PF.DiagonalMovement.Always
  });
  const path = finder.findPath(
    clampedFrom.x,
    clampedFrom.y,
    clampedTo.x,
    clampedTo.y,
    grid
  );

  return path.map((tile) => {
    return {
      x: tile[0],
      y: tile[1]
    };
  });
};
