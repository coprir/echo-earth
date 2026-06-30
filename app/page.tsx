"use client";

/**
 * ECHO EARTH — the organism's body.
 * Senses (useEnvironment) → mood (Theme) → atmosphere (ParticleField) →
 * discovery field (NeuralMap + orbs + modes) → memory (useAdaptiveMind).
 */

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEnvironment } from "@/engine/useEnvironment";
import { useAdaptiveMind, watchTravelMode } from "@/engine/useAdaptiveMind";
import { ambient } from "@/engine/audio";
import { CategoryId, Place } from "@/lib/places";
import { rankCategories, filterPlaces } from "@/lib/recommend";
import { useLang, useT, dirOf } from "@/lib/i18n";
import PlanetaryEntry from "@/components/planet/PlanetaryEntry";
import NeuralMap from "@/components/map/NeuralMap";
import LivingMap from "@/components/map/LivingMap";
import CategoryOrbs from "@/components/discovery/CategoryOrbs";
import MoodModes from "@/components/discovery/MoodModes";
import PlaceDetail from "@/components/discovery/PlaceDetail";
import VitalsHUD from "@/components/hud/VitalsHUD";
import Consciousness from "@/components/organism/Consciousness";
import AtmospherePicker from "@/components/discovery/AtmospherePicker";
import Concierge from "@/components/concierge/Concierge";
import About from "@/components/about/About";

const ParticleField = dynamic(() => import("@/components/organism/ParticleField"), { ssr: false });

