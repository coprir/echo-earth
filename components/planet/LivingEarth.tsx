"use client";

/**
 * LivingEarth — the planetary scale of ECHO EARTH.
 *
 * A holographic Three.js globe that is genuinely alive:
 *  • a day/night terminator driven by the REAL subsolar point (the visitor's
 *    local time decides which hemisphere is lit when they arrive),
 *  • an atmospheric fresnel halo tinted by the current mood/atmosphere,
 *  • a pulsing beacon at the visitor's true latitude/longitude — Earth finding
 *    the human — with a light pillar reaching toward them,
 *  • drifting orbital particles (satellites / migratory sparks),
 *  • a starfield, slow breath-rotation, and a cinematic "dive" that rotates the
 *    visitor's location to face the camera and falls toward the surface before
 *    handing off to the local neural map.
 *
 * No texture assets — purely procedural geometry + shaders, so it inherits the
 * organism's living color system and never loads an external image.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const DEG = Math.PI / 180;

// lon=0,lat=0 sits at +Z (facing the camera)
function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * DEG;
  const theta = lon * DEG;
  return new THREE.Vector3(r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta));
}

/** Direction to the sun in globe-local space, from date + UTC time. */
function subsolarDir(now: Date): THREE.Vector3 {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start) / 86400000);
  const decl = -23.44 * Math.cos(((360 / 365) * (dayOfYear + 10)) * DEG); // solar declination
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
  const sunLon = (12 - utcHours) * 15; // subsolar longitude (°E)
  return latLonToVec3(decl, sunLon, 1).normalize();
}

function buildGraticule(r: number): Float32Array {
  const pts: number[] = [];
  const push = (lat: number, lon: number) => {
    const v = latLonToVec3(lat, lon, r);
    pts.push(v.x, v.y, v.z);
  };
  const STEP = 4;
  // meridians every 20°
  for (let lon = 0; lon < 360; lon += 20) {
    for (let lat = -90; lat < 90; lat += STEP) {
      push(lat, lon);
      push(lat + STEP, lon);
    }
  }
  // parallels every 20° (skip poles)
  for (let lat = -80; lat <= 80; lat += 20) {
    for (let lon = 0; lon < 360; lon += STEP) {
      push(lat, lon);
      push(lat, lon + STEP);
    }
  }
  return new Float32Array(pts);
}

const GLOBE_VERT = `
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOBE_FRAG = `
  uniform vec3 uAccent;
  uniform vec3 uSun;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    float d = dot(normalize(vWorldNormal), normalize(uSun));
    float lit = smoothstep(-0.05, 0.45, d);
    vec3 night = uAccent * 0.04;
    vec3 day = uAccent * 0.55 + 0.03;
    vec3 col = mix(night, day, lit);
    // a thin bright dawn band along the terminator
    float term = smoothstep(0.0, 0.12, d) * (1.0 - smoothstep(0.12, 0.3, d));
    col += uAccent * term * 0.4;
    // gentle rim glow toward the silhouette
    float rim = pow(1.0 - max(dot(normalize(vViewDir), normalize(vWorldNormal)), 0.0), 3.5);
    col += uAccent * rim * 0.3;
    gl_FragColor = vec4(col, 0.96);
  }
`;

const ATMO_VERT = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMO_FRAG = `
  uniform vec3 uAccent;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float fres = pow(1.0 - max(dot(normalize(vViewDir), normalize(vNormal)), 0.0), 4.5);
    gl_FragColor = vec4(uAccent, fres * 0.7);
  }
