import { describe, expect, it } from "vitest";
import * as legacy from "../shared/lib/appHelpers.jsx";
import * as notifications from "../shared/lib/notificationHelpers.ts";
import {
  buildNotificationAutomationRows,
  buildNotificationDeliveriesForRules,
  buildNotificationProviderRows,
  ensureNotificationRules,
  renderNotificationTemplate,
  splitNotificationEventsByCooldown,
} from "../shared/lib/notificationHelpers.ts";

describe("notification helpers", () => {
  it("stays importable from appHelpers so existing callers keep working", () => {
    for (const [name, fn] of Object.entries(notifications)) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(fn);
    }
    expect(typeof (legacy as Record<string, unknown>).flattenWarehouseStock).toBe("function");
  });

  it("merges stored rules over defaults and keeps custom ones", () => {
    const rules = ensureNotificationRules([{ id: "RULE-CREDIT-OVERDUE", status: "Passiv" }, { id: "CUSTOM", name: "X" }]);
    expect(rules.find((rule) => rule.id === "RULE-CREDIT-OVERDUE")).toMatchObject({ status: "Passiv", channel: "SMS" });
    expect(rules.at(-1)).toEqual({ id: "CUSTOM", name: "X" });
  });

  it("renders template placeholders and blanks missing values", () => {
    expect(renderNotificationTemplate("{customer}: {amount} {missing}", { customer: "Əli", amount: 50 })).toBe("Əli: 50 ");
  });

  it("holds events sent within the cooldown window", () => {
    const now = new Date("2026-11-14T12:00:00Z");
    const rule = { id: "R", cooldownHours: 24 };
    const sendLog = [{ ruleId: "R", entityId: "A", sentAtIso: "2026-11-14T06:00:00Z", sentAt: "06:00" }];
    const { ready, held } = splitNotificationEventsByCooldown(rule, [{ entityId: "A" }, { entityId: "B" }], sendLog, now);
    expect(ready).toEqual([{ entityId: "B", dedupeKey: "R:B" }]);
    expect(held).toEqual([{ entityId: "A", dedupeKey: "R:A", heldReason: "24 saat cooldown", lastSentAt: "06:00" }]);
  });

  it("blocks deliveries on a disabled channel", () => {
    const providerRows = buildNotificationProviderRows([], { toggles: { email: false } });
    const email = providerRows.find((row) => String(row.channel).toLowerCase().includes("email"));
    expect(email?.health).toBe("Kanal bağlıdır");
    const [entry] = buildNotificationDeliveriesForRules({
      rules: [{ id: "R", channel: email?.channel, providerId: email?.id, events: [{ entityId: "E", recipient: "Kassa" }] }],
      providerRows,
      settings: { toggles: { email: false } },
      stamp: "14.11.2026",
    });
    expect(entry).toMatchObject({ ruleId: "R", status: "Bloklandı", dedupeKey: "R:E", recipient: "Kassa", sentAt: "14.11.2026" });
  });

  it("queues pending purchase orders for approval", () => {
    const rows = buildNotificationAutomationRows({
      purchaseOrders: [{ id: "PO-1", vendor: "Vendor", amount: 6000, status: "Təsdiq gözləyir" }],
    });
    const po = rows.find((row) => row.id === "RULE-PO-APPROVAL");
    expect(po?.totalEventCount).toBe(1);
    expect(po?.events[0]).toMatchObject({ entityId: "PO-1", recipient: "Vendor", amount: 6000, priority: "Yüksək", module: "vendors" });
  });
});
