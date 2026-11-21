import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import type {
  BingoCard,
  Cell,
  DrawMode,
  FullGamePayload,
  GameSessionSettings,
  GameStatus,
  PastGameRecord,
} from '../types.ts';
import { updateCardStats } from '../utils/bingoLogic.ts';

const { Pool } = pg;

const DEFAULT_SESSION_ID = 'default';

interface SessionRow {
  id: string;
  status: string;
  draw_mode: string;
  batch_prefix: string;
  batch_quantity: number;
  custom_logo: string | null;
  updated_at: string;
}

interface CardRow {
  id: string;
  player_name: string;
  grid_json: string;
  position: number;
}

interface DrawRow {
  number: number;
  draw_order: number;
}

interface HistoryRow {
  id: string;
  total_cards: number;
  drawn_numbers_json: string;
  winners_json: string;
  finished_at: string;
}

const normalizeSession = (row?: SessionRow | null): GameSessionSettings => ({
  status:
    row?.status === 'PLAYING' || row?.status === 'FINISHED' || row?.status === 'SETUP'
      ? row.status
      : 'SETUP',
  drawMode: row?.draw_mode === 'MANUAL' ? 'MANUAL' : 'AUTO',
  batchPrefix: row?.batch_prefix || 'Cartela',
  batchQuantity: typeof row?.batch_quantity === 'number' ? row.batch_quantity : 10,
  customLogo: row?.custom_logo ?? null,
});

const hydrateCards = (rows: CardRow[], drawHistory: number[]): BingoCard[] => {
  const drawnSet = new Set<number>(drawHistory);
  return rows.map((row) => {
    const grid = JSON.parse(row.grid_json) as Cell[][];
    const baseCard: BingoCard = {
      id: row.id,
      playerName: row.player_name,
      grid,
      missingCount: 24,
      isWinner: false,
    };
    return drawnSet.size > 0 ? updateCardStats(baseCard, drawnSet) : baseCard;
  });
};

export interface BingoDatabase {
  init(): Promise<void>;
  getEngine(): 'postgres' | 'sqlite';
  ping(): Promise<boolean>;
  getFullState(): Promise<FullGamePayload>;
  updateSettings(partial: Partial<GameSessionSettings>): Promise<GameSessionSettings>;
  addCards(cards: BingoCard[]): Promise<BingoCard[]>;
  deleteCard(cardId: string): Promise<boolean>;
  addDraw(num: number): Promise<{ drawHistory: number[]; status: GameStatus }>;
  undoLastDraw(): Promise<{ drawHistory: number[]; status: GameStatus }>;
  resetDraws(): Promise<void>;
  clearAllCardsAndDraws(): Promise<void>;
  clearPastGames(): Promise<void>;
}

class SqliteBingoDatabase implements BingoDatabase {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    const resolvedPath = path.resolve(dbPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    this.db = new DatabaseSync(resolvedPath);
  }

  getEngine(): 'sqlite' {
    return 'sqlite';
  }

  async init(): Promise<void> {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'SETUP',
        draw_mode TEXT NOT NULL DEFAULT 'AUTO',
        batch_prefix TEXT NOT NULL DEFAULT 'Cartela',
        batch_quantity INTEGER NOT NULL DEFAULT 10,
        custom_logo TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL DEFAULT 'default',
        player_name TEXT NOT NULL,
        grid_json TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cards_session_pos ON cards (session_id, position);

      CREATE TABLE IF NOT EXISTS drawn_numbers (
        session_id TEXT NOT NULL DEFAULT 'default',
        draw_order INTEGER NOT NULL,
        number INTEGER NOT NULL,
        drawn_at TEXT NOT NULL,
        PRIMARY KEY (session_id, number)
      );

      CREATE INDEX IF NOT EXISTS idx_drawn_order ON drawn_numbers (session_id, draw_order);

      CREATE TABLE IF NOT EXISTS game_history (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL DEFAULT 'default',
        total_cards INTEGER NOT NULL,
        drawn_numbers_json TEXT NOT NULL,
        winners_json TEXT NOT NULL,
        finished_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_history_finished ON game_history (session_id, finished_at DESC);
    `);

    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO game_sessions (id, status, draw_mode, batch_prefix, batch_quantity, custom_logo, updated_at)
         VALUES (?, 'SETUP', 'AUTO', 'Cartela', 10, NULL, ?)`
      )
      .run(DEFAULT_SESSION_ID, now);
  }

