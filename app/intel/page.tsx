"use client";

/**
 * ECHO EARTH — Tourism & Mobility Intelligence command centre.
 *
 * A cinematic analytics surface: live city pulse, geointelligence movement map,
 * AI demand forecasts, trending & emerging zones, visitor source mix and spend.
 * Runs on the demo-intelligence engine (lib/intel) off real location + weather;
 * real anonymized movement streams plug into the same shapes later.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useEnvironment } from "@/engine/useEnvironment";
import { computeIntel, flag, Activity } from "@/lib/intel";
import MovementMap from "@/components/intel/MovementMap";

const fmtHour = (h: number) => `${String(h).padStart(2, "0")}:00`;

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`ee-glass p-4 ${className}`}>
      <h2 className="mb-3 text-[10px] uppercase tracking-[0.3em]" style={{ color: "var(--ee-text-dim)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function IntelDashboard() {
  const { env, theme } = useEnvironment();
  const [mounted, setMounted] = useState(false);
  const [tick, setTick] = useState(0);
  const [activity, setActivity] = useState<Activity | null>(null);

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setTick((t) => t + 1), 5000); // gentle live refresh
    return () => clearInterval(id);
  }, []);

  // live venue pulse: poll the real open/closed status of nearby venues
  useEffect(() => {
    if (env.lat == null || env.lon == null) return;
    let alive = true;
    const load = () =>
      fetch(`/api/pulse?lat=${env.lat}&lon=${env.lon}`)
        .then((r) => r.json())
        .then((d) => {
          if (alive && d && typeof d.openRatio === "number") setActivity(d as Activity);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 90000); // refresh live data ~every 90s
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [env.lat, env.lon]);

  const intel = useMemo(() => {
    if (env.lat == null || env.lon == null) return null;
    return computeIntel({ lat: env.lat, lon: env.lon, now: env.now, weather: env.weather.kind, season: theme.season, activity: activity ?? undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env.lat, env.lon, env.weather.kind, theme.season, env.now, tick, activity]);

  if (!mounted) return <main className="min-h-dvh" style={{ background: "var(--ee-bg-deep)" }} />;

  const nowH = env.now.getHours();

  return (
    <main className="min-h-dvh px-3 py-3 sm:px-5 sm:py-4" style={{ background: "radial-gradient(120% 120% at 50% 0%, var(--ee-bg) 0%, var(--ee-bg-deep) 100%)", color: "var(--ee-text)" }}>
      {/* top bar */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="ee-breathe inline-block h-3 w-3 rounded-full" style={{ background: "var(--ee-accent)", boxShadow: "0 0 14px var(--ee-glow)" }} />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.4em] ee-glow-text">echo earth · intelligence</p>
            <p className="text-[10px] tracking-wider" style={{ color: "var(--ee-text-dim)" }}>
              {env.city ? `${env.city}${env.country ? ", " + env.country : ""}` : "locating…"} · {env.now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {intel && intel.venuesTotal > 0 && (
            <span className="ee-glass !rounded-full px-3 py-1 text-[10px] tabular-nums tracking-wider" style={{ color: "var(--ee-text-dim)" }}>
              {intel.venuesOpen}/{intel.venuesTotal} venues open now
            </span>
          )}
          <span className="ee-glass flex items-center gap-1.5 !rounded-full px-3 py-1 text-[10px] tracking-widest" style={{ color: intel?.live ? "var(--ee-accent)" : "var(--ee-text-dim)" }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full ee-breathe" style={{ background: intel?.live ? "var(--ee-accent)" : "var(--ee-text-dim)" }} /> {intel?.live ? "LIVE" : "DEMO"}
          </span>
          <Link href="/" className="ee-glass !rounded-full px-3 py-1.5 text-xs" style={{ color: "var(--ee-text-dim)" }}>
            ← experience
          </Link>
        </div>
      </header>

      {!intel ? (
        <div className="grid min-h-[60vh] place-items-center">
          <p className="animate-pulse text-sm tracking-[0.3em] uppercase" style={{ color: "var(--ee-text-dim)" }}>
            synchronizing city pulse…
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {/* ---- movement map + pulse overlay ---- */}
          <div className="ee-glass relative overflow-hidden lg:col-span-2" style={{ height: "min(58vh, 520px)" }}>
            <MovementMap zones={intel.zones} />
            <div className="pointer-events-none absolute left-4 top-4">
              <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "var(--ee-text-dim)" }}>
                city energy index
              </p>
              <div className="flex items-end gap-2">
                <span className="text-5xl font-extralight ee-glow-text tabular-nums">{intel.energyIndex}</span>
                <span className="mb-2 text-sm tabular-nums" style={{ color: intel.trend >= 0 ? "hsl(140,70%,65%)" : "hsl(0,70%,70%)" }}>
                  {intel.trend >= 0 ? "▲" : "▼"} {Math.abs(intel.trend)}%
                </span>
              </div>
              <p className="mt-1 text-[11px] uppercase tracking-[0.25em]" style={{ color: "var(--ee-accent)" }}>
                {intel.crowd}
              </p>
            </div>
            <div className="pointer-events-none absolute inset-x-4 bottom-3">
              <p className="text-xs font-light" style={{ color: "var(--ee-text)" }}>
                <span style={{ color: "var(--ee-accent)" }}>◆ trending now · </span>
                {intel.headline}
              </p>
            </div>
          </div>

          {/* ---- AI forecasts ---- */}
          <Panel title="AI demand forecast · next ~2h">
            <ul className="space-y-2.5">
              {intel.forecasts.map((f) => {
                const up = f.next >= f.now;
                return (
                  <li key={f.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: "var(--ee-text)" }}>{f.label}</span>
                      <span className="tabular-nums" style={{ color: up ? "hsl(140,70%,65%)" : "hsl(30,80%,65%)" }}>
                        {f.now} → {f.next} {up ? "▲" : "▼"}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--ee-line)" }}>
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${f.next}%`, background: "var(--ee-accent)", boxShadow: "0 0 8px var(--ee-glow)" }} />
                    </div>
                    <p className="mt-0.5 text-[10px] italic" style={{ color: "var(--ee-text-dim)" }}>
                      {f.driver}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Panel>

          {/* ---- 24h movement curve ---- */}
          <Panel title="24-hour movement rhythm" className="lg:col-span-2">
            <div className="flex h-28 items-end gap-1">
              {intel.hourly.map((v, hr) => (
                <div key={hr} className="group relative flex-1">
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${v}%`,
                      minHeight: 2,
                      background: hr === nowH ? "var(--ee-accent)" : hr === intel.peakHour ? "var(--ee-accent2)" : "var(--ee-line)",
                      boxShadow: hr === nowH ? "0 0 10px var(--ee-glow)" : "none",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[9px]" style={{ color: "var(--ee-text-dim)" }}>
              <span>00:00</span>
              <span>peak {fmtHour(intel.peakHour)}</span>
              <span>now {fmtHour(nowH)}</span>
              <span>23:00</span>
            </div>
          </Panel>

          {/* ---- visitor sources ---- */}
          <Panel title="Visitor source mix">
            <ul className="space-y-2">
              {intel.sources.map((s) => (
                <li key={s.code} className="flex items-center gap-2 text-xs">
                  <span className="text-base leading-none">{flag(s.code)}</span>
                  <span className="w-24 truncate" style={{ color: "var(--ee-text)" }}>{s.name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--ee-line)" }}>
                    <div className="h-full rounded-full" style={{ width: `${s.pct * 2.6}%`, maxWidth: "100%", background: "var(--ee-accent)" }} />
                  </div>
                  <span className="w-8 text-right tabular-nums" style={{ color: "var(--ee-text-dim)" }}>{s.pct}%</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-[11px]" style={{ background: "var(--ee-surface)" }}>
              <span style={{ color: "var(--ee-text-dim)" }}>local vs tourist</span>
              <span style={{ color: "var(--ee-text)" }}>{intel.localPct}% local · {100 - intel.localPct}% visitor</span>
            </div>
          </Panel>

          {/* ---- trending & emerging zones ---- */}
          <Panel title="Trending & emerging zones" className="lg:col-span-2">
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[...intel.zones].sort((a, b) => b.intensity - a.intensity).slice(0, 6).map((z) => (
                <li key={z.name} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "var(--ee-surface)", border: "1px solid var(--ee-line)" }}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] tabular-nums" style={{ background: `hsla(${z.hue},80%,60%,0.2)`, color: `hsl(${z.hue},80%,72%)` }}>
                    {z.intensity}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm" style={{ color: "var(--ee-text)" }}>
                      <span className="truncate">{z.name}</span>
                      {z.emerging && <span className="rounded-full px-1.5 text-[9px] uppercase tracking-wider" style={{ background: "hsla(52,90%,60%,0.2)", color: "hsl(52,90%,72%)" }}>emerging</span>}
                    </span>
                    <span className="text-[10px]" style={{ color: z.delta >= 0 ? "hsl(140,70%,65%)" : "hsl(0,70%,70%)" }}>
                      {z.delta >= 0 ? "▲" : "▼"} {Math.abs(z.delta)}% vs typical
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          {/* ---- spend + weather impact ---- */}
          <Panel title="Signals">
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-[0.25em]" style={{ color: "var(--ee-text-dim)" }}>est. spend / visitor tonight</p>
              <p className="text-3xl font-extralight ee-glow-text tabular-nums">€{intel.spendEstimate}</p>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--ee-text-dim)" }}>
              <span style={{ color: "var(--ee-accent)" }}>weather impact · </span>
              {intel.weatherImpact}
            </p>
          </Panel>

          {/* ---- data stream ticker ---- */}
          <div className="ee-glass overflow-hidden lg:col-span-3">
            <div className="flex items-center gap-6 whitespace-nowrap px-4 py-2 text-[11px] tabular-nums" style={{ color: "var(--ee-text-dim)" }}>
              <span style={{ color: "var(--ee-accent)" }}>▚ STREAM</span>
              <span>energy {intel.energyIndex}</span>
              <span>crowd {intel.crowd}</span>
              {intel.forecasts.map((f) => (
                <span key={f.id}>
                  {f.label.toLowerCase()} {f.now}→{f.next}
                </span>
              ))}
              <span>spend €{intel.spendEstimate}</span>
              <span>local {intel.localPct}%</span>
              <span style={{ color: "var(--ee-text-dim)" }}>· {intel.live ? "live intelligence" : "demo intelligence"} · GDPR-safe, anonymized ·</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
