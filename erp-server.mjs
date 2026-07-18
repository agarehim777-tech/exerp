import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { initialState } from "../src/data.js";

const { Pool } = pg;

const port = Number(process.env.PORT || process.env.ERP_API_PORT || 8787);
const host = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const dbPath = resolve(process.env.ERP_DB_PATH || "data/erpaz.sqlite");
const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const allowedOrigins = String(process.env.ERP_CORS_ORIGIN || "http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const bootstrapPassword = process.env.ERP_BOOTSTRAP_PASSWORD || "";
const sessionHours = 12;
const serverStartedAt = Date.now();
const releaseVersion = process.env.VITE_RELEASE_VERSION || process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || "local";
const auditMode = "immutable-hash-chain";
const schemaVersion = 2;

function now() {
  return new Date().toISOString();
}

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  });
  res.end(JSON.stringify(payload));
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  const [salt, stored] = String(storedHash || "").split(":");
  if (!salt || !stored) return false;
  const computed = scryptSync(password, salt, 64);
  const expected = Buffer.from(stored, "hex");
  return expected.length === computed.length && timingSafeEqual(expected, computed);
}

function userPayload(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
}

function normalizeJsonValue(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function createSqliteStore() {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);

  function exec(sql) {
    db.exec(sql);
  }

  function tryExec(sql) {
    try {
      db.exec(sql);
    } catch {
      // Existing SQLite files may already have the column; keep init idempotent.
    }
  }

  return {
    provider: "SQLite",
    async init() {
      exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS app_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          json TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'Aktiv',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS audit_events (
          id TEXT PRIMARY KEY,
          happened_at TEXT NOT NULL,
          module TEXT NOT NULL,
          action TEXT NOT NULL,
          detail TEXT NOT NULL,
          status TEXT NOT NULL,
          role TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS backup_snapshots (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          created_by TEXT NOT NULL,
          reason TEXT NOT NULL,
          json TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          state_hash TEXT NOT NULL
        );
      `);
      for (const columnSql of [
        "ALTER TABLE audit_events ADD COLUMN user_id TEXT",
        "ALTER TABLE audit_events ADD COLUMN user_email TEXT",
        "ALTER TABLE audit_events ADD COLUMN request_ip TEXT",
        "ALTER TABLE audit_events ADD COLUMN metadata TEXT",
        "ALTER TABLE audit_events ADD COLUMN prev_hash TEXT",
        "ALTER TABLE audit_events ADD COLUMN entry_hash TEXT",
      ]) {
        tryExec(columnSql);
      }
    },
    async get(sql, params = []) {
      return db.prepare(sql).get(...params);
    },
    async all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    async run(sql, params = []) {
      return db.prepare(sql).run(...params);
    },
    async transaction(callback) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = await callback(this);
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function createPostgresStore() {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });

  function toPostgres(sql) {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
  }

  async function withClient(callback) {
    const client = await pool.connect();
    try {
      return await callback(client);
    } finally {
      client.release();
    }
  }

  return {
    provider: "Postgres",
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          json JSONB NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'Aktiv',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_events (
          id TEXT PRIMARY KEY,
          happened_at TEXT NOT NULL,
          module TEXT NOT NULL,
          action TEXT NOT NULL,
          detail TEXT NOT NULL,
          status TEXT NOT NULL,
          role TEXT NOT NULL,
          user_id TEXT,
          user_email TEXT,
          request_ip TEXT,
          metadata JSONB,
          prev_hash TEXT,
          entry_hash TEXT
        );
        CREATE TABLE IF NOT EXISTS backup_snapshots (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          created_by TEXT NOT NULL,
          reason TEXT NOT NULL,
          json JSONB NOT NULL,
          size_bytes INTEGER NOT NULL,
          state_hash TEXT NOT NULL
        );
      `);
      await pool.query(`
        ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS user_id TEXT;
        ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS user_email TEXT;
        ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS request_ip TEXT;
        ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS metadata JSONB;
        ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS prev_hash TEXT;
        ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS entry_hash TEXT;
      `);
    },
    async get(sql, params = []) {
      const result = await pool.query(toPostgres(sql), params);
      return result.rows[0] || null;
    },
    async all(sql, params = []) {
      const result = await pool.query(toPostgres(sql), params);
      return result.rows;
    },
    async run(sql, params = []) {
      return pool.query(toPostgres(sql), params);
    },
    async transaction(callback) {
      return withClient(async (client) => {
        await client.query("BEGIN");
        const trx = {
          get: async (sql, params = []) => {
            const result = await client.query(toPostgres(sql), params);
            return result.rows[0] || null;
          },
          all: async (sql, params = []) => {
            const result = await client.query(toPostgres(sql), params);
            return result.rows;
          },
          run: async (sql, params = []) => client.query(toPostgres(sql), params),
        };
        try {
          const result = await callback(trx);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    },
  };
}

const store = databaseUrl ? createPostgresStore() : createSqliteStore();

async function bootstrapAdmin() {
  const existing = await store.get("SELECT id FROM users LIMIT 1");
  if (existing || !bootstrapPassword) return;
  await store.run(
    "INSERT INTO users (id, name, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      "USR-ADMIN",
      process.env.ERP_BOOTSTRAP_NAME || "Administrator",
      process.env.ERP_BOOTSTRAP_EMAIL || "admin@local",
      hashPassword(bootstrapPassword),
      "Super Admin",
      "Aktiv",
      now(),
    ],
  );
}

async function getAuth(req) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = await store.get(
    `
      SELECT users.id, users.name, users.email, users.role, users.status, sessions.expires_at
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ?
    `,
    [tokenHash],
  );
  if (!row || row.status !== "Aktiv" || new Date(row.expires_at).getTime() <= Date.now()) {
    if (row) await store.run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
    return null;
  }
  return { token, user: userPayload(row) };
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) reject(new Error("Request size limit exceeded"));
    });
    req.on("end", () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON payload"));
      }
    });
    req.on("error", reject);
  });
}

function getRequestIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .split(",")[0]
    .trim();
}

function stateHash(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function auditHash({ prevHash = "", happenedAt, module, action, detail, status, role, userId = "", userEmail = "", requestIp = "", metadata = {} }) {
  return stateHash({
    prevHash,
    happenedAt,
    module,
    action,
    detail,
    status,
    role,
    userId,
    userEmail,
    requestIp,
    metadata,
  });
}

async function getLastAuditHash(trx = store) {
  const row = await trx.get("SELECT entry_hash FROM audit_events WHERE entry_hash IS NOT NULL ORDER BY happened_at DESC LIMIT 1");
  return row?.entry_hash || "";
}

async function insertAuditEvent(trx, entry, { auth = null, req = null, metadata = {} } = {}) {
  const happenedAt = entry.date || entry.happened_at || now();
  const module = entry.module || "Sistem";
  const action = entry.action || "Yenilənmə";
  const detail = entry.detail || "";
  const status = entry.status || "Tamamlandı";
  const role = entry.role || auth?.user?.role || "System";
  const userId = auth?.user?.id || "";
  const userEmail = auth?.user?.email || "";
  const requestIp = req ? getRequestIp(req) : "";
  const meta = {
    source: "server",
    ...metadata,
  };
  const prevHash = await getLastAuditHash(trx);
  const entryHash = auditHash({
    prevHash,
    happenedAt,
    module,
    action,
    detail,
    status,
    role,
    userId,
    userEmail,
    requestIp,
    metadata: meta,
  });

  await trx.run(
    `
      INSERT INTO audit_events (id, happened_at, module, action, detail, status, role, user_id, user_email, request_ip, metadata, prev_hash, entry_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `,
    [
      entry.id || `AUD-SRV-${Date.now()}-${randomBytes(3).toString("hex")}`,
      happenedAt,
      module,
      action,
      detail,
      status,
      role,
      userId,
      userEmail,
      requestIp,
      JSON.stringify(meta),
      prevHash,
      entryHash,
    ],
  );
  return entryHash;
}

async function writeServerAudit(entry, options = {}) {
  await store.transaction(async (trx) => insertAuditEvent(trx, entry, options));
}

function seedState() {
  const state = structuredClone(initialState);
  state.dbMeta = {
    provider: store.provider,
    runtime: "server",
    schemaVersion,
    version: schemaVersion,
    auditMode,
    lastWriteAt: now(),
  };
  return state;
}

async function getState() {
  const row = await store.get("SELECT json FROM app_state WHERE id = 1");
  return row ? normalizeJsonValue(row.json) : null;
}

async function saveState(state, auth = null, req = null) {
  const savedAt = now();
  const safeState = {
    ...state,
    dbMeta: {
      ...(state.dbMeta || {}),
      provider: store.provider,
      runtime: "server",
      schemaVersion,
      version: schemaVersion,
      auditMode,
      lastWriteAt: savedAt,
      lastWriteBy: auth?.user?.email || "system",
    },
  };

  await store.transaction(async (trx) => {
    await trx.run(
      `
        INSERT INTO app_state (id, json, version, updated_at) VALUES (1, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET json = excluded.json, version = app_state.version + 1, updated_at = excluded.updated_at
      `,
      [JSON.stringify(safeState), savedAt],
    );
    for (const entry of safeState.auditLog || []) {
      if (!entry?.id) continue;
      await insertAuditEvent(trx, entry, { auth, req, metadata: { origin: "client-state-sync" } });
    }
    await insertAuditEvent(
      trx,
      {
        id: `AUD-SAVE-${Date.now()}-${randomBytes(3).toString("hex")}`,
        date: savedAt,
        module: "Backend DB",
        action: "State yazılışı",
        detail: `Schema v${schemaVersion} · ${store.provider}`,
        status: "Tamamlandı",
        role: auth?.user?.role || "System",
      },
      { auth, req, metadata: { stateBytes: JSON.stringify(safeState).length } },
    );
  });

  return safeState;
}

async function getHealthSnapshot() {
  const [userRow, stateRow, auditRow, backupRow] = await Promise.all([
    store.get("SELECT id FROM users LIMIT 1"),
    store.get("SELECT version, updated_at FROM app_state WHERE id = 1"),
    store.get("SELECT COUNT(*) AS count FROM audit_events"),
    store.get("SELECT COUNT(*) AS count, MAX(created_at) AS last_backup_at FROM backup_snapshots"),
  ]);

  return {
    status: "ok",
    provider: store.provider,
    runtime: "server",
    schemaVersion,
    auditMode,
    releaseVersion,
    uptimeSeconds: Math.round((Date.now() - serverStartedAt) / 1000),
    hasBootstrapUser: Boolean(userRow),
    stateVersion: Number(stateRow?.version || 0),
    stateUpdatedAt: stateRow?.updated_at || "",
    auditEvents: Number(auditRow?.count || 0),
    backups: Number(backupRow?.count || 0),
    lastBackupAt: backupRow?.last_backup_at || "",
  };
}

async function createBackupSnapshot(auth, req, reason = "Manual backup") {
  const state = (await getState()) || seedState();
  const createdAt = now();
  const payload = JSON.stringify(state);
  const snapshot = {
    id: `BKP-${Date.now()}-${randomBytes(3).toString("hex")}`,
    createdAt,
    createdBy: auth.user.email,
    reason,
    sizeBytes: Buffer.byteLength(payload),
    stateHash: stateHash(payload),
  };

  await store.transaction(async (trx) => {
    await trx.run(
      "INSERT INTO backup_snapshots (id, created_at, created_by, reason, json, size_bytes, state_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [snapshot.id, snapshot.createdAt, snapshot.createdBy, snapshot.reason, payload, snapshot.sizeBytes, snapshot.stateHash],
    );
    await insertAuditEvent(
      trx,
      {
        id: `AUD-BKP-${Date.now()}-${randomBytes(3).toString("hex")}`,
        date: createdAt,
        module: "Backend Backup",
        action: "Server backup snapshot",
        detail: `${snapshot.id} · ${Math.round(snapshot.sizeBytes / 1024)} KB`,
        status: "Tamamlandı",
        role: auth.user.role,
      },
      { auth, req, metadata: { backupId: snapshot.id, stateHash: snapshot.stateHash } },
    );
  });

  return snapshot;
}

async function listBackupSnapshots() {
  const rows = await store.all(
    "SELECT id, created_at, created_by, reason, size_bytes, state_hash FROM backup_snapshots ORDER BY created_at DESC LIMIT 20",
  );
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    reason: row.reason,
    sizeBytes: Number(row.size_bytes || 0),
    stateHash: row.state_hash,
  }));
}

