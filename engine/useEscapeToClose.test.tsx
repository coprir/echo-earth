import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderHook } from "@testing-library/react";
import { useEscapeToClose } from "./useEscapeToClose";

describe("useEscapeToClose", () => {
  it("calls onClose when Escape is pressed while active", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(true, onClose));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does nothing when inactive", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(false, onClose));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores every other key", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(true, onClose));

    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "a" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes its listener once inactive (no leftover call after going inactive)", () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(({ active }) => useEscapeToClose(active, onClose), {
      initialProps: { active: true },
    });

    rerender({ active: false });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
