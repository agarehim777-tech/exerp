import { cleanup, fireEvent, render } from "@testing-library/react";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Boxes } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetricCard, PanelHeader, ProgressRow, SimpleTable, StatusBadge, statusClass } from "../shared/ui/primitives.tsx";

afterEach(cleanup);

// UI phase 2 is complete: components/ui.jsx is gone and nothing in src may import it again.

function sourceFiles(dir: string): string[] {
  if (!statSync(dir).isDirectory()) return [dir];
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(jsx?|tsx?)$/.test(name) ? [path] : [];
  });
}

describe("shared widgets", () => {
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

  it("keeps the legacy components/ui.jsx removed", () => {
    expect(existsSync("src/components/ui.jsx")).toBe(false);
    // Matches "../components/ui.jsx" as well as the relative "./ui.jsx" / "../ui.jsx" forms used inside src/components.
    const legacyImport = /from\s*["'](?:[^"']*\/components|(?:\.\.?\/)*\.\.?)\/ui(?:\.jsx)?["']/;
    const offenders = sourceFiles("src").filter(file => legacyImport.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
