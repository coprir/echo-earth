/**
 * ECHO EARTH — City Consciousness
 *
 * The ambient AI voice of the organism. It observes the environment and the
 * visitor's behavior and speaks in short, poetic, cinematic lines — never
 * robotic, never a chatbot. This is a deterministic generator (no network):
 * it composes from weighted lexical fragments seeded by the moment, so the
 * voice is varied but coherent, and works fully offline. An LLM layer can
 * later replace `compose()` while keeping the same Observation contract.
 */

import type { EnvSignals, TimePhase, WeatherKind, Atmosphere } from "./environment";
import type { MoodMode, TravelMode } from "./useAdaptiveMind";

export interface Observation {
  env: EnvSignals;
  atmosphere: Atmosphere;
  travel: TravelMode;
  mode: MoodMode;
  /** how fast the visitor is interacting, 0..1 */
  energy: number;
  /** categories the visitor keeps returning to */
  favorites: string[];
  /** which category they are currently looking at */
  category: string;
  /** how long since they last touched anything, ms */
  idleMs: number;
  /** number of places revealed in the current view */
  placeCount: number;
}

export type Thought = { text: string; tone: "calm" | "curious" | "electric" | "tender" | "mysterious" };

/** pick from a list using a rolling, non-repeating seed */
function pick<T>(list: T[], seed: number): T {
  return list[Math.floor(Math.abs(Math.sin(seed) * 99999)) % list.length];
}

const PHASE_WORDS: Record<TimePhase, string[]> = {
  dawn: ["the city is waking with you", "first light is touching the rooftops", "the streets are still soft with sleep"],
  day: ["the city is wide awake", "everything is open and humming", "daylight is pouring through the avenues"],
  dusk: ["golden hour is bleeding across the skyline", "the city is exhaling into evening", "the light is going amber and forgiving"],
  night: ["the city is glowing from within", "windows are lighting up like synapses", "the night is settling over the district"],
  latenight: ["only the sleepless doors are still breathing", "the city has gone quiet and electric", "these are the hours that belong to no one"],
};

const WEATHER_WORDS: Partial<Record<WeatherKind, string[]>> = {
  rain: ["rain is falling — the cafés are becoming warm islands", "the streets are turning to mirrors", "rain detected. quiet rooms are lighting up"],
  drizzle: ["a soft drizzle is misting the glass", "the air has gone silver and slow"],
  thunder: ["something restless is moving through the sky", "the air feels charged tonight"],
  snow: ["snow is rewriting the city in white", "the world has gone hushed and crystalline"],
  clear: ["the sky is open and clean", "not a cloud — the city feels limitless"],
  clouds: ["a low ceiling of cloud is holding the city close", "the light is flat and contemplative"],
  mist: ["mist is dissolving the edges of things", "the district is half-erased by fog"],
};

const ATMOSPHERE_WHISPERS: Partial<Record<Atmosphere, string[]>> = {
  dream: ["reality is going soft at the edges", "you're drifting through a half-remembered city"],
  neonstorm: ["there's voltage in the air tonight", "the city is overclocked and glowing"],
  calmpulse: ["everything has slowed to a single heartbeat", "breathe — the city is breathing with you"],
  goldensunset: ["the hour that forgives everything is here", "the whole skyline has turned to honey"],
  cyberrain: ["chrome streets, falling light", "the rain is made of data tonight"],
  midnight: ["the city has gone silent — only the open doors remain", "this is the deep middle of the night"],
  aurora: ["the sky is leaking impossible colors", "something luminous is unfolding overhead"],
  chaos: ["the city has forgotten its own rules", "nothing is holding still tonight"],
};

const BEHAVIOR_INSIGHTS = {
  fastScroll: ["you're moving quickly — I'll surface things faster", "restless tonight? the city is keeping pace with you"],
  slowExplore: ["you like to linger — so will I", "you move through the city gently"],
  driving: ["you're in motion — fuel and quick warmth are lit up ahead", "the road is moving under you; I'm watching the route"],
  walking: ["you're on foot — the close, slow places are glowing", "wandering suits you — the cafés are near"],
  idle: ["take your time. I'll be here, listening to the streets", "the city waits with you", "stillness. the district hums on without urgency"],
  returning: (fav: string) => [`you keep returning to ${fav} — I've been remembering`, `${fav} again. I'm learning the shape of your taste`],
  nightQuiet: ["you prefer quieter places after dark — noted", "after sunset you lean toward the hushed corners"],
};

