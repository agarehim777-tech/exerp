/**
 * Blob (tenant_states) ↔ real cədvəllər barışdırması (reconciliation).
 *
 * Bütün funksiyalar saf (pure) — şəbəkə çağırışı etmir, yalnız verilən massivləri müqayisə edir.
 * Məqsəd: blob-dan DB-yə miqrasiya zamanı hansı qeydlərin uyğunsuz olduğunu görmək.
 */

const norm = (v) => String(v ?? '').trim().toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const SEVERITY = { ok: 'ok', warn: 'warn', error: 'error' };

/** Blob-un warehouseStock obyektini düz (flat) sətir massivinə çevirir. */
export function flattenBlobStock(warehouseStock = {}) {
  return Object.entries(warehouseStock || {}).flatMap(([warehouseId, rows]) =>
    (rows || []).map((row) => ({ ...row, warehouseId })),
  );
}

/** Blob-dakı serial/IMEI qeydlərini düz massivə çevirir. */
export function flattenBlobSerials(warehouseStock = {}) {
  return flattenBlobStock(warehouseStock).flatMap((row) =>
    (row.serials || [])
      .filter((s) => s && (s.imei || s.serial))
      .map((s) => ({
        key: norm(s.imei || s.serial),
        imei: s.imei || s.serial,
        status: s.status || 'Anbarda',
        product: row.product || '',
        warehouseId: row.warehouseId,
      })),
  );
}

/** Blob-dakı serial statusunu DB `inventory_units.status` dəyərinə uyğunlaşdırır. */
export function mapBlobSerialStatus(status) {
  const s = norm(status);
  if (s.includes('rezerv')) return 'reserved';
  if (s.includes('satıl') || s.includes('satil')) return 'sold';
  if (s.includes('karantin')) return 'quarantine';
  if (s.includes('təhvil') || s.includes('tehvil')) return 'issued';
  if (s.includes('silin')) return 'written_off';
  return 'available';
}

/**
 * Serial/IMEI barışdırması.
 * @param {{ warehouseStock?: object, units?: Array }} input
 */
export function reconcileSerials({ warehouseStock = {}, units = [] } = {}) {
  const blob = flattenBlobSerials(warehouseStock);
  const blobByKey = new Map(blob.map((b) => [b.key, b]));
  const dbByKey = new Map();
  (units || []).forEach((u) => {
    const key = norm(u.imei || u.serial_no);
    if (key) dbByKey.set(key, u);
  });

  const issues = [];

  blobByKey.forEach((b, key) => {
    const db = dbByKey.get(key);
    if (!db) {
      issues.push({ kind: 'missing_in_db', key, imei: b.imei, blobStatus: b.status, dbStatus: null, severity: SEVERITY.error });
      return;
    }
    const expected = mapBlobSerialStatus(b.status);
    if (expected !== db.status) {
      issues.push({ kind: 'status_mismatch', key, imei: b.imei, blobStatus: b.status, dbStatus: db.status, expected, severity: SEVERITY.warn });
    }
  });

  dbByKey.forEach((u, key) => {
    if (!blobByKey.has(key)) {
      issues.push({ kind: 'missing_in_blob', key, imei: u.imei || u.serial_no, blobStatus: null, dbStatus: u.status, severity: SEVERITY.warn });
    }
  });

  return {
    blobCount: blobByKey.size,
    dbCount: dbByKey.size,
    matched: blobByKey.size - issues.filter((i) => i.kind === 'missing_in_db').length,
    issues,
  };
}

/**
 * Rezerv barışdırması: blob-dakı `reserved` sayı ↔ `inventory_units` içindəki reserved status sayı.
 * Məhsul adı ilə uyğunlaşdırma üçün `productNameById` xəritəsi verilir.
 */
