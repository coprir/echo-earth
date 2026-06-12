"use client";

/**
 * ECHO EARTH — the organism's body.
 * Senses (useEnvironment) → mood (Theme) → atmosphere (ParticleField) →
 * discovery field (NeuralMap + orbs + modes) → memory (useAdaptiveMind).
 */

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEnvironment } from "@/engine/useEnvironment";
import { useAdaptiveMind, watchTravelMode } from "@/engine/useAdaptiveMind";
import { ambient } from "@/engine/audio";
import { CategoryId, Place } from "@/lib/places";
import { rankCategories, filterPlaces, whisper } from "@/lib/recommend";
import Awakening from "@/components/organism/Awakening";
import NeuralMap from "@/components/map/NeuralMap";
import LivingMap from "@/components/map/LivingMap";
import CategoryOrbs from "@/components/discovery/CategoryOrbs";
import MoodModes from "@/components/discovery/MoodModes";
import PlaceDetail from "@/components/discovery/PlaceDetail";
import VitalsHUD from "@/components/hud/VitalsHUD";

const ParticleField = dynamic(() => import("@/components/organism/ParticleField"), { ssr: false });

export default function EchoEarth() {
  const { env, theme } = useEnvironment();
  const mind = useAdaptiveMind();
  const [awake, setAwake] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [category, setCategory] = useState<CategoryId>("cafes");
  const [places, setPlaces] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [dataMode, setDataMode] = useState<"live" | "echo" | null>(null);
  const [mapZoom, setMapZoom] = useState(1);

  useEffect(() => {
    setMounted(true);
    useAdaptiveMind.getState().wake();
    return watchTravelMode();
  }, []);

  // ambient audio follows the mood and reacts to pointer energy
  useEffect(() => {
    if (!ambient.muted) ambient.setMood(theme.audioMood);
  }, [theme.audioMood]);
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
    useAdaptiveMind.getState().noticeCategory(id);
  }, []);

  const pickPlace = useCallback((p: Place) => {
    setSelected(p);
    useAdaptiveMind.getState().noticeCategory(p.category, 0.2);
  }, []);

  const thought = whisper(mind.mode, theme.phase, env.weather.kind, env.city, mind.travel);

  if (!mounted) {
    return <main className="min-h-dvh" style={{ background: "var(--ee-bg-deep)" }} />;
  }

  return (
    <main className="relative min-h-dvh overflow-hidden">
      {!awake && <Awakening env={env} theme={theme} onDone={() => setAwake(true)} />}

      <ParticleField mode={theme.particles} density={theme.particleDensity} accent={theme.palette.accent} />

      <VitalsHUD env={env} theme={theme} travel={mind.travel} />

      {/* the discovery field */}
      <motion.section
        className="relative z-10 flex flex-col h-dvh pt-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: awake ? 1 : 0 }}
        transition={{ duration: 1.6, ease: "easeOut" }}
        aria-label="Discovery field"
      >
        {/* the organism's current thought */}
        <AnimatePresence mode="wait">
          <motion.p
            key={thought}
            initial={{ opacity: 0, filter: "blur(6px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(6px)" }}
            transition={{ duration: 0.9 }}
            className="text-center text-sm font-light px-6"
            style={{ color: "var(--ee-text-dim)" }}
          >
            {thought}
          </motion.p>
        </AnimatePresence>

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
                growing the city…
              </p>
            </div>
          )}
          {dataMode === "echo" && (
            <p className="absolute bottom-1 right-3 text-[9px] tracking-wider" style={{ color: "var(--ee-text-dim)" }}>
              demo city · no API key
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
