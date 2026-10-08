import { describe, expect, it } from "vitest";
import { buildConciergeContext } from "./buildContext";
import type { ConciergeRequest } from "./types";

function baseRequest(overrides: Partial<ConciergeRequest> = {}): ConciergeRequest {
  return {
    energy: "calm",
    language: "en",
    local: true,
    city: "Nairobi",
    country: "KE",
    weatherKind: "clear",
    tempC: 22,
    phase: "day",
    season: "summer",
    mode: "explore",
    travel: "still",
    favorites: ["cafes"],
    candidates: [],
    ...overrides,
  };
}

function candidate(id: string, overrides: Partial<ConciergeRequest["candidates"][number]> = {}) {
  return {
    id,
    name: `Place ${id}`,
    category: "cafes" as const,
    rating: 4,
    priceLevel: 2,
    openNow: true,
    distanceM: 500,
    isGem: false,
    ...overrides,
  };
}

describe("buildConciergeContext", () => {
  it("carries request fields through unchanged", () => {
    const ctx = buildConciergeContext(baseRequest());
    expect(ctx).toMatchObject({
      energy: "calm",
      language: "en",
      local: true,
      city: "Nairobi",
      country: "KE",
      weather: { kind: "clear", tempC: 22 },
      phase: "day",
      season: "summer",
      mode: "explore",
      travel: "still",
      favorites: ["cafes"],
    });
  });

  it("deduplicates candidates by id", () => {
    const ctx = buildConciergeContext(
      baseRequest({ candidates: [candidate("a"), candidate("a"), candidate("b")] })
    );
    expect(ctx.candidates.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("sorts by rating desc, then distance asc", () => {
    const ctx = buildConciergeContext(
      baseRequest({
        candidates: [
          candidate("low-rating", { rating: 3 }),
          candidate("high-rating-far", { rating: 4.8, distanceM: 2000 }),
          candidate("high-rating-near", { rating: 4.8, distanceM: 200 }),
        ],
      })
    );
    expect(ctx.candidates.map((c) => c.id)).toEqual(["high-rating-near", "high-rating-far", "low-rating"]);
  });

  it("caps the candidate list sent to the model regardless of how many were posted", () => {
    const many = Array.from({ length: 40 }, (_, i) => candidate(`p${i}`, { rating: 5 - i * 0.01 }));
    const ctx = buildConciergeContext(baseRequest({ candidates: many }));
    expect(ctx.candidates.length).toBeLessThanOrEqual(24);
  });
});
