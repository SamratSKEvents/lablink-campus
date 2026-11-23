/**
 * 3D live resource twin. Labs are tiles built from primitives (no model files),
 * units are coloured by status, SOS units pulse, and a selected blocked unit shows an
 * arched path to its replacement. Lazy-loaded; the list view is the accessible twin.
 */
import { Html, OrbitControls, QuadraticBezierLine } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { MathUtils, type Mesh } from "three";
import type { LabWithUnits } from "../lib/types";
import { PALETTE, prefersReducedMotion, STATUS_COLOR } from "./shared";

const SPACING = 7;
const TILE = { w: 5.6, d: 4.6 };

function unitPosition(lab: LabWithUnits, index: number): [number, number, number] {
  const cols = 4;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return [lab.map.x * SPACING - TILE.w / 2 + 0.9 + col * 1.25, 0.45, lab.map.z * SPACING - TILE.d / 2 + 1.1 + row * 1.2];
}

function Unit({ position, status, selected, onClick, label }: { position: [number, number, number]; status: string; selected: boolean; onClick: () => void; label: string }) {
  const ref = useRef<Mesh>(null);
  const reduce = prefersReducedMotion();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pulse = status === "sos" && !reduce ? 1 + Math.sin(clock.elapsedTime * 4) * 0.12 : 1;
    const s = (selected ? 1.25 : 1) * pulse;
    ref.current.scale.setScalar(MathUtils.lerp(ref.current.scale.x, s, 0.2));
  });
  return (
    <mesh ref={ref} position={position} onClick={(e) => (e.stopPropagation(), onClick())} castShadow>
      <boxGeometry args={[0.8, 0.6, 0.7]} />
      <meshStandardMaterial color={STATUS_COLOR[status] ?? PALETTE.stone2} roughness={0.5} emissive={selected ? PALETTE.yellow : "#000"} emissiveIntensity={selected ? 0.25 : 0} />
      {selected && (
        <Html center distanceFactor={10} position={[0, 0.8, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <span className="chip tone-neutral !bg-white shadow">{label}</span>
        </Html>
      )}
    </mesh>
  );
}

export default function Twin({ labs, selected, rescueTo, onSelect }: { labs: LabWithUnits[]; selected: string | null; rescueTo?: string; onSelect: (id: string) => void }) {
  const positions = useMemo(() => {
    const m = new Map<string, [number, number, number]>();
    labs.forEach((l) => l.equipment.forEach((e, i) => m.set(e.id, unitPosition(l, i))));
    return m;
  }, [labs]);
  const centre = useMemo(() => {
    const xs = labs.map((l) => l.map.x * SPACING);
    const zs = labs.map((l) => l.map.z * SPACING);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2] as [number, number, number];
  }, [labs]);
  const from = selected ? positions.get(selected) : undefined;
  const to = rescueTo ? positions.get(rescueTo) : undefined;

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [centre[0] + 14, 20, centre[2] + 22], fov: 40 }} onPointerMissed={() => undefined}>
      <color attach="background" args={[PALETTE.white]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 20, 10]} intensity={1.1} castShadow />
      <group>
        {labs.map((l) => (
          <group key={l.id}>
            <mesh position={[l.map.x * SPACING, 0, l.map.z * SPACING]} receiveShadow>
              <boxGeometry args={[TILE.w, 0.2, TILE.d]} />
              <meshStandardMaterial color={PALETTE.stone} />
            </mesh>
            <Html position={[l.map.x * SPACING, 0.2, l.map.z * SPACING + TILE.d / 2 + 0.4]} center distanceFactor={14} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
              <span className="whitespace-nowrap text-sm font-semibold text-ink-2">{l.name}</span>
            </Html>
            {l.equipment.map((e) => (
              <Unit key={e.id} position={positions.get(e.id)!} status={e.liveStatus} selected={selected === e.id} onClick={() => onSelect(e.id)} label={e.name} />
            ))}
          </group>
        ))}
      </group>
      {from && to && <QuadraticBezierLine start={from} end={to} mid={[(from[0] + to[0]) / 2, 5, (from[2] + to[2]) / 2]} color={PALETTE.green} lineWidth={4} dashed dashSize={0.5} gapSize={0.3} />}
      <OrbitControls target={centre} enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.3} minDistance={8} maxDistance={60} />
    </Canvas>
  );
}
