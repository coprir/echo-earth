import { describe, expect, it } from "vitest";
import {
  buildValidCandidates,
  categoryContextScores,
  filterPlaces,
  rankCategories,
  rankPlaces,
  scorePlace,
  type PlaceRankingContext,
  type ScorablePlace,
} from "./recommend";
import { CATEGORIES } from "./places";

const baseCtx: PlaceRankingContext = {
  mode: "explore",
  travel: "still",
  phase: "day",
  weather: "unknown",
  favorites: [],
};

function place(overrides: Partial<ScorablePlace> = {}): ScorablePlace {
  return {
    category: "cafes",
    rating: 4,
    priceLevel: 2,
    openNow: true,
    distanceM: 500,
    isGem: false,
    ...overrides,
  };
}

describe("categoryContextScores / rankCategories", () => {
  it("golden case: late-night mode puts clubs/cocktails/fastfood/taverns on top, in that weighted order", () => {
    const ranked = rankCategories("latenight", "still", "day", "unknown", []);
    const top4 = ranked.slice(0, 4).map((c) => c.id);
    expect(top4).toEqual(["clubs", "cocktails", "fastfood", "taverns"]);
  });

  it("every category appears exactly once, regardless of context", () => {
    const ranked = rankCategories("hiddengems", "driving", "latenight", "rain", ["gems", "cafes"]);
    expect(ranked).toHaveLength(CATEGORIES.length);
    expect(new Set(ranked.map((c) => c.id)).size).toBe(CATEGORIES.length);
  });

  it("favorites lift a category even outside any mode's category list", () => {
    // "gyms" isn't in any MODE_CATEGORIES list for "explore" — favoriting it
    // should still pull it toward the front via the favorites rule alone.
    const withoutFavorite = rankCategories("explore", "still", "day", "unknown", []);
    const withFavorite = rankCategories("explore", "still", "day", "unknown", ["gyms"]);
    const rankWithout = withoutFavorite.findIndex((c) => c.id === "gyms");
    const rankWith = withFavorite.findIndex((c) => c.id === "gyms");
    expect(rankWith).toBeLessThan(rankWithout);
  });

  it("categoryContextScores gives every mode-listed category a positive score and decays by position", () => {
    const scores = categoryContextScores({ mode: "luxury", travel: "still", phase: "day", weather: "unknown", favorites: [] });
    // luxury: ["cocktails", "restaurants", "hotels", "scenic"], base 100 step 8
    expect(scores.get("cocktails")).toBe(100);
    expect(scores.get("restaurants")).toBe(92);
    expect(scores.get("hotels")).toBe(84);
    expect(scores.get("scenic")).toBe(76);
    expect(scores.get("gems")).toBe(0); // not in luxury's list, no other rule applies
  });
});

describe("scorePlace", () => {
  it("rewards higher rating and penalizes distance", () => {
    const near = scorePlace(place({ rating: 4, distanceM: 100 }), baseCtx);
    const far = scorePlace(place({ rating: 4, distanceM: 3000 }), baseCtx);
    expect(near).toBeGreaterThan(far);

    const lowRated = scorePlace(place({ rating: 3, distanceM: 500 }), baseCtx);
    const highRated = scorePlace(place({ rating: 4.8, distanceM: 500 }), baseCtx);
    expect(highRated).toBeGreaterThan(lowRated);
  });

  it("gives a bigger gem bonus specifically in hiddengems mode than in any other mode", () => {
    const gem = place({ isGem: true });
    const scoreExplore = scorePlace(gem, { ...baseCtx, mode: "explore" });
    const scoreHiddenGems = scorePlace(gem, { ...baseCtx, mode: "hiddengems" });
    const nonGemHiddenGems = scorePlace({ ...gem, isGem: false }, { ...baseCtx, mode: "hiddengems" });
    expect(scoreHiddenGems).toBeGreaterThan(scoreExplore);
    expect(scoreHiddenGems).toBeGreaterThan(nonGemHiddenGems);
  });

  it("rewards higher price level in luxury mode and lower price level in cheapeats mode", () => {
    const cheap = place({ priceLevel: 0 });
    const expensive = place({ priceLevel: 4 });
    expect(scorePlace(expensive, { ...baseCtx, mode: "luxury" })).toBeGreaterThan(scorePlace(cheap, { ...baseCtx, mode: "luxury" }));
    expect(scorePlace(cheap, { ...baseCtx, mode: "cheapeats" })).toBeGreaterThan(scorePlace(expensive, { ...baseCtx, mode: "cheapeats" }));
  });

  it("penalizes a place that's confirmed closed, but doesn't penalize unknown open-state", () => {
    const open = scorePlace(place({ openNow: true }), baseCtx);
    const closed = scorePlace(place({ openNow: false }), baseCtx);
    const unknown = scorePlace(place({ openNow: null }), baseCtx);
    expect(open).toBeGreaterThan(unknown);
    expect(unknown).toBeGreaterThan(closed);
  });
});

