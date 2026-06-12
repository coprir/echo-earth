"use client";

/**
 * Ambient audio engine — a tiny generative synth, no samples.
 *
 * Builds a drone from detuned oscillators through a lowpass filter.
 * The theme's audioMood picks the chord and timbre; pointer movement
 * opens the filter so the organism audibly responds to touch.
 * Starts only after a user gesture (browser autoplay policy) and stays quiet.
 */

import type { Theme } from "./environment";

type AudioMood = Theme["audioMood"];

const CHORDS: Record<AudioMood, number[]> = {
  warm: [110, 164.81, 220, 329.63], // A2 E3 A3 E4
  cold: [98, 146.83, 246.94, 392], // G2 D3 B3 G4 — open, glassy
  neon: [87.31, 130.81, 207.65, 311.13], // F2 C3 G#3 D#4 — synthetic
  rainy: [103.83, 155.56, 233.08, 311.13], // G#2 D#3 A#3 D#4 — soft minor
};

class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private oscs: OscillatorNode[] = [];
  private mood: AudioMood | null = null;
  muted = true;

  start(mood: AudioMood) {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 320;
      this.filter.Q.value = 0.8;
      this.filter.connect(this.master);
      this.master.connect(this.ctx.destination);

      // slow LFO breathing the filter — the organism's audible breath
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain);
      lfoGain.connect(this.filter.frequency);
      lfo.start();
    }
    this.ctx.resume();
    this.setMood(mood);
    this.muted = false;
    this.master!.gain.linearRampToValueAtTime(0.045, this.ctx.currentTime + 4);
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

  /** Pointer/touch energy opens the filter — call with 0..1. */
  excite(amount: number) {
    if (!this.ctx || !this.filter || this.muted) return;
    const f = 320 + amount * 1400;
    this.filter.frequency.cancelScheduledValues(this.ctx.currentTime);
    this.filter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.4);
  }

  stop() {
    if (!this.ctx || !this.master) return;
    this.muted = true;
    this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.5);
  }
}

export const ambient = new AmbientEngine();