export function reconcileReservations({ warehouseStock = {}, units = [], productNameById = {} } = {}) {
  const blobRows = flattenBlobStock(warehouseStock);
  const blobByProduct = new Map();
  blobRows.forEach((row) => {
    const key = norm(row.product);
    if (!key) return;
    const cur = blobByProduct.get(key) || { product: row.product, reserved: 0, total: 0 };
    cur.reserved += num(row.reserved);
    cur.total += num(row.total);
    blobByProduct.set(key, cur);
  });

  const dbByProduct = new Map();
  (units || []).forEach((u) => {
    const name = productNameById[u.product_id] || u.product_id;
    const key = norm(name);
    const cur = dbByProduct.get(key) || { product: name, reserved: 0, total: 0 };
    cur.total += num(u.quantity);
    if (u.status === 'reserved') cur.reserved += num(u.quantity);
    dbByProduct.set(key, cur);
  });

  const keys = new Set([...blobByProduct.keys(), ...dbByProduct.keys()]);
  const rows = [...keys].map((key) => {
    const b = blobByProduct.get(key);
    const d = dbByProduct.get(key);
    const blobReserved = b ? b.reserved : 0;
    const dbReserved = d ? d.reserved : 0;
    const diff = Number((dbReserved - blobReserved).toFixed(3));
    return {
      product: (b && b.product) || (d && d.product) || key,
      blobReserved,
      dbReserved,
      diff,
      severity: diff === 0 ? SEVERITY.ok : Math.abs(diff) > 1 ? SEVERITY.error : SEVERITY.warn,
    };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  return {
    rows,
    mismatchCount: rows.filter((r) => r.diff !== 0).length,
    totalBlobReserved: rows.reduce((s, r) => s + r.blobReserved, 0),
    totalDbReserved: rows.reduce((s, r) => s + r.dbReserved, 0),
  };
}

/**
 * İstehsal planları ↔ `workflow_records` (module = production) barışdırması.
 */
export function reconcileProduction({ productionPlans = [], workflowRecords = [] } = {}) {
  const blobByKey = new Map(
    (productionPlans || [])
      .filter(Boolean)
      .map((p) => [norm(p.id || p.code || p.name), p]),
  );
  const dbByKey = new Map(
    (workflowRecords || [])
      .filter((r) => !r.module || norm(r.module) === 'production')
      .map((r) => [norm(r.record_no || r.title), r]),
  );

  const issues = [];
  blobByKey.forEach((p, key) => {
    const db = dbByKey.get(key);
    if (!db) {
      issues.push({ kind: 'missing_in_db', key, name: p.name || p.id, blobStatus: p.status || '—', dbStatus: null, severity: SEVERITY.error });
      return;
    }
    if (p.status && norm(p.status) !== norm(db.status)) {
      issues.push({ kind: 'status_mismatch', key, name: p.name || p.id, blobStatus: p.status, dbStatus: db.status, severity: SEVERITY.warn });
    }
  });
  dbByKey.forEach((r, key) => {
    if (!blobByKey.has(key)) {
      issues.push({ kind: 'missing_in_blob', key, name: r.title || r.record_no, blobStatus: null, dbStatus: r.status, severity: SEVERITY.warn });
    }
  });

  return { blobCount: blobByKey.size, dbCount: dbByKey.size, issues };
}

/**
 * Bildiriş qaydaları ↔ `notification_deliveries` barışdırması.
 * Aktiv qayda üçün heç bir göndəriş qeydi yoxdursa — qayda hələ serverə köçməyib.
 */
export function reconcileNotificationRules({ notificationRules = [], deliveries = [], sendLog = [] } = {}) {
  const deliveryByTemplate = new Map();
  (deliveries || []).forEach((d) => {
    const key = norm(d.template_code || d.metadata?.rule_id);
    if (!key) return;
    const cur = deliveryByTemplate.get(key) || { count: 0, failed: 0, lastAt: null };
    cur.count += 1;
    if (d.status === 'failed') cur.failed += 1;
    const at = d.sent_at || d.scheduled_at || d.created_at || null;
    if (at && (!cur.lastAt || at > cur.lastAt)) cur.lastAt = at;
    deliveryByTemplate.set(key, cur);
  });

  const blobLogByRule = new Map();
  (sendLog || []).forEach((entry) => {
    const key = norm(entry.ruleId || entry.rule_id || entry.id);
    if (!key) return;
    blobLogByRule.set(key, (blobLogByRule.get(key) || 0) + 1);
  });

  const rows = (notificationRules || []).filter(Boolean).map((rule) => {
    const key = norm(rule.id);
    const db = deliveryByTemplate.get(key) || { count: 0, failed: 0, lastAt: null };
    const blobSends = blobLogByRule.get(key) || 0;
    const active = norm(rule.status) === 'aktiv' || norm(rule.status) === 'active';
    let severity = SEVERITY.ok;
    if (active && db.count === 0) severity = blobSends > 0 ? SEVERITY.error : SEVERITY.warn;
    else if (db.failed > 0) severity = SEVERITY.warn;
    return {
      id: rule.id,
      name: rule.name || rule.id,
      channel: rule.channel || '—',
      status: rule.status || '—',
      blobSends,
      dbDeliveries: db.count,
      dbFailed: db.failed,
      lastDeliveryAt: db.lastAt,
      severity,
    };
  });

  const knownRuleIds = new Set(rows.map((r) => norm(r.id)));
  const orphanDeliveries = [...deliveryByTemplate.entries()]
    .filter(([key]) => key && !knownRuleIds.has(key))
    .map(([key, v]) => ({ templateCode: key, count: v.count, severity: SEVERITY.warn }));

  return {
    rows,
    orphanDeliveries,
    unmigratedCount: rows.filter((r) => r.severity !== SEVERITY.ok).length,
  };
}

/** Bütün barışdırma nəticələrini bir hesabatda toplayır. */
export function buildReconciliationReport(input = {}) {
  const serials = reconcileSerials(input);
  const reservations = reconcileReservations(input);
  const production = reconcileProduction(input);
  const notifications = reconcileNotificationRules(input);

  const errorCount =
    serials.issues.filter((i) => i.severity === SEVERITY.error).length +
    reservations.rows.filter((r) => r.severity === SEVERITY.error).length +
    production.issues.filter((i) => i.severity === SEVERITY.error).length +
    notifications.rows.filter((r) => r.severity === SEVERITY.error).length;

  const warnCount =
    serials.issues.filter((i) => i.severity === SEVERITY.warn).length +
    reservations.rows.filter((r) => r.severity === SEVERITY.warn).length +
    production.issues.filter((i) => i.severity === SEVERITY.warn).length +
    notifications.rows.filter((r) => r.severity === SEVERITY.warn).length +
    notifications.orphanDeliveries.length;

  return {
    serials,
    reservations,
    production,
    notifications,
    summary: {
      errorCount,
      warnCount,
      healthy: errorCount === 0 && warnCount === 0,
      generatedAt: new Date().toISOString(),
    },
  };
}

/** Hesabatı CSV mətninə çevirir (ixrac üçün). */
export function reconciliationToCsv(report) {
  const lines = [['bolme', 'acar', 'problem', 'blob', 'db', 'ciddilik'].join(',')];
  const push = (section, key, kind, blob, db, severity) =>
    lines.push([section, key, kind, blob ?? '', db ?? '', severity].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));

  report.serials.issues.forEach((i) => push('serial', i.imei, i.kind, i.blobStatus, i.dbStatus, i.severity));
  report.reservations.rows.filter((r) => r.diff !== 0).forEach((r) => push('rezerv', r.product, 'reserved_diff', r.blobReserved, r.dbReserved, r.severity));
  report.production.issues.forEach((i) => push('istehsal', i.name, i.kind, i.blobStatus, i.dbStatus, i.severity));
  report.notifications.rows.filter((r) => r.severity !== SEVERITY.ok).forEach((r) => push('bildiris', r.name, 'not_migrated', r.blobSends, r.dbDeliveries, r.severity));
  report.notifications.orphanDeliveries.forEach((o) => push('bildiris', o.templateCode, 'orphan_delivery', '', o.count, o.severity));

  return lines.join('\n');
}
