import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ErrorBoundary from "../components/ErrorBoundary.jsx";

function Boom(): JSX.Element {
  throw new Error("boom-test");
}

describe("ErrorBoundary", () => {
  it("renders friendly UI when child throws", () => {
    // Suppress React's error log during this render
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Bir problem yarandı/i)).toBeInTheDocument();
    expect(screen.getByText(/boom-test/)).toBeInTheDocument();
    spy.mockRestore();
  });
});
