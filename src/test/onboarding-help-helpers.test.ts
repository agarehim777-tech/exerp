import { describe, expect, it } from "vitest";
import * as legacy from "../shared/lib/appHelpers.jsx";
import * as onboarding from "../shared/lib/onboardingHelpers.ts";
import { buildHelpArticles, buildHelpModuleGuides, buildOnboardingRows } from "../shared/lib/onboardingHelpers.ts";
import { navItems } from "../data.js";

describe("onboarding and help helpers", () => {
  it("stays importable from appHelpers so existing callers keep working", () => {
    for (const [name, fn] of Object.entries(onboarding)) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(fn);
    }
  });

  it("checks each onboarding step against real data and marks the first open one in progress", () => {
    const empty = buildOnboardingRows();
    expect(empty.steps).toHaveLength(10);
    expect(empty).toMatchObject({ completed: 0, blockers: 1, progress: 0 });
    expect(empty.nextStep?.id).toBe("ONB-1");
    expect(empty.steps.slice(0, 2).map((step) => step.status)).toEqual(["İcrada", "Gözləyir"]);

    const rows = buildOnboardingRows(
      { steps: [{ id: "ONB-2", owner: "Baş anbardar" }] },
      {
        settings: { company: "Test MMC", voen: "1234567890" },
        warehouses: [{ id: "WH-1" }],
        products: [{ name: "A" }],
        warehouseStock: { "WH-1": [{ product: "A", total: 3 }] },
        reportExports: [{ id: "R1" }],
      },
    );
    expect(rows.steps.slice(0, 4).map((step) => [step.id, step.status, step.action])).toEqual([
      ["ONB-1", "Tamamlandı", "Yoxlanılıb"],
      ["ONB-2", "Tamamlandı", "Yoxlanılıb"],
      ["ONB-3", "Tamamlandı", "Yoxlanılıb"],
      ["ONB-4", "İcrada", "Modula keç"],
    ]);
    expect(rows.steps[1].owner).toBe("Baş anbardar");
    expect(rows.steps.find((step) => step.id === "ONB-9")?.status).toBe("Tamamlandı");
    expect(rows).toMatchObject({ completed: 4, blockers: 1, progress: 40 });
    expect(rows.nextStep?.id).toBe("ONB-4");
  });

  it("builds a guide for every module except dashboard, messages and notifications", () => {
    const guides = buildHelpModuleGuides({ onboardingRows: buildOnboardingRows() });
    const expected = navItems.filter((item: { id: string }) => !["dashboard", "messages", "notifications"].includes(item.id));
    expect(guides.map((guide) => guide.id)).toEqual(expected.map((item: { id: string }) => item.id));
    const settings = guides.find((guide) => guide.id === "settings");
    // Several steps share a module; the last one (ONB-10 for settings) is what the guide shows.
    if (settings) expect(settings).toMatchObject({ readiness: "Gözləyir", owner: "Administrator" });
    const readiness = buildHelpModuleGuides({ moduleReadiness: { items: [{ module: guides[0].id, status: "Hazır", next: "Davam" }] } });
    expect(readiness[0]).toMatchObject({ readiness: "Hazır", next: "Davam" });
  });

  it("keeps manual articles first and lets them override generated ones", () => {
    const guides = buildHelpModuleGuides({});
    const articles = buildHelpArticles([{ id: "HELP-START", title: "Öz mətnimiz" }], guides);
    expect(articles[0]).toEqual({ id: "HELP-START", title: "Öz mətnimiz" });
    expect(articles.filter((article) => article.id === "HELP-START")).toHaveLength(1);
    expect(articles.map((article) => article.id)).toContain("HELP-PERMISSIONS");
    expect(articles.filter((article) => String(article.id).startsWith("HELP-MOD-"))).toHaveLength(Math.min(12, guides.length));
    expect(buildHelpArticles(null)).toHaveLength(3);
  });
});
