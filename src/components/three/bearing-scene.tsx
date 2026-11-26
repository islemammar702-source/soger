"use client";

import { Canvas, useFrame, type ThreeElements } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export type SceneQuality = "lite" | "full";

/* ─── Géométries procédurales ─────────────────────────────────────────── */

/** Profil de bague (révolution autour de Y) avec chemin de roulement creusé. */
function ringProfile(rIn: number, rOut: number, width: number, groove: "inner" | "outer", depth: number, steps: number) {
  const h = width / 2;
  const pts: THREE.Vector2[] = [];
  const chamfer = 0.035;
  const grooveR = 0.24;
  if (groove === "outer") {
    // Chemin sur le diamètre intérieur de la bague extérieure.
    pts.push(new THREE.Vector2(rOut - chamfer, -h), new THREE.Vector2(rOut, -h + chamfer), new THREE.Vector2(rOut, h - chamfer), new THREE.Vector2(rOut - chamfer, h));
    pts.push(new THREE.Vector2(rIn + chamfer, h), new THREE.Vector2(rIn, h - chamfer));
    for (let i = 0; i <= steps; i++) {
      const y = THREE.MathUtils.lerp(grooveR, -grooveR, i / steps);
      const d = Math.sqrt(Math.max(0, grooveR * grooveR - y * y)) / grooveR;
      pts.push(new THREE.Vector2(rIn + d * depth, y));
    }
    pts.push(new THREE.Vector2(rIn, -h + chamfer), new THREE.Vector2(rIn + chamfer, -h), new THREE.Vector2(rOut - chamfer, -h));
  } else {
    // Chemin sur le diamètre extérieur de la bague intérieure.
    pts.push(new THREE.Vector2(rIn + chamfer, -h), new THREE.Vector2(rIn, -h + chamfer), new THREE.Vector2(rIn, h - chamfer), new THREE.Vector2(rIn + chamfer, h));
    pts.push(new THREE.Vector2(rOut - chamfer, h), new THREE.Vector2(rOut, h - chamfer));
    for (let i = 0; i <= steps; i++) {
      const y = THREE.MathUtils.lerp(grooveR, -grooveR, i / steps);
      const d = Math.sqrt(Math.max(0, grooveR * grooveR - y * y)) / grooveR;
      pts.push(new THREE.Vector2(rOut - d * depth, y));
    }
    pts.push(new THREE.Vector2(rOut, -h + chamfer), new THREE.Vector2(rOut - chamfer, -h), new THREE.Vector2(rIn + chamfer, -h));
  }
  return pts;
}

function gearShape(teeth: number, rRoot: number, rTip: number, rHole: number) {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const p = [
      [rRoot, a],
      [rTip, a + step * 0.18],
      [rTip, a + step * 0.42],
      [rRoot, a + step * 0.6],
    ] as const;
    p.forEach(([r, ang], j) => {
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (i === 0 && j === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    shape.absarc(0, 0, rRoot, a + step * 0.6, a + step, false);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, rHole, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  // Allègements (perçages) dans la toile.
  if (rRoot > 1) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = (rRoot + rHole) / 2;
      const h = new THREE.Path();
      h.absarc(Math.cos(a) * r, Math.sin(a) * r, (rRoot - rHole) * 0.22, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
  }
  return shape;
}

/* ─── Matériaux ──────────────────────────────────────────────────────── */

function useMaterials() {
  return useMemo(
    () => ({
      steel: new THREE.MeshStandardMaterial({ color: "#d4d9e0", metalness: 1, roughness: 0.22 }),
      polished: new THREE.MeshStandardMaterial({ color: "#ffffff", metalness: 1, roughness: 0.16, envMapIntensity: 1.8 }),
      dark: new THREE.MeshStandardMaterial({ color: "#3b4452", metalness: 0.9, roughness: 0.38 }),
      cage: new THREE.MeshStandardMaterial({ color: "#b8925a", metalness: 0.95, roughness: 0.3 }),
      accent: new THREE.MeshStandardMaterial({ color: "#16a34a", metalness: 0.6, roughness: 0.35, emissive: "#0d5c2a", emissiveIntensity: 0.25 }),
    }),
    [],
  );
}

/* ─── Roulement à billes ─────────────────────────────────────────────── */

const BALLS = 11;
const PITCH_R = 1.35;

function Bearing({ quality }: { quality: SceneQuality }) {
  const m = useMaterials();
  const seg = quality === "full" ? 128 : 64;
  const inner = useRef<THREE.Group>(null);
  const balls = useRef<THREE.Group>(null);

  const outerGeo = useMemo(() => new THREE.LatheGeometry(ringProfile(1.55, 2.05, 0.9, "outer", 0.07, 16), seg), [seg]);
  const innerGeo = useMemo(() => new THREE.LatheGeometry(ringProfile(0.72, 1.15, 0.9, "inner", 0.07, 16), seg), [seg]);
  const ballGeo = useMemo(() => new THREE.SphereGeometry(0.205, quality === "full" ? 48 : 24, quality === "full" ? 32 : 16), [quality]);
  const cageGeo = useMemo(() => new THREE.TorusGeometry(PITCH_R, 0.028, 12, seg), [seg]);
  const rivetGeo = useMemo(() => new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10), []);

  useFrame((_, dt) => {
    // Cinématique simplifiée : bague intérieure motrice, la cage (et les billes)
    // tournent à ≈ 40 % de sa vitesse, la bague extérieure reste fixe.
    const w = Math.min(dt, 0.05) * 0.9;
    if (inner.current) inner.current.rotation.y += w;
    if (balls.current) balls.current.rotation.y += w * 0.4;
  });

  return (
    <group>
      <mesh geometry={outerGeo} material={m.steel} />
      <group ref={inner}>
        <mesh geometry={innerGeo} material={m.steel} />
        {/* Repère vert : rend la rotation lisible. */}
        <mesh position={[0.935, 0.452, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.accent}>
          <boxGeometry args={[0.3, 0.06, 0.006]} />
        </mesh>
      </group>
      <group ref={balls}>
        {Array.from({ length: BALLS }, (_, i) => {
          const a = (i / BALLS) * Math.PI * 2;
          return <mesh key={i} geometry={ballGeo} material={m.polished} position={[Math.cos(a) * PITCH_R, 0, Math.sin(a) * PITCH_R]} />;
        })}
        <mesh geometry={cageGeo} material={m.cage} position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={cageGeo} material={m.cage} position={[0, -0.16, 0]} rotation={[Math.PI / 2, 0, 0]} />
        {Array.from({ length: BALLS }, (_, i) => {
          const a = ((i + 0.5) / BALLS) * Math.PI * 2;
          return <mesh key={i} geometry={rivetGeo} material={m.cage} position={[Math.cos(a) * PITCH_R, 0, Math.sin(a) * PITCH_R]} />;
        })}
      </group>
    </group>
  );
}

/* ─── Engrenages ─────────────────────────────────────────────────────── */

function Gear({ teeth, rRoot, rTip, rHole, depth, speed, material, ...props }: {
  teeth: number; rRoot: number; rTip: number; rHole: number; depth: number; speed: number; material: THREE.Material;
} & ThreeElements["group"]) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(gearShape(teeth, rRoot, rTip, rHole), {
      depth, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 6,
    });
    g.center();
    return g;
  }, [teeth, rRoot, rTip, rHole, depth]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += Math.min(dt, 0.05) * speed;
  });
  return (
    <group {...props}>
      <mesh ref={ref} geometry={geo} material={material} />
    </group>
  );
}

