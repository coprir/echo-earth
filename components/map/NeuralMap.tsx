"use client";

/**
 * NeuralMap — the city rendered as a living neural network.
 *
 * The visitor is the nucleus at center; nearby places are neurons placed by
 * real bearing + distance, connected by filaments that fire light pulses.
 * The whole field breathes, sways toward the pointer, and ripples like
 * liquid glass. Canvas 2D, fully procedural — works with zero API keys.
 * When a Google Maps key is present, LivingMap renders real tiles beneath it.
 */

import { useEffect, useRef } from "react";
import type { Place } from "@/lib/places";
import { categoryById } from "@/lib/places";

interface Props {
  places: Place[];
  selectedId: string | null;
  onSelect: (p: Place) => void;
  motionIntensity: number;
}

interface Node {
  place: Place;
  x: number;
  y: number;
  tx: number;
  ty: number;
  r: number;
  hue: number;
  born: number;
}

export default function NeuralMap({ places, selectedId, onSelect, motionIntensity }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const pointerRef = useRef({ x: 0.5, y: 0.5 });
  const propsRef = useRef({ selectedId, onSelect, motionIntensity });
  propsRef.current = { selectedId, onSelect, motionIntensity };

  // rebuild nodes when places change; nodes are laid out by bearing/distance
  useEffect(() => {
    const now = performance.now();
    nodesRef.current = places.map((p, i) => {
      const maxD = Math.max(...places.map((q) => q.distanceM), 1000);
      const radius = 0.16 + 0.72 * Math.sqrt(p.distanceM / maxD); // sqrt: spread inner ring
      const angle = ((p.bearing - 90) * Math.PI) / 180;
      return {
        place: p,
        x: 0.5,
        y: 0.5,
        tx: 0.5 + radius * 0.42 * Math.cos(angle),
        ty: 0.5 + radius * 0.42 * Math.sin(angle),
        r: 7 + p.rating * 1.6,
        hue: categoryById(p.category).hue,
        born: now + i * 90, // staggered birth
      };
    });
  }, [places]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    };
    canvas.addEventListener("pointermove", onMove);

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let best: Node | null = null;
      let bestD = 32;
      for (const n of nodesRef.current) {
        const d = Math.hypot(n.x * w - mx, n.y * h - my);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      if (best) propsRef.current.onSelect(best.place);
    };
    canvas.addEventListener("click", onClick);

    const draw = (t: number) => {
      const { selectedId: sel, motionIntensity: mi } = propsRef.current;
      ctx.clearRect(0, 0, w, h);
      const cx = 0.5 * w;
      const cy = 0.5 * h;
      const px = pointerRef.current.x;
      const py = pointerRef.current.y;
      const breath = 1 + Math.sin(t / 1800) * 0.02 * mi;
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--ee-accent").trim() || "#7df";

      // nucleus — the visitor
      ctx.beginPath();
      const nr = (12 + Math.sin(t / 600) * 2.5 * mi) * breath;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, nr * 4);
      grad.addColorStop(0, accent);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.arc(cx, cy, nr * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = "#fff";
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();

      // sonar ring sweeping outward
      const ringR = ((t / 24) % (Math.min(w, h) * 0.5)) * breath;
      ctx.beginPath();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = Math.max(0, 0.25 - ringR / (Math.min(w, h) * 1.6));
      ctx.lineWidth = 1;
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      for (const n of nodesRef.current) {
        if (t < n.born) continue;
        const age = Math.min(1, (t - n.born) / 900);
        // liquid sway: nodes drift toward target with pointer attraction + sine wander
        const wander = 0.006 * mi;
        const targetX = n.tx + Math.sin(t / 2300 + n.hue) * wander + (px - 0.5) * 0.02 * mi;
        const targetY = n.ty + Math.cos(t / 2700 + n.hue) * wander + (py - 0.5) * 0.02 * mi;
        n.x += (targetX - n.x) * 0.04;
        n.y += (targetY - n.y) * 0.04;
        const nx = n.x * w;
        const ny = n.y * h;

        // filament to nucleus with a traveling firing pulse
        ctx.beginPath();
        ctx.strokeStyle = `hsla(${n.hue}, 80%, 65%, ${0.10 * age})`;
        ctx.lineWidth = 1;
        const midX = (cx + nx) / 2 + Math.sin(t / 1400 + n.hue) * 14 * mi;
        const midY = (cy + ny) / 2 + Math.cos(t / 1600 + n.hue) * 14 * mi;
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(midX, midY, nx, ny);
        ctx.stroke();

        const pulseT = ((t / 1000 + n.hue) % 3) / 3;
        if (pulseT < 1) {
          const q = (a: number, b: number, c: number, tt: number) => (1 - tt) * (1 - tt) * a + 2 * (1 - tt) * tt * b + tt * tt * c;
          ctx.beginPath();
          ctx.fillStyle = `hsla(${n.hue}, 95%, 75%, ${0.7 * age})`;
          ctx.arc(q(cx, midX, nx, pulseT), q(cy, midY, ny, pulseT), 1.6, 0, Math.PI * 2);
          ctx.fill();
        }

        // neuron body
        const isSel = sel === n.place.id;
        const pulse = 1 + Math.sin(t / 700 + n.hue) * 0.12 * mi;
        const r = n.r * age * pulse * (isSel ? 1.5 : 1);
        const g2 = ctx.createRadialGradient(nx, ny, 0, nx, ny, r * 2.6);
        g2.addColorStop(0, `hsla(${n.hue}, 90%, 65%, ${isSel ? 0.95 : 0.65})`);
        g2.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.fillStyle = g2;
        ctx.arc(nx, ny, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = `hsla(${n.hue}, 30%, 96%, ${age})`;
        ctx.arc(nx, ny, Math.max(1.5, r * 0.28), 0, Math.PI * 2);
        ctx.fill();

        if (n.place.isGem) {
          ctx.beginPath();
          ctx.strokeStyle = `hsla(58, 95%, 70%, ${0.7 * age})`;
          ctx.setLineDash([2, 4]);
          ctx.arc(nx, ny, r * 1.7, t / 900, t / 900 + Math.PI * 1.5);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // label
        ctx.font = "11px var(--font-geist-mono), monospace";
        ctx.fillStyle = `hsla(${n.hue}, 25%, 92%, ${isSel ? 1 : 0.65 * age})`;
        ctx.textAlign = "center";
        ctx.fillText(n.place.name, nx, ny + r * 2.2 + 12);
        if (isSel) {
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.fillText(`${(n.place.distanceM / 1000).toFixed(1)} km · ★ ${n.place.rating}`, nx, ny + r * 2.2 + 26);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("click", onClick);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full cursor-pointer" aria-label="Neural map of nearby places" role="img" />;
}
