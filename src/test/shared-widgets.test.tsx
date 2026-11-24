import { cleanup, fireEvent, render } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Boxes } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as legacyUi from "../components/ui.jsx";
import { MetricCard, PanelHeader, ProgressRow, SimpleTable, StatusBadge, statusClass } from "../shared/ui/primitives.tsx";

afterEach(cleanup);

// UI phase 2: folders listed here have moved to shared/ui and must not import components/ui.jsx again.
const MIGRATED = ["src/modules/warehouse", "src/modules/hr", "src/pages/HrPage.jsx", "src/modules/finance", "src/shared/lib/appDomainFinance.jsx", "src/modules/credits", "src/pages/CreditsPage.jsx", "src/modules/procurement", "src/modules/production", "src/modules/projects"];

function sourceFiles(dir: string): string[] {
  if (!statSync(dir).isDirectory()) return [dir];
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(jsx?|tsx?)$/.test(name) ? [path] : [];
  });
}

describe("shared widgets", () => {
  it("keeps the legacy entry point as a pure re-export", () => {
    expect(legacyUi.StatusBadge).toBe(StatusBadge);
    expect(legacyUi.DataTable).toBe(SimpleTable);
  });

  it("maps Azerbaijani status words to the same tone classes", () => {
    expect(statusClass("Kritik")).toBe("danger");
    expect(statusClass("Ödənilib")).toBe("ok");
    expect(statusClass("Gözləyir")).toBe("warning");
    expect(statusClass("Yoldadır")).toBe("info");
    expect(statusClass("Naməlum")).toBe("neutral");
    const { container } = render(<StatusBadge status="Qismən təhvil" />);
    expect(container.querySelector("span.status.warning")?.textContent).toBe("Qismən təhvil");
  });

  it("renders positional rows with right-aligned numeric columns and index clicks", () => {
    const onRowClick = vi.fn();
    const { container, getByText } = render(
      <SimpleTable columns={["Məhsul", "Məbləğ", { label: "Qeyd", nowrap: true }]} rows={[["Ayran", "12.00", "—"]]} onRowClick={onRowClick} />,
    );
    const headers = container.querySelectorAll("th");
    expect(headers[1]?.className).toContain("is-numeric");
    expect(headers[2]?.className).toContain("is-nowrap");
    fireEvent.click(getByText("Ayran"));
    expect(onRowClick).toHaveBeenCalledWith(0);
    cleanup();
    expect(render(<SimpleTable columns={["A"]} rows={[]} />).getByText("Axtarışa uyğun məlumat tapılmadı")).toBeTruthy();
  });

  it("keeps legacy markup for metric cards, panel headers and progress rows", () => {
    const onClick = vi.fn();
    const { container } = render(<>
      <MetricCard label="Stok" value="5" icon={Boxes} tone="warning" onClick={onClick} />
      <PanelHeader title="Anbar" subtitle="Qalıqlar" />
      <ProgressRow label="Doluluq" value={140} />
    </>);
    const card = container.querySelector("article.metric-card.metric-card-clickable");
    expect(card?.querySelector(".metric-icon.warning")).toBeTruthy();
    fireEvent.keyDown(card as Element, { key: "Enter" });
    expect(onClick).toHaveBeenCalledOnce();
    expect(container.querySelector(".panel-header h2")?.textContent).toBe("Anbar");
    expect(container.querySelector("progress")?.getAttribute("value")).toBe("100");
  });

  it.each(MIGRATED)("%s no longer imports components/ui.jsx", folder => {
    const offenders = sourceFiles(folder).filter(file => /components\/ui(\.jsx)?["']/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
