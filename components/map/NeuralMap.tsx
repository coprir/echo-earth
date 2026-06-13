"use client";

/**
 * NeuralMap — the city rendered as a living neural network.
 *
 * The visitor is the nucleus at center; nearby places are neurons placed by
 * real bearing + distance, connected by filaments that fire light pulses.
 * The whole field breathes, sways toward the pointer, and ripples like
 * liquid glass. Canvas 2D, fully procedural — works with zero API keys.
 * When a Google Maps key is present, LivingMap renders real tiles beneath it.
 *
 * The field is zoomable: wheel / pinch zoom anchored at the pointer, drag to
 * pan, +/− controls — so clustered neighborhoods can be pulled apart.
 */

import { useEffect, useRef } from "react";
import type { Place } from "@/lib/places";
import { categoryById } from "@/lib/places";

interface Props {
  places: Place[];
  selectedId: string | null;
  onSelect: (p: Place) => void;
  motionIntensity: number;
  /** Reports the current zoom factor (1 = default) so tile layers can follow. */
  onZoom?: (z: number) => void;
}

interface Node {
  place: Place;
  x: number; // world coords, normalized 0..1
  y: number;
  tx: number;
  ty: number;
  sx: number; // last drawn screen position (for hit-testing)
  sy: number;
  r: number;
  hue: number;
  born: number;
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 8;

export default function NeuralMap({ places, selectedId, onSelect, motionIntensity, onZoom }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const pointerRef = useRef({ x: 0.5, y: 0.5 });
  // gyroscope tilt, normalized -1..1, drives parallax on touch devices
  const tiltRef = useRef({ x: 0, y: 0 });
  // view transform: screen = center + (world - 0.5) * size * z + pan
  const viewRef = useRef({ z: 1, px: 0, py: 0 });
  const propsRef = useRef({ selectedId, onSelect, motionIntensity, onZoom });
  propsRef.current = { selectedId, onSelect, motionIntensity, onZoom };

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
        sx: 0,
        sy: 0,
        r: 7 + p.rating * 1.6,
        hue: categoryById(p.category).hue,
        born: now + i * 90, // staggered birth
      };
    });
  }, [places]);

  // zoom helper shared by wheel, pinch and buttons — anchored at a screen point
  const zoomAt = (factor: number, ax: number, ay: number, w: number, h: number) => {
    const v = viewRef.current;
    const newZ = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z * factor));
    const applied = newZ / v.z;
    if (applied === 1) return;
    // keep the world point under (ax, ay) fixed on screen
    v.px = ax - w / 2 - (ax - w / 2 - v.px) * applied;
    v.py = ay - h / 2 - (ay - h / 2 - v.py) * applied;
    v.z = newZ;
    // soft clamp pan so the field can't be flung out of reach
    const maxPanX = w * v.z * 0.6;
    const maxPanY = h * v.z * 0.6;
    v.px = Math.max(-maxPanX, Math.min(maxPanX, v.px));
    v.py = Math.max(-maxPanY, Math.min(maxPanY, v.py));
    propsRef.current.onZoom?.(v.z);
  };
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

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
    // orientation change (touch rotate) doesn't always trip the ResizeObserver
    // synchronously, so re-measure explicitly after the rotation settles.
    const onOrient = () => setTimeout(resize, 120);
    window.addEventListener("orientationchange", onOrient);

    // ---- gyroscope parallax: the field leans with the device ----
    const onOrientation = (e: DeviceOrientationEvent) => {
      // gamma: left-right tilt (-90..90), beta: front-back (-180..180)
      const isLandscape = window.innerWidth > window.innerHeight;
      const lr = (e.gamma ?? 0) / 45;
      const fb = ((e.beta ?? 0) - 45) / 45; // ~45° is a natural holding angle
      tiltRef.current = {
        x: Math.max(-1, Math.min(1, isLandscape ? fb : lr)),
        y: Math.max(-1, Math.min(1, isLandscape ? -lr : fb)),
      };
    };
    window.addEventListener("deviceorientation", onOrientation);

    // ---- pointer interaction: hover sway, drag pan, pinch zoom ----
    const active = new Map<number, { x: number; y: number }>();
    let dragDistance = 0;
    let lastPinchDist = 0;
    let gyroAsked = false;

    const onPointerDown = (e: PointerEvent) => {
      // iOS 13+ needs a user gesture to unlock motion sensors
      if (!gyroAsked) {
        gyroAsked = true;
        const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
        DOE?.requestPermission?.().catch(() => {});
      }
      canvas.setPointerCapture(e.pointerId);
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragDistance = 0;
      if (active.size === 2) {
        const [a, b] = [...active.values()];
        lastPinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
      const prev = active.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragDistance += Math.hypot(dx, dy);

      if (active.size === 1) {
        // drag pan
        const v = viewRef.current;
        v.px += dx;
        v.py += dy;
      } else if (active.size === 2) {
        // pinch zoom anchored at the midpoint
        const [a, b] = [...active.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastPinchDist > 0) {
          const midX = (a.x + b.x) / 2 - rect.left;
          const midY = (a.y + b.y) / 2 - rect.top;
          zoomAtRef.current(dist / lastPinchDist, midX, midY, w, h);
        }
        lastPinchDist = dist;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      active.delete(e.pointerId);
      if (active.size < 2) lastPinchDist = 0;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAtRef.current(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top, w, h);
    };

    const onClick = (e: MouseEvent) => {
      if (dragDistance > 6) return; // it was a pan, not a tap
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let best: Node | null = null;
      let bestD = 32;
      for (const n of nodesRef.current) {
        const d = Math.hypot(n.sx - mx, n.sy - my);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      if (best) propsRef.current.onSelect(best.place);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("click", onClick);

    const draw = (t: number) => {
      const { selectedId: sel, motionIntensity: mi } = propsRef.current;
      const { z, px: panX, py: panY } = viewRef.current;
      ctx.clearRect(0, 0, w, h);
      const toScreenX = (wx: number) => w / 2 + (wx - 0.5) * w * z + panX;
      const toScreenY = (wy: number) => h / 2 + (wy - 0.5) * h * z + panY;
      const cx = toScreenX(0.5);
      const cy = toScreenY(0.5);
      // pointer position and gyroscope tilt both feed the parallax offset
      // (tilt is centered at 0.5 so a level phone behaves like a centered cursor)
      const px = pointerRef.current.x + tiltRef.current.x * 0.5;
      const py = pointerRef.current.y + tiltRef.current.y * 0.5;
      const breath = 1 + Math.sin(t / 1800) * 0.02 * mi;
      const nodeScale = Math.min(1.7, 0.75 + 0.35 * z); // grow gently with zoom
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

      // sonar ring sweeping outward (in world scale, so it zooms with the city)
      const ringR = ((t / 24) % (Math.min(w, h) * 0.5)) * breath * z;
      ctx.beginPath();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = Math.max(0, 0.25 - ringR / (Math.min(w, h) * 1.6 * z));
      ctx.lineWidth = 1;
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      for (const n of nodesRef.current) {
        if (t < n.born) continue;
        const age = Math.min(1, (t - n.born) / 900);
        // liquid sway: nodes drift toward target with pointer attraction + sine wander
        const wander = (0.006 * mi) / z; // calmer when zoomed in, so labels stay readable
        const targetX = n.tx + Math.sin(t / 2300 + n.hue) * wander + ((px - 0.5) * 0.02 * mi) / z;
        const targetY = n.ty + Math.cos(t / 2700 + n.hue) * wander + ((py - 0.5) * 0.02 * mi) / z;
        n.x += (targetX - n.x) * 0.04;
        n.y += (targetY - n.y) * 0.04;
        const nx = toScreenX(n.x);
        const ny = toScreenY(n.y);
        n.sx = nx;
        n.sy = ny;

        // skip work for nodes far off-screen
        if (nx < -120 || nx > w + 120 || ny < -120 || ny > h + 120) continue;

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
        const r = n.r * age * pulse * nodeScale * (isSel ? 1.5 : 1);
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
        if (isSel || z >= 2.2) {
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
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("orientationchange", onOrient);
      window.removeEventListener("deviceorientation", onOrientation);
    };
  }, []);

  const buttonZoom = (factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    zoomAtRef.current(factor, rect.width / 2, rect.height / 2, rect.width, rect.height);
  };

  const resetView = () => {
    viewRef.current = { z: 1, px: 0, py: 0 };
    propsRef.current.onZoom?.(1);
  };

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing [touch-action:none]"
        aria-label="Neural map of nearby places — scroll or pinch to zoom, drag to pan"
        role="img"
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5" role="group" aria-label="Map zoom controls">
        {[
          { glyph: "+", label: "Zoom in", action: () => buttonZoom(1.5) },
          { glyph: "−", label: "Zoom out", action: () => buttonZoom(1 / 1.5) },
          { glyph: "◌", label: "Reset view", action: resetView },
        ].map((b) => (
          <button
            key={b.label}
            onClick={b.action}
            aria-label={b.label}
            className="ee-glass !rounded-full w-9 h-9 grid place-items-center text-base leading-none transition-transform active:scale-90"
            style={{ color: "var(--ee-text-dim)" }}
          >
            {b.glyph}
          </button>
        ))}
      </div>
      <p className="absolute bottom-1 left-3 text-[9px] tracking-wider pointer-events-none" style={{ color: "var(--ee-text-dim)" }}>
        scroll / pinch to zoom · drag to pan
      </p>
    </div>
  );
}
