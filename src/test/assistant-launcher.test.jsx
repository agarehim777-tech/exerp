import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const loads = vi.hoisted(() => ({ count: 0 }));

vi.mock("../modules/assistant/FloatingAssistant.jsx", () => {
  loads.count += 1;
  return {
    default: ({ defaultOpen }) => <div data-testid="assistant-panel">{defaultOpen ? "open" : "closed"}</div>,
  };
});

import AssistantLauncher from "../modules/assistant/AssistantLauncher.jsx";

it("shows the launcher without loading the chat panel, and opens the panel on click", async () => {
  render(<AssistantLauncher />);
  const button = screen.getByRole("button", { name: "AI köməkçini aç" });
  expect(loads.count).toBe(0);
  expect(screen.queryByTestId("assistant-panel")).toBeNull();

  fireEvent.click(button);
  expect(await screen.findByTestId("assistant-panel")).toHaveTextContent("open");
  expect(loads.count).toBe(1);
});

it("points the app's lazy FloatingAssistant at the launcher, not the panel", async () => {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const source = await readFile(join(process.cwd(), "src/config/lazyPages.js"), "utf8");
  expect(source).toMatch(/FloatingAssistant = lazy\(\(\) => import\("\.\.\/modules\/assistant\/AssistantLauncher\.jsx"\)\)/);
});
