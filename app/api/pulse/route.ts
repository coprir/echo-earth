import { NextRequest, NextResponse } from "next/server";
import { CATEGORIES, CategoryId, synthesizePlaces } from "@/lib/places";

/**
 * Live city pulse — real-time venue activity.
 *
 * Aggregates the real open/closed status of real nearby venues across a
 * representative set of categories (Google Places API New), right now. This is
 * the live signal that grounds the City Energy Index: as venues actually open
 * and close through the day, the numbers move. Falls back to the deterministic
 * demo city when no Google key is set, so the dashboard always has a pulse.
 */

interface GPlace {
  rating?: number;
  currentOpeningHours?: { openNow?: boolean };
}

// categories sampled for the pulse (day + night mix)
const SAMPLE: CategoryId[] = ["cafes", "restaurants", "cocktails", "taverns", "clubs", "gyms"];

async function categoryActivity(lat: number, lon: number, categoryId: CategoryId, key: string) {
  const cat = CATEGORIES.find((c) => c.id === categoryId)!;
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.rating,places.currentOpeningHours.openNow",
    },
    body: JSON.stringify({
      includedTypes: cat.gTypes,
      maxResultCount: 20,
      locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: 5000 } },
    }),
    next: { revalidate: 120 },
  });
  if (!res.ok) throw new Error(`pulse ${categoryId} ${res.status}`);
  const data = await res.json();
  const places = (data.places ?? []) as GPlace[];
  const total = places.length;
  const open = places.filter((p) => p.currentOpeningHours?.openNow).length;
  const rated = places.filter((p) => p.rating);
  const avgRating = rated.length ? rated.reduce((s, p) => s + (p.rating ?? 0), 0) / rated.length : 0;
  return { total, open, avgRating };
}

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lon = parseFloat(req.nextUrl.searchParams.get("lon") ?? "");
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "lat/lon required" }, { status: 400 });
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
  const byCategory: Record<string, { total: number; open: number; avgRating: number }> = {};

  if (key) {
    try {
      const results = await Promise.all(SAMPLE.map((c) => categoryActivity(lat, lon, c, key)));
      SAMPLE.forEach((c, i) => (byCategory[c] = results[i]));
      const total = SAMPLE.reduce((s, c) => s + byCategory[c].total, 0);
      const open = SAMPLE.reduce((s, c) => s + byCategory[c].open, 0);
      if (total > 0) {
        return NextResponse.json({
          mode: "live",
          total,
          open,
          openRatio: open / total,
          byCategory,
          sampledAt: Date.now(),
        });
      }
    } catch {
      // fall through to demo synthesis
    }
  }

  // demo fallback: synthesize open/total from the deterministic city
  let total = 0;
  let open = 0;
  for (const c of SAMPLE) {
    const places = synthesizePlaces(lat, lon, c, 10);
    const o = places.filter((p) => p.openNow).length;
    byCategory[c] = { total: places.length, open: o, avgRating: 4.2 };
    total += places.length;
    open += o;
  }
  return NextResponse.json({ mode: "echo", total, open, openRatio: total ? open / total : 0, byCategory, sampledAt: Date.now() });
}
