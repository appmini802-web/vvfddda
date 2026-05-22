import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// ─── JSON Fallback DB ────────────────────────────────────────────────────────

const DB_FILE = path.join(process.cwd(), 'db.json');

interface DbData {
  users: Record<string, any>;
  withdrawals: Record<string, any>;
  global_settings: Record<string, any>;
}

function readDb(): DbData {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { users: {}, withdrawals: {}, global_settings: {} };
  }
}

function writeDb(data: DbData) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Adapter Interface ───────────────────────────────────────────────────────

export interface DbAdapter {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
  connect(): Promise<{
    query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
    release(): void;
    _begin?: () => void;
    _commit?: () => void;
    _rollback?: () => void;
  }>;
}

// ─── JSON Adapter ────────────────────────────────────────────────────────────

class JsonAdapter implements DbAdapter {
  async query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
    return this._execute(sql, params);
  }

  async connect() {
    let txData: DbData | null = null;

    return {
      query: async (sql: string, params: any[] = []) => {
        if (txData) {
          // در حالت transaction روی کپی کار می‌کنیم
          const result = this._executeOnData(txData, sql, params);
          return result;
        }
        return this._execute(sql, params);
      },
      release: () => {},
      _begin: () => { txData = readDb(); },
      _commit: () => { if (txData) { writeDb(txData); txData = null; } },
      _rollback: () => { txData = null; },
    };
  }

  private _execute(sql: string, params: any[] = []): { rows: any[] } {
    const data = readDb();
    const result = this._executeOnData(data, sql, params);
    writeDb(data);
    return result;
  }

  private _executeOnData(data: DbData, sql: string, params: any[] = []): { rows: any[] } {
    const s = sql.trim().toUpperCase();

    // SELECT 1 (health check)
    if (sql.trim() === 'SELECT 1') return { rows: [{ '?column?': 1 }] };

    // CREATE TABLE IF NOT EXISTS — ignore
    if (s.startsWith('CREATE TABLE')) return { rows: [] };

    // ── users ──────────────────────────────────────────────────────────────

    if (s.includes('FROM USERS') || s.includes('INTO USERS') || s.includes('UPDATE USERS') || s.includes('DELETE FROM USERS')) {

      // SELECT COUNT(*) FROM users
      if (s.startsWith('SELECT COUNT') && s.includes('FROM USERS')) {
        const count = Object.keys(data.users).length;
        return { rows: [{ count }] };
      }

      // SELECT COALESCE(SUM(balance)...) FROM users
      if (s.includes('SUM(BALANCE)')) {
        const total = Object.values(data.users).reduce((acc: number, u: any) => acc + (u.balance || 0), 0);
        return { rows: [{ total }] };
      }

      // SELECT * FROM users WHERE id = $1
      if (s.startsWith('SELECT') && s.includes('WHERE ID = $1')) {
        const id = String(params[0]);
        const user = data.users[id];
        return { rows: user ? [this._mapUser(user)] : [] };
      }

      // SELECT * FROM users ORDER BY updated_at
      if (s.startsWith('SELECT') && s.includes('FROM USERS')) {
        const rows = Object.values(data.users).map((u: any) => this._mapUser(u));
        rows.sort((a: any, b: any) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        return { rows };
      }

      // INSERT INTO users
      if (s.startsWith('INSERT INTO USERS')) {
        const [id, balance, tasks, referrerId, updatedAt] = params;
        const user = {
          id: String(id),
          balance: balance || 0,
          tasks_completed: tasks || [],
          referrals_count: 0,
          referrer_id: referrerId || null,
          updated_at: updatedAt,
        };
        data.users[String(id)] = user;
        return { rows: [this._mapUser(user)] };
      }

      // UPDATE users SET balance = balance + $1, referrals_count = referrals_count + 1 WHERE id = $2
      if (s.startsWith('UPDATE USERS') && s.includes('REFERRALS_COUNT')) {
        const [, updatedAt, id] = params;
        const u = data.users[String(id)];
        if (u) {
          u.balance = (u.balance || 0) + params[0];
          u.referrals_count = (u.referrals_count || 0) + 1;
          u.updated_at = updatedAt;
        }
        return { rows: u ? [this._mapUser(u)] : [] };
      }

      // UPDATE users SET balance = balance + $1 WHERE id = $2 (ad reward)
      if (s.startsWith('UPDATE USERS') && s.includes('BALANCE = BALANCE +') && !s.includes('TASKS')) {
        const rewardAmt = params[0];
        const updatedAt = params[1];
        const id = String(params[2]);
        const u = data.users[id];
        if (u) {
          u.balance = (u.balance || 0) + rewardAmt;
          u.updated_at = updatedAt;
          return { rows: [{ balance: u.balance }] };
        }
        return { rows: [] };
      }

      // UPDATE users SET balance = balance - $1 WHERE id = $2 (withdraw)
      if (s.startsWith('UPDATE USERS') && s.includes('BALANCE = BALANCE -')) {
        const [amount, updatedAt, id] = params;
        const u = data.users[String(id)];
        if (u) {
          u.balance = (u.balance || 0) - amount;
          u.updated_at = updatedAt;
        }
        return { rows: [] };
      }

      // UPDATE users SET balance = balance + $1 (refund on reject)
      if (s.startsWith('UPDATE USERS') && s.includes('BALANCE = BALANCE +') && params.length === 2) {
        const [amount, id] = params;
        const u = data.users[String(id)];
        if (u) u.balance = (u.balance || 0) + amount;
        return { rows: [] };
      }

      // UPDATE users SET balance = $1, tasks_completed = $2
      if (s.startsWith('UPDATE USERS') && s.includes('TASKS_COMPLETED')) {
        const [amount, tasks, updatedAt, id] = params;
        const u = data.users[String(id)];
        if (u) {
          u.balance = (u.balance || 0) + amount;
          u.tasks_completed = tasks;
          u.updated_at = updatedAt;
          return { rows: [{ balance: u.balance }] };
        }
        return { rows: [] };
      }

      // UPDATE users SET balance = $1 (admin update)
      if (s.startsWith('UPDATE USERS') && s.includes('BALANCE = $1')) {
        const [balance, updatedAt, id] = params;
        const u = data.users[String(id)];
        if (u) {
          u.balance = balance;
          u.updated_at = updatedAt;
          return { rows: [{ id: u.id }] };
        }
        return { rows: [] };
      }

      // SELECT balance FROM users WHERE id = $1 FOR UPDATE
      if (s.includes('FOR UPDATE') && s.includes('FROM USERS')) {
        const id = String(params[0]);
        const u = data.users[id];
        return { rows: u ? [{ balance: u.balance }] : [] };
      }

      // DELETE FROM users WHERE id = $1
      if (s.startsWith('DELETE FROM USERS')) {
        const id = String(params[0]);
        const existed = !!data.users[id];
        delete data.users[id];
        return { rows: existed ? [{ id }] : [] };
      }
    }

    // ── withdrawals ────────────────────────────────────────────────────────

    if (s.includes('WITHDRAWALS')) {

      // SELECT COUNT(*) FROM withdrawals WHERE status = $1
      if (s.startsWith('SELECT COUNT') && s.includes('WHERE STATUS')) {
        const status = params[0];
        const count = Object.values(data.withdrawals).filter((w: any) => w.status === status).length;
        return { rows: [{ count }] };
      }

      // SELECT * FROM withdrawals WHERE user_id = $1
      if (s.startsWith('SELECT') && s.includes('WHERE USER_ID')) {
        const uid = String(params[0]);
        const rows = Object.values(data.withdrawals)
          .filter((w: any) => w.user_id === uid)
          .sort((a: any, b: any) => b.timestamp - a.timestamp);
        return { rows };
      }

      // SELECT * FROM withdrawals WHERE id = $1
      if (s.startsWith('SELECT') && s.includes('WHERE ID = $1')) {
        const id = String(params[0]);
        const w = data.withdrawals[id];
        return { rows: w ? [w] : [] };
      }

      // SELECT * FROM withdrawals ORDER BY timestamp DESC
      if (s.startsWith('SELECT') && s.includes('FROM WITHDRAWALS')) {
        const rows = Object.values(data.withdrawals)
          .sort((a: any, b: any) => b.timestamp - a.timestamp);
        return { rows };
      }

      // INSERT INTO withdrawals
      if (s.startsWith('INSERT INTO WITHDRAWALS')) {
        const [id, userId, amount, address, method, status, timestamp] = params;
        data.withdrawals[String(id)] = { id, user_id: userId, amount, address, method, status, timestamp };
        return { rows: [] };
      }

      // UPDATE withdrawals SET status = $1 WHERE id = $2
      if (s.startsWith('UPDATE WITHDRAWALS')) {
        const [status, id] = params;
        const w = data.withdrawals[String(id)];
        if (w) w.status = status;
        return { rows: [] };
      }

      // DELETE FROM withdrawals WHERE user_id = $1
      if (s.startsWith('DELETE FROM WITHDRAWALS')) {
        const uid = String(params[0]);
        for (const key of Object.keys(data.withdrawals)) {
          if (data.withdrawals[key].user_id === uid) delete data.withdrawals[key];
        }
        return { rows: [] };
      }
    }

    // ── global_settings ────────────────────────────────────────────────────

    if (s.includes('GLOBAL_SETTINGS')) {

      // SELECT COUNT(*) FROM global_settings WHERE id = 1
      if (s.startsWith('SELECT COUNT')) {
        const count = Object.keys(data.global_settings).length;
        return { rows: [{ count }] };
      }

      // SELECT * FROM global_settings WHERE id = 1
      if (s.startsWith('SELECT')) {
        const setting = data.global_settings['1'];
        return { rows: setting ? [setting] : [] };
      }

      // INSERT INTO global_settings ... ON CONFLICT DO UPDATE
      if (s.startsWith('INSERT INTO GLOBAL_SETTINGS')) {
        const [id, exchangeRate, minWithdraw, dollarRate] = params;
        data.global_settings[String(id)] = { id, exchange_rate: exchangeRate, min_withdraw: minWithdraw, dollar_rate: dollarRate };
        return { rows: [data.global_settings[String(id)]] };
      }
    }

    console.warn('[JsonDB] Unhandled query:', sql.substring(0, 80));
    return { rows: [] };
  }

  private _mapUser(u: any) {
    return {
      id: u.id,
      balance: u.balance || 0,
      tasks_completed: u.tasks_completed || [],
      referrals_count: u.referrals_count || 0,
      referrer_id: u.referrer_id || null,
      updated_at: u.updated_at,
    };
  }
}

