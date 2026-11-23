/**
 * Instrument models built from primitives (no binary assets, so the repo stays small).
 * The control named by the current step glows yellow and pulses gently.
 */
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import { BufferGeometry, Float32BufferAttribute, Line, LineBasicMaterial, type Mesh, type MeshStandardMaterial } from "three";
import { PALETTE, prefersReducedMotion } from "./shared";

function Control({ id, highlight, position, children, color = PALETTE.ink }: { id: string; highlight: string; position: [number, number, number]; children: ReactNode; color?: string }) {
  const ref = useRef<Mesh>(null);
  const on = id === highlight;
  const reduce = prefersReducedMotion();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const m = ref.current.material as MeshStandardMaterial;
    m.emissiveIntensity = on ? (reduce ? 0.8 : 0.55 + Math.sin(clock.elapsedTime * 4) * 0.3) : 0;
    ref.current.scale.setScalar(on && !reduce ? 1.08 + Math.sin(clock.elapsedTime * 4) * 0.04 : 1);
  });
  return (
    <mesh ref={ref} position={position}>
      {children}
      <meshStandardMaterial color={on ? PALETTE.yellow : color} emissive={PALETTE.yellow} emissiveIntensity={0} roughness={0.4} />
    </mesh>
  );
}

function Trace() {
  const line = useMemo(() => {
    const g = new BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i <= 120; i++) {
      const x = -1.15 + (i / 120) * 2.3;
      pts.push(x, Math.sin(x * 9) * 0.35, 0);
    }
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return new Line(g, new LineBasicMaterial({ color: PALETTE.yellow }));
  }, []);
  return <primitive object={line} position={[-0.6, 0.25, 0.47]} />;
}

function Oscilloscope({ h }: { h: string }) {
  const knob = <cylinderGeometry args={[0.13, 0.13, 0.12, 24]} />;
  const button = <boxGeometry args={[0.2, 0.12, 0.08]} />;
  return (
    <group rotation={[0, -0.35, 0]}>
      <mesh>
        <boxGeometry args={[3.6, 2, 0.9]} />
        <meshStandardMaterial color={PALETTE.stone2} roughness={0.6} />
      </mesh>
      <Control id="screen" highlight={h} position={[-0.6, 0.25, 0.46]} color="#1f2a24">
        <boxGeometry args={[2.4, 1.3, 0.02]} />
      </Control>
      <Trace />
      <group rotation={[Math.PI / 2, 0, 0]}>
        <Control id="vertical" highlight={h} position={[1.05, 0.5, -0.5]}>{knob}</Control>
        <Control id="horizontal" highlight={h} position={[1.45, 0.5, -0.5]}>{knob}</Control>
        <Control id="trigger" highlight={h} position={[1.25, 0.5, -0.05]}>{knob}</Control>
      </group>
      <Control id="autoscale" highlight={h} position={[1.05, 0.75, 0.47]} color={PALETTE.green}>{button}</Control>
      <Control id="default" highlight={h} position={[1.45, 0.75, 0.47]}>{button}</Control>
      <Control id="measure" highlight={h} position={[1.05, -0.35, 0.47]}>{button}</Control>
      <Control id="runstop" highlight={h} position={[1.45, -0.35, 0.47]} color={PALETTE.red}>{button}</Control>
      <Control id="probe" highlight={h} position={[-1.3, -0.8, 0.5]} color={PALETTE.yellow}>
        <cylinderGeometry args={[0.1, 0.1, 0.14, 24]} />
      </Control>
    </group>
  );
}

function Printer({ h }: { h: string }) {
  return (
    <group rotation={[0, -0.5, 0]} position={[0, -0.6, 0]}>
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[2.6, 0.2, 2]} />
        <meshStandardMaterial color={PALETTE.stone2} />
      </mesh>
      <mesh position={[-1.1, 1.2, -0.6]}>
        <boxGeometry args={[0.15, 2.4, 0.15]} />
        <meshStandardMaterial color={PALETTE.ink} />
      </mesh>
      <mesh position={[1.1, 1.2, -0.6]}>
        <boxGeometry args={[0.15, 2.4, 0.15]} />
        <meshStandardMaterial color={PALETTE.ink} />
      </mesh>
      <mesh position={[0, 2.35, -0.6]}>
        <boxGeometry args={[2.35, 0.15, 0.15]} />
        <meshStandardMaterial color={PALETTE.ink} />
      </mesh>
      <Control id="bed" highlight={h} position={[0, 0.2, 0.1]} color="#3b3b3b">
        <boxGeometry args={[1.9, 0.08, 1.6]} />
      </Control>
      <Control id="sheet" highlight={h} position={[0, 0.27, 0.1]} color="#c9a227">
        <boxGeometry args={[1.8, 0.03, 1.5]} />
      </Control>
      <Control id="nozzle" highlight={h} position={[0.2, 1.4, -0.35]} color={PALETTE.orange}>
        <boxGeometry args={[0.4, 0.45, 0.35]} />
      </Control>
      <Control id="spool" highlight={h} position={[0, 2.8, -0.6]} color={PALETTE.green}>
        <cylinderGeometry args={[0.45, 0.45, 0.3, 32]} />
      </Control>
      <Control id="knob" highlight={h} position={[0.9, 0.1, 1.05]}>
        <boxGeometry args={[0.6, 0.35, 0.08]} />
      </Control>
      <Control id="usb" highlight={h} position={[0.35, 0.05, 1.03]} color={PALETTE.blue}>
        <boxGeometry args={[0.2, 0.08, 0.06]} />
      </Control>
    </group>
  );
}

export default function Explainer({ classId, highlight }: { classId: string; highlight: string }) {
  return (
    <div className="h-96">
      <Canvas dpr={[1, 2]} camera={{ position: [0, 1.2, 5.5], fov: 40 }}>
        <color attach="background" args={[PALETTE.white]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        {classId === "3d-printer" ? <Printer h={highlight} /> : <Oscilloscope h={highlight} />}
        <OrbitControls enableDamping dampingFactor={0.08} enablePan={false} minDistance={3} maxDistance={9} />
      </Canvas>
    </div>
  );
}
