
import { TetrominoType } from './constants';

export interface Position {
  x: number;
  y: number;
}

export interface ActivePiece {
  type: TetrominoType;
  pos: Position;
  shape: number[][];
}

export interface GameState {
  grid: (string | null)[][];
  activePiece: ActivePiece;
  nextPieceType: TetrominoType;
  nextNextPieceType: TetrominoType;
  score: number;
  lines: number;
  gameOver: boolean;
  isPaused: boolean;
  level: number;
  clearingCells?: Set<string>; // 사라지는 중인 블록들
  fillingCells?: Set<string>;  // 새로 채워지는 중인 블록들 (애니메이션용)
  isAnimating?: boolean;       
}
