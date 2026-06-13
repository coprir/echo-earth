"use client";

/**
 * useEnvironment — the organism's sensory nervous system.
 *
 * Gathers every signal the browser will give us (geolocation, weather, device,
 * battery, network, motion, light preference, scroll energy) into one EnvSignals
 * object, and re-resolves the Theme whenever anything meaningful changes.
 * Every sensor is optional and SSR-safe: missing senses degrade, never crash.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useAdaptiveMind } from "./useAdaptiveMind";
import {
  EnvSignals,
  Theme,
  DeviceKind,
  PerfTier,
  WeatherKind,
  resolveTheme,
  applyTheme,
} from "./environment";

const MUTATION_MS = 1000 * 60 * 3; // the organism drifts every 3 minutes

function visitorSeed(): number {
  try {
    const k = "ee-visitor-seed";
    const existing = localStorage.getItem(k);
    if (existing) return parseFloat(existing);
    const seed = Math.random();
    localStorage.setItem(k, String(seed));
    return seed;
  } catch {
    return 0.42;
  }
}

function detectDevice(): { device: DeviceKind; isTouch: boolean } {
  if (typeof window === "undefined") return { device: "desktop", isTouch: false };
  const ua = navigator.userAgent;
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const phone = /iPhone|Android.+Mobile/i.test(ua);
  const tablet = /iPad|Android(?!.*Mobile)/i.test(ua) || (isTouch && Math.min(screen.width, screen.height) > 600);
  return { device: phone ? "phone" : tablet ? "tablet" : "desktop", isTouch };
}

function detectPerfTier(device: DeviceKind): PerfTier {
  if (typeof window === "undefined") return "mid";
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  if (cores >= 12 && mem >= 8 && device === "desktop") return "high";
  if (cores >= 6 && mem >= 4) return "mid";
  return "low";
}

export interface GeoState {
  lat: number | null;
  lon: number | null;
  city: string | null;
  country: string | null;
  source: "gps" | "ip" | "none";
}

export function useEnvironment() {
  const [geo, setGeo] = useState<GeoState>({ lat: null, lon: null, city: null, country: null, source: "none" });
  const [weather, setWeather] = useState<EnvSignals["weather"]>({ kind: "unknown", tempC: null, description: "sensing…" });
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [batterySaver, setBatterySaver] = useState(false);
  const [netSpeed, setNetSpeed] = useState<EnvSignals["netSpeed"]>("unknown");
  const [prefersDark, setPrefersDark] = useState(true);
  const [prefersReducedMotion, setPRM] = useState(false);
  const [mutationTick, setMutationTick] = useState(0);
  const [motionEnergy, setMotionEnergy] = useState(0.4);
  const [screenW, setScreenW] = useState(1200);
  const [screenH, setScreenH] = useState(800);
  const [clock, setClock] = useState(() => new Date());

  const { device, isTouch } = useMemo(detectDevice, []);
  const perfTier = useMemo(() => detectPerfTier(device), [device]);
  const seed = useMemo(visitorSeed, []);
  const energyRef = useRef(0.4);

  // ---- location: IP first (instant, no permission), then upgrade to GPS ----
  useEffect(() => {
    let alive = true;
    fetch("/api/geo")
      .then((r) => r.json())
      .then((d) => {
        if (alive && d.lat != null && geoRef.current.source !== "gps")
          setGeo({ lat: d.lat, lon: d.lon, city: d.city, country: d.country, source: "ip" });
      })
      .catch(() => {});
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => alive && setGeo((g) => ({ ...g, lat: pos.coords.latitude, lon: pos.coords.longitude, source: "gps" })),
        () => {},
        { timeout: 8000, maximumAge: 600000 }
      );
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const geoRef = useRef(geo);
  geoRef.current = geo;

  // ---- weather, refreshed when location changes and every 15 min ----
  useEffect(() => {
    if (geo.lat == null) return;
    let alive = true;
    const load = () =>
      fetch(`/api/weather?lat=${geo.lat}&lon=${geo.lon}`)
        .then((r) => r.json())
        .then((d) => alive && setWeather({ kind: d.kind as WeatherKind, tempC: d.tempC, description: d.description }))
        .catch(() => {});
    load();
    const id = setInterval(load, 15 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [geo.lat, geo.lon]);

  // ---- battery ----
  useEffect(() => {
    const nav = navigator as unknown as { getBattery?: () => Promise<{ level: number; addEventListener: (e: string, f: () => void) => void }> };
    nav.getBattery?.().then((b) => {
      const update = () => {
        setBatteryLevel(b.level);
        setBatterySaver(b.level < 0.15);
      };
      update();
      b.addEventListener("levelchange", update);
    });
  }, []);

  // ---- network ----
  useEffect(() => {
    const conn = (navigator as unknown as { connection?: { effectiveType?: string; saveData?: boolean; addEventListener?: (e: string, f: () => void) => void } }).connection;
    if (!conn) return;
    const update = () => {
      setNetSpeed(conn.effectiveType === "4g" ? "fast" : "slow");
      if (conn.saveData) setBatterySaver(true);
    };
    update();
    conn.addEventListener?.("change", update);
  }, []);

  // ---- media queries: dark, reduced motion ----
  useEffect(() => {
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const prm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setPrefersDark(dark.matches);
      setPRM(prm.matches);
    };
    apply();
    dark.addEventListener("change", apply);
    prm.addEventListener("change", apply);
    return () => {
      dark.removeEventListener("change", apply);
      prm.removeEventListener("change", apply);
    };
  }, []);

  // ---- screen size ----
  useEffect(() => {
    const update = () => {
      setScreenW(window.innerWidth);
      setScreenH(window.innerHeight);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ---- motion energy: scroll velocity + pointer speed + device motion ----
  useEffect(() => {
    let lastY = window.scrollY;
    let lastX = 0;
    let lastPY = 0;
    let lastT = performance.now();
    const bump = (amount: number) => {
      energyRef.current = Math.min(1, energyRef.current * 0.92 + amount);
    };
    const onScroll = () => {
      bump(Math.min(0.3, Math.abs(window.scrollY - lastY) / 800));
      lastY = window.scrollY;
    };
    const onPointer = (e: PointerEvent) => {
      const now = performance.now();
      const dt = Math.max(16, now - lastT);
      const v = Math.hypot(e.clientX - lastX, e.clientY - lastPY) / dt;
      bump(Math.min(0.15, v * 0.05));
      lastX = e.clientX;
      lastPY = e.clientY;
      lastT = now;
    };
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (a) bump(Math.min(0.2, (Math.abs(a.x ?? 0) + Math.abs(a.y ?? 0)) / 80));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("devicemotion", onMotion);
    const decay = setInterval(() => {
      energyRef.current = Math.max(0.15, energyRef.current * 0.97);
      setMotionEnergy(energyRef.current);
    }, 1500);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("devicemotion", onMotion);
      clearInterval(decay);
    };
  }, []);

  // ---- slow biological clocks ----
  useEffect(() => {
    const mut = setInterval(() => setMutationTick((t) => t + 1), MUTATION_MS);
    const clk = setInterval(() => setClock(new Date()), 60 * 1000);
    return () => {
      clearInterval(mut);
      clearInterval(clk);
    };
  }, []);

  const env: EnvSignals = useMemo(
    () => ({
      now: clock,
      lat: geo.lat,
      lon: geo.lon,
      city: geo.city,
      country: geo.country,
      weather,
      device,
      isTouch,
      screenW,
      screenH,
      batteryLevel,
      batterySaver,
      netSpeed,
      prefersDark,
      prefersReducedMotion,
      perfTier,
      motionEnergy,
      visitorSeed: seed,
      mutationTick,
    }),
    [clock, geo, weather, device, isTouch, screenW, screenH, batteryLevel, batterySaver, netSpeed, prefersDark, prefersReducedMotion, perfTier, motionEnergy, seed, mutationTick]
  );

  const atmosphere = useAdaptiveMind((s) => s.atmosphere);
  const theme: Theme = useMemo(() => resolveTheme(env, atmosphere), [env, atmosphere]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return { env, theme, geo };
}
