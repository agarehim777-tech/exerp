// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readAllRows, readRowsByIds } from "../services/readAllRows.js";

// Fake PostgREST table that, like the real one, silently caps a response at maxRows.
function fakeTable(total, maxRows = 1000) {
  const rows = Array.from({ length: total }, (_, index) => ({ id: index + 1 }));
  const calls = [];
  const query = () => ({
    range: async (from, to) => {
      calls.push([from, to]);
      return { data: rows.slice(from, Math.min(to + 1, from + maxRows)), error: null };
    },
  });
  return { query, calls };
}

describe("readAllRows", () => {
  it("reads past the 1000-row response cap", async () => {
    const { query } = fakeTable(2345);
    const { data, error } = await readAllRows(query);
    expect(error).toBeNull();
    expect(data).toHaveLength(2345);
    expect(new Set(data.map((row) => row.id)).size).toBe(2345);
  });

  it("stops after a short page and handles empty tables", async () => {
    const exact = fakeTable(1000);
    expect((await readAllRows(exact.query)).data).toHaveLength(1000);
    expect(exact.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);

    const empty = fakeTable(0);
    expect(await readAllRows(empty.query)).toEqual({ data: [], error: null });
    expect(empty.calls).toHaveLength(1);
  });

  it("returns the error instead of a partial list", async () => {
    let page = 0;
    const query = () => ({
      range: async () => (page++ === 0
        ? { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }
        : { data: null, error: { code: "57014", message: "statement timeout" } }),
    });
    expect(await readAllRows(query)).toEqual({ data: null, error: { code: "57014", message: "statement timeout" } });
  });
});

describe("readRowsByIds", () => {
  // Fake .in() query: records each chunk and returns one row per id.
  function fakeIdQuery() {
    const chunks = [];
    const queryForChunk = (chunk) => {
      chunks.push(chunk);
      return { range: async (from, to) => ({ data: chunk.slice(from, to + 1).map((id) => ({ id })), error: null }) };
    };
    return { chunks, queryForChunk };
  }

  it("splits a long id list into URL-sized chunks and returns every row", async () => {
    const ids = Array.from({ length: 250 }, (_, index) => `id-${index}`);
    const { chunks, queryForChunk } = fakeIdQuery();
    const { data, error } = await readRowsByIds(ids, queryForChunk);
    expect(error).toBeNull();
    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 50]);
    expect(data.map((row) => row.id)).toEqual(ids);
  });

  it("drops duplicate and empty ids and makes no request for an empty list", async () => {
    const { chunks, queryForChunk } = fakeIdQuery();
    expect((await readRowsByIds(["a", "a", null, "", undefined, "b"], queryForChunk)).data).toEqual([{ id: "a" }, { id: "b" }]);
    expect(chunks).toEqual([["a", "b"]]);

    const empty = fakeIdQuery();
    expect(await readRowsByIds([], empty.queryForChunk)).toEqual({ data: [], error: null });
    expect(empty.chunks).toHaveLength(0);
  });

  it("returns the first chunk error instead of a partial list", async () => {
    const failure = { code: "57014", message: "statement timeout" };
    let calls = 0;
    const queryForChunk = (chunk) => ({
      range: async () => (calls++ === 0 ? { data: chunk.map((id) => ({ id })), error: null } : { data: null, error: failure }),
    });
    const ids = Array.from({ length: 150 }, (_, index) => `id-${index}`);
    expect(await readRowsByIds(ids, queryForChunk)).toEqual({ data: null, error: failure });
  });
});

describe("id-list reads are chunked", () => {
  // .in() with an unbounded, data-derived id list must go through readRowsByIds.
  const guarded = {
    "src/shared/hooks/useSalesBonusLedger.js": ["orders", "customers"],
    "src/modules/warehouse/ProductBalancesPage.jsx": ["purchase_order_lines", "goods_receipts", "goods_receipt_lines"],
  };

  it.each(Object.entries(guarded))("%s", (file, tables) => {
    const source = readFileSync(file, "utf8");
    for (const table of tables) {
      const reads = [...source.matchAll(new RegExp(`\\.from\\(['"]${table}['"]\\)\\s*\\.select\\([^;]*?\\.in\\(`, "g"))];
      expect(reads.length, `${table} id-list read`).toBeGreaterThan(0);
      for (const read of reads) {
        const before = source.slice(Math.max(0, read.index - 80), read.index);
        expect(before, `${table} must be chunked`).toMatch(/readRowsByIds\([^,]+,\s*\(chunk\)\s*=>\s*supabase\s*$/);
      }
    }
  });
});

describe("whole-tenant reads go through readAllRows", () => {
  // These tables are read in full to build statements, ledgers and pickers; a bare select would
  // stop at 1000 rows without any error.
  const guarded = {
    "src/shared/hooks/useFinancialStatements.ts": ["sales_invoices", "cash_transactions", "stock_balances", "vendor_invoices"],
    "src/shared/hooks/useSalesBonusLedger.js": ["order_bonus_assignments", "sales_bonus_entries"],
    "src/shared/hooks/useCashbook.js": ["employees"],
    "src/modules/procurement/ProcurementPage.jsx": ["vendors", "products", "purchase_orders", "purchase_order_lines", "goods_receipts", "goods_receipt_lines", "vendor_invoices", "vendor_invoice_lines"],
    "src/modules/procurement/LandedCostPanel.jsx": ["purchase_order_lines"],
    "src/modules/warehouse/StockAgingPanel.jsx": ["inventory_aging_v", "inventory_cost_layers"],
  };

  it.each(Object.entries(guarded))("%s", (file, tables) => {
    const source = readFileSync(file, "utf8");
    for (const table of tables) {
      // Reads only: writes (.insert/.update/.delete) come right after .from() instead of .select().
      const reads = [...source.matchAll(new RegExp(`\\.from\\(['"]${table}['"]\\)(?=\\s*\\.select\\()`, "g"))];
      expect(reads.length, `${table} read`).toBeGreaterThan(0);
      for (const read of reads) {
        const before = source.slice(Math.max(0, read.index - 60), read.index);
        expect(before, `${table} must be paged`).toMatch(/readAllRows\(\(\)\s*=>\s*supabase\s*$/);
      }
    }
  });
});