const MODE_REFLECTIONS: Partial<Record<MoodMode, string[]>> = {
  latenight: ["only what's still awake is pulsing now", "I've dimmed everything that's already closed"],
  rainyday: ["I've gathered the warm, dry rooms for you", "steamed windows and low light — here they are"],
  cheapeats: ["full plates, light wallets — surfacing the honest places", "I've filtered for warmth over price"],
  luxury: ["I've raised the city's upper atmosphere for you", "only the rare and the refined are glowing now"],
  hiddengems: ["the places the maps barely whisper about — here", "I've surfaced the secrets the locals keep"],
};

/** Compose one thought from the current observation. */
export function compose(o: Observation, seed: number): Thought {
  const { env, atmosphere, travel, mode, energy, favorites, idleMs } = o;
  const weatherActive = env.weather.kind !== "unknown" && env.weather.kind !== "clear";

  // priority ladder — the most salient thing the organism notices right now
  type Cand = { text: string; tone: Thought["tone"]; weight: number };
  const cands: Cand[] = [];

  if (atmosphere !== "auto" && ATMOSPHERE_WHISPERS[atmosphere])
    cands.push({ text: pick(ATMOSPHERE_WHISPERS[atmosphere]!, seed), tone: atmosphere === "calmpulse" ? "calm" : atmosphere === "chaos" || atmosphere === "neonstorm" ? "electric" : "mysterious", weight: 6 });

  if (idleMs > 18000) cands.push({ text: pick(BEHAVIOR_INSIGHTS.idle, seed), tone: "calm", weight: 5 });

  if (travel === "driving") cands.push({ text: pick(BEHAVIOR_INSIGHTS.driving, seed), tone: "electric", weight: 7 });
  else if (travel === "walking") cands.push({ text: pick(BEHAVIOR_INSIGHTS.walking, seed), tone: "tender", weight: 4 });

  if (weatherActive && WEATHER_WORDS[env.weather.kind])
    cands.push({ text: pick(WEATHER_WORDS[env.weather.kind]!, seed), tone: env.weather.kind === "rain" || env.weather.kind === "snow" ? "tender" : "mysterious", weight: 5 });

  if (energy > 0.7) cands.push({ text: pick(BEHAVIOR_INSIGHTS.fastScroll, seed), tone: "electric", weight: 3 });
  else if (energy < 0.3 && idleMs < 18000) cands.push({ text: pick(BEHAVIOR_INSIGHTS.slowExplore, seed), tone: "calm", weight: 2 });

  if (favorites.length && Math.abs(Math.sin(seed * 2.3)) > 0.6)
    cands.push({ text: pick(BEHAVIOR_INSIGHTS.returning(favorites[0]), seed), tone: "tender", weight: 4 });

  if ((env.now.getHours() >= 20 || env.now.getHours() < 5) && mode === "explore")
    cands.push({ text: pick(BEHAVIOR_INSIGHTS.nightQuiet, seed), tone: "mysterious", weight: 2 });

  if (mode !== "explore" && MODE_REFLECTIONS[mode])
    cands.push({ text: pick(MODE_REFLECTIONS[mode]!, seed), tone: "curious", weight: 4 });

  // always-available ambient fallbacks so the voice never runs dry
  const hh = env.now.getHours();
  const phase: TimePhase = hh < 5 ? "latenight" : hh < 8 ? "dawn" : hh < 17 ? "day" : hh < 20 ? "dusk" : "night";
  cands.push({ text: pick(PHASE_WORDS[phase], seed), tone: "mysterious", weight: 2 });
  if (env.city) cands.push({ text: `synchronizing with ${env.city.toLowerCase()}…`, tone: "calm", weight: 1 });

  // weighted, seed-jittered choice
  const scored = cands.map((c, i) => ({ c, s: c.weight * (0.6 + 0.8 * Math.abs(Math.sin(seed * 1.7 + i))) }));
  scored.sort((a, b) => b.s - a.s);
  return { text: scored[0].c.text, tone: scored[0].c.tone };
}

/** The very first thing the consciousness says when it wakes, per visitor. */
export function greeting(o: Observation): Thought {
  const where = o.env.city ? ` near ${o.env.city}` : "";
  const lines: Thought[] = [
    { text: `I feel a presence${where}. let me synchronize…`, tone: "mysterious" },
    { text: `someone new${where}. the city is turning to look`, tone: "curious" },
    { text: `welcome back to the surface${where}`, tone: "tender" },
  ];
  return o.env.visitorSeed > 0.5 ? lines[0] : o.favorites.length ? lines[2] : lines[1];
}