  async ping(): Promise<boolean> {
    this.db.prepare('SELECT 1').get();
    return true;
  }

  async getFullState(): Promise<FullGamePayload> {
    const sessionRow = this.db
      .prepare('SELECT id, status, draw_mode, batch_prefix, batch_quantity, custom_logo, updated_at FROM game_sessions WHERE id = ?')
      .get(DEFAULT_SESSION_ID) as unknown as SessionRow | undefined;

    const drawRows = this.db
      .prepare('SELECT number, draw_order FROM drawn_numbers WHERE session_id = ? ORDER BY draw_order ASC')
      .all(DEFAULT_SESSION_ID) as unknown as DrawRow[];

    const drawHistory = drawRows.map((r) => r.number);

    const cardRows = this.db
      .prepare('SELECT id, player_name, grid_json, position FROM cards WHERE session_id = ? ORDER BY position ASC, created_at ASC')
      .all(DEFAULT_SESSION_ID) as unknown as CardRow[];

    const cards = hydrateCards(cardRows, drawHistory);
    const session = normalizeSession(sessionRow);
    if (drawHistory.length > 0 && session.status === 'SETUP') {
      session.status = 'PLAYING';
    }

    const historyRows = this.db
      .prepare('SELECT id, total_cards, drawn_numbers_json, winners_json, finished_at FROM game_history WHERE session_id = ? ORDER BY finished_at DESC LIMIT 50')
      .all(DEFAULT_SESSION_ID) as unknown as HistoryRow[];

    const pastGames: PastGameRecord[] = historyRows.map((row) => ({
      id: row.id,
      totalCards: row.total_cards,
      drawnNumbers: JSON.parse(row.drawn_numbers_json) as number[],
      winners: JSON.parse(row.winners_json) as { id: string; playerName: string }[],
      finishedAt: row.finished_at,
    }));

    return {
      dbEngine: 'sqlite',
      session,
      drawHistory,
      cards,
      pastGames,
    };
  }

