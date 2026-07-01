"use client";

/**
 * MovementMap — the geointelligence view: zones as glowing intensity nodes with
 * live movement particles flowing between them, a sweeping telemetry grid, and a
 * scanning radar line. Cyberpunk control-room / F1-telemetry feel. Canvas 2D,
 * fully procedural — driven by the Intel zones.
 */

import { useEffect, useRef } from "react";
import type { Zone } from "@/lib/intel";

export default function MovementMap({ zones }: { zones: Zone[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const zonesRef = useRef(zones);
  zonesRef.current = zones;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let w = 0;
    let h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // flow particles between random zone pairs
    type P = { a: number; b: number; t: number; speed: number };
    let flows: P[] = [];
    const seedFlows = () => {
      const n = zonesRef.current.length;
      flows = Array.from({ length: Math.min(40, n * 5) }, () => ({
        a: Math.floor(Math.random() * n),
        b: Math.floor(Math.random() * n),
        t: Math.random(),
        speed: 0.15 + Math.random() * 0.35,
      }));
    };
    seedFlows();

    const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--ee-accent").trim() || "#5fe6ff";

    const draw = (time: number) => {
      const zs = zonesRef.current;
      ctx.clearRect(0, 0, w, h);
      const t = time / 1000;
      const acc = accent();

      // telemetry grid
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      const step = 44;
      for (let x = 0; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // radar sweep
      const cx = w / 2;
      const cy = h / 2;
      const ang = (t * 0.5) % (Math.PI * 2);
      const grad = ctx.createConicGradient?.(ang, cx, cy);
      if (grad) {
        grad.addColorStop(0, "rgba(255,255,255,0.06)");
        grad.addColorStop(0.08, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      const px = (n: number) => n * w;
      const py = (n: number) => n * h;

      // flows
      for (const f of flows) {
        const a = zs[f.a];
        const b = zs[f.b];
        if (!a || !b || f.a === f.b) continue;
        f.t += f.speed * 0.006;
        if (f.t > 1) {
          f.t = 0;
          f.a = Math.floor(Math.random() * zs.length);
          f.b = Math.floor(Math.random() * zs.length);
        }
        const x = px(a.x) + (px(b.x) - px(a.x)) * f.t;
        const y = py(a.y) + (py(b.y) - py(a.y)) * f.t;
        // faint connective line
        ctx.strokeStyle = `hsla(${a.hue}, 80%, 65%, 0.06)`;
        ctx.beginPath();
        ctx.moveTo(px(a.x), py(a.y));
        ctx.lineTo(px(b.x), py(b.y));
        ctx.stroke();
        // moving pulse
        ctx.beginPath();
        ctx.fillStyle = `hsla(${a.hue}, 95%, 78%, 0.9)`;
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // zone nodes
      for (const z of zs) {
        const x = px(z.x);
        const y = py(z.y);
        const r = 6 + (z.intensity / 100) * 26;
        const pulse = 1 + Math.sin(t * 1.5 + z.hue) * 0.12;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4 * pulse);
        g.addColorStop(0, `hsla(${z.hue}, 90%, 62%, ${0.35 + (z.intensity / 100) * 0.5})`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.4 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = `hsla(${z.hue}, 40%, 96%, 0.95)`;
        ctx.arc(x, y, Math.max(2, r * 0.22), 0, Math.PI * 2);
        ctx.fill();
        if (z.emerging) {
          ctx.strokeStyle = `hsla(52, 95%, 70%, ${0.5 + Math.sin(t * 3) * 0.3})`;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.arc(x, y, r + 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.font = "10px var(--font-geist-mono), monospace";
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.textAlign = "center";
        ctx.fillText(z.name, x, y + r + 14);
        ctx.fillStyle = acc;
        ctx.fillText(`${z.intensity}`, x, y + 3);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="h-full w-full" aria-label="Live movement intelligence map" role="img" />;
}
