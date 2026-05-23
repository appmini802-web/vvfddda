import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import crypto from "crypto";
import pool, { getAdapter } from "./src/db";

dotenv.config();

// ─── Telegram initData validation ────────────────────────────────────────────
function validateTelegramInitData(initData: string, botToken: string): boolean {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return false;
    params.delete("hash");

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    return expectedHash === hash;
  } catch {
    return false;
  }
}

// ─── Helper: wraps client for both PG and JSON adapter ───────────────────────
async function getClient() {
  const adapter = await getAdapter();
  const client = await adapter.connect() as any;
  return {
    query: client.query.bind(client),
    release: client.release.bind(client),
    begin: async () => {
      if (client._begin) client._begin();
      else await client.query("BEGIN");
    },
    commit: async () => {
      if (client._commit) client._commit();
      else await client.query("COMMIT");
    },
    rollback: async () => {
      if (client._rollback) client._rollback();
      else await client.query("ROLLBACK");
    },
  };
}

// ─── ثابت‌های اقتصادی ─────────────────────────────────────────────────────────
// این مقادیر باید با درآمد واقعی Adsgram تنظیم شوند
const REWARDS = {
  AD_WATCH: 50,          // پاداش تماشای ویدیو (Reward block)
  TASK_ADSGRAM: 150,     // پاداش Task block ادزگرام
  REFERRAL_SIGNUP: 200,  // پاداش ثبت‌نام از طریق لینک دعوت
  REFERRAL_PERCENT: 0.10, // ۱۰٪ از هر درآمد referral به معرف می‌رسد
} as const;

// نرخ تبدیل پیش‌فرض: هر 5000 سکه = 1 TON
// با MAX_DAILY_ADS=20 و AD_WATCH=50: حداکثر 1000 سکه/روز = 0.2 TON/روز
// حداقل برداشت 5000 سکه = 1 TON (حدود 5 دلار)
const DEFAULT_SETTINGS = {
  EXCHANGE_RATE: 5000,
  MIN_WITHDRAW: 5000,
  DOLLAR_RATE: 5.0,
};