async function restoreBackupSnapshot(id, auth, req) {
  const row = await store.get("SELECT * FROM backup_snapshots WHERE id = ?", [id]);
  if (!row) return null;
  const state = normalizeJsonValue(row.json);
  const restoredAt = now();
  const safeState = {
    ...state,
    dbMeta: {
      ...(state.dbMeta || {}),
      provider: store.provider,
      runtime: "server",
      schemaVersion,
      version: schemaVersion,
      auditMode,
      lastRestoreAt: restoredAt,
      lastRestoreFile: id,
      lastRestoreBy: auth.user.email,
    },
  };

  await store.transaction(async (trx) => {
    await trx.run(
      `
        INSERT INTO app_state (id, json, version, updated_at) VALUES (1, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET json = excluded.json, version = app_state.version + 1, updated_at = excluded.updated_at
      `,
      [JSON.stringify(safeState), restoredAt],
    );
    await insertAuditEvent(
      trx,
      {
        id: `AUD-RST-${Date.now()}-${randomBytes(3).toString("hex")}`,
        date: restoredAt,
        module: "Backend Backup",
        action: "Server restore snapshot",
        detail: `${id} restore edildi`,
        status: "Tamamlandı",
        role: auth.user.role,
      },
      { auth, req, metadata: { backupId: id, stateHash: row.state_hash } },
    );
  });

  return safeState;
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  }
}

