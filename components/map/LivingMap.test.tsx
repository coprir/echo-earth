import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import type { Theme } from "@/engine/environment";

// env.client reads NEXT_PUBLIC_GOOGLE_MAPS_API_KEY at render time, so tests
// can flip this object's field directly instead of re-mocking per case.
// vi.mock factories are hoisted above all imports/consts, so the values they
// close over must go through vi.hoisted to exist in time.
const { mockEnv, importLibrary, setOptions } = vi.hoisted(() => ({
  mockEnv: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: undefined as string | undefined },
  importLibrary: vi.fn(),
  setOptions: vi.fn(),
}));
vi.mock("@/lib/env.client", () => ({ env: mockEnv }));
vi.mock("@googlemaps/js-api-loader", () => ({ setOptions, importLibrary }));

// a minimal stand-in for google.maps.Map — jsdom has no real Maps SDK
class FakeMap {
  setCenter = vi.fn();
  setZoom = vi.fn();
  setOptions = vi.fn();
}

import LivingMap from "./LivingMap";

function theme(): Theme {
  return {
    id: "night-clear",
    label: "Night",
    phase: "night",
    season: "winter",
    palette: {
      bg: "#000",
      bgDeep: "#000",
      surface: "#111",
      glow: "#222",
      accent: "#fff",
      accentSolid: "#fff",
      onAccent: "#000",
      accent2: "#eee",
      text: "#fff",
      textDim: "#aaa",
      line: "#333",
    },
    particles: "none",
    particleDensity: 0,
    breathSeconds: 8,
    motionIntensity: 0.5,
    glassBlur: 8,
    fontMood: "geometric",
    audioMood: "cold",
  };
}

describe("LivingMap", () => {
  beforeEach(() => {
    mockEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = undefined;
    importLibrary.mockReset();
    setOptions.mockReset();
    delete window.gm_authFailure;
  });

  afterEach(() => {
    delete window.gm_authFailure;
  });

  it("renders nothing and never touches the loader when no key is configured (demo mode)", () => {
    const { container } = render(<LivingMap lat={1} lon={2} theme={theme()} />);
    expect(container.firstChild).toBeNull();
    expect(importLibrary).not.toHaveBeenCalled();
  });

  it("renders the map layer once the loader resolves successfully", async () => {
    mockEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    importLibrary.mockResolvedValue({ Map: FakeMap });

    const { container } = render(<LivingMap lat={1} lon={2} theme={theme()} />);
    await waitFor(() => expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull());
    expect(setOptions).toHaveBeenCalledWith({ key: "test-key", v: "weekly" });
  });

  it("hides the layer instead of leaving a broken tile when importLibrary rejects (network/script failure)", async () => {
    mockEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    importLibrary.mockRejectedValue(new Error("script load failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { container } = render(<LivingMap lat={1} lon={2} theme={theme()} />);
    await waitFor(() => expect(container.firstChild).toBeNull());
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("hides the layer when Google calls gm_authFailure — the failure mode that resolves importLibrary() and paints its own error tile instead of rejecting", async () => {
    mockEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    // never resolves on its own — mirrors the real SDK, which "succeeds" at
    // the script level while gm_authFailure fires separately for a bad key
    importLibrary.mockReturnValue(new Promise(() => {}));

    const { container } = render(<LivingMap lat={1} lon={2} theme={theme()} />);
    await waitFor(() => expect(window.gm_authFailure).toBeInstanceOf(Function));
    act(() => window.gm_authFailure!());
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("restores any pre-existing window.gm_authFailure on unmount instead of leaking its own", async () => {
    mockEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    importLibrary.mockReturnValue(new Promise(() => {}));
    const prior = vi.fn();
    window.gm_authFailure = prior;

    const { unmount } = render(<LivingMap lat={1} lon={2} theme={theme()} />);
    await waitFor(() => expect(window.gm_authFailure).not.toBe(prior));
    unmount();
    expect(window.gm_authFailure).toBe(prior);
  });
});