describe("rankPlaces", () => {
  it("sorts by score descending", () => {
    const places = [place({ rating: 3, distanceM: 1000 }), place({ rating: 4.8, distanceM: 200 }), place({ rating: 4, distanceM: 500 })];
    const ranked = rankPlaces(places, baseCtx);
    expect(ranked[0].rating).toBe(4.8);
    expect(ranked[2].rating).toBe(3);
  });

  it("is generic — works on a minimal shape that isn't the full Place type (e.g. ConciergeCandidate)", () => {
    interface Trimmed extends ScorablePlace {
      id: string;
    }
    const items: Trimmed[] = [
      { id: "a", ...place({ rating: 3 }) },
      { id: "b", ...place({ rating: 4.9 }) },
    ];
    const ranked = rankPlaces(items, baseCtx);
    expect(ranked[0].id).toBe("b");
  });

  it("never mutates the input array", () => {
    const places = [place({ rating: 3 }), place({ rating: 5 })];
    const copy = [...places];
    rankPlaces(places, baseCtx);
    expect(places).toEqual(copy);
  });
});

describe("filterPlaces", () => {
  it("latenight mode excludes places confirmed closed, but keeps unknown-state places", () => {
    const places = [place({ openNow: true }), place({ openNow: false }), place({ openNow: null })];
    const out = filterPlaces(places, "latenight");
    expect(out.every((p) => p.openNow !== false)).toBe(true);
    expect(out).toHaveLength(2);
  });

  it("cheapeats mode keeps only priceLevel <= 1", () => {
    const places = [place({ priceLevel: 0 }), place({ priceLevel: 1 }), place({ priceLevel: 3 })];
    expect(filterPlaces(places, "cheapeats")).toHaveLength(2);
  });

  it("luxury mode keeps high price OR high rating", () => {
    const places = [place({ priceLevel: 4, rating: 3 }), place({ priceLevel: 0, rating: 4.8 }), place({ priceLevel: 1, rating: 3 })];
    expect(filterPlaces(places, "luxury")).toHaveLength(2);
  });

  it("hiddengems mode keeps only isGem", () => {
    const places = [place({ isGem: true }), place({ isGem: false })];
    expect(filterPlaces(places, "hiddengems")).toEqual([places[0]]);
  });

  it("never returns an empty list when the input wasn't empty — falls back to the unfiltered set", () => {
    const places = [place({ isGem: false }), place({ isGem: false })];
    expect(filterPlaces(places, "hiddengems")).toHaveLength(2);
  });

  it("explore mode applies no filter at all", () => {
    const places = [place({ openNow: false, priceLevel: 4, rating: 1, isGem: false })];
    expect(filterPlaces(places, "explore")).toEqual(places);
  });
});

describe("buildValidCandidates", () => {
  it("composes filterPlaces then rankPlaces", () => {
    const places = [
      place({ isGem: false, rating: 5 }), // filtered out in hiddengems mode despite top rating
      place({ isGem: true, rating: 3, distanceM: 2000 }),
      place({ isGem: true, rating: 4, distanceM: 200 }),
    ];
    const out = buildValidCandidates(places, { ...baseCtx, mode: "hiddengems" });
    expect(out.every((p) => p.isGem)).toBe(true);
    expect(out[0].rating).toBe(4); // closer + still well-rated gem ranks first
  });
});