  async updateSettings(partial: Partial<GameSessionSettings>): Promise<GameSessionSettings> {
    const currentRow = this.db
      .prepare('SELECT id, status, draw_mode, batch_prefix, batch_quantity, custom_logo, updated_at FROM game_sessions WHERE id = ?')
      .get(DEFAULT_SESSION_ID) as unknown as SessionRow | undefined;
    const current = normalizeSession(currentRow);

    const next: GameSessionSettings = {
      status: partial.status ?? current.status,
      drawMode: partial.drawMode ?? current.drawMode,
      batchPrefix: partial.batchPrefix !== undefined ? partial.batchPrefix : current.batchPrefix,
      batchQuantity: partial.batchQuantity !== undefined ? partial.batchQuantity : current.batchQuantity,
      customLogo: partial.customLogo !== undefined ? partial.customLogo : current.customLogo,
    };

    this.db
      .prepare(
        `UPDATE game_sessions
         SET status = ?, draw_mode = ?, batch_prefix = ?, batch_quantity = ?, custom_logo = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        next.status,
        next.drawMode,
        next.batchPrefix,
        next.batchQuantity,
        next.customLogo,
        new Date().toISOString(),
        DEFAULT_SESSION_ID
      );

    return next;
  }

  async addCards(newCards: BingoCard[]): Promise<BingoCard[]> {
    if (newCards.length === 0) return [];

    const maxPosRow = this.db
      .prepare('SELECT COALESCE(MAX(position), 0) AS max_pos FROM cards WHERE session_id = ?')
      .get(DEFAULT_SESSION_ID) as { max_pos: number } | undefined;

    let pos = (maxPosRow?.max_pos ?? 0) + 1;
    const now = new Date().toISOString();

    const insertStmt = this.db.prepare(
      `INSERT INTO cards (id, session_id, player_name, grid_json, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    this.db.exec('BEGIN');
    try {
      for (const card of newCards) {
        insertStmt.run(
          card.id,
          DEFAULT_SESSION_ID,
          card.playerName,
          JSON.stringify(card.grid),
          pos++,
          now
        );
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    const drawRows = this.db
      .prepare('SELECT number, draw_order FROM drawn_numbers WHERE session_id = ? ORDER BY draw_order ASC')
      .all(DEFAULT_SESSION_ID) as unknown as DrawRow[];
    const drawnSet = new Set(drawRows.map((r) => r.number));

    return drawnSet.size > 0 ? newCards.map((c) => updateCardStats(c, drawnSet)) : newCards;
  }

  async deleteCard(cardId: string): Promise<boolean> {
    const result = this.db
      .prepare('DELETE FROM cards WHERE id = ? AND session_id = ?')
      .run(cardId, DEFAULT_SESSION_ID);
    return Number(result.changes) > 0;
  }

  async addDraw(num: number): Promise<{ drawHistory: number[]; status: GameStatus }> {
    const existing = this.db
      .prepare('SELECT number FROM drawn_numbers WHERE session_id = ? AND number = ?')
      .get(DEFAULT_SESSION_ID, num);
    if (existing) {
      const err = new Error('DUPLICATE_NUMBER');
      throw err;
    }

    const maxOrderRow = this.db
      .prepare('SELECT COALESCE(MAX(draw_order), 0) AS max_order FROM drawn_numbers WHERE session_id = ?')
      .get(DEFAULT_SESSION_ID) as { max_order: number } | undefined;

    const nextOrder = (maxOrderRow?.max_order ?? 0) + 1;
    const now = new Date().toISOString();

    this.db.exec('BEGIN');
    try {
      this.db
        .prepare('INSERT INTO drawn_numbers (session_id, draw_order, number, drawn_at) VALUES (?, ?, ?, ?)')
        .run(DEFAULT_SESSION_ID, nextOrder, num, now);

      this.db
        .prepare("UPDATE game_sessions SET status = 'PLAYING', updated_at = ? WHERE id = ?")
        .run(now, DEFAULT_SESSION_ID);

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    const drawRows = this.db
      .prepare('SELECT number, draw_order FROM drawn_numbers WHERE session_id = ? ORDER BY draw_order ASC')
      .all(DEFAULT_SESSION_ID) as unknown as DrawRow[];

    return {
      drawHistory: drawRows.map((r) => r.number),
      status: 'PLAYING',
    };
  }

  async undoLastDraw(): Promise<{ drawHistory: number[]; status: GameStatus }> {
    const lastRow = this.db
      .prepare('SELECT number FROM drawn_numbers WHERE session_id = ? ORDER BY draw_order DESC LIMIT 1')
      .get(DEFAULT_SESSION_ID) as { number: number } | undefined;

    if (lastRow) {
      this.db
        .prepare('DELETE FROM drawn_numbers WHERE session_id = ? AND number = ?')
        .run(DEFAULT_SESSION_ID, lastRow.number);
    }

    const drawRows = this.db
      .prepare('SELECT number, draw_order FROM drawn_numbers WHERE session_id = ? ORDER BY draw_order ASC')
      .all(DEFAULT_SESSION_ID) as unknown as DrawRow[];

    const nextStatus: GameStatus = drawRows.length === 0 ? 'SETUP' : 'PLAYING';
    this.db
      .prepare('UPDATE game_sessions SET status = ?, updated_at = ? WHERE id = ?')
      .run(nextStatus, new Date().toISOString(), DEFAULT_SESSION_ID);

    return {
      drawHistory: drawRows.map((r) => r.number),
      status: nextStatus,
    };
  }

  private archiveRoundIfDrawn(): void {
    const drawRows = this.db
      .prepare('SELECT number, draw_order FROM drawn_numbers WHERE session_id = ? ORDER BY draw_order ASC')
      .all(DEFAULT_SESSION_ID) as unknown as DrawRow[];
    if (drawRows.length === 0) return;

    const drawHistory = drawRows.map((r) => r.number);
    const cardRows = this.db
      .prepare('SELECT id, player_name, grid_json, position FROM cards WHERE session_id = ?')
      .all(DEFAULT_SESSION_ID) as unknown as CardRow[];

    const cards = hydrateCards(cardRows, drawHistory);
    const winners = cards
      .filter((c) => c.isWinner)
      .map((c) => ({ id: c.id, playerName: c.playerName }));

    this.db
      .prepare(
        `INSERT INTO game_history (id, session_id, total_cards, drawn_numbers_json, winners_json, finished_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        crypto.randomUUID(),
        DEFAULT_SESSION_ID,
        cards.length,
        JSON.stringify(drawHistory),
        JSON.stringify(winners),
        new Date().toISOString()
      );
  }

  async resetDraws(): Promise<void> {
    this.db.exec('BEGIN');
    try {
      this.archiveRoundIfDrawn();
      this.db.prepare('DELETE FROM drawn_numbers WHERE session_id = ?').run(DEFAULT_SESSION_ID);
      this.db
        .prepare("UPDATE game_sessions SET status = 'SETUP', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), DEFAULT_SESSION_ID);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async clearAllCardsAndDraws(): Promise<void> {
    this.db.exec('BEGIN');
    try {
      this.archiveRoundIfDrawn();
      this.db.prepare('DELETE FROM drawn_numbers WHERE session_id = ?').run(DEFAULT_SESSION_ID);
      this.db.prepare('DELETE FROM cards WHERE session_id = ?').run(DEFAULT_SESSION_ID);
      this.db
        .prepare("UPDATE game_sessions SET status = 'SETUP', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), DEFAULT_SESSION_ID);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async clearPastGames(): Promise<void> {
    this.db.prepare('DELETE FROM game_history WHERE session_id = ?').run(DEFAULT_SESSION_ID);
  }
}

class PostgresBingoDatabase implements BingoDatabase {
  private pool: pg.Pool;

  constructor(connectionString: string, useSsl: boolean) {
    this.pool = new Pool({
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
  }

  getEngine(): 'postgres' {
    return 'postgres';
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'SETUP',
        draw_mode TEXT NOT NULL DEFAULT 'AUTO',
        batch_prefix TEXT NOT NULL DEFAULT 'Cartela',
        batch_quantity INTEGER NOT NULL DEFAULT 10,
        custom_logo TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL DEFAULT 'default',
        player_name TEXT NOT NULL,
        grid_json TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cards_session_pos ON cards (session_id, position);

      CREATE TABLE IF NOT EXISTS drawn_numbers (
        session_id TEXT NOT NULL DEFAULT 'default',
        draw_order INTEGER NOT NULL,
        number INTEGER NOT NULL,
        drawn_at TEXT NOT NULL,
        PRIMARY KEY (session_id, number)
      );

      CREATE INDEX IF NOT EXISTS idx_drawn_order ON drawn_numbers (session_id, draw_order);

      CREATE TABLE IF NOT EXISTS game_history (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL DEFAULT 'default',
        total_cards INTEGER NOT NULL,
        drawn_numbers_json TEXT NOT NULL,
        winners_json TEXT NOT NULL,
        finished_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_history_finished ON game_history (session_id, finished_at DESC);
    `);

    await this.pool.query(
      `INSERT INTO game_sessions (id, status, draw_mode, batch_prefix, batch_quantity, custom_logo, updated_at)
       VALUES ($1, 'SETUP', 'AUTO', 'Cartela', 10, NULL, $2)
       ON CONFLICT (id) DO NOTHING`,
      [DEFAULT_SESSION_ID, new Date().toISOString()]
    );
  }

  async ping(): Promise<boolean> {
    await this.pool.query('SELECT 1');
    return true;
  }

  async getFullState(): Promise<FullGamePayload> {
    const sessionRes = await this.pool.query<SessionRow>(
      'SELECT id, status, draw_mode, batch_prefix, batch_quantity, custom_logo, updated_at FROM game_sessions WHERE id = $1',
      [DEFAULT_SESSION_ID]
    );
    const drawRes = await this.pool.query<DrawRow>(
      'SELECT number, draw_order FROM drawn_numbers WHERE session_id = $1 ORDER BY draw_order ASC',
      [DEFAULT_SESSION_ID]
    );
    const cardRes = await this.pool.query<CardRow>(
      'SELECT id, player_name, grid_json, position FROM cards WHERE session_id = $1 ORDER BY position ASC, created_at ASC',
      [DEFAULT_SESSION_ID]
    );
    const historyRes = await this.pool.query<HistoryRow>(
      'SELECT id, total_cards, drawn_numbers_json, winners_json, finished_at FROM game_history WHERE session_id = $1 ORDER BY finished_at DESC LIMIT 50',
      [DEFAULT_SESSION_ID]
    );

    const drawHistory = drawRes.rows.map((r) => r.number);
    const cards = hydrateCards(cardRes.rows, drawHistory);
    const session = normalizeSession(sessionRes.rows[0]);
    if (drawHistory.length > 0 && session.status === 'SETUP') {
      session.status = 'PLAYING';
    }

    const pastGames: PastGameRecord[] = historyRes.rows.map((row) => ({
      id: row.id,
      totalCards: row.total_cards,
      drawnNumbers: JSON.parse(row.drawn_numbers_json) as number[],
      winners: JSON.parse(row.winners_json) as { id: string; playerName: string }[],
      finishedAt: row.finished_at,
    }));

    return {
      dbEngine: 'postgres',
      session,
      drawHistory,
      cards,
      pastGames,
    };
  }

  async updateSettings(partial: Partial<GameSessionSettings>): Promise<GameSessionSettings> {
    const res = await this.pool.query<SessionRow>(
      'SELECT id, status, draw_mode, batch_prefix, batch_quantity, custom_logo, updated_at FROM game_sessions WHERE id = $1',
      [DEFAULT_SESSION_ID]
    );
    const current = normalizeSession(res.rows[0]);
    const next: GameSessionSettings = {
      status: partial.status ?? current.status,
      drawMode: (partial.drawMode ?? current.drawMode) as DrawMode,
      batchPrefix: partial.batchPrefix !== undefined ? partial.batchPrefix : current.batchPrefix,
      batchQuantity: partial.batchQuantity !== undefined ? partial.batchQuantity : current.batchQuantity,
      customLogo: partial.customLogo !== undefined ? partial.customLogo : current.customLogo,
    };

    await this.pool.query(
      `UPDATE game_sessions
       SET status = $1, draw_mode = $2, batch_prefix = $3, batch_quantity = $4, custom_logo = $5, updated_at = $6
       WHERE id = $7`,
      [
        next.status,
        next.drawMode,
        next.batchPrefix,
        next.batchQuantity,
        next.customLogo,
        new Date().toISOString(),
        DEFAULT_SESSION_ID,
      ]
    );

    return next;
  }

  async addCards(newCards: BingoCard[]): Promise<BingoCard[]> {
    if (newCards.length === 0) return [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const maxRes = await client.query<{ max_pos: number }>(
        'SELECT COALESCE(MAX(position), 0)::int AS max_pos FROM cards WHERE session_id = $1',
        [DEFAULT_SESSION_ID]
      );
      let pos = (maxRes.rows[0]?.max_pos ?? 0) + 1;
      const now = new Date().toISOString();

      for (const card of newCards) {
        await client.query(
          `INSERT INTO cards (id, session_id, player_name, grid_json, position, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [card.id, DEFAULT_SESSION_ID, card.playerName, JSON.stringify(card.grid), pos++, now]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const drawRes = await this.pool.query<DrawRow>(
      'SELECT number, draw_order FROM drawn_numbers WHERE session_id = $1 ORDER BY draw_order ASC',
      [DEFAULT_SESSION_ID]
    );
    const drawnSet = new Set(drawRes.rows.map((r) => r.number));
    return drawnSet.size > 0 ? newCards.map((c) => updateCardStats(c, drawnSet)) : newCards;
  }

  async deleteCard(cardId: string): Promise<boolean> {
    const res = await this.pool.query(
      'DELETE FROM cards WHERE id = $1 AND session_id = $2',
      [cardId, DEFAULT_SESSION_ID]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async addDraw(num: number): Promise<{ drawHistory: number[]; status: GameStatus }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT number FROM drawn_numbers WHERE session_id = $1 AND number = $2',
        [DEFAULT_SESSION_ID, num]
      );
      if (existing.rows.length > 0) {
        throw new Error('DUPLICATE_NUMBER');
      }

      const maxRes = await client.query<{ max_order: number }>(
        'SELECT COALESCE(MAX(draw_order), 0)::int AS max_order FROM drawn_numbers WHERE session_id = $1',
        [DEFAULT_SESSION_ID]
      );
      const nextOrder = (maxRes.rows[0]?.max_order ?? 0) + 1;
      const now = new Date().toISOString();

      await client.query(
        'INSERT INTO drawn_numbers (session_id, draw_order, number, drawn_at) VALUES ($1, $2, $3, $4)',
        [DEFAULT_SESSION_ID, nextOrder, num, now]
      );
      await client.query(
        "UPDATE game_sessions SET status = 'PLAYING', updated_at = $1 WHERE id = $2",
        [now, DEFAULT_SESSION_ID]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const drawRes = await this.pool.query<DrawRow>(
      'SELECT number, draw_order FROM drawn_numbers WHERE session_id = $1 ORDER BY draw_order ASC',
      [DEFAULT_SESSION_ID]
    );
    return {
      drawHistory: drawRes.rows.map((r) => r.number),
      status: 'PLAYING',
    };
  }

  async undoLastDraw(): Promise<{ drawHistory: number[]; status: GameStatus }> {
    const lastRes = await this.pool.query<{ number: number }>(
      'SELECT number FROM drawn_numbers WHERE session_id = $1 ORDER BY draw_order DESC LIMIT 1',
      [DEFAULT_SESSION_ID]
    );
    if (lastRes.rows[0]) {
      await this.pool.query(
        'DELETE FROM drawn_numbers WHERE session_id = $1 AND number = $2',
        [DEFAULT_SESSION_ID, lastRes.rows[0].number]
      );
    }

    const drawRes = await this.pool.query<DrawRow>(
      'SELECT number, draw_order FROM drawn_numbers WHERE session_id = $1 ORDER BY draw_order ASC',
      [DEFAULT_SESSION_ID]
    );
    const nextStatus: GameStatus = drawRes.rows.length === 0 ? 'SETUP' : 'PLAYING';
    await this.pool.query(
      'UPDATE game_sessions SET status = $1, updated_at = $2 WHERE id = $3',
      [nextStatus, new Date().toISOString(), DEFAULT_SESSION_ID]
    );

    return {
      drawHistory: drawRes.rows.map((r) => r.number),
      status: nextStatus,
    };
  }

  private async archiveRoundIfDrawn(client: pg.PoolClient): Promise<void> {
    const drawRes = await client.query<DrawRow>(
      'SELECT number, draw_order FROM drawn_numbers WHERE session_id = $1 ORDER BY draw_order ASC',
      [DEFAULT_SESSION_ID]
    );
    if (drawRes.rows.length === 0) return;

    const drawHistory = drawRes.rows.map((r) => r.number);
    const cardRes = await client.query<CardRow>(
      'SELECT id, player_name, grid_json, position FROM cards WHERE session_id = $1',
      [DEFAULT_SESSION_ID]
    );
    const cards = hydrateCards(cardRes.rows, drawHistory);
    const winners = cards
      .filter((c) => c.isWinner)
      .map((c) => ({ id: c.id, playerName: c.playerName }));

    await client.query(
      `INSERT INTO game_history (id, session_id, total_cards, drawn_numbers_json, winners_json, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        crypto.randomUUID(),
        DEFAULT_SESSION_ID,
        cards.length,
        JSON.stringify(drawHistory),
        JSON.stringify(winners),
        new Date().toISOString(),
      ]
    );
  }

  async resetDraws(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.archiveRoundIfDrawn(client);
      await client.query('DELETE FROM drawn_numbers WHERE session_id = $1', [DEFAULT_SESSION_ID]);
      await client.query(
        "UPDATE game_sessions SET status = 'SETUP', updated_at = $1 WHERE id = $2",
        [new Date().toISOString(), DEFAULT_SESSION_ID]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async clearAllCardsAndDraws(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.archiveRoundIfDrawn(client);
      await client.query('DELETE FROM drawn_numbers WHERE session_id = $1', [DEFAULT_SESSION_ID]);
      await client.query('DELETE FROM cards WHERE session_id = $1', [DEFAULT_SESSION_ID]);
      await client.query(
        "UPDATE game_sessions SET status = 'SETUP', updated_at = $1 WHERE id = $2",
        [new Date().toISOString(), DEFAULT_SESSION_ID]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async clearPastGames(): Promise<void> {
    await this.pool.query('DELETE FROM game_history WHERE session_id = $1', [DEFAULT_SESSION_ID]);
  }
}

export const createDatabase = async (): Promise<BingoDatabase> => {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const db: BingoDatabase = databaseUrl
    ? new PostgresBingoDatabase(databaseUrl, process.env.DATABASE_SSL === 'true')
    : new SqliteBingoDatabase(process.env.SQLITE_PATH?.trim() || './data/bingo.db');

  await db.init();
  return db;
};