function HexNut({ material, ...props }: { material: THREE.Material } & ThreeElements["group"]) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.x = t * 0.3;
    ref.current.rotation.y = t * 0.2;
  });
  return (
    <group {...props}>
      <group ref={ref}>
        <mesh material={material}>
          <cylinderGeometry args={[0.22, 0.22, 0.16, 6]} />
        </mesh>
      </group>
    </group>
  );
}

/* ─── Composition ────────────────────────────────────────────────────── */

function Rig({ quality }: { quality: SceneQuality }) {
  const root = useRef<THREE.Group>(null);
  const m = useMaterials();
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((_, dt) => {
    if (!root.current) return;
    // Parallaxe : suit le pointeur et le défilement, avec amortissement.
    const scroll = Math.min(window.scrollY / window.innerHeight, 1.2);
    const k = 1 - Math.exp(-dt * 3);
    root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, 0.95 - scroll * 0.45 + pointer.current.y * 0.12, k);
    root.current.rotation.z = THREE.MathUtils.lerp(root.current.rotation.z, -0.35 + pointer.current.x * 0.15, k);
    root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, scroll * 1.1, k);
  });

  return (
    <>
      <group ref={root}>
        <Bearing quality={quality} />
      </group>
      {/* Engrenages en arrière-plan : rapport 24/12 → vitesses inverses. */}
      <Gear teeth={24} rRoot={1.55} rTip={1.75} rHole={0.4} depth={0.32} speed={0.25} material={m.dark} position={[1.05, 0.95, -2.6]} rotation={[0.25, -0.5, 0]} />
      {quality === "full" && (
        <>
          <Gear teeth={12} rRoot={0.72} rTip={0.92} rHole={0.22} depth={0.32} speed={-0.5} material={m.steel} position={[-0.8, 2.3, -2.75]} rotation={[0.25, -0.5, 0.12]} />
          <HexNut material={m.steel} position={[-2.7, 1.5, -0.6]} />
          <HexNut material={m.dark} position={[-2.1, -1.7, 0.8]} scale={0.8} />
          <ContactShadows position={[0, -2.3, 0]} opacity={0.45} scale={9} blur={2.6} far={4} resolution={512} color="#000000" />
        </>
      )}
    </>
  );
}

export default function BearingScene({ quality }: { quality: SceneQuality }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  // Arrête le rendu quand le hero n'est plus à l'écran (batterie, CPU).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas
        frameloop={visible ? "always" : "never"}
        dpr={quality === "full" ? [1, 2] : [1, 1.5]}
        camera={{ position: [0, 0, 7.4], fov: 38 }}
        gl={{ antialias: true, alpha: true, powerPreference: quality === "full" ? "high-performance" : "low-power" }}
      >
        <ambientLight intensity={0.25} />
        <directionalLight position={[4, 6, 5]} intensity={2.2} />
        <directionalLight position={[-5, -2, -3]} intensity={0.6} color="#86efac" />
        {/* Environnement procédural (aucun fichier HDR à télécharger). */}
        <Environment resolution={quality === "full" ? 256 : 64} frames={1}>
          <Lightformer intensity={3} position={[0, 5, -6]} scale={[10, 2, 1]} />
          <Lightformer intensity={2} position={[-6, 1, 1]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} />
          <Lightformer intensity={1.5} position={[6, -1, 2]} rotation-y={-Math.PI / 2} scale={[8, 1.5, 1]} />
          <Lightformer intensity={1.2} color="#22c55e" position={[0, -4, 3]} rotation-x={Math.PI / 2} scale={[6, 1, 1]} />
        </Environment>
        <Rig quality={quality} />
      </Canvas>
    </div>
  );
}
