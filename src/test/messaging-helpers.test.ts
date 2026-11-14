import { describe, expect, it } from "vitest";
import * as legacy from "../shared/lib/appHelpers.jsx";
import * as messaging from "../shared/lib/messagingHelpers.ts";
import {
  buildMessageContextOptions,
  buildMessageParticipantOptions,
  getInitials,
  getMessageContextPayload,
  normalizeMessageThread,
  upsertSupportConversation,
} from "../shared/lib/messagingHelpers.ts";

describe("messaging helpers", () => {
  it("stays importable from appHelpers so existing callers keep working", () => {
    for (const [name, fn] of Object.entries(messaging)) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(fn);
    }
  });

  it("builds initials from the first two words", () => {
    expect(getInitials("əli məmmədov həsən")).toBe("ƏM");
    expect(getInitials("")).toBe("E");
  });

  it("normalizes a thread with defaults, type and archive state", () => {
    const thread = normalizeMessageThread({ id: "T1", participants: ["a", "b", "c"], status: "Arxiv", messages: [{ text: "Salam", time: "10:00" }] });
    expect(thread).toMatchObject({ title: "T1", type: "group", status: "Arxiv", archived: true, team: "Qrup", preview: "Salam", time: "10:00", unread: 0 });
    expect(normalizeMessageThread({ ticketId: "S1" })).toMatchObject({ type: "task", preview: "Mesaj yoxdur", time: "Yeni", messages: [] });
  });

  it("dedupes participants and drops ones without id or name", () => {
    const options = buildMessageParticipantOptions({ users: [{ id: "u1", name: "Admin" }, { id: "u1", name: "Admin" }, { name: "No id" }] }, [{ id: "e1", fullName: "Kamran", department: "Satış" }]);
    expect(options).toEqual([
      { id: "u1", name: "Admin", role: "İstifadəçi", team: "Sistem", source: "user" },
      { id: "e1", name: "Kamran", role: "Əməkdaş", team: "Satış", source: "employee" },
    ]);
  });

  it("offers an unlinked option first and resolves a linked credit", () => {
    const sources = { credits: [{ id: "C1", contractId: "IN-1", orderId: "SO-1", fin: "FIN1", customer: "Əli" }] };
    expect(buildMessageContextOptions(sources).map((option) => [option.type, option.label])).toEqual([["", "Bağlantı yoxdur"], ["credit", "IN-1"]]);
    expect(getMessageContextPayload("credit", "IN-1", sources)).toEqual({
      linkedType: "credit", linkedId: "IN-1", creditId: "C1", orderId: "SO-1", customerFin: "FIN1", linkedLabel: "IN-1",
    });
    expect(getMessageContextPayload("", "x")).toEqual({});
  });

  it("creates a support thread once and appends later comments to it", () => {
    const ticket = { id: "SUP-1", title: "Ekran", owner: "Support" };
    const first = upsertSupportConversation([], ticket, { id: "c1", text: "Problem", author: "Əli" });
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ ticketId: "SUP-1", type: "task", person: "Ekran", initials: "E", preview: "Problem" });
    const second = upsertSupportConversation(first, ticket, { id: "c2", text: "Həll olundu", at: "12:00" });
    expect(second).toHaveLength(1);
    expect(second[0].messages.map((message: { text: string }) => message.text)).toEqual(["Problem", "Həll olundu"]);
    expect(second[0]).toMatchObject({ preview: "Həll olundu", time: "12:00" });
  });
});
