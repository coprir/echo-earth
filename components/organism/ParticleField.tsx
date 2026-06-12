"use client";

/**
 * ParticleField — the organism's atmosphere, rendered in WebGL.
 *
 * One instanced points system whose behavior morphs by ParticleMode:
 *   rain      — fast vertical streaks
 *   snow      — slow tumbling drift
 *   embers    — rising warm sparks
 *   fireflies — wandering glow points (night)
 *   frost     — near-still crystalline shimmer
 *   dust      — lazy sunlit motes
 * Density scales with the device performance tier; pointer position bends
 * the field so the air visibly responds to the visitor.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { ParticleMode } from "@/engine/environment";

const COUNTS: Record<ParticleMode, number> = {
  none: 0,
  dust: 900,
  rain: 2200,
  snow: 1400,
  embers: 700,
  fireflies: 350,
  frost: 600,
};

function Field({ mode, density, accent }: { mode: ParticleMode; density: number; accent: string }) {
  const points = useRef<THREE.Points>(null);
  const { viewport, pointer } = useThree();
  const count = Math.floor(COUNTS[mode] * density) || 1;

  const { positions, speeds, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8;
      speeds[i] = 0.4 + Math.random() * 0.8;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, speeds, phases };
  }, [count]);

  const color = useMemo(() => new THREE.Color(accent), [accent]);

  useFrame((state, dt) => {
    const p = points.current;
    if (!p) return;
    const arr = (p.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const t = state.clock.elapsedTime;
    const px = pointer.x * viewport.width * 0.5;
    const py = pointer.y * viewport.height * 0.5;
    const clampedDt = Math.min(dt, 0.05);

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      let x = arr[ix];
      let y = arr[ix + 1];
      const s = speeds[i];
      const ph = phases[i];

      switch (mode) {
        case "rain":
          y -= s * 18 * clampedDt;
          x -= s * 2 * clampedDt;
          break;
        case "snow":
          y -= s * 1.6 * clampedDt;
          x += Math.sin(t * 0.8 + ph) * 0.8 * clampedDt;
          break;
        case "embers":
          y += s * 2.2 * clampedDt;
          x += Math.sin(t * 1.4 + ph) * 0.5 * clampedDt;
          break;
        case "fireflies":
          x += Math.sin(t * 0.5 + ph) * 0.7 * clampedDt;
          y += Math.cos(t * 0.4 + ph * 1.7) * 0.7 * clampedDt;
          break;
        case "frost":
          x += Math.sin(t * 0.2 + ph) * 0.1 * clampedDt;
          y += Math.cos(t * 0.15 + ph) * 0.08 * clampedDt;
          break;
        default: // dust
          x += Math.sin(t * 0.3 + ph) * 0.3 * clampedDt;
          y += s * 0.25 * clampedDt;
      }

      // the air bends gently away from the pointer
      const dx = x - px;
      const dy = y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < 6) {
        const f = (1 - d2 / 6) * 1.6 * clampedDt;
        x += dx * f;
        y += dy * f;
      }

      // wrap
      if (y < -9) y = 9;
      if (y > 9) y = -9;
      if (x < -13) x = 13;
      if (x > 13) x = -13;
      arr[ix] = x;
      arr[ix + 1] = y;
    }
    p.geometry.attributes.position.needsUpdate = true;
    (p.material as THREE.PointsMaterial).color.lerp(color, 0.02);
  });

  return (
    <points ref={points} key={`${mode}-${count}`}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={mode === "rain" ? 0.045 : mode === "fireflies" ? 0.14 : 0.08}
        transparent
        opacity={mode === "frost" || mode === "dust" ? 0.45 : 0.7}
        color={accent}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function ParticleField({ mode, density, accent }: { mode: ParticleMode; density: number; accent: string }) {
  if (mode === "none" || density <= 0) return null;
  return (
    <div className="fixed inset-0 pointer-events-none" aria-hidden>
      <Canvas
        camera={{ position: [0, 0, 10], fov: 60 }}
        gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
        dpr={[1, 1.5]}
      >
        <Field mode={mode} density={density} accent={accent} />
      </Canvas>
    </div>
  );
}
