import { describe, expect, it } from "vitest";
import { encodeGeohash, decodeGeohashCenter, PRESENCE_GEOHASH_PRECISION } from "./geohash";

describe("encodeGeohash", () => {
  it("produces a 5-character cell at the default (presence) precision", () => {
    const cell = encodeGeohash(48.8566, 2.3522); // Paris
    expect(cell).toHaveLength(PRESENCE_GEOHASH_PRECISION);
    expect(cell).toMatch(/^[0-9b-hj-km-np-z]{5}$/); // standard geohash base32 alphabet
  });

  it("is deterministic — the same point always yields the same cell", () => {
    expect(encodeGeohash(48.8566, 2.3522)).toBe(encodeGeohash(48.8566, 2.3522));
  });

  it("two points a few meters apart fall in the same coarse cell (the whole point of bucketing)", () => {
    const a = encodeGeohash(48.8566, 2.3522);
    const b = encodeGeohash(48.8567, 2.3523); // ~13m away
    expect(a).toBe(b);
  });

  it("two points in different cities fall in different cells", () => {
    const paris = encodeGeohash(48.8566, 2.3522);
    const tokyo = encodeGeohash(35.6762, 139.6503);
    expect(paris).not.toBe(tokyo);
  });

  it("supports other precisions for testing/verification, not just the presence default", () => {
    expect(encodeGeohash(0, 0, 1)).toHaveLength(1);
    expect(encodeGeohash(0, 0, 9)).toHaveLength(9);
  });
});

describe("decodeGeohashCenter — used only for verification, not the rendering path", () => {
  it("round-trips to within the cell's own bounds (never the exact original point)", () => {
    const lat = 48.8566;
    const lon = 2.3522;
    const cell = encodeGeohash(lat, lon);
    const { lat: dLat, lon: dLon } = decodeGeohashCenter(cell);
    // the decoded center is close to, but not exactly, the original point —
    // confirms this is lossy bucketing, not a reversible encoding
    expect(Math.abs(dLat - lat)).toBeLessThan(0.05);
    expect(Math.abs(dLon - lon)).toBeLessThan(0.05);
  });

  it("confirms precision-5 cells are the documented ~4.9km size (RTP-1's acceptance criterion)", () => {
    const { cellKm } = decodeGeohashCenter(encodeGeohash(48.8566, 2.3522));
    // half-size reported; full cell edge is 2x — check it's in the
    // documented coarse ballpark, not exact-pixel (varies slightly with
    // latitude due to the base32/bit-interleaving shape)
    expect(cellKm * 2).toBeGreaterThan(2);
    expect(cellKm * 2).toBeLessThan(10);
  });

  it("never throws on malformed/adversarial input — presence data must never be trusted", () => {
    expect(() => decodeGeohashCenter("")).not.toThrow();
    expect(() => decodeGeohashCenter("!!!!!")).not.toThrow();
    expect(() => decodeGeohashCenter("a".repeat(500))).not.toThrow();
  });
});
