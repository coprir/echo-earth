import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Bomb(): null {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("fine")).toBeInTheDocument();
  });

  it("renders the fallback (and swallows the error) when a descendant throws", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<p>recovered</p>}>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText("recovered")).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("renders nothing (not a crash) when no fallback is given", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(container).toBeEmptyDOMElement();
    consoleError.mockRestore();
  });
});
