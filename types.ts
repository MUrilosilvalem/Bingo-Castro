export type BingoNumber = number;

export interface Cell {
  number: number | 'FREE';
  isMarked: boolean;
}

// 5 columns (B, I, N, G, O), each has 5 cells (N has a free space)
export interface BingoCard {
  id: string;
  playerName: string;
  grid: Cell[][]; // 5x5 grid
  missingCount: number; // Calculated field for ranking
  isWinner: boolean;
}

export type GameStatus = 'SETUP' | 'PLAYING' | 'FINISHED';
export type ViewMode = 'GAME' | 'GENERATOR' | 'PRINT';
export type DrawMode = 'AUTO' | 'MANUAL';

export interface GameState {
  status: GameStatus;
  drawnNumbers: number[];
  currentNumber: number | null;
  cards: BingoCard[];
}

export interface PastGameRecord {
  id: string;
  totalCards: number;
  drawnNumbers: number[];
  winners: { id: string; playerName: string }[];
  finishedAt: string;
}

export interface GameSessionSettings {
  status: GameStatus;
  drawMode: DrawMode;
  batchPrefix: string;
  batchQuantity: number;
  customLogo: string | null;
}

export interface FullGamePayload {
  dbEngine: 'postgres' | 'sqlite';
  session: GameSessionSettings;
  drawHistory: number[];
  cards: BingoCard[];
  pastGames: PastGameRecord[];
}

export const COLUMNS = ['B', 'I', 'N', 'G', 'O'];