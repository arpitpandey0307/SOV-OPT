"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Line, OrbitControls, Sparkles } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

// A convex polytope (the feasible region of an LP) with the simplex path walking
// along its edges from a starting vertex to the optimum.
function Polytope() {
  const group = useRef<THREE.Group>(null);
  const runner = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);

  const { geometry, edges, path } = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1.55, 1);
    // Squash and skew so it reads as a generic polytope rather than a perfect solid.
    g.scale(1.25, 0.85, 1.05);
    g.rotateZ(0.35);
    const pos = g.getAttribute("position");
    const verts: THREE.Vector3[] = [];
    const seen = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      const key = v.toArray().map((n) => n.toFixed(3)).join(",");
      if (!seen.has(key)) {
        seen.set(key, verts.length);
        verts.push(v);
      }
    }
    // Greedy "simplex" walk: from the lowest vertex, repeatedly step to the
    // neighbouring vertex that improves the objective direction the most.
    const c = new THREE.Vector3(0.35, 1, 0.25).normalize();
    const neighbours = (v: THREE.Vector3) =>
      verts.filter((w) => w !== v && w.distanceTo(v) < 1.05).sort((a, b) => b.dot(c) - a.dot(c));
    let cur = verts.reduce((a, b) => (a.dot(c) < b.dot(c) ? a : b));
    const walk = [cur];
    for (let k = 0; k < 12; k++) {
      const next = neighbours(cur)[0];
      if (!next || next.dot(c) <= cur.dot(c) + 1e-6) break;
      walk.push(next);
      cur = next;
    }
    return { geometry: g, edges: new THREE.EdgesGeometry(g), path: walk };
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (group.current) {
      group.current.rotation.y = t * 0.12;
      group.current.rotation.x = Math.sin(t * 0.2) * 0.12;
    }
    // Move the runner along the path, pausing at the optimum.
    const cycle = path.length + 1.5;
    const s = (t * 0.9) % cycle;
    const i = Math.min(Math.floor(s), path.length - 1);
    const f = Math.min(s - i, 1);
    const a = path[i];
    const b = path[Math.min(i + 1, path.length - 1)];
    const p = a.clone().lerp(b, f);
    runner.current?.position.copy(p);
    halo.current?.position.copy(path[path.length - 1]);
    if (halo.current) halo.current.scale.setScalar(1 + Math.sin(t * 3) * 0.25);
  });

  return (
    <group ref={group}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color="#7c5cff"
          transparent
          opacity={0.18}
          roughness={0.15}
          metalness={0.2}
          transmission={0.6}
          thickness={1}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#8ea2ff" transparent opacity={0.55} />
      </lineSegments>
      {path.map((v, i) => (
        <mesh key={i} position={v}>
          <sphereGeometry args={[0.045, 16, 16]} />
          <meshBasicMaterial color={i === path.length - 1 ? "#ff9a3c" : "#22d3ee"} />
        </mesh>
      ))}
      <Line points={path} color="#22d3ee" lineWidth={3} transparent opacity={0.95} />
      <mesh ref={runner}>
        <sphereGeometry args={[0.09, 24, 24]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh ref={halo}>
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshBasicMaterial color="#ff9a3c" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

export default function HeroScene() {
  return (
    <Canvas camera={{ position: [0, 0.4, 5.2], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.6} />
      <pointLight position={[4, 4, 4]} intensity={40} color="#ff9a3c" />
      <pointLight position={[-4, -2, 3]} intensity={30} color="#22d3ee" />
      <Float speed={1.2} rotationIntensity={0.25} floatIntensity={0.6}>
        <Polytope />
      </Float>
      <Sparkles count={90} scale={[7, 5, 5]} size={2.2} speed={0.35} color="#a5b4fc" />
      <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={0.6} />
    </Canvas>
  );
}
