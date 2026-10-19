import { describe, expect, it } from "vitest";
import { citySlug, presenceTopic, parsePresencePayload } from "./presence";

describe("citySlug", () => {
  it("combines city and country into a lowercase, hyphenated slug", () => {
    expect(citySlug("Paris", "FR")).toBe("paris-fr");
  });

  it("strips accents and non-alphanumeric characters", () => {
    expect(citySlug("São Paulo", "BR")).toBe("sao-paulo-br");
    expect(citySlug("Lefkoşa", "TR")).toBe("lefkosa-tr");
  });

  it("falls back to a constant bucket rather than refusing to join, when location is unknown", () => {
    expect(citySlug(null, null)).toBe("unknown");
  });

  it("handles city-only or country-only gracefully", () => {
    expect(citySlug("Nairobi", null)).toBe("nairobi");
    expect(citySlug(null, "KE")).toBe("ke");
  });

  it("caps length so a pathological input can't produce an unbounded channel name", () => {
    const huge = "a".repeat(500);
    expect(citySlug(huge, null).length).toBeLessThanOrEqual(60);
  });
});

describe("presenceTopic", () => {
  it("scopes the Realtime channel topic per city", () => {
    expect(presenceTopic("Paris", "FR")).toBe("presence:city:paris-fr");
  });
});

describe("parsePresencePayload — defends against untrusted remote data", () => {
  it("accepts a well-formed cell payload", () => {
    expect(parsePresencePayload({ cell: "u09tv" })).toEqual({ cell: "u09tv" });
  });

  it("rejects non-objects, missing cell, and wrong-typed cell", () => {
    expect(parsePresencePayload(null)).toBeNull();
    expect(parsePresencePayload(undefined)).toBeNull();
    expect(parsePresencePayload("u09tv")).toBeNull();
    expect(parsePresencePayload({})).toBeNull();
    expect(parsePresencePayload({ cell: 12345 })).toBeNull();
    expect(parsePresencePayload({ cell: null })).toBeNull();
  });

  it("rejects an attempt to smuggle raw coordinates or other fields through the cell string", () => {
    expect(parsePresencePayload({ cell: "48.8566,2.3522" })).toBeNull(); // commas/dots not in the geohash alphabet
    expect(parsePresencePayload({ cell: "<script>" })).toBeNull();
    expect(parsePresencePayload({ cell: "a".repeat(5000) })).toBeNull(); // length-bounded
  });

  it("is case-insensitive-safe (lowercase only, by construction of encodeGeohash, but defends anyway)", () => {
    expect(parsePresencePayload({ cell: "U09TV" })).toBeNull(); // our own encoder never emits uppercase — a payload that does is suspect
  });
});