export default function EchoEarth() {
  const { env, theme } = useEnvironment();
  const mind = useAdaptiveMind();
  const { t, lang } = useT();
  const autoFromCountry = useLang((s) => s.autoFromCountry);
  const autoFromNavigator = useLang((s) => s.autoFromNavigator);
  const [awake, setAwake] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [category, setCategory] = useState<CategoryId>("cafes");
  const [places, setPlaces] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [dataMode, setDataMode] = useState<"live" | "echo" | null>(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    setMounted(true);
    useAdaptiveMind.getState().wake();
    autoFromNavigator();
    return watchTravelMode();
  }, [autoFromNavigator]);

  // language: auto-select from IP country (unless the visitor chose manually)
  useEffect(() => {
    if (env.country) autoFromCountry(env.country);
  }, [env.country, autoFromCountry]);

  // reflect language + direction on <html> (RTL for Arabic)
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dirOf(lang);
  }, [lang]);

  // onboarding sequence: once the planet has dived in, greet new visitors with
  // the "what is this?" intro; returning-this-session visitors skip straight to
  // the concierge. Closing the intro releases the concierge auto-open.
  useEffect(() => {
    if (!awake) return;
    let seen = true;
    try {
      seen = sessionStorage.getItem("ee-about-seen") === "1";
    } catch {}
    if (seen) {
      setIntroDone(true);
      return;
    }
    const t = setTimeout(() => setAboutOpen(true), 700);
    return () => clearTimeout(t);
  }, [awake]);

  const closeAbout = useCallback(() => {
    setAboutOpen(false);
    try {
      sessionStorage.setItem("ee-about-seen", "1");
    } catch {}
    setIntroDone(true);
  }, []);

  // ambient audio follows the mood and reacts to pointer energy
  useEffect(() => {
    if (!ambient.muted) ambient.setMood(theme.audioMood);
  }, [theme.audioMood]);
  // the weather noise bed follows the real sky + time of day
  useEffect(() => {
    const night = theme.phase === "night" || theme.phase === "latenight";
    ambient.reactWeather(env.weather.kind, night);
  }, [env.weather.kind, theme.phase]);
  // synthetic atmospheres recolor the sound character
  useEffect(() => {
    ambient.setAtmosphere(mind.atmosphere);
  }, [mind.atmosphere]);
  useEffect(() => {
    const onMove = () => ambient.excite(env.motionEnergy);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [env.motionEnergy]);

  // fetch places whenever location or category changes
  useEffect(() => {
    if (env.lat == null || env.lon == null) return;
    let alive = true;
    fetch(`/api/places?lat=${env.lat}&lon=${env.lon}&category=${category}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setPlaces(d.places ?? []);
        setDataMode(d.mode ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [env.lat, env.lon, category]);

  const rankedCategories = useMemo(
    () => rankCategories(mind.mode, mind.travel, theme.phase, env.weather.kind, mind.favorites()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mind.mode, mind.travel, theme.phase, env.weather.kind, mind.affinities]
  );

  const visiblePlaces = useMemo(() => filterPlaces(places, mind.mode), [places, mind.mode]);

  const pickCategory = useCallback((id: CategoryId) => {
    setCategory(id);
    setSelected(null);
    ambient.blip("tick");
    useAdaptiveMind.getState().noticeCategory(id);
  }, []);

  // concierge hands a journey stop to the map: switch category, fly to it, open it
  const focusPlace = useCallback((p: Place) => {
    setCategory(p.category);
    setSelected(p);
    ambient.blip("select");
    useAdaptiveMind.getState().noticeCategory(p.category, 0.15);
  }, []);

  const pickPlace = useCallback((p: Place) => {
    setSelected(p);
    ambient.blip("select");
    const m = useAdaptiveMind.getState();
    m.noticeCategory(p.category, 0.2);
    m.recordDiscovery();
  }, []);

  if (!mounted) {
    return <main className="min-h-dvh" style={{ background: "var(--ee-bg-deep)" }} />;
  }

  return (
    <main className="relative min-h-dvh overflow-hidden">
      {!awake && <PlanetaryEntry env={env} theme={theme} onDone={() => setAwake(true)} />}

      <ParticleField mode={theme.particles} density={theme.particleDensity} accent={theme.palette.accent} />

      <VitalsHUD env={env} theme={theme} travel={mind.travel} onAbout={() => setAboutOpen(true)} />

      <About open={aboutOpen} onClose={closeAbout} />

      {/* the City Consciousness — the organism's living voice */}
      {awake && <Consciousness env={env} category={category} placeCount={visiblePlaces.length} />}

      {/* Digital Weather System — synthetic atmosphere selector */}
      {awake && <AtmospherePicker />}

      {/* AI City Concierge — energy intent → personalized movement journey */}
      {awake && <Concierge lat={env.lat} lon={env.lon} city={env.city} onFocusPlace={focusPlace} autoOpen={introDone} />}

      {/* the discovery field */}
      <motion.section
        className="relative z-10 flex flex-col h-dvh pt-24 landscape:pt-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: awake ? 1 : 0 }}
        transition={{ duration: 1.6, ease: "easeOut" }}
        aria-label={t("field.aria")}
      >
        {/* neural city */}
        <div className="relative flex-1 mx-2 my-3 ee-breathe" style={{ animationDuration: "calc(var(--ee-breath) * 2)" }}>
          {env.lat != null && env.lon != null && <LivingMap lat={env.lat} lon={env.lon} theme={theme} zoom={mapZoom} />}
          <NeuralMap
            places={visiblePlaces}
            selectedId={selected?.id ?? null}
            onSelect={pickPlace}
            motionIntensity={theme.motionIntensity}
            onZoom={(z) => setMapZoom(Math.round(z * 10) / 10)}
          />
          {visiblePlaces.length === 0 && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <p className="text-xs tracking-[0.3em] uppercase animate-pulse" style={{ color: "var(--ee-text-dim)" }}>
                {t("field.growing")}
              </p>
            </div>
          )}
          {dataMode === "echo" && (
            <p className="absolute bottom-1 right-3 text-[9px] tracking-wider" style={{ color: "var(--ee-text-dim)" }}>
              {t("field.demo")}
            </p>
          )}
        </div>

        {/* controls */}
        <div className="pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
          <MoodModes active={mind.mode} onPick={(m) => useAdaptiveMind.getState().setMode(m)} />
          <CategoryOrbs categories={rankedCategories} active={category} onPick={pickCategory} />
        </div>
      </motion.section>

      <PlaceDetail place={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
