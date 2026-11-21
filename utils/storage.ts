import { BingoCard, GameStatus } from '../types';
import { updateCardStats } from './bingoLogic';

const STATE_STORAGE_KEY = 'bingo_master_state_v1';
const LOGO_STORAGE_KEY = 'bingo_master_logo_v1';

export type ViewMode = 'GAME' | 'GENERATOR' | 'PRINT';
export type DrawMode = 'AUTO' | 'MANUAL';

export interface PersistedBingoState {
  status: GameStatus;
  viewMode: ViewMode;
  drawHistory: number[];
  cards: BingoCard[];
  drawMode: DrawMode;
  batchPrefix: string;
  batchQuantity: number;
}

const DEFAULT_STATE: PersistedBingoState = {
  status: 'SETUP',
  viewMode: 'GENERATOR',
  drawHistory: [],
  cards: [],
  drawMode: 'AUTO',
  batchPrefix: 'Cartela',
  batchQuantity: 10,
};

const isValidCard = (card: unknown): card is BingoCard => {
  if (!card || typeof card !== 'object') return false;
  const c = card as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.playerName === 'string' &&
    Array.isArray(c.grid) &&
    c.grid.length === 5 &&
    c.grid.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 5 &&
        row.every(
          (cell) =>
            cell &&
            typeof cell === 'object' &&
            ((cell as Record<string, unknown>).number === 'FREE' ||
              typeof (cell as Record<string, unknown>).number === 'number')
        )
    )
  );
};

export const loadBingoState = (): PersistedBingoState => {
  try {
    const raw = window.localStorage.getItem(STATE_STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;

    const parsed = JSON.parse(raw) as Partial<PersistedBingoState>;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_STATE;

    const seen = new Set<number>();
    const drawHistory: number[] = [];
    if (Array.isArray(parsed.drawHistory)) {
      for (const item of parsed.drawHistory) {
        if (typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= 75 && !seen.has(item)) {
          seen.add(item);
          drawHistory.push(item);
        }
      }
    }

    const drawnSet = new Set<number>(drawHistory);

    const rawCards = Array.isArray(parsed.cards) ? parsed.cards.filter(isValidCard) : [];
    const cards = rawCards.map((card) =>
      drawnSet.size > 0
        ? updateCardStats(card, drawnSet)
        : {
            ...card,
            missingCount: 24,
            isWinner: false,
            grid: card.grid.map((row) =>
              row.map((cell) => ({
                ...cell,
                isMarked: cell.number === 'FREE',
              }))
            ),
          }
    );

    const status: GameStatus =
      drawHistory.length > 0
        ? 'PLAYING'
        : parsed.status === 'PLAYING' || parsed.status === 'FINISHED' || parsed.status === 'SETUP'
          ? parsed.status
          : 'SETUP';

    const viewMode: ViewMode =
      parsed.viewMode === 'GAME' || parsed.viewMode === 'GENERATOR' || parsed.viewMode === 'PRINT'
        ? parsed.viewMode
        : 'GENERATOR';

    const drawMode: DrawMode = parsed.drawMode === 'MANUAL' ? 'MANUAL' : 'AUTO';

    const batchPrefix = typeof parsed.batchPrefix === 'string' ? parsed.batchPrefix : 'Cartela';
    const batchQuantity =
      typeof parsed.batchQuantity === 'number' && Number.isFinite(parsed.batchQuantity)
        ? Math.max(1, Math.min(100, Math.round(parsed.batchQuantity)))
        : 10;

    return {
      status,
      viewMode,
      drawHistory,
      cards,
      drawMode,
      batchPrefix,
      batchQuantity,
    };
  } catch {
    return DEFAULT_STATE;
  }
};

export const saveBingoState = (state: PersistedBingoState): void => {
  try {
    window.localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Não foi possível salvar o estado do bingo no navegador:', error);
  }
};

export const loadCustomLogo = (): string | null => {
  try {
    const logo = window.localStorage.getItem(LOGO_STORAGE_KEY);
    return logo || null;
  } catch {
    return null;
  }
};

export const saveCustomLogo = (logo: string | null): void => {
  try {
    if (logo) {
      window.localStorage.setItem(LOGO_STORAGE_KEY, logo);
    } else {
      window.localStorage.removeItem(LOGO_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Não foi possível salvar a logo no navegador:', error);
  }
};
