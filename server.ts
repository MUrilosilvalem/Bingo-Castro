import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createDatabase } from './server/db.ts';
import { generateCard } from './utils/bingoLogic.ts';
import type { BingoCard, Cell, DrawMode, GameSessionSettings } from './types.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const SAFE_LOGO_DATA_URL_RE = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_LOGO_LENGTH = 2_500_000;

const isValidGrid = (grid: unknown): grid is Cell[][] => {
  if (!Array.isArray(grid) || grid.length !== 5) return false;
  return grid.every(
    (row) =>
      Array.isArray(row) &&
      row.length === 5 &&
      row.every((cell) => {
        if (!cell || typeof cell !== 'object') return false;
        const c = cell as Record<string, unknown>;
        if (c.number === 'FREE') return true;
        return typeof c.number === 'number' && Number.isInteger(c.number) && c.number >= 1 && c.number <= 75;
      })
  );
};

const sanitizeCardInput = (raw: unknown): BingoCard | null => {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.playerName !== 'string') return null;
  const playerName = c.playerName.trim().slice(0, 80);
  if (!playerName) return null;

  if (isValidGrid(c.grid) && typeof c.id === 'string' && /^[A-Za-z0-9_-]{3,40}$/.test(c.id)) {
    return {
      id: c.id,
      playerName,
      grid: c.grid,
      missingCount: 24,
      isWinner: false,
    };
  }

  return generateCard(playerName);
};

async function startServer() {
  const db = await createDatabase();
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '3mb' }));

  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      await db.ping();
      res.json({ ok: true, db: db.getEngine() });
    } catch {
      res.status(503).json({ ok: false, error: 'Database unavailable' });
    }
  });

  app.get('/api/game', async (_req: Request, res: Response) => {
    try {
      const payload = await db.getFullState();
      res.json(payload);
    } catch (err) {
      console.error('Failed to load game state:', err);
      res.status(500).json({ error: 'Erro ao carregar dados do banco.' });
    }
  });

  app.put('/api/game/settings', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: Partial<GameSessionSettings> = {};

      if (body.drawMode !== undefined) {
        if (body.drawMode !== 'AUTO' && body.drawMode !== 'MANUAL') {
          res.status(400).json({ error: 'Modo de sorteio inválido.' });
          return;
        }
        patch.drawMode = body.drawMode as DrawMode;
      }

      if (body.batchPrefix !== undefined) {
        if (typeof body.batchPrefix !== 'string') {
          res.status(400).json({ error: 'Prefixo inválido.' });
          return;
        }
        patch.batchPrefix = body.batchPrefix.trim().slice(0, 40) || 'Cartela';
      }

      if (body.batchQuantity !== undefined) {
        const qty = Number(body.batchQuantity);
        if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
          res.status(400).json({ error: 'Quantidade deve estar entre 1 e 100.' });
          return;
        }
        patch.batchQuantity = qty;
      }

      if (body.customLogo !== undefined) {
        if (body.customLogo === null) {
          patch.customLogo = null;
        } else if (
          typeof body.customLogo === 'string' &&
          body.customLogo.length <= MAX_LOGO_LENGTH &&
          SAFE_LOGO_DATA_URL_RE.test(body.customLogo)
        ) {
          patch.customLogo = body.customLogo;
        } else {
          res.status(400).json({ error: 'Formato ou tamanho de imagem inválido.' });
          return;
        }
      }

      const session = await db.updateSettings(patch);
      res.json({ session });
    } catch (err) {
      console.error('Failed to update settings:', err);
      res.status(500).json({ error: 'Erro ao atualizar configurações.' });
    }
  });

  app.post('/api/cards', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;

      if (Array.isArray(body.cards)) {
        if (body.cards.length === 0 || body.cards.length > 100) {
          res.status(400).json({ error: 'Envie entre 1 e 100 cartelas por vez.' });
          return;
        }
        const validCards: BingoCard[] = [];
        for (const item of body.cards) {
          const card = sanitizeCardInput(item);
          if (!card) {
            res.status(400).json({ error: 'Dados de cartela inválidos.' });
            return;
          }
          validCards.push(card);
        }
        const saved = await db.addCards(validCards);
        res.status(201).json({ cards: saved });
        return;
      }

      const single = sanitizeCardInput(body);
      if (!single) {
        res.status(400).json({ error: 'Nome do jogador é obrigatório.' });
        return;
      }
      const saved = await db.addCards([single]);
      res.status(201).json({ cards: saved });
    } catch (err) {
      console.error('Failed to add cards:', err);
      res.status(500).json({ error: 'Erro ao salvar cartela(s).' });
    }
  });

  app.delete('/api/cards/:id', async (req: Request, res: Response) => {
    try {
      const cardId = String(req.params.id || '').trim();
      if (!/^[A-Za-z0-9_-]{1,60}$/.test(cardId)) {
        res.status(400).json({ error: 'ID de cartela inválido.' });
        return;
      }
      const deleted = await db.deleteCard(cardId);
      if (!deleted) {
        res.status(404).json({ error: 'Cartela não encontrada.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('Failed to delete card:', err);
      res.status(500).json({ error: 'Erro ao excluir cartela.' });
    }
  });

  app.delete('/api/cards', async (_req: Request, res: Response) => {
    try {
      await db.clearAllCardsAndDraws();
      const payload = await db.getFullState();
      res.json(payload);
    } catch (err) {
      console.error('Failed to clear game:', err);
      res.status(500).json({ error: 'Erro ao limpar jogo.' });
    }
  });

  app.post('/api/draws', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const num = Number(body.number);
      if (!Number.isInteger(num) || num < 1 || num > 75) {
        res.status(400).json({ error: 'Número deve ser um inteiro entre 1 e 75.' });
        return;
      }

      const result = await db.addDraw(num);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error && err.message === 'DUPLICATE_NUMBER') {
        res.status(409).json({ error: 'Número já sorteado!' });
        return;
      }
      console.error('Failed to save draw:', err);
      res.status(500).json({ error: 'Erro ao registrar número sorteado.' });
    }
  });

  app.delete('/api/draws/last', async (_req: Request, res: Response) => {
    try {
      const result = await db.undoLastDraw();
      res.json(result);
    } catch (err) {
      console.error('Failed to undo last draw:', err);
      res.status(500).json({ error: 'Erro ao desfazer último sorteio.' });
    }
  });

  app.post('/api/draws/reset', async (_req: Request, res: Response) => {
    try {
      await db.resetDraws();
      const payload = await db.getFullState();
      res.json(payload);
    } catch (err) {
      console.error('Failed to reset draws:', err);
      res.status(500).json({ error: 'Erro ao reiniciar sorteio.' });
    }
  });

  app.delete('/api/history', async (_req: Request, res: Response) => {
    try {
      await db.clearPastGames();
      res.json({ ok: true });
    } catch (err) {
      console.error('Failed to clear history:', err);
      res.status(500).json({ error: 'Erro ao limpar histórico de partidas.' });
    }
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint não encontrado.' });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve('dist');
    const indexHtml = path.join(distDir, 'index.html');
    app.use(express.static(distDir));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || !fs.existsSync(indexHtml)) {
        next();
        return;
      }
      res.sendFile(indexHtml);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bingo server running on http://0.0.0.0:${PORT} (db: ${db.getEngine()}, prod: ${IS_PROD})`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
