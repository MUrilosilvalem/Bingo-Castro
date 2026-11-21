import type {
  BingoCard,
  FullGamePayload,
  GameSessionSettings,
  GameStatus,
} from '../types';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = 'Erro na comunicação com o servidor.';
    try {
      const errBody = (await response.json()) as { error?: string };
      if (errBody?.error) message = errBody.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const api = {
  getGame: () => requestJson<FullGamePayload>('/api/game'),

  updateSettings: (patch: Partial<GameSessionSettings>) =>
    requestJson<{ session: GameSessionSettings }>('/api/game/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  addCard: (card: BingoCard) =>
    requestJson<{ cards: BingoCard[] }>('/api/cards', {
      method: 'POST',
      body: JSON.stringify(card),
    }),

  addCardsBatch: (cards: BingoCard[]) =>
    requestJson<{ cards: BingoCard[] }>('/api/cards', {
      method: 'POST',
      body: JSON.stringify({ cards }),
    }),

  deleteCard: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/cards/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  clearAll: () =>
    requestJson<FullGamePayload>('/api/cards', {
      method: 'DELETE',
    }),

  addDraw: (number: number) =>
    requestJson<{ drawHistory: number[]; status: GameStatus }>('/api/draws', {
      method: 'POST',
      body: JSON.stringify({ number }),
    }),

  undoLastDraw: () =>
    requestJson<{ drawHistory: number[]; status: GameStatus }>('/api/draws/last', {
      method: 'DELETE',
    }),

  resetDraws: () =>
    requestJson<FullGamePayload>('/api/draws/reset', {
      method: 'POST',
    }),

  clearPastGames: () =>
    requestJson<{ ok: boolean }>('/api/history', {
      method: 'DELETE',
    }),
};