`;

function cssAccent(): THREE.Color {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--ee-accent").trim();
    if (v) return new THREE.Color(v);
  } catch {}
  return new THREE.Color("#5fe6ff");
}

interface SceneProps {
  lat: number;
  lon: number;
  diving: boolean;
  reducedMotion: boolean;
  onArrive: () => void;
}

function EarthScene({ lat, lon, diving, reducedMotion, onArrive }: SceneProps) {
  const group = useRef<THREE.Group>(null);
  const globeMat = useRef<THREE.ShaderMaterial>(null);
  const atmoMat = useRef<THREE.ShaderMaterial>(null);
  const beacon = useRef<THREE.Group>(null);
  const orbiters = useRef<THREE.Points>(null);
  const { camera } = useThree();
  const arrivedRef = useRef(false);
  const frameRef = useRef(0);

  const R = 1;
  const graticule = useMemo(() => buildGraticule(R * 1.002), []);
  const sun = useMemo(() => subsolarDir(new Date()), []);
  const accent = useMemo(cssAccent, []);
  const beaconPos = useMemo(() => latLonToVec3(lat, lon, R), [lat, lon]);

  // target rotation that brings the beacon to face the camera (+Z)
  const targetRot = useMemo(() => ({ y: -lon * DEG, x: lat * DEG }), [lat, lon]);

  const uniforms = useMemo(
    () => ({
      globe: { uAccent: { value: accent.clone() }, uSun: { value: sun } },
      atmo: { uAccent: { value: accent.clone() } },
    }),
    [accent, sun]
  );

  // orbital particles ("satellites / migratory sparks")
  const orbital = useMemo(() => {
    const n = reducedMotion ? 40 : 160;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const radius = 1.25 + Math.random() * 0.5;
      const a = Math.random() * Math.PI * 2;
      const incl = (Math.random() - 0.5) * 1.4;
      pos[i * 3] = radius * Math.cos(a);
      pos[i * 3 + 1] = radius * Math.sin(incl);
      pos[i * 3 + 2] = radius * Math.sin(a);
      seed[i] = Math.random() * Math.PI * 2;
    }
    return { pos, seed, n };
  }, [reducedMotion]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const clampedDt = Math.min(dt, 0.05);
    frameRef.current++;

    // refresh accent occasionally so the planet follows mood/atmosphere changes
    if (frameRef.current % 30 === 0) {
      const a = cssAccent();
      uniforms.globe.uAccent.value.lerp(a, 0.5);
      uniforms.atmo.uAccent.value.lerp(a, 0.5);
    }

    if (group.current) {
      if (!diving) {
        // slow living breath-rotation
        if (!reducedMotion) group.current.rotation.y += clampedDt * 0.06;
      } else {
        // cinematic dive: rotate the visitor's location to face us, fall in
        group.current.rotation.y += (targetRot.y - group.current.rotation.y) * Math.min(1, clampedDt * 1.6);
        group.current.rotation.x += (targetRot.x - group.current.rotation.x) * Math.min(1, clampedDt * 1.6);
        const targetZ = 1.18;
        camera.position.z += (targetZ - camera.position.z) * Math.min(1, clampedDt * 1.1);
        if (!arrivedRef.current && camera.position.z < 1.35) {
          arrivedRef.current = true;
          onArrive();
        }
      }
    }

    if (beacon.current) {
      const pulse = 1 + Math.sin(t * 2.2) * 0.25;
      beacon.current.scale.setScalar(reducedMotion ? 1 : pulse);
    }
    if (orbiters.current && !reducedMotion) orbiters.current.rotation.y += clampedDt * 0.12;
  });

  // beacon orientation: a pillar pointing outward from the surface
  const beaconQuat = useMemo(() => {
    const up = beaconPos.clone().normalize();
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    return q;
  }, [beaconPos]);

  return (
    <>
      <group ref={group}>
        {/* planet body */}
        <mesh>
          <sphereGeometry args={[R, 64, 64]} />
          <shaderMaterial
            ref={globeMat}
            vertexShader={GLOBE_VERT}
            fragmentShader={GLOBE_FRAG}
            uniforms={uniforms.globe}
            transparent
          />
        </mesh>

        {/* holographic graticule */}
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[graticule, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={accent} transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} />
        </lineSegments>

        {/* visitor beacon + light pillar */}
        <group position={beaconPos.toArray()} quaternion={beaconQuat}>
          <group ref={beacon}>
            <mesh>
              <sphereGeometry args={[0.022, 16, 16]} />
              <meshBasicMaterial color={"#ffffff"} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.05, 16, 16]} />
              <meshBasicMaterial color={accent} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
          </group>
          {/* pillar reaching toward the human */}
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.004, 0.004, 0.24, 8]} />
            <meshBasicMaterial color={accent} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      </group>

      {/* atmosphere halo (does not rotate with the surface) */}
      <mesh>
        <sphereGeometry args={[R * 1.22, 48, 48]} />
        <shaderMaterial
          ref={atmoMat}
          vertexShader={ATMO_VERT}
          fragmentShader={ATMO_FRAG}
          uniforms={uniforms.atmo}
          transparent
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* orbital particles */}
      <points ref={orbiters}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[orbital.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.012} color={accent} transparent opacity={0.7} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </>
  );
}

function Starfield() {
  const stars = useMemo(() => {
    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(8 + Math.random() * 6);
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z;
    }
    return pos;
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[stars, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.03} color={"#ffffff"} transparent opacity={0.6} sizeAttenuation depthWrite={false} />
    </points>
  );
}

export default function LivingEarth({
  lat,
  lon,
  diving,
  reducedMotion = false,
  onArrive,
}: {
  lat: number | null;
  lon: number | null;
  diving: boolean;
  reducedMotion?: boolean;
  onArrive: () => void;
}) {
  return (
    <div className="absolute inset-0">
      <Canvas
        camera={{ position: [0, 0, 4.2], fov: 38 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        dpr={[1, 2]}
      >
        <Starfield />
        <EarthScene lat={lat ?? 0} lon={lon ?? 0} diving={diving} reducedMotion={reducedMotion} onArrive={onArrive} />
      </Canvas>
    </div>
  );
}
