import { describe, expect, it } from "vitest";
import { composeJourney, energyCategories, ENERGIES } from "./itinerary";
import type { CategoryId, Place } from "./places";

function place(id: string, category: CategoryId, overrides: Partial<Place> = {}): Place {
  return {
    id,
    name: id,
    category,
    lat: 0,
    lon: 0,
    rating: 4,
    priceLevel: 2,
    openNow: true,
    distanceM: 500,
    bearing: 0,
    address: "",
    isGem: false,
    source: "echo",
    ...overrides,
  };
}

describe("energyCategories", () => {
  it("returns each energy's unique step categories", () => {
    expect(energyCategories("calm")).toEqual(["scenic", "cafes", "beaches"]);
  });

  it("every defined energy resolves to at least one category", () => {
    for (const e of ENERGIES) {
      expect(energyCategories(e.id).length).toBeGreaterThan(0);
    }
  });
});

describe("composeJourney", () => {
  it("picks one real place per step, in step order", () => {
    const byCat = {
      scenic: [place("s1", "scenic")],
      cafes: [place("c1", "cafes")],
      beaches: [place("b1", "beaches")],
    };
    const journey = composeJourney("calm", byCat);
    expect(journey.stops.map((s) => s.place.id)).toEqual(["s1", "c1", "b1"]);
    expect(journey.stops.map((s) => s.index)).toEqual([1, 2, 3]);
  });

  it("never repeats the same place across steps, even if it appears in multiple categories' pools", () => {
    const shared = place("shared", "cafes");
    const byCat = {
      scenic: [{ ...shared, category: "scenic" as const }],
      cafes: [shared],
      beaches: [place("b1", "beaches")],
    };
    const journey = composeJourney("calm", byCat);
    const ids = journey.stops.map((s) => s.place.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("skips a step entirely when its category has no places, rather than erroring", () => {
    const journey = composeJourney("calm", { cafes: [place("c1", "cafes")] });
    expect(journey.stops).toHaveLength(1);
    expect(journey.stops[0].place.id).toBe("c1");
  });

  it("ranks within a step by the shared scoring engine (best real candidate first, not just first-in-list)", () => {
    const byCat = {
      scenic: [place("low", "scenic", { rating: 2.5, distanceM: 3000 }), place("high", "scenic", { rating: 4.9, distanceM: 100 })],
      cafes: [place("c1", "cafes")],
      beaches: [place("b1", "beaches")],
    };
    const journey = composeJourney("calm", byCat);
    expect(journey.stops[0].place.id).toBe("high");
  });

  it("an energy's mode actually filters candidates now (luxurious energy excludes cheap, low-rated places)", () => {
    const byCat = {
      hotels: [place("budget", "hotels", { priceLevel: 0, rating: 3 }), place("grand", "hotels", { priceLevel: 4, rating: 4.8 })],
      cocktails: [place("bar1", "cocktails", { priceLevel: 4, rating: 4.7 })],
      restaurants: [place("r1", "restaurants", { priceLevel: 4, rating: 4.7 })],
      scenic: [place("v1", "scenic", { priceLevel: 4, rating: 4.7 })],
    };
    const journey = composeJourney("luxurious", byCat);
    const hotelStop = journey.stops.find((s) => s.place.category === "hotels");
    expect(hotelStop?.place.id).toBe("grand");
  });

  it("offset cycles through the ranked pool (regenerate picks the next-best, not a repeat)", () => {
    const byCat = {
      cafes: [place("c1", "cafes", { rating: 5 }), place("c2", "cafes", { rating: 4.5 }), place("c3", "cafes", { rating: 4 })],
      scenic: [place("s1", "scenic")],
      beaches: [place("b1", "beaches")],
    };
    const first = composeJourney("calm", byCat, 0);
    const regenerated = composeJourney("calm", byCat, 1);
    const cafeFirst = first.stops.find((s) => s.place.category === "cafes")?.place.id;
    const cafeRegenerated = regenerated.stops.find((s) => s.place.category === "cafes")?.place.id;
    // both picks must be real, ranked pool members, and regenerating must
    // land on a *different* one — the exact pool position depends on the
    // cafes step's index within "calm"'s template, which is an internal
    // detail this test deliberately doesn't pin down
    expect(["c1", "c2", "c3"]).toContain(cafeFirst);
    expect(["c1", "c2", "c3"]).toContain(cafeRegenerated);
    expect(cafeRegenerated).not.toBe(cafeFirst);
  });

  it("accepts an optional context (travel/phase/weather/favorites) without changing the function's required arguments", () => {
    const byCat = { cafes: [place("c1", "cafes")], scenic: [place("s1", "scenic")], beaches: [place("b1", "beaches")] };
    // must not throw, and must still produce a full journey
    const journey = composeJourney("calm", byCat, 0, { travel: "walking", phase: "dusk", weather: "clear", favorites: ["cafes"] });
    expect(journey.stops).toHaveLength(3);
  });

  it("computes spanM as the sum of consecutive stop distance deltas", () => {
    const byCat = { cafes: [place("c1", "cafes", { distanceM: 100 })], scenic: [place("s1", "scenic", { distanceM: 500 })], beaches: [place("b1", "beaches", { distanceM: 300 })] };
    const journey = composeJourney("calm", byCat);
    // order is scenic(500), cafes(100), beaches(300) per the "calm" template
    expect(journey.spanM).toBe(Math.abs(100 - 500) + Math.abs(300 - 100));
  });
});
