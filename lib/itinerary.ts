/**
 * ECHO EARTH — AI City Concierge: the itinerary engine.
 *
 * The concierge doesn't return a list of places — it composes a *movement
 * journey*: an ordered sequence of stops chosen for how a human emotionally
 * moves through a night, with connective narration between them. Each "energy"
 * the visitor picks maps to a journey template, a synthetic atmosphere, and a
 * discovery mode, so choosing an energy re-skins the whole organism and re-tunes
 * what it surfaces.
 *
 * Deterministic and offline today (works with the demo city); composeJourney()
 * is the clean swap-point for an LLM/vector-recommendation layer later.
 */

import { CategoryId, Place, categoryById } from "./places";
import type { Atmosphere } from "@/engine/environment";
import type { MoodMode } from "@/engine/useAdaptiveMind";

export type Energy = "calm" | "social" | "luxurious" | "underground" | "romantic" | "productive" | "chaotic";

export interface EnergyDef {
  id: Energy;
  label: string;
  glyph: string;
  question: string; // the one-line the concierge offers
  atmosphere: Atmosphere;
  mode: MoodMode;
  title: string; // journey title
  subtitle: string;
  steps: { category: CategoryId; note: string }[];
}

export const ENERGIES: EnergyDef[] = [
  {
    id: "calm",
    label: "Calm",
    glyph: "◌",
    question: "somewhere the city slows down",
    atmosphere: "calmpulse",
    mode: "explore",
    title: "A Slow Current",
    subtitle: "an unhurried drift through the quiet of the city",
    steps: [
      { category: "scenic", note: "begin where the city exhales" },
      { category: "cafes", note: "a quiet cup to settle into" },
      { category: "beaches", note: "let the water carry the rest" },
    ],
  },
  {
    id: "social",
    label: "Social",
    glyph: "❋",
    question: "warmth, people, easy laughter",
    atmosphere: "neonstorm",
    mode: "explore",
    title: "Where the City Gathers",
    subtitle: "a route toward other people and open doors",
    steps: [
      { category: "cafes", note: "warm up where there's a hum of voices" },
      { category: "taverns", note: "find the easy laughter" },
      { category: "cocktails", note: "where the night pools together" },
    ],
  },
  {
    id: "luxurious",
    label: "Luxurious",
    glyph: "♦",
    question: "the city's upper atmosphere",
    atmosphere: "goldensunset",
    mode: "luxury",
    title: "The Upper Atmosphere",
    subtitle: "the rare, the refined, the worth-dressing-for",
    steps: [
      { category: "hotels", note: "start in the upper air" },
      { category: "cocktails", note: "something rare in a low-lit room" },
      { category: "restaurants", note: "a table worth dressing for" },
      { category: "scenic", note: "end above it all" },
    ],
  },
  {
    id: "underground",
    label: "Underground",
    glyph: "◑",
    question: "the secrets the locals keep",
    atmosphere: "midnight",
    mode: "hiddengems",
    title: "Beneath the Surface",
    subtitle: "doors most people walk straight past",
    steps: [
      { category: "gems", note: "a door with no sign" },
      { category: "taverns", note: "the locals' worst-kept secret" },
      { category: "clubs", note: "follow the bass down" },
    ],
  },
  {
    id: "romantic",
    label: "Romantic",
    glyph: "✶",
    question: "slow light and someone beside you",
    atmosphere: "goldensunset",
    mode: "explore",
    title: "The Golden Hour Trail",
    subtitle: "for two, and the hour that forgives everything",
    steps: [
      { category: "scenic", note: "catch the light as it turns gold" },
      { category: "cocktails", note: "two glasses, one slow hour" },
      { category: "restaurants", note: "a long table for two" },
    ],
  },
  {
    id: "productive",
    label: "Productive",
    glyph: "▲",
    question: "focus, fuel, and momentum",
    atmosphere: "aurora",
    mode: "explore",
    title: "The Focus Path",
    subtitle: "for the days you need the city to work with you",
    steps: [
      { category: "coworking", note: "set up your base" },
      { category: "cafes", note: "refuel without losing the thread" },
      { category: "gyms", note: "burn the restlessness off" },
    ],
  },
  {
    id: "chaotic",
    label: "Chaotic",
    glyph: "✺",
    question: "no plan, all night",
    atmosphere: "chaos",
    mode: "latenight",
    title: "No Plan, All Night",
    subtitle: "let the city decide what happens to you",
    steps: [
      { category: "cocktails", note: "start loud" },
      { category: "clubs", note: "lose the plot" },
      { category: "fastfood", note: "the 3am reward" },
      { category: "gems", note: "wherever the night drags you" },
    ],
  },
];

export const energyById = (id: Energy) => ENERGIES.find((e) => e.id === id)!;

export interface JourneyStop {
  place: Place;
  note: string;
  index: number;
}

export interface Journey {
  energy: Energy;
  title: string;
  subtitle: string;
  stops: JourneyStop[];
  /** total walking-ish distance across the route, metres */
  spanM: number;
}

/** The unique categories an energy's journey needs (for fetching). */
export function energyCategories(energy: Energy): CategoryId[] {
  return [...new Set(energyById(energy).steps.map((s) => s.category))];
}

/**
 * Compose the journey: pick the best real place for each step, avoiding repeats.
 * `offset` lets the visitor "regenerate" for the next-best options.
 */
export function composeJourney(energy: Energy, placesByCategory: Partial<Record<CategoryId, Place[]>>, offset = 0): Journey {
  const def = energyById(energy);
  const used = new Set<string>();
  const stops: JourneyStop[] = [];

  def.steps.forEach((step, i) => {
    const pool = (placesByCategory[step.category] ?? [])
      .filter((p) => !used.has(p.id))
      // concierge prefers open, well-rated, reasonably close
      .sort((a, b) => b.rating - a.rating || a.distanceM - b.distanceM);
    if (!pool.length) return;
    const pick = pool[(offset + i) % pool.length] ?? pool[0];
    used.add(pick.id);
    stops.push({ place: pick, note: step.note, index: stops.length + 1 });
  });

  const spanM = stops.reduce((sum, s, i) => (i === 0 ? 0 : sum + Math.abs(s.place.distanceM - stops[i - 1].place.distanceM)), 0);

  return { energy, title: def.title, subtitle: def.subtitle, stops, spanM };
}

/** A one-line the concierge says when it hands over a journey. */
export function journeyWhisper(j: Journey, city: string | null): string {
  if (!j.stops.length) return "the city's quiet here — I couldn't trace a full route. try another energy?";
  const where = city ? ` across ${city}` : "";
  const lead = j.stops[0]?.place.name;
  return `here's your route${where} — ${j.stops.length} stops, beginning at ${lead}. follow me.`;
}

const icon = (c: CategoryId) => categoryById(c).icon;
export { icon as stopIcon };
