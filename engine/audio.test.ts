import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ambient } from "./audio";

// jsdom provides a real AudioContext-shaped global in some setups, but not
// reliably across environments — stub the Web Audio API minimally so this
// test exercises only the visibility-lifecycle logic under test, not a real
// audio graph.
class FakeAudioContext {
  state: "running" | "suspended" = "running";
  currentTime = 0;
  destination = {};
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  resume = vi.fn(async () => {
    this.state = "running";
  });
  createGain() {
    return { gain: { value: 0, linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, connect: vi.fn() };
  }
  createBiquadFilter() {
    return { type: "lowpass", frequency: { value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, Q: { value: 0 }, connect: vi.fn() };
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(10) };
  }
  createBufferSource() {
    return { buffer: null, loop: false, connect: vi.fn(), start: vi.fn() };
  }
  createOscillator() {
    return { type: "sine", frequency: { value: 0 }, detune: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  }
}

// `ambient` is a genuine singleton in production (one AmbientEngine per page
// load, constructed — and its visibilitychange listener registered — once at
// module-import time), so these tests share that one instance sequentially
// rather than resetting modules between them, which would leave orphaned
// listeners on `document` from the discarded instance.
describe("AmbientEngine visibility lifecycle", () => {
  let originalVisibility: PropertyDescriptor | undefined;

  beforeEach(() => {
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
    originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
  });

  afterEach(() => {
    if (originalVisibility) Object.defineProperty(document, "visibilityState", originalVisibility);
  });

  function setVisibility(state: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  function ctxOf(a: typeof ambient) {
    return (a as unknown as { ctx: FakeAudioContext }).ctx;
  }

  it("suspends the AudioContext when the tab is hidden, and resumes it when visible again (if not muted)", () => {
    ambient.start("warm");
    const ctx = ctxOf(ambient);
    expect(ambient.muted).toBe(false);

    setVisibility("hidden");
    expect(ctx.suspend).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    expect(ctx.resume).toHaveBeenCalled();
  });

  it("does not resume on visibility return if the visitor had muted it", () => {
    ambient.stop();
    const ctx = ctxOf(ambient);
    // start() itself calls resume() once (the real post-gesture resume) —
    // what's under test is whether the hidden→visible cycle calls it again.
    const callsBeforeCycle = ctx.resume.mock.calls.length;

    setVisibility("hidden");
    setVisibility("visible");
    expect(ctx.resume.mock.calls.length).toBe(callsBeforeCycle);
  });
});
