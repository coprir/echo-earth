import { NextRequest, NextResponse } from "next/server";
import { CATEGORIES, CategoryId, Place, bearingDeg, haversineM, synthesizePlaces } from "@/lib/places";

/**
 * Discovery engine API. Uses Google Places API (New) searchNearby when
 * GOOGLE_MAPS_API_KEY is set; otherwise grows a deterministic synthetic city
 * around the visitor (demo mode) so discovery always works.
 */

interface GPlace {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  currentOpeningHours?: { openNow?: boolean };
  shortFormattedAddress?: string;
}

const PRICE: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

async function googleNearby(lat: number, lon: number, categoryId: CategoryId, key: string): Promise<Place[]> {
  const cat = CATEGORIES.find((c) => c.id === categoryId)!;
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours.openNow,places.shortFormattedAddress",
    },
    body: JSON.stringify({
      includedTypes: cat.gTypes,
      maxResultCount: 12,
      locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: 4000 } },
      rankPreference: "POPULARITY",
    }),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`places ${res.status}`);
  const data = await res.json();
  return ((data.places ?? []) as GPlace[])
    .filter((p) => p.location)
    .map((p) => {
      const plat = p.location!.latitude;
      const plon = p.location!.longitude;
      const rating = p.rating ?? 0;
      const reviews = p.userRatingCount ?? 0;
      return {
        id: p.id,
        name: p.displayName?.text ?? "Unnamed",
        category: categoryId,
        lat: plat,
        lon: plon,
        rating,
        priceLevel: PRICE[p.priceLevel ?? ""] ?? 2,
        openNow: p.currentOpeningHours?.openNow ?? null,
        distanceM: Math.round(haversineM(lat, lon, plat, plon)),
        bearing: bearingDeg(lat, lon, plat, plon),
        address: p.shortFormattedAddress ?? "",
        isGem: rating >= 4.5 && reviews > 5 && reviews < 200,
        source: "google" as const,
      };
    })
    .sort((a, b) => a.distanceM - b.distanceM);
}

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lon = parseFloat(req.nextUrl.searchParams.get("lon") ?? "");
  const category = (req.nextUrl.searchParams.get("category") ?? "cafes") as CategoryId;
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "lat/lon required" }, { status: 400 });
  }
  if (!CATEGORIES.some((c) => c.id === category)) {
    return NextResponse.json({ error: "unknown category" }, { status: 400 });
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (key) {
    try {
      const places = await googleNearby(lat, lon, category, key);
      if (places.length) return NextResponse.json({ places, mode: "live" });
    } catch {
      // fall through to demo synthesis
    }
  }

  return NextResponse.json({ places: synthesizePlaces(lat, lon, category), mode: "echo" });
}
