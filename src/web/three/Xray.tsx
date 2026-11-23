/**
 * Project X-Ray: the plan explodes into parts from a fixed shape library, with
 * illustrative physical effects: fluid particles, heat glow, pressure pulses, current
 * dashes. Clicking a part shows the task and equipment it needs.
 * Labelled "Illustrative visualisation, not a simulation."
 */
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { Color, MathUtils, type Group, type Mesh, type MeshStandardMaterial, type Points } from "three";
import type { PlanPart } from "@shared/domain";
import { PALETTE, prefersReducedMotion } from "./shared";

interface TaskRef {
  id: string;
  name: string;
  equipment: string;
}

const SHAPE_COLOR: Record<string, string> = {
  board: PALETTE.green,
  sensor: PALETTE.blue,
  pipe: PALETTE.blue,
  motor: PALETTE.orange,
  casing: PALETTE.stone2,
  battery: PALETTE.yellow,
  display: PALETTE.violet,
};

function Shape({ shape }: { shape: string }) {
  switch (shape) {
    case "board":
      return <boxGeometry args={[1.6, 0.12, 1.1]} />;
    case "sensor":
      return <cylinderGeometry args={[0.25, 0.25, 0.5, 24]} />;
    case "pipe":
      return <torusGeometry args={[0.6, 0.12, 16, 48, Math.PI * 1.5]} />;
    case "motor":
      return <cylinderGeometry args={[0.45, 0.45, 0.9, 32]} />;
    case "battery":
      return <boxGeometry args={[0.6, 0.35, 1.2]} />;
    case "display":
      return <boxGeometry args={[1.2, 0.75, 0.08]} />;
    default:
      return <boxGeometry args={[2.4, 1.6, 1.8]} />;
  }
}

function Part({ part, index, count, exploded, selected, onSelect }: { part: PlanPart; index: number; count: number; exploded: boolean; selected: boolean; onSelect: () => void }) {
  const group = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const reduce = prefersReducedMotion();
  const angle = (index / count) * Math.PI * 2;
  const target = useMemo(() => (exploded ? [Math.cos(angle) * 2.6, ((index % 3) - 1) * 0.9, Math.sin(angle) * 2.6] : [0, (index - count / 2) * 0.15, 0]), [exploded, angle, index, count]);
  const casing = part.shape === "casing";
  const heat = part.quantity?.kind === "heat";
  const pressure = part.quantity?.kind === "pressure";

  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (!g) return;
    // --ease-move feel: critically damped approach over ~600 ms.
    const k = reduce ? 1 : 1 - Math.exp(-dt * 7);
    g.position.set(MathUtils.lerp(g.position.x, target[0]!, k), MathUtils.lerp(g.position.y, target[1]!, k), MathUtils.lerp(g.position.z, target[2]!, k));
    const mat = mesh.current?.material as MeshStandardMaterial | undefined;
    if (mat && heat) mat.emissiveIntensity = reduce ? 0.5 : 0.35 + Math.sin(clock.elapsedTime * 2) * 0.25;
    if (mesh.current && pressure && !reduce) mesh.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 5) * 0.06);
  });

  return (
    <group ref={group}>
      <mesh ref={mesh} onClick={(e) => (e.stopPropagation(), onSelect())} castShadow>
        <Shape shape={part.shape} />
        <meshStandardMaterial
          color={SHAPE_COLOR[part.shape] ?? PALETTE.stone2}
          transparent={casing}
          opacity={casing ? (exploded ? 0.25 : 0.4) : 1}
          wireframe={casing && exploded}
          emissive={heat ? new Color(PALETTE.orange) : selected ? new Color(PALETTE.yellow) : new Color("#000")}
          emissiveIntensity={heat ? 0.5 : selected ? 0.35 : 0}
          roughness={0.45}
        />
      </mesh>
      {part.quantity?.kind === "fluid" && <Flow color={PALETTE.blue} radius={0.6} />}
      {part.quantity?.kind === "current" && <Flow color={PALETTE.yellow} radius={0.75} size={0.06} speed={2.2} />}
    </group>
  );
}

/** Particles circulating around a part: fluid in pipes, or current as moving dashes. */
function Flow({ color, radius, size = 0.09, speed = 1 }: { color: string; radius: number; size?: number; speed?: number }) {
  const ref = useRef<Points>(null);
  const reduce = prefersReducedMotion();
  const N = 28;
  const positions = useMemo(() => new Float32Array(N * 3), []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = reduce ? 0 : clock.elapsedTime * speed;
    const attr = ref.current.geometry.attributes.position!;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 1.5 + t;
      attr.setXYZ(i, Math.cos(a) * radius, Math.sin(a) * radius, 0);
    }
    attr.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={size} sizeAttenuation />
    </points>
  );
}

export default function Xray({ parts, tasks }: { parts: PlanPart[]; tasks: TaskRef[] }) {
  const [exploded, setExploded] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const part = selected !== null ? parts[selected] : undefined;
  const task = part?.taskId ? tasks.find((t) => t.id === part.taskId) : undefined;
  const summary = parts.map((p) => `${p.name}${p.quantity ? ` (${p.quantity.label})` : ""}`).join(", ");

  return (
    <div className="grid gap-3">
      <div className="h-72 rounded-2xl bg-subtle overflow-hidden" role="img" aria-label={`Exploded 3D view of the project parts: ${summary}`}>
        <Canvas shadows dpr={[1, 2]} camera={{ position: [5, 4, 6], fov: 40 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
          {parts.map((p, i) => (
            <Part key={`${p.name}-${i}`} part={p} index={i} count={parts.length} exploded={exploded} selected={selected === i} onSelect={() => setSelected(i)} />
          ))}
          <OrbitControls enableDamping dampingFactor={0.08} enablePan={false} minDistance={4} maxDistance={14} />
        </Canvas>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setExploded((e) => !e)} aria-pressed={exploded}>
          {exploded ? "Assemble" : "Explode"}
        </button>
        <label className="sr-only" htmlFor="xray-part">Inspect a part</label>
        <select id="xray-part" className="input !w-auto !min-h-10 !py-2 text-sm" value={selected ?? ""} onChange={(e) => setSelected(e.target.value === "" ? null : Number(e.target.value))}>
          <option value="">Inspect a part…</option>
          {parts.map((p, i) => (
            <option key={i} value={i}>{p.name}</option>
          ))}
        </select>
      </div>
      <p className="text-sm min-h-10" aria-live="polite">
        {part ? (
          <>
            <b>{part.name}</b>
            {part.quantity && <> · {part.quantity.label}</>}
            {task ? <> · built in “{task.name}” on the {task.equipment}</> : <> · bought or assembled, no lab time needed</>}
          </>
        ) : (
          <span className="meta">Click a part, or pick one from the list.</span>
        )}
      </p>
      <p className="meta text-xs">Illustrative visualisation, not a simulation.</p>
    </div>
  );
}