// ─── PostgreSQL Adapter ──────────────────────────────────────────────────────

class PgAdapter implements DbAdapter {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async query(sql: string, params?: any[]) {
    return this.pool.query(sql, params);
  }

  async connect() {
    const client = await this.pool.connect();
    return {
      query: (sql: string, params?: any[]) => client.query(sql, params),
      release: () => client.release(),
    };
  }
}

// ─── Export: try PG first, fallback to JSON ──────────────────────────────────

let _adapter: DbAdapter | null = null;

export async function getAdapter(): Promise<DbAdapter> {
  if (_adapter) return _adapter;

  // Render / Supabase: support both individual vars and DATABASE_URL
  const hasPg = process.env.PGHOST || process.env.DATABASE_URL;

  if (hasPg) {
    try {
      const pgPool = process.env.DATABASE_URL
        ? new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 5000,
          })
        : new Pool({
            host: process.env.PGHOST,
            port: parseInt(process.env.PGPORT || '5432', 10),
            database: process.env.PGDATABASE,
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            connectionTimeoutMillis: 5000,
          });

      await pgPool.query('SELECT 1');
      console.log('✅ Connected to PostgreSQL');
      _adapter = new PgAdapter(pgPool);
      return _adapter;
    } catch (err: any) {
      console.warn('⚠️  PostgreSQL unavailable:', err.message);
      console.log('🔄 Falling back to local JSON database...');
    }
  }

  console.log('📁 Using JSON file database (db.json)');
  _adapter = new JsonAdapter();
  return _adapter;
}

// backward compat — برای import مستقیم pool در server.ts
export default {
  query: async (sql: string, params?: any[]) => {
    const adapter = await getAdapter();
    return adapter.query(sql, params);
  },
  connect: async () => {
    const adapter = await getAdapter();
    return adapter.connect();
  },
};
