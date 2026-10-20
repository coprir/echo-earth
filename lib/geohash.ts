/**
 * Coarse, one-way location bucketing for presence (RTP-1 in
 * IMPLEMENTATION_PLAN.md). Standard geohash encoding — lossy by design: a
 * precision-5 cell is ~4.9km × 4.9km, large enough that "someone is in this
 * cell" carries no meaningful location information, and the encoding cannot
 * be reversed to recover the original coordinate, only the cell's bounds.
 *
 * This is the *only* function in the codebase that is allowed to see a
 * visitor's real lat/lon for the presence feature — everything downstream
 * (the Realtime channel payload, other visitors' browsers, this app's own
 * logs) only ever sees the resulting cell string. See
 * docs/realtime-presence.md for the full privacy threat model.
 */

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Default precision: ~4.9km × 4.9km cells — deliberately coarse. */
export const PRESENCE_GEOHASH_PRECISION = 5;

export function encodeGeohash(lat: number, lon: number, precision = PRESENCE_GEOHASH_PRECISION): string {
  let latRange: [number, number] = [-90, 90];
  let lonRange: [number, number] = [-180, 180];
  let hash = "";
  let bits = 0;
  let bitCount = 0;
  let evenBit = true; // alternates starting with longitude

  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lonRange[0] + lonRange[1]) / 2;
      if (lon >= mid) {
        bits = (bits << 1) | 1;
        lonRange = [mid, lonRange[1]];
      } else {
        bits = bits << 1;
        lonRange = [lonRange[0], mid];
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (lat >= mid) {
        bits = (bits << 1) | 1;
        latRange = [mid, latRange[1]];
      } else {
        bits = bits << 1;
        latRange = [latRange[0], mid];
      }
    }
    evenBit = !evenBit;
    bitCount++;
    if (bitCount === 5) {
      hash += BASE32[bits];
      bits = 0;
      bitCount = 0;
    }
  }
  return hash;
}

/** Decodes a geohash back to its cell's *center* point and half-size (km) — never the original point. */
export function decodeGeohashCenter(cell: string): { lat: number; lon: number; cellKm: number } {
  let latRange: [number, number] = [-90, 90];
  let lonRange: [number, number] = [-180, 180];
  let evenBit = true;

  for (const char of cell.toLowerCase()) {
    const idx = BASE32.indexOf(char);
    if (idx === -1) continue; // malformed input — skip rather than throw, never trust remote data
    for (let n = 4; n >= 0; n--) {
      const bit = (idx >> n) & 1;
      if (evenBit) {
        const mid = (lonRange[0] + lonRange[1]) / 2;
        lonRange = bit ? [mid, lonRange[1]] : [lonRange[0], mid];
      } else {
        const mid = (latRange[0] + latRange[1]) / 2;
        latRange = bit ? [mid, latRange[1]] : [latRange[0], mid];
      }
      evenBit = !evenBit;
    }
  }
  const lat = (latRange[0] + latRange[1]) / 2;
  const lon = (lonRange[0] + lonRange[1]) / 2;
  // ~111.32km per degree latitude; longitude narrows by cos(lat)
  const cellKm = ((latRange[1] - latRange[0]) * 111.32) / 2;
  return { lat, lon, cellKm };
}