const server = createServer(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (req.method === "GET" && url.pathname === "/healthz") {
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end("ok");
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      json(res, 200, await getHealthSnapshot());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = await store.get("SELECT * FROM users WHERE lower(email) = lower(?)", [email]);
      if (!user || user.status !== "Aktiv" || !verifyPassword(password, user.password_hash)) {
        json(res, 401, { error: "Email ve ya parol yanlisdir." });
        return;
      }
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000).toISOString();
      await store.run(
        "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        [hashToken(token), user.id, expiresAt, now()],
      );
      json(res, 200, { token, expiresAt, user: userPayload(user) });
      return;
    }

    const auth = await getAuth(req);
    if (!auth) {
      json(res, 401, { error: "Sessiya teleb olunur." });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      await store.run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(auth.token)]);
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/session") {
      json(res, 200, { user: auth.user });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/ops/deployment") {
      const health = await getHealthSnapshot();
      json(res, 200, {
        ...health,
        corsOrigins: allowedOrigins,
        host,
        port,
        nodeVersion: process.version,
        backupMode: "server-snapshot",
        providerIntegrations: {
          sms: Boolean(process.env.SMS_PROVIDER_URL || process.env.SMS_API_KEY),
          email: Boolean(process.env.SMTP_URL || process.env.SMTP_HOST),
          payment: Boolean(process.env.PAYMENT_PROVIDER_URL || process.env.PAYMENT_API_KEY),
          webhookSecret: Boolean(process.env.ERP_WEBHOOK_SIGNING_SECRET),
        },
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      json(res, 200, { state: (await getState()) || seedState() });
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/state") {
      const body = await readBody(req);
      if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
        json(res, 400, { error: "State obyekt kimi gonderilmelidir." });
        return;
      }
      json(res, 200, { state: await saveState(body.state, auth, req) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/backups") {
      json(res, 200, { backups: await listBackupSnapshots() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/backups") {
      const body = await readBody(req);
      json(res, 201, { backup: await createBackupSnapshot(auth, req, String(body.reason || "Manual backup")) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/restore") {
      if (auth.user.role !== "Super Admin") {
        json(res, 403, { error: "Restore yalnız Super Admin üçün aktivdir." });
        return;
      }
      const body = await readBody(req);
      const restored = await restoreBackupSnapshot(String(body.backupId || ""), auth, req);
      if (!restored) {
        json(res, 404, { error: "Backup snapshot tapılmadı." });
        return;
      }
      json(res, 200, { state: restored });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/users") {
      if (auth.user.role !== "Super Admin") {
        json(res, 403, { error: "Bu emeliyyat yalniz Super Admin ucundur." });
        return;
      }
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!name || !email || password.length < 8) {
        json(res, 400, { error: "Ad, email ve en azi 8 simvoldan ibaret parol teleb olunur." });
        return;
      }
      const user = {
        id: `USR-${Date.now()}`,
        name,
        email,
        role: String(body.role || "Satis Meneceri"),
        status: "Aktiv",
      };
      try {
        await store.run(
          "INSERT INTO users (id, name, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [user.id, user.name, user.email, hashPassword(password), user.role, user.status, now()],
        );
      } catch {
        json(res, 409, { error: "Bu email artiq istifade olunur." });
        return;
      }
      json(res, 201, { user });
      return;
    }

    json(res, 404, { error: "Endpoint tapilmadi." });
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : "Sorgu emal olunmadi." });
  }
});

await store.init();
await bootstrapAdmin();

server.listen(port, host, () => {
  console.log(`ERP API ${store.provider} server is listening on http://${host}:${port}`);
});