if (!process.env.ADMIN_PASSWORD) {
  console.error("ADMIN_PASSWORD is not set in .env. The server cannot start without an admin password.");
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
app.use(express.json());

app.post("/api/user", async (req, res) => {
  const { id: userId, referrerId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing user id" });

  try {
    const existing = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (existing.rows.length > 0) {
      const u = existing.rows[0];
      return res.json({
        balance: u.balance,
        tasksCompleted: u.tasks_completed || [],
        referralsCount: u.referrals_count || 0,
      });
    }

    // کاربر جدید — داخل transaction ثبت می‌شود
    const client = await getClient();
    try {
      await client.begin();

      // بررسی وجود referrer قبل از اعطای پاداش
      if (referrerId && referrerId !== userId) {
        const referrerExists = await client.query("SELECT id FROM users WHERE id = $1", [referrerId]);
        if (referrerExists.rows.length > 0) {
          await client.query(
            "UPDATE users SET balance = balance + $1, referrals_count = referrals_count + 1, updated_at = $2 WHERE id = $3",
            [REWARDS.REFERRAL_SIGNUP, new Date().toISOString(), referrerId]
          );
        }
      }

      const result = await client.query(
        "INSERT INTO users (id, balance, tasks_completed, referrer_id, updated_at) VALUES ($1, 0, $2, $3, $4) RETURNING *",
        [userId, [], (referrerId && referrerId !== userId) ? referrerId : null, new Date().toISOString()]
      );
      await client.commit();

      const u = result.rows[0];
      res.json({
        balance: u.balance,
        tasksCompleted: u.tasks_completed || [],
        referralsCount: u.referrals_count || 0,
      });
    } catch (err) {
      await client.rollback();
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/user/:id", async (req, res) => {
  const userId = req.params.id;
  try {
    let result = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (result.rows.length === 0) {
      result = await pool.query(
        "INSERT INTO users (id, balance, tasks_completed, updated_at) VALUES ($1, 0, $2, $3) RETURNING *",
        [userId, [], new Date().toISOString()]
      );
    }
    const u = result.rows[0];
    res.json({
      balance: u.balance,
      tasksCompleted: u.tasks_completed || [],
      referralsCount: u.referrals_count || 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// ─── Adsgram Reward URL Webhook ──────────────────────────────────────────────
// این endpoint را در داشبورد Adsgram در فیلد "Reward URL" وارد کنید:
// https://your-app.onrender.com/api/adsgram/reward?userId=[userId]
// سرور Adsgram وقتی کاربر task را انجام داد، GET به این آدرس می‌زند
// و [userId] را با Telegram ID کاربر جایگزین می‌کند
app.get("/api/adsgram/reward", async (req, res) => {
  const userId = req.query.userId as string;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  const TASK_ID = "adsgram_task_webhook";

  try {
    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (userResult.rows.length === 0) {
      // کاربر وجود ندارد — ثبت می‌کنیم
      await pool.query(
        "INSERT INTO users (id, balance, tasks_completed, updated_at) VALUES ($1, 0, $2, $3)",
        [userId, [], new Date().toISOString()]
      );
      return res.status(200).json({ ok: true });
    }

    const user = userResult.rows[0];
    const tasksCompleted: string[] = user.tasks_completed || [];

    // جلوگیری از دریافت پاداش تکراری
    if (tasksCompleted.includes(TASK_ID)) {
      return res.status(200).json({ ok: true, message: "already rewarded" });
    }

    tasksCompleted.push(TASK_ID);
    await pool.query(
      "UPDATE users SET balance = balance + $1, tasks_completed = $2, updated_at = $3 WHERE id = $4",
      [REWARDS.TASK_ADSGRAM, tasksCompleted, new Date().toISOString(), userId]
    );

    // ۱۰٪ به معرف
    const referrerId = user.referrer_id;
    if (referrerId) {
      const bonus = Math.floor(REWARDS.TASK_ADSGRAM * REWARDS.REFERRAL_PERCENT);
      if (bonus > 0) {
        await pool.query(
          "UPDATE users SET balance = balance + $1, updated_at = $2 WHERE id = $3",
          [bonus, new Date().toISOString(), referrerId]
        );
      }
    }

    // Adsgram انتظار پاسخ 200 دارد
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Adsgram reward webhook error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/reward/ad", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const rewardAmount = REWARDS.AD_WATCH;

    const result = await pool.query(
      "UPDATE users SET balance = balance + $1, updated_at = $2 WHERE id = $3 RETURNING balance, referrer_id",
      [rewardAmount, new Date().toISOString(), userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // ۱۰٪ پاداش به معرف
    const referrerId = result.rows[0].referrer_id;
    if (referrerId) {
      const referralBonus = Math.floor(rewardAmount * REWARDS.REFERRAL_PERCENT);
      if (referralBonus > 0) {
        await pool.query(
          "UPDATE users SET balance = balance + $1, updated_at = $2 WHERE id = $3",
          [referralBonus, new Date().toISOString(), referrerId]
        );
      }
    }

    res.json({ success: true, balance: result.rows[0].balance });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/adsgram-tasks", async (req, res) => {
  const adsgramTasks: any[] = [];
  res.json({ success: true, tasks: adsgramTasks });
});

app.post("/api/reward/task", async (req, res) => {
  const { userId, taskId } = req.body;

  if (!userId || !taskId) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  // مقدار پاداش task سرور-ساید تعیین می‌شود
  const TASK_REWARDS: Record<string, number> = {
    'adsgram_task_1': 300,
    'adsgram_task_2': 400,
    'adsgram_task_3': 500,
  };
  // Task block ادزگرام
  const taskReward = taskId.startsWith('adsgram_task_block_')
    ? REWARDS.TASK_ADSGRAM
    : (TASK_REWARDS[taskId] ?? 200);

  try {
    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];
    const tasksCompleted = user.tasks_completed || [];
    if (tasksCompleted.includes(taskId)) {
      return res.status(400).json({ error: "Task already completed" });
    }

    tasksCompleted.push(taskId);
    const updated = await pool.query(
      "UPDATE users SET balance = balance + $1, tasks_completed = $2, updated_at = $3 WHERE id = $4 RETURNING balance",
      [taskReward, tasksCompleted, new Date().toISOString(), userId]
    );

    // ۱۰٪ پاداش به معرف
    const referrerId = user.referrer_id;
    if (referrerId) {
      const referralBonus = Math.floor(taskReward * REWARDS.REFERRAL_PERCENT);
      if (referralBonus > 0) {
        await pool.query(
          "UPDATE users SET balance = balance + $1, updated_at = $2 WHERE id = $3",
          [referralBonus, new Date().toISOString(), referrerId]
        );
      }
    }

    res.json({ success: true, balance: updated.rows[0].balance });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/settings", async (req, res) => {
  try {
    let result = await pool.query("SELECT * FROM global_settings WHERE id = 1");
    if (result.rows.length === 0) {
      result = await pool.query(
        "INSERT INTO global_settings (id, exchange_rate, min_withdraw, dollar_rate) VALUES (1, $1, $2, $3) RETURNING *",
        [DEFAULT_SETTINGS.EXCHANGE_RATE, DEFAULT_SETTINGS.MIN_WITHDRAW, DEFAULT_SETTINGS.DOLLAR_RATE]
      );
    }
    const s = result.rows[0];
    res.json({
      success: true,
      settings: {
        exchangeRate: s.exchange_rate,
        minWithdraw: s.min_withdraw,
        dollarRate: s.dollar_rate,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// Admin auth
let activeAdminToken: string | null = null;
let activeAdminLastSeen: number = 0;
const ADMIN_SESSION_TIMEOUT = 1000 * 60 * 15;

function checkAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token as string) || req.body.token;
  if (!activeAdminToken || token !== activeAdminToken || Date.now() - activeAdminLastSeen > ADMIN_SESSION_TIMEOUT) {
    if (activeAdminToken && Date.now() - activeAdminLastSeen > ADMIN_SESSION_TIMEOUT) {
      activeAdminToken = null;
    }
    return res.status(401).json({ error: "Unauthorized" });
  }
  activeAdminLastSeen = Date.now();
  next();
}

app.post("/api/admin/login", async (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (password === adminPassword) {
    const now = Date.now();
    const token = crypto.randomBytes(32).toString("hex");
    activeAdminToken = token;
    activeAdminLastSeen = now;
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: "رمز عبور اشتباه است" });
  }
});

app.post("/api/admin/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.body.token;
  if (token === activeAdminToken) {
    activeAdminToken = null;
    activeAdminLastSeen = 0;
  }
  res.json({ success: true });
});

app.get("/api/withdrawals/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const result = await pool.query(
      "SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY timestamp DESC",
      [userId]
    );
    const mapped = result.rows.map((w) => ({
      id: w.id,
      userId: w.user_id,
      amount: w.amount,
      address: w.address,
      method: w.method,
      status: w.status,
      timestamp: Number(w.timestamp),
    }));
    res.json({ success: true, withdrawals: mapped });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/withdraw", async (req, res) => {
  const { userId, amount, address, method } = req.body;
  if (!userId || !amount || !address || !method) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const client = await getClient();
  try {
    await client.begin();

    const userResult = await client.query("SELECT balance FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (userResult.rows.length === 0) {
      await client.rollback();
      return res.status(400).json({ error: "User not found" });
    }

    const userBalance = userResult.rows[0].balance;
    if (userBalance < amount) {
      await client.rollback();
      return res.status(400).json({ error: "Insufficient balance" });
    }

    await client.query(
      "UPDATE users SET balance = balance - $1, updated_at = $2 WHERE id = $3",
      [amount, new Date().toISOString(), userId]
    );

    const wId = Date.now().toString();
    const ts = Date.now();
    await client.query(
      "INSERT INTO withdrawals (id, user_id, amount, address, method, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [wId, userId, amount, address, method, "pending", ts]
    );

    await client.commit();
    const newBalance = userBalance - amount;
    const withdrawal = {
      id: wId,
      userId,
      amount,
      address,
      method,
      status: "pending",
      timestamp: ts,
    };
    res.json({ success: true, balance: newBalance, withdrawal });
  } catch (err) {
    await client.rollback();
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

// --- Admin endpoints ---

app.get("/api/admin/withdrawals", checkAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM withdrawals ORDER BY timestamp DESC");
    const mapped = result.rows.map((w) => ({
      id: w.id,
      userId: w.user_id,
      amount: w.amount,
      address: w.address,
      method: w.method,
      status: w.status,
      timestamp: Number(w.timestamp),
    }));
    res.json({ success: true, withdrawals: mapped });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/admin/withdraw/status", checkAdmin, async (req, res) => {
  const { id, status } = req.body;

  const client = await getClient();
  try {
    await client.begin();

    const itemResult = await client.query("SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE", [id]);
    if (itemResult.rows.length === 0) {
      await client.rollback();
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    const item = itemResult.rows[0];
    if (item.status !== "pending") {
      await client.rollback();
      return res.status(400).json({ error: "Already processed" });
    }

    await client.query("UPDATE withdrawals SET status = $1 WHERE id = $2", [status, id]);

    if (status === "rejected") {
      await client.query(
        "UPDATE users SET balance = balance + $1 WHERE id = $2",
        [item.amount, item.user_id]
      );
    }

    await client.commit();
    res.json({
      success: true,
      withdrawal: { ...item, status },
    });
  } catch (err) {
    await client.rollback();
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

app.get("/api/admin/users", checkAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users ORDER BY updated_at DESC NULLS LAST");
    const mapped = result.rows.map((u) => ({
      id: u.id,
      balance: u.balance,
      tasksCompleted: u.tasks_completed || [],
      referralsCount: u.referrals_count || 0,
      referrerId: u.referrer_id,
      updatedAt: u.updated_at,
    }));
    res.json({ success: true, users: mapped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/admin/stats", checkAdmin, async (req, res) => {
  try {
    const totalUsersResult = await pool.query("SELECT COUNT(*)::int as count FROM users");
    const pendingResult = await pool.query("SELECT COUNT(*)::int as count FROM withdrawals WHERE status = 'pending'");
    const approvedResult = await pool.query("SELECT COUNT(*)::int as count FROM withdrawals WHERE status = 'approved'");
    const rejectedResult = await pool.query("SELECT COUNT(*)::int as count FROM withdrawals WHERE status = 'rejected'");
    const balanceResult = await pool.query("SELECT COALESCE(SUM(balance), 0)::bigint as total FROM users");

    res.json({
      success: true,
      stats: {
        totalUsers: totalUsersResult.rows[0].count,
        pendingWithdrawals: pendingResult.rows[0].count,
        approvedWithdrawals: approvedResult.rows[0].count,
        rejectedWithdrawals: rejectedResult.rows[0].count,
        totalBalance: Number(balanceResult.rows[0].total),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/admin/user/update", checkAdmin, async (req, res) => {
  const { userId, balance } = req.body;
  if (!userId || balance === undefined) {
    return res.status(400).json({ error: "Missing parameters" });
  }
  try {
    const result = await pool.query(
      "UPDATE users SET balance = $1, updated_at = $2 WHERE id = $3 RETURNING id",
      [balance, new Date().toISOString(), userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/admin/user/delete", checkAdmin, async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }
  try {
    await pool.query("DELETE FROM withdrawals WHERE user_id = $1", [userId]);
    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/admin/settings", checkAdmin, async (req, res) => {
  const { settings } = req.body;
  try {
    await pool.query(
      `INSERT INTO global_settings (id, exchange_rate, min_withdraw, dollar_rate)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET exchange_rate = $1, min_withdraw = $2, dollar_rate = $3`,
      [settings.exchangeRate, settings.minWithdraw, settings.dollarRate]
    );
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

async function startServer() {
  // Initialize DB adapter (PostgreSQL or JSON fallback) — باید اول از همه اجرا شود
  await getAdapter();

  const db = await getAdapter();

  try {
    await db.query("SELECT 1");
    console.log("✅ Database ready");

    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        balance INTEGER DEFAULT 0,
        tasks_completed TEXT[] DEFAULT '{}',
        referrals_count INTEGER DEFAULT 0,
        referrer_id TEXT DEFAULT NULL,
        updated_at TEXT
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        address TEXT NOT NULL,
        method TEXT NOT NULL,
        status TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        created_at TEXT
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS global_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        exchange_rate INTEGER NOT NULL,
        min_withdraw INTEGER NOT NULL,
        dollar_rate REAL NOT NULL
      )
    `);

    const settingsExist = await db.query("SELECT COUNT(*)::int as count FROM global_settings WHERE id = 1");
    if (settingsExist.rows[0].count === 0) {
      await db.query(
        "INSERT INTO global_settings (id, exchange_rate, min_withdraw, dollar_rate) VALUES (1, $1, $2, $3)",
        [DEFAULT_SETTINGS.EXCHANGE_RATE, DEFAULT_SETTINGS.MIN_WITHDRAW, DEFAULT_SETTINGS.DOLLAR_RATE]
      );
      console.log("Default settings seeded");
    }
  } catch (err) {
    console.error("Failed to connect to database:", err);
    process.exit(1);
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
