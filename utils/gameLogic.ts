
import { COLS, ROWS, TETROMINOS } from '../constants';
import { ActivePiece, Position } from '../types';

export const createEmptyGrid = () => 
  Array.from({ length: ROWS }, () => Array(COLS).fill(null));

export const checkCollision = (
  piece: ActivePiece, 
  grid: (string | null)[][], 
  move: Position = { x: 0, y: 0 }
): boolean => {
  const { shape, pos } = piece;
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x]) {
        const nextX = pos.x + x + move.x;
        const nextY = pos.y + y + move.y;
        
        // Check boundaries
        if (nextX < 0 || nextX >= COLS || nextY >= ROWS) {
          return true;
        }
        
        // Check grid occupancy (only if within vertical bounds)
        if (nextY >= 0 && grid[nextY][nextX]) {
          return true;
        }
      }
    }
  }
  return false;
};

export const rotatePiece = (shape: number[][]): number[][] => {
  const N = shape.length;
  const rotated = Array.from({ length: N }, () => Array(N).fill(0));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      rotated[x][N - 1 - y] = shape[y][x];
    }
  }
  return rotated;
};

export const getGhostPosition = (piece: ActivePiece, grid: (string | null)[][]): Position => {
  let ghostY = piece.pos.y;
  while (!checkCollision(piece, grid, { x: 0, y: ghostY - piece.pos.y + 1 })) {
    ghostY++;
  }
  return { x: piece.pos.x, y: ghostY };
};
