"use client";

/**
 * ECHO EARTH — reactive ambient sound engine.
 *
 * Fully generative, zero samples. Layers, all subtle and premium:
 *   • drone   — detuned oscillator chord per audio mood, through a breathing lowpass
 *   • weather — looped filtered-noise bed (rain hiss / soft snow / faint city air)
 *   • sub     — a slow ~55 Hz pulse synced to the organism's breath
 *   • blips   — short bell/click envelopes on discovery and category changes
 *
 * Everything reacts: pointer/scroll energy opens the master filter, weather
 * raises the noise bed, atmospheres bend brightness and level, night deepens
 * the sub. Starts only after a user gesture (autoplay policy) and stays quiet.
 */

import type { Theme, WeatherKind, Atmosphere } from "./environment";

type AudioMood = Theme["audioMood"];

const CHORDS: Record<AudioMood, number[]> = {
  warm: [110, 164.81, 220, 329.63], // A2 E3 A3 E4
  cold: [98, 146.83, 246.94, 392], // G2 D3 B3 G4 — open, glassy
  neon: [87.31, 130.81, 207.65, 311.13], // F2 C3 G#3 D#4 — synthetic
  rainy: [103.83, 155.56, 233.08, 311.13], // G#2 D#3 A#3 D#4 — soft minor
};

// per-weather noise bed: filter type, center freq, and how loud it sits
const WEATHER_BED: Record<WeatherKind, { type: BiquadFilterType; freq: number; q: number; level: number }> = {
  rain: { type: "bandpass", freq: 2400, q: 0.6, level: 0.05 },
  drizzle: { type: "bandpass", freq: 2000, q: 0.7, level: 0.03 },
  thunder: { type: "bandpass", freq: 1800, q: 0.5, level: 0.06 },
  snow: { type: "lowpass", freq: 700, q: 0.4, level: 0.022 },
  mist: { type: "lowpass", freq: 500, q: 0.4, level: 0.018 },
  clouds: { type: "lowpass", freq: 900, q: 0.3, level: 0.012 },
  clear: { type: "lowpass", freq: 1200, q: 0.3, level: 0.008 }, // faint city air
  unknown: { type: "lowpass", freq: 800, q: 0.3, level: 0.008 },
};

class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private oscs: OscillatorNode[] = [];
  private mood: AudioMood | null = null;

  // weather bed
  private noiseSrc: AudioBufferSourceNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;
  private subGain: GainNode | null = null;

  private weather: WeatherKind = "unknown";
  private atmosphere: Atmosphere = "auto";
  private night = false;
  muted = true;

  start(mood: AudioMood) {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      const ctx = this.ctx;

      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(ctx.destination);

      // drone bus — breathing lowpass
      this.filter = ctx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 320;
      this.filter.Q.value = 0.8;
      this.filter.connect(this.master);

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain);
      lfoGain.connect(this.filter.frequency);
      lfo.start();

      // weather bed — looped noise buffer through a tunable filter
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        // brown-ish noise: smoother, less harsh than white
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
      this.noiseSrc = ctx.createBufferSource();
      this.noiseSrc.buffer = buf;
      this.noiseSrc.loop = true;
      this.noiseFilter = ctx.createBiquadFilter();
      this.noiseGain = ctx.createGain();
      this.noiseGain.gain.value = 0;
      this.noiseSrc.connect(this.noiseFilter);
      this.noiseFilter.connect(this.noiseGain);
      this.noiseGain.connect(this.master);
      this.noiseSrc.start();

      // sub-bass breath pulse — ~55 Hz, gain swelled by a slow LFO
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = 55;
      this.subGain = ctx.createGain();
      this.subGain.gain.value = 0;
      const subLfo = ctx.createOscillator();
      subLfo.frequency.value = 0.16; // ~one swell every 6s, near the breath
      const subLfoGain = ctx.createGain();
      subLfoGain.gain.value = 0.018;
      subLfo.connect(subLfoGain);
      subLfoGain.connect(this.subGain.gain);
      sub.connect(this.subGain);
      this.subGain.connect(this.master);
      sub.start();
      subLfo.start();
    }
    this.ctx.resume();
    this.setMood(mood);
    this.applyWeather();
    this.muted = false;
    this.master!.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 4);
  }

  setMood(mood: AudioMood) {
    if (!this.ctx || !this.filter || mood === this.mood) return;
    this.mood = mood;
    for (const o of this.oscs) {
      try {
        o.stop(this.ctx.currentTime + 2);
      } catch {}
    }
    this.oscs = [];
    for (const freq of CHORDS[mood]) {
      for (const detune of [-4, 4]) {
        const osc = this.ctx.createOscillator();
        osc.type = mood === "neon" ? "sawtooth" : mood === "cold" ? "triangle" : "sine";
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const g = this.ctx.createGain();
        g.gain.value = 0;
        g.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 3);
        osc.connect(g);
        g.connect(this.filter);
        osc.start();
        this.oscs.push(osc);
      }
    }
  }

  /** Weather drives the noise bed character + level. */
  reactWeather(kind: WeatherKind, isNight = this.night) {
    this.weather = kind;
    this.night = isNight;
    this.applyWeather();
  }

  private applyWeather() {
    if (!this.ctx || !this.noiseFilter || !this.noiseGain || !this.subGain) return;
    const bed = WEATHER_BED[this.weather] ?? WEATHER_BED.unknown;
    // atmospheres recolor the bed: cyber rain forces wet hiss, midnight hushes
    let level = bed.level;
    let freq = bed.freq;
    if (this.atmosphere === "cyberrain" || this.atmosphere === "neonstorm") {
      level = Math.max(level, 0.05);
      freq = 2600;
    } else if (this.atmosphere === "midnight" || this.atmosphere === "calmpulse") {
      level *= 0.5;
    } else if (this.atmosphere === "chaos") {
      level = Math.max(level, 0.06);
    }
    const now = this.ctx.currentTime;
    this.noiseFilter.type = this.atmosphere === "cyberrain" || this.atmosphere === "neonstorm" ? "bandpass" : bed.type;
    this.noiseFilter.frequency.setTargetAtTime(freq, now, 1.5);
    this.noiseFilter.Q.value = bed.q;
    this.noiseGain.gain.setTargetAtTime(level, now, 2);
    // night deepens the sub swell
    this.subGain.gain.cancelScheduledValues(now);
  }

  setAtmosphere(a: Atmosphere) {
    this.atmosphere = a;
    this.applyWeather();
  }

  /** Pointer/touch/scroll energy opens the master filter — call with 0..1. */
  excite(amount: number) {
    if (!this.ctx || !this.filter || this.muted) return;
    const f = 320 + amount * 1400;
    this.filter.frequency.cancelScheduledValues(this.ctx.currentTime);
    this.filter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.4);
  }

  /** Short tactile sound on interaction. "select" = soft bell, "tick" = click. */
  blip(kind: "select" | "tick" = "tick") {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = kind === "select" ? "sine" : "triangle";
    const base = kind === "select" ? 660 : 420;
    osc.frequency.setValueAtTime(base, now);
    if (kind === "select") osc.frequency.exponentialRampToValueAtTime(base * 1.5, now + 0.18);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(kind === "select" ? 0.06 : 0.03, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "select" ? 0.5 : 0.18));
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  stop() {
    if (!this.ctx || !this.master) return;
    this.muted = true;
    this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.5);
  }
}

export const ambient = new AmbientEngine();
