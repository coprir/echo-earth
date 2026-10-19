import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Concierge from "./Concierge";
import { useAdaptiveMind } from "@/engine/useAdaptiveMind";
import type { EnvSignals, Theme } from "@/engine/environment";
import type { Place } from "@/lib/places";

function env(overrides: Partial<EnvSignals> = {}): EnvSignals {
  return {
    now: new Date("2026-01-01T20:00:00"),
    lat: 48.8566,
    lon: 2.3522,
    city: "Paris",
    country: "FR",
    weather: { kind: "clear", tempC: 18, description: "clear" },
    device: "desktop",
    isTouch: false,
    screenW: 1024,
    screenH: 768,
    batteryLevel: null,
    batterySaver: false,
    netSpeed: "unknown",
    prefersDark: true,
    prefersReducedMotion: false,
    perfTier: "high",
    motionEnergy: 0,
    visitorSeed: 0,
    mutationTick: 0,
    ...overrides,
  };
}

function theme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: "night-clear",
    label: "Night",
    phase: "night",
    season: "winter",
    palette: {
      bg: "#000", bgDeep: "#000", surface: "#111", glow: "#222",
      accent: "#fff", accent2: "#eee", text: "#fff", textDim: "#aaa", line: "#333",
    },
    particles: "none",
    particleDensity: 0,
    breathSeconds: 8,
    motionIntensity: 0.5,
    glassBlur: 8,
    fontMood: "geometric",
    audioMood: "cold",
    ...overrides,
  };
}

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: "p1",
    name: "Aurora Beans",
    category: "cafes",
    lat: 48.86,
    lon: 2.35,
    rating: 4.6,
    priceLevel: 2,
    openNow: true,
    distanceM: 400,
    bearing: 90,
    address: "1 Rue de Paris",
    isGem: false,
    source: "echo",
    ...overrides,
  };
}

const noop = () => {};

describe("Concierge", () => {
  beforeEach(() => {
    useAdaptiveMind.setState({ atmosphere: "auto", travel: "still", mode: "explore", affinities: {}, energy: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("composes a deterministic journey from /api/places with no AI call made when the fetch mock returns no AI data (fallback is the default)", async () => {
    const places: Record<string, Place> = {
      cafe1: place({ id: "cafe1", name: "Aurora Beans", category: "cafes" }),
      scenic1: place({ id: "scenic1", name: "Riverside View", category: "scenic" }),
      beach1: place({ id: "beach1", name: "Quiet Shore", category: "beaches" }),
    };
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/places")) {
        const category = new URL(url, "http://localhost").searchParams.get("category");
        const match = Object.values(places).find((p) => p.category === category);
        return Promise.resolve({ ok: true, json: async () => ({ places: match ? [match] : [] }) } as Response);
      }
      if (url.startsWith("/api/concierge")) {
        return Promise.resolve({ ok: true, json: async () => ({ ai: null }) } as Response);
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Concierge lat={48.8566} lon={2.3522} city="Paris" env={env()} theme={theme()} onFocusPlace={noop} autoOpen={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /open|concierge/i }));
    fireEvent.click(await screen.findByRole("button", { name: /calm/i }));

    await waitFor(() => expect(screen.getByText("Aurora Beans")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText("Riverside View")).toBeInTheDocument();
    expect(screen.getByText("Quiet Shore")).toBeInTheDocument();
    // no AI narrative label shown — the fetch mock's /api/concierge resolved to {ai: null}
    expect(screen.queryByText("✦ AI-refined")).not.toBeInTheDocument();
  });

  it("swaps in the AI narrative and reordered stops once /api/concierge resolves with valid data referencing real candidate ids", async () => {
    const cafe = place({ id: "cafe1", name: "Aurora Beans", category: "cafes" });
    const scenic = place({ id: "scenic1", name: "Riverside View", category: "scenic" });
    const beach = place({ id: "beach1", name: "Quiet Shore", category: "beaches" });
    const byCategory: Record<string, Place> = { cafes: cafe, scenic: scenic, beaches: beach };

    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/places")) {
        const category = new URL(url, "http://localhost").searchParams.get("category") ?? "";
        const match = byCategory[category];
        return Promise.resolve({ ok: true, json: async () => ({ places: match ? [match] : [] }) } as Response);
      }
      if (url.startsWith("/api/concierge")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ai: {
              narrative: "A slow drift through a quiet Paris evening.",
              stops: [{ placeId: "cafe1", reason: "warm start" }],
            },
          }),
        } as Response);
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Concierge lat={48.8566} lon={2.3522} city="Paris" env={env()} theme={theme()} onFocusPlace={noop} autoOpen={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /open|concierge/i }));
    fireEvent.click(await screen.findByRole("button", { name: /calm/i }));

    await waitFor(() => expect(screen.getByText("A slow drift through a quiet Paris evening.")).toBeInTheDocument(), {
      timeout: 3000,
    });
    // the AI response only referenced "cafe1" — the other deterministic stops are gone
    expect(screen.queryByText("Riverside View")).not.toBeInTheDocument();
    expect(screen.queryByText("Quiet Shore")).not.toBeInTheDocument();
    expect(screen.getByText("Aurora Beans")).toBeInTheDocument();
  });

  it("drops a model-invented place id and keeps the deterministic journey when nothing survives validation server-side (route already filters this, but the UI must not crash on an empty ai.stops result)", async () => {
    const cafe = place({ id: "cafe1", name: "Aurora Beans", category: "cafes" });
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/places")) {
        const category = new URL(url, "http://localhost").searchParams.get("category") ?? "";
        return Promise.resolve({ ok: true, json: async () => ({ places: category === "cafes" ? [cafe] : [] }) } as Response);
      }
      if (url.startsWith("/api/concierge")) {
        // route-level validation (lib/ai/validate.ts) would normally strip an
        // unknown id and return ai: null when nothing survives
        return Promise.resolve({ ok: true, json: async () => ({ ai: null }) } as Response);
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Concierge lat={48.8566} lon={2.3522} city="Paris" env={env()} theme={theme()} onFocusPlace={noop} autoOpen={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /open|concierge/i }));
    fireEvent.click(await screen.findByRole("button", { name: /calm/i }));

    await waitFor(() => expect(screen.getByText("Aurora Beans")).toBeInTheDocument(), { timeout: 3000 });
  });

  it("closes on Escape, like any dialog should", async () => {
    render(
      <Concierge lat={null} lon={null} city={null} env={env()} theme={theme()} onFocusPlace={noop} autoOpen={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /open|concierge/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    // the dialog's exit animation (AnimatePresence) unmounts it asynchronously
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
