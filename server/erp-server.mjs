import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { initialState, navItems } from "../src/data.js";

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
const schemaVersion = 3;
const platformAdminRole = "Platform Super Admin";
const companyAdminRoles = new Set(["Super Admin", "Company Admin", "Şirkət Admini"]);
const tenantModuleIds = navItems.filter((item) => item.id !== "platform").map((item) => item.id);

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
  const companyModules = user.company_module_access
    ? normalizeJsonValue(user.company_module_access)
    : tenantModuleIds;
  return {
    id: user.id,
    companyId: user.company_id || null,
    companyName: user.company_name || null,
    companyModules: Array.isArray(companyModules) ? companyModules : tenantModuleIds,
    companyUserLimit: Number(user.company_user_limit || 0),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: Boolean(user.must_change_password),
  };
}

function isPlatformAdmin(user) {
  return user?.role === platformAdminRole;
}

function isCompanyAdmin(user) {
  return isPlatformAdmin(user) || companyAdminRoles.has(user?.role);
}

function normalizeCompanyModules(value) {
  const requested = Array.isArray(value) ? value : [];
  return [...new Set(["dashboard", ...requested.filter((id) => tenantModuleIds.includes(id))])];
}

function companyPayload(company) {
  return {
    ...company,
    module_access: normalizeCompanyModules(normalizeJsonValue(company.module_access || "[]")),
    user_limit: Number(company.user_limit || 1),
    user_count: Number(company.user_count || 0),
  };
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
        CREATE TABLE IF NOT EXISTS companies (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'Aktiv',
          plan TEXT NOT NULL DEFAULT 'Standart',
          module_access TEXT NOT NULL DEFAULT '[]',
          user_limit INTEGER NOT NULL DEFAULT 10,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tenant_states (
          company_id TEXT PRIMARY KEY,
          json TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
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
        "ALTER TABLE users ADD COLUMN company_id TEXT",
        "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE companies ADD COLUMN module_access TEXT NOT NULL DEFAULT '[]'",
        "ALTER TABLE companies ADD COLUMN user_limit INTEGER NOT NULL DEFAULT 10",
        "ALTER TABLE audit_events ADD COLUMN company_id TEXT",
        "ALTER TABLE backup_snapshots ADD COLUMN company_id TEXT",
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
        CREATE TABLE IF NOT EXISTS companies (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'Aktiv',
          plan TEXT NOT NULL DEFAULT 'Standart',
          module_access JSONB NOT NULL DEFAULT '[]'::jsonb,
          user_limit INTEGER NOT NULL DEFAULT 10,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tenant_states (
          company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
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
        ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS module_access JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS user_limit INTEGER NOT NULL DEFAULT 10;
        ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS company_id TEXT;
        ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS company_id TEXT;
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
  const platformAdmin = await store.get("SELECT id FROM users WHERE role = ? LIMIT 1", [platformAdminRole]);
  if (platformAdmin || !bootstrapPassword) return;
  const existing = await store.get("SELECT id FROM users LIMIT 1");
  const bootstrapEmail = existing
    ? process.env.ERP_PLATFORM_ADMIN_EMAIL || "platform@local"
    : process.env.ERP_BOOTSTRAP_EMAIL || "admin@local";
  const matchingUser = await store.get("SELECT id FROM users WHERE lower(email) = lower(?)", [bootstrapEmail]);
  if (matchingUser) {
    await store.run(
      "UPDATE users SET role = ?, company_id = NULL, password_hash = ?, must_change_password = ? WHERE id = ?",
      [platformAdminRole, hashPassword(bootstrapPassword), 0, matchingUser.id],
    );
    return;
  }
  await store.run(
    "INSERT INTO users (id, name, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      "USR-ADMIN",
      process.env.ERP_BOOTSTRAP_NAME || "Administrator",
      bootstrapEmail,
      hashPassword(bootstrapPassword),
      platformAdminRole,
      "Aktiv",
      now(),
    ],
  );
}

async function migrateLegacyTenant() {
  const legacyUser = await store.get("SELECT id FROM users WHERE company_id IS NULL LIMIT 1");
  const legacyState = await store.get("SELECT json, version, updated_at FROM app_state WHERE id = 1");
  if (!legacyUser && !legacyState) return;
  const companyId = "CMP-DEFAULT";
  const createdAt = now();
  await store.transaction(async (trx) => {
    await trx.run(
      `INSERT INTO companies (id, name, slug, status, plan, module_access, user_limit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [companyId, process.env.ERP_DEFAULT_COMPANY_NAME || "Əsas şirkət", "esas-sirket", "Aktiv", "Standart", JSON.stringify(tenantModuleIds), 100, createdAt],
    );
    const defaultCompany = await trx.get("SELECT module_access FROM companies WHERE id = ?", [companyId]);
    const defaultModules = defaultCompany?.module_access ? normalizeJsonValue(defaultCompany.module_access) : [];
    if (!Array.isArray(defaultModules) || defaultModules.length === 0) {
      await trx.run("UPDATE companies SET module_access = ?, user_limit = ? WHERE id = ?", [JSON.stringify(tenantModuleIds), 100, companyId]);
    }
    await trx.run("UPDATE users SET company_id = ? WHERE company_id IS NULL", [companyId]);
    if (legacyState) {
      await trx.run(
        `INSERT INTO tenant_states (company_id, json, version, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(company_id) DO NOTHING`,
        [companyId, JSON.stringify(normalizeJsonValue(legacyState.json)), Number(legacyState.version || 1), legacyState.updated_at || createdAt],
      );
    }
    await trx.run("UPDATE audit_events SET company_id = ? WHERE company_id IS NULL", [companyId]);
    await trx.run("UPDATE backup_snapshots SET company_id = ? WHERE company_id IS NULL", [companyId]);
  });
}

async function getAuth(req) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = await store.get(
    `
      SELECT users.id, users.company_id, companies.name AS company_name, companies.module_access AS company_module_access,
             companies.user_limit AS company_user_limit, users.name, users.email, users.role,
             users.status, users.must_change_password, sessions.expires_at
      FROM sessions JOIN users ON users.id = sessions.user_id
      LEFT JOIN companies ON companies.id = users.company_id
      WHERE sessions.token_hash = ?
    `,
    [tokenHash],
  );
  if (!row || row.status !== "Aktiv" || (row.company_id && !row.company_name) || new Date(row.expires_at).getTime() <= Date.now()) {
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

async function getLastAuditHash(trx = store, companyId = null) {
  const row = companyId
    ? await trx.get("SELECT entry_hash FROM audit_events WHERE company_id = ? AND entry_hash IS NOT NULL ORDER BY happened_at DESC LIMIT 1", [companyId])
    : await trx.get("SELECT entry_hash FROM audit_events WHERE company_id IS NULL AND entry_hash IS NOT NULL ORDER BY happened_at DESC LIMIT 1");
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
  const companyId = auth?.user?.companyId || null;
  const requestIp = req ? getRequestIp(req) : "";
  const meta = {
    source: "server",
    ...metadata,
  };
  const prevHash = await getLastAuditHash(trx, companyId);
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
      INSERT INTO audit_events (id, company_id, happened_at, module, action, detail, status, role, user_id, user_email, request_ip, metadata, prev_hash, entry_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `,
    [
      entry.id || `AUD-SRV-${Date.now()}-${randomBytes(3).toString("hex")}`,
      companyId,
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

function seedTenantState() {
  const state = seedState();
  state.settings = {
    ...(state.settings || {}),
    users: [],
    sessionUserId: null,
  };
  return state;
}

async function getState(companyId) {
  if (!companyId) return null;
  const row = await store.get("SELECT json FROM tenant_states WHERE company_id = ?", [companyId]);
  return row ? normalizeJsonValue(row.json) : null;
}

async function saveState(state, auth = null, req = null) {
  const companyId = auth?.user?.companyId;
  if (!companyId) throw new Error("Şirkət konteksti tələb olunur.");
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
        INSERT INTO tenant_states (company_id, json, version, updated_at) VALUES (?, ?, 1, ?)
        ON CONFLICT(company_id) DO UPDATE SET json = excluded.json, version = tenant_states.version + 1, updated_at = excluded.updated_at
      `,
      [companyId, JSON.stringify(safeState), savedAt],
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
    store.get("SELECT MAX(version) AS version, MAX(updated_at) AS updated_at FROM tenant_states"),
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
  const companyId = auth.user.companyId;
  if (!companyId) throw new Error("Backup üçün şirkət konteksti tələb olunur.");
  const state = (await getState(companyId)) || seedTenantState();
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
      "INSERT INTO backup_snapshots (id, company_id, created_at, created_by, reason, json, size_bytes, state_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [snapshot.id, companyId, snapshot.createdAt, snapshot.createdBy, snapshot.reason, payload, snapshot.sizeBytes, snapshot.stateHash],
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

async function listBackupSnapshots(companyId) {
  const rows = await store.all(
    "SELECT id, created_at, created_by, reason, size_bytes, state_hash FROM backup_snapshots WHERE company_id = ? ORDER BY created_at DESC LIMIT 20",
    [companyId],
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
  const companyId = auth.user.companyId;
  const row = await store.get("SELECT * FROM backup_snapshots WHERE id = ? AND company_id = ?", [id, companyId]);
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
        INSERT INTO tenant_states (company_id, json, version, updated_at) VALUES (?, ?, 1, ?)
        ON CONFLICT(company_id) DO UPDATE SET json = excluded.json, version = tenant_states.version + 1, updated_at = excluded.updated_at
      `,
      [companyId, JSON.stringify(safeState), restoredAt],
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
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
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
      const user = await store.get(
        `SELECT users.*, companies.name AS company_name, companies.status AS company_status,
                companies.module_access AS company_module_access, companies.user_limit AS company_user_limit
         FROM users LEFT JOIN companies ON companies.id = users.company_id
         WHERE lower(users.email) = lower(?)`,
        [email],
      );
      if (!user || user.status !== "Aktiv" || (user.company_id && user.company_status !== "Aktiv") || !verifyPassword(password, user.password_hash)) {
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

    if (req.method === "POST" && url.pathname === "/api/auth/change-password") {
      const body = await readBody(req);
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");
      const user = await store.get("SELECT password_hash FROM users WHERE id = ?", [auth.user.id]);
      if (!user || !verifyPassword(currentPassword, user.password_hash)) {
        json(res, 401, { error: "Cari parol yanlışdır." });
        return;
      }
      if (newPassword.length < 8) {
        json(res, 400, { error: "Yeni parol ən azı 8 simvol olmalıdır." });
        return;
      }
      await store.run("UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?", [hashPassword(newPassword), 0, auth.user.id]);
      await store.run("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", [auth.user.id, hashToken(auth.token)]);
      json(res, 200, { ok: true });
      return;
    }

    if (auth.user.mustChangePassword) {
      json(res, 403, { error: "İlk girişdə parol dəyişdirilməlidir.", code: "PASSWORD_CHANGE_REQUIRED" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/companies") {
      if (!isPlatformAdmin(auth.user)) {
        json(res, 403, { error: "Şirkət siyahısı yalnız Platform Super Admin üçündür." });
        return;
      }
      const companies = await store.all(
        `SELECT companies.id, companies.name, companies.slug, companies.status, companies.plan,
                companies.module_access, companies.user_limit, companies.created_at,
                COUNT(users.id) AS user_count
         FROM companies LEFT JOIN users ON users.company_id = companies.id
         GROUP BY companies.id, companies.name, companies.slug, companies.status, companies.plan,
                  companies.module_access, companies.user_limit, companies.created_at
         ORDER BY companies.created_at DESC`,
      );
      json(res, 200, { companies: companies.map(companyPayload), availableModules: navItems.filter((item) => item.id !== "platform") });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/companies") {
      if (!isPlatformAdmin(auth.user)) {
        json(res, 403, { error: "Şirkət yaratmaq yalnız Platform Super Admin üçündür." });
        return;
      }
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      const slug = String(body.slug || name).trim().toLowerCase().replace(/[^a-z0-9əöüğçş]+/gi, "-").replace(/^-|-$/g, "");
      const adminName = String(body.adminName || "").trim();
      const adminEmail = String(body.adminEmail || "").trim().toLowerCase();
      const adminPassword = String(body.adminPassword || "");
      const moduleAccess = normalizeCompanyModules(body.moduleAccess);
      const userLimit = Math.max(1, Math.min(10000, Number(body.userLimit || 10)));
      if (!name || !slug || !adminName || !adminEmail || adminPassword.length < 8) {
        json(res, 400, { error: "Şirkət adı, admin adı/email-i və ən azı 8 simvolluq ilkin parol tələb olunur." });
        return;
      }
      const company = { id: `CMP-${Date.now()}`, name, slug, status: "Aktiv", plan: String(body.plan || "Standart"), module_access: moduleAccess, user_limit: userLimit };
      const admin = { id: `USR-${Date.now()}-${randomBytes(2).toString("hex")}`, name: adminName, email: adminEmail, role: "Super Admin", status: "Aktiv" };
      try {
        await store.transaction(async (trx) => {
          await trx.run("INSERT INTO companies (id, name, slug, status, plan, module_access, user_limit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [company.id, company.name, company.slug, company.status, company.plan, JSON.stringify(company.module_access), company.user_limit, now()]);
          await trx.run(
            "INSERT INTO users (id, company_id, name, email, password_hash, role, status, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [admin.id, company.id, admin.name, admin.email, hashPassword(adminPassword), admin.role, admin.status, 1, now()],
          );
          await trx.run("INSERT INTO tenant_states (company_id, json, version, updated_at) VALUES (?, ?, 1, ?)", [company.id, JSON.stringify(seedTenantState()), now()]);
        });
      } catch {
        json(res, 409, { error: "Şirkət slug-u və ya admin email-i artıq istifadə olunur." });
        return;
      }
      json(res, 201, { company, admin: { ...admin, companyId: company.id, companyName: company.name, mustChangePassword: true } });
      return;
    }

    const companyRoute = url.pathname.match(/^\/api\/companies\/([^/]+)$/);
    if (companyRoute && req.method === "PATCH") {
      if (!isPlatformAdmin(auth.user)) {
        json(res, 403, { error: "Şirkət düzəlişi yalnız Platform Super Admin üçündür." });
        return;
      }
      const companyId = decodeURIComponent(companyRoute[1]);
      const current = await store.get("SELECT * FROM companies WHERE id = ?", [companyId]);
      if (!current) {
        json(res, 404, { error: "Şirkət tapılmadı." });
        return;
      }
      const body = await readBody(req);
      const name = String(body.name ?? current.name).trim();
      const slug = String(body.slug ?? current.slug).trim().toLowerCase().replace(/[^a-z0-9əöüğçş]+/gi, "-").replace(/^-|-$/g, "");
      const plan = String(body.plan ?? current.plan).trim() || "Standart";
      const status = ["Aktiv", "Dondurulub", "Silinib"].includes(body.status) ? body.status : current.status;
      const moduleAccess = body.moduleAccess === undefined
        ? normalizeCompanyModules(normalizeJsonValue(current.module_access || "[]"))
        : normalizeCompanyModules(body.moduleAccess);
      const userLimit = Math.max(1, Math.min(10000, Number(body.userLimit ?? current.user_limit ?? 10)));
      if (!name || !slug || (companyId === "CMP-DEFAULT" && status !== "Aktiv")) {
        json(res, 400, { error: companyId === "CMP-DEFAULT" ? "Əsas şirkət dondurula və silinə bilməz." : "Şirkət adı və slug tələb olunur." });
        return;
      }
      try {
        await store.run(
          "UPDATE companies SET name = ?, slug = ?, plan = ?, status = ?, module_access = ?, user_limit = ? WHERE id = ?",
          [name, slug, plan, status, JSON.stringify(moduleAccess), userLimit, companyId],
        );
      } catch {
        json(res, 409, { error: "Bu slug artıq istifadə olunur." });
        return;
      }
      if (status !== "Aktiv") {
        await store.run("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)", [companyId]);
      }
      json(res, 200, { company: companyPayload({ ...current, id: companyId, name, slug, plan, status, module_access: moduleAccess, user_limit: userLimit }) });
      return;
    }

    if (companyRoute && req.method === "DELETE") {
      if (!isPlatformAdmin(auth.user)) {
        json(res, 403, { error: "Şirkət silmək yalnız Platform Super Admin üçündür." });
        return;
      }
      const companyId = decodeURIComponent(companyRoute[1]);
      if (companyId === "CMP-DEFAULT") {
        json(res, 400, { error: "Əsas şirkət silinə bilməz." });
        return;
      }
      const current = await store.get("SELECT * FROM companies WHERE id = ?", [companyId]);
      if (!current) {
        json(res, 404, { error: "Şirkət tapılmadı." });
        return;
      }
      await store.transaction(async (trx) => {
        await trx.run("UPDATE companies SET status = ? WHERE id = ?", ["Silinib", companyId]);
        await trx.run("UPDATE users SET status = ? WHERE company_id = ?", ["Passiv", companyId]);
        await trx.run("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)", [companyId]);
      });
      json(res, 200, { ok: true, archived: true });
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
      if (!auth.user.companyId) {
        json(res, 403, { error: "Platform administratorunun şirkət state-inə birbaşa girişi yoxdur." });
        return;
      }
      json(res, 200, { state: (await getState(auth.user.companyId)) || seedTenantState() });
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
      json(res, 200, { backups: await listBackupSnapshots(auth.user.companyId) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/backups") {
      const body = await readBody(req);
      json(res, 201, { backup: await createBackupSnapshot(auth, req, String(body.reason || "Manual backup")) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/restore") {
      if (!isCompanyAdmin(auth.user) || !auth.user.companyId) {
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
      if (!isCompanyAdmin(auth.user) || !auth.user.companyId) {
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
      const userCountRow = await store.get("SELECT COUNT(*) AS count FROM users WHERE company_id = ? AND status <> ?", [auth.user.companyId, "Silinib"]);
      const userLimit = Math.max(1, Number(auth.user.companyUserLimit || 1));
      if (Number(userCountRow?.count || 0) >= userLimit) {
        json(res, 409, { error: `Şirkətin ${userLimit} istifadəçi limiti dolub.` });
        return;
      }
      const requestedModuleAccess = Array.isArray(body.moduleAccess) ? body.moduleAccess : auth.user.companyModules;
      const moduleAccess = requestedModuleAccess.filter((moduleId) => auth.user.companyModules.includes(moduleId));
      const user = {
        id: `USR-${Date.now()}`,
        name,
        email,
        role: String(body.role || "Satis Meneceri") === platformAdminRole ? "Satis Meneceri" : String(body.role || "Satis Meneceri"),
        status: "Aktiv",
        moduleAccess,
      };
      try {
        await store.run(
          "INSERT INTO users (id, company_id, name, email, password_hash, role, status, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [user.id, auth.user.companyId, user.name, user.email, hashPassword(password), user.role, user.status, 1, now()],
        );
      } catch {
        json(res, 409, { error: "Bu email artiq istifade olunur." });
        return;
      }
      json(res, 201, { user: { ...user, companyId: auth.user.companyId, companyName: auth.user.companyName, mustChangePassword: true } });
      return;
    }

    json(res, 404, { error: "Endpoint tapilmadi." });
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : "Sorgu emal olunmadi." });
  }
});

await store.init();
await bootstrapAdmin();
await migrateLegacyTenant();

server.listen(port, host, () => {
  console.log(`ERP API ${store.provider} server is listening on http://${host}:${port}`);
});
