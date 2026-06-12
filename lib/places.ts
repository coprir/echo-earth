/**
 * Discovery engine — category genome + Place types shared by client and API.
 */

export type CategoryId =
  | "hotels"
  | "taverns"
  | "cafes"
  | "cocktails"
  | "petrol"
  | "clubs"
  | "restaurants"
  | "gems"
  | "pharmacies"
  | "beaches"
  | "scenic"
  | "gyms"
  | "fastfood"
  | "coworking";

export interface Category {
  id: CategoryId;
  label: string;
  icon: string; // emoji glyph — replaced by generated icons later
  /** Google Places API (New) includedTypes */
  gTypes: string[];
  keyword?: string;
  hue: number; // node color identity on the neural map
}

export const CATEGORIES: Category[] = [
  { id: "cafes", label: "Cafés", icon: "☕", gTypes: ["cafe", "coffee_shop"], hue: 32 },
  { id: "restaurants", label: "Restaurants", icon: "🍽", gTypes: ["restaurant"], hue: 8 },
  { id: "cocktails", label: "Cocktail Bars", icon: "🍸", gTypes: ["bar"], keyword: "cocktail", hue: 320 },
  { id: "taverns", label: "Taverns", icon: "🍺", gTypes: ["bar", "pub"], keyword: "tavern", hue: 45 },
  { id: "clubs", label: "Clubs", icon: "🎛", gTypes: ["night_club"], hue: 280 },
  { id: "hotels", label: "Hotels", icon: "🛏", gTypes: ["hotel", "lodging"], hue: 210 },
  { id: "beaches", label: "Beaches", icon: "🌊", gTypes: ["beach"], hue: 190 },
  { id: "scenic", label: "Scenic", icon: "🌄", gTypes: ["tourist_attraction", "scenic_lookout"], hue: 150 },
  { id: "gems", label: "Hidden Gems", icon: "✨", gTypes: ["point_of_interest"], keyword: "hidden gem", hue: 60 },
  { id: "petrol", label: "Petrol", icon: "⛽", gTypes: ["gas_station"], hue: 0 },
  { id: "pharmacies", label: "Pharmacies", icon: "✚", gTypes: ["pharmacy"], hue: 130 },
  { id: "gyms", label: "Gyms", icon: "🏋", gTypes: ["gym", "fitness_center"], hue: 255 },
  { id: "fastfood", label: "Fast Food", icon: "🍔", gTypes: ["fast_food_restaurant", "meal_takeaway"], hue: 22 },
  { id: "coworking", label: "Coworking", icon: "💻", gTypes: ["coworking_space"], keyword: "coworking", hue: 175 },
];

export const categoryById = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!;

export interface Place {
  id: string;
  name: string;
  category: CategoryId;
  lat: number;
  lon: number;
  rating: number;
  priceLevel: number; // 0..4
  openNow: boolean | null;
  distanceM: number;
  bearing: number; // degrees from user, drives the neural-map layout
  address: string;
  isGem: boolean; // high rating + low review count = hidden gem
  source: "google" | "echo"; // echo = demo-mode synthesis
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lon2 - lon1) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/* ----------------------------------------------------------------------- */
/* Demo-mode synthesis: when no Google key is configured, ECHO EARTH grows  */
/* a believable city around the visitor so the experience always works.     */
/* ----------------------------------------------------------------------- */

const NAME_BANKS: Record<CategoryId, string[]> = {
  cafes: ["Aurora Beans", "The Quiet Cup", "Mara Roastery", "Static & Steam", "Lumen Coffee", "Paper Moon Café"],
  restaurants: ["Ember & Oak", "Casa Lumina", "The Salt Garden", "Nyota Kitchen", "Maru Table", "Driftwood Dining"],
  cocktails: ["Neon Botanist", "The Velvet Orbit", "Halcyon Bar", "Smoke & Citrus", "Zero Gravity Lounge"],
  taverns: ["The Brass Anchor", "Old Meridian Tavern", "Stone & Barrel", "The Wandering Fox"],
  clubs: ["Pulse Theory", "Bassline District", "Club Helios", "Afterglow", "The Voltage Room"],
  hotels: ["Hotel Meridian", "The Echo Grand", "Solace Suites", "Atlas House", "Horizon Stay"],
  beaches: ["Crescent Bay", "Silversand Shore", "Driftpoint Beach", "Lagoon Edge"],
  scenic: ["Skyline Ridge", "The Overlook", "Botanic Crown", "Sunset Terraces", "Old Quarter Walk"],
  gems: ["The Unmarked Door", "Backstreet Vinyl & Tea", "Rooftop Allotment", "The Midnight Bakery"],
  petrol: ["Apex Fuel", "Northgate Station", "Rapid Energy", "Meridian Petrol"],
  pharmacies: ["Carewell Pharmacy", "Luna Chemists", "Vital Point", "Greenleaf Pharmacy"],
  gyms: ["Forge Athletics", "Kinetic Lab", "Iron Orbit", "Pulseworks Gym"],
  fastfood: ["Stacked!", "Midnight Shawarma", "Crispy Theory", "Rocket Slice Pizza"],
  coworking: ["The Assembly", "Node Workspace", "Daylight Desk", "Orbit Commons"],
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic per-location synthesis — the same street corner always grows the same city. */
export function synthesizePlaces(lat: number, lon: number, category: CategoryId, count = 8): Place[] {
  const rand = mulberry32(Math.floor(lat * 1000) * 31 + Math.floor(lon * 1000) * 7 + category.length * 1013);
  const names = NAME_BANKS[category];
  const places: Place[] = [];
  for (let i = 0; i < count; i++) {
    const distance = 180 + rand() * 2800;
    const bearing = rand() * 360;
    const dLat = (distance * Math.cos((bearing * Math.PI) / 180)) / 111320;
    const dLon = (distance * Math.sin((bearing * Math.PI) / 180)) / (111320 * Math.cos((lat * Math.PI) / 180));
    const rating = Math.round((3.4 + rand() * 1.6) * 10) / 10;
    const reviews = Math.floor(rand() * 900);
    places.push({
      id: `echo-${category}-${i}`,
      name: names[i % names.length] + (i >= names.length ? ` ${["II", "North", "East", "Annex"][i % 4]}` : ""),
      category,
      lat: lat + dLat,
      lon: lon + dLon,
      rating,
      priceLevel: Math.floor(rand() * 4),
      openNow: rand() > 0.25,
      distanceM: Math.round(distance),
      bearing,
      address: `${Math.floor(rand() * 200) + 1} ${["Meridian", "Harbor", "Acacia", "Signal", "Garden"][Math.floor(rand() * 5)]} ${["St", "Ave", "Lane", "Rd"][Math.floor(rand() * 4)]}`,
      isGem: rating >= 4.5 && reviews < 120,
      source: "echo",
    });
  }
  return places.sort((a, b) => a.distanceM - b.distanceM);
}
