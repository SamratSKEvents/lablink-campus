/**
 * Spot illustrations. If a generated image exists at /illustrations/<name>.webp it is used;
 * otherwise a built-in "sticker" SVG renders (flat token colours, ink outline, soft shadow).
 * Decorative: always hidden from assistive tech.
 */
import { useState, type CSSProperties, type ReactNode } from "react";

export type IllustrationName =
  | "flask"
  | "microscope"
  | "id-card"
  | "robot-arm"
  | "printer"
  | "goggles"
  | "calendar"
  | "beaker-rack"
  | "oscilloscope"
  | "shield";

const INK = "#0c0a09";
const S = {
  stroke: INK,
  strokeWidth: 2.5,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
};

const SVGS: Record<IllustrationName, ReactNode> = {
  flask: (
    <>
      <path d="M40 10h20M44 10v28L22 78q-5 12 9 12h38q14 0 9-12L56 38V10" fill="#fff" {...S} />
      <path d="M30 64h40l8 14q4 9-8 9H30q-12 0-8-9z" fill="#2fcf8a" />
      <path d="M44 10v28L22 78q-5 12 9 12h38q14 0 9-12L56 38V10" fill="none" {...S} />
      <circle cx="44" cy="74" r="4" fill="#fff" {...S} strokeWidth={2} />
      <circle cx="56" cy="66" r="3" fill="#fff" {...S} strokeWidth={2} />
      <circle cx="50" cy="52" r="2.5" fill="#fff" {...S} strokeWidth={2} />
      <rect x="40" y="4" width="20" height="8" rx="3" fill="#ff8a3d" {...S} />
    </>
  ),
  microscope: (
    <>
      <rect x="22" y="82" width="56" height="10" rx="5" fill="#4c8dff" {...S} />
      <path d="M58 82V52q0-12-12-12" fill="none" {...S} strokeWidth={6} />
      <rect x="34" y="14" width="16" height="40" rx="6" transform="rotate(-20 42 34)" fill="#fff" {...S} />
      <rect x="30" y="58" width="30" height="6" rx="3" fill="#fff" {...S} />
      <circle cx="64" cy="58" r="7" fill="#ffd54a" {...S} />
      <rect x="40" y="8" width="12" height="8" rx="3" transform="rotate(-20 46 12)" fill={INK} />
    </>
  ),
  "id-card": (
    <>
      <path d="M50 4v16" {...S} strokeWidth={5} />
      <rect x="44" y="16" width="12" height="10" rx="3" fill={INK} />
      <g transform="rotate(-8 50 60)">
        <rect x="14" y="26" width="72" height="56" rx="10" fill="#ffd54a" {...S} />
        <rect x="22" y="36" width="20" height="20" rx="10" fill="#fff" {...S} strokeWidth={2} />
        <rect x="48" y="38" width="28" height="5" rx="2.5" fill={INK} />
        <rect x="48" y="48" width="18" height="4" rx="2" fill={INK} opacity={0.5} />
        <rect x="58" y="58" width="20" height="18" rx="4" fill="#fff" {...S} strokeWidth={2} />
        <path d="M62 62h4v4h-4zM70 62h4v4h-4zM62 70h4v3h-4zM70 68h4v5h-4z" fill={INK} />
      </g>
    </>
  ),
  "robot-arm": (
    <>
      <rect x="20" y="80" width="40" height="12" rx="6" fill="#fff" {...S} />
      <path d="M40 80V56l26-20" fill="none" {...S} strokeWidth={9} stroke="#ff8a3d" />
      <path d="M40 80V56l26-20" fill="none" {...S} />
      <circle cx="40" cy="56" r="7" fill="#fff" {...S} />
      <circle cx="66" cy="36" r="6" fill="#fff" {...S} />
      <path d="M70 32l12-10M72 40l14 2" {...S} strokeWidth={4} />
      <rect x="80" y="26" width="10" height="10" rx="2" fill="#2fcf8a" {...S} strokeWidth={2} />
    </>
  ),
  printer: (
    <>
      <rect x="14" y="14" width="72" height="76" rx="8" fill="#fff" {...S} />
      <path d="M22 26h56" {...S} strokeWidth={5} />
      <rect x="44" y="24" width="14" height="14" rx="3" fill="#ff8a3d" {...S} />
      <rect x="24" y="70" width="52" height="8" rx="3" fill="#e2dfdb" {...S} />
      <circle cx="50" cy="62" r="8" fill="#8b6cff" {...S} />
      <circle cx="50" cy="62" r="3" fill="#fff" />
    </>
  ),
  goggles: (
    <>
      <path d="M8 52q-4-6 4-8M92 52q4-6-4-8" {...S} strokeWidth={5} stroke="#ffd54a" />
      <rect x="12" y="38" width="76" height="30" rx="15" fill="#4c8dff" {...S} />
      <rect x="18" y="43" width="28" height="20" rx="10" fill="#e8f0ff" {...S} strokeWidth={2} />
      <rect x="54" y="43" width="28" height="20" rx="10" fill="#e8f0ff" {...S} strokeWidth={2} />
      <path d="M24 48l6-3M60 48l6-3" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  calendar: (
    <>
      <rect x="14" y="18" width="72" height="72" rx="10" fill="#fff" {...S} />
      <path d="M14 34h72" {...S} />
      <path d="M32 10v14M68 10v14" {...S} strokeWidth={5} />
      <rect x="24" y="44" width="30" height="10" rx="5" fill="#2fcf8a" {...S} strokeWidth={2} />
      <rect x="40" y="58" width="36" height="10" rx="5" fill="#ffd54a" {...S} strokeWidth={2} />
      <rect x="24" y="72" width="24" height="10" rx="5" fill="#ff8a3d" {...S} strokeWidth={2} />
      <path d="M60 76l5 5 10-11" fill="none" {...S} strokeWidth={4} />
    </>
  ),
  "beaker-rack": (
    <>
      {[
        ["#ffd54a", 26],
        ["#8b6cff", 50],
        ["#ff8a3d", 74],
      ].map(([c, x]) => (
        <g key={String(x)}>
          <path d={`M${Number(x) - 7} 14v52a7 7 0 0 0 14 0V14`} fill="#fff" {...S} />
          <path d={`M${Number(x) - 7} 44h14v22a7 7 0 0 1-14 0z`} fill={String(c)} />
          <path d={`M${Number(x) - 7} 14v52a7 7 0 0 0 14 0V14`} fill="none" {...S} />
        </g>
      ))}
      <rect x="10" y="52" width="80" height="10" rx="4" fill="#f6f5f3" {...S} />
      <path d="M16 62v26M84 62v26" {...S} strokeWidth={4} />
    </>
  ),
  oscilloscope: (
    <>
      <rect x="10" y="22" width="80" height="58" rx="8" fill="#e2dfdb" {...S} />
      <rect x="16" y="28" width="46" height="40" rx="5" fill="#1f2a24" {...S} />
      <path
        d="M20 48q5-14 10 0t10 0 10 0 9 0"
        fill="none"
        stroke="#ffd54a"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <circle cx="76" cy="38" r="6" fill="#fff" {...S} />
      <circle cx="76" cy="58" r="6" fill="#fff" {...S} />
      <rect x="20" y="80" width="10" height="8" fill={INK} />
      <rect x="70" y="80" width="10" height="8" fill={INK} />
    </>
  ),
  shield: (
    <>
      <path d="M50 8l34 12v26c0 22-14 36-34 44C30 82 16 68 16 46V20z" fill="#2fcf8a" {...S} />
      <path d="M50 32v28M36 46h28" stroke="#fff" strokeWidth={8} strokeLinecap="round" />
      <path d="M84 12l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#ffd54a" {...S} strokeWidth={1.5} />
    </>
  ),
};

export function Illustration({
  name,
  className = "",
  style,
}: {
  name: IllustrationName;
  className?: string;
  style?: CSSProperties;
}) {
  const [useSvg, setUseSvg] = useState(false);
  const shadow = { filter: "drop-shadow(0 10px 14px rgba(12,10,9,0.14))", ...style };
  if (useSvg)
    return (
      <svg viewBox="0 0 100 100" className={className} style={shadow} aria-hidden="true" focusable="false">
        {SVGS[name]}
      </svg>
    );
  return (
    <img
      src={`/illustrations/${name}.webp`}
      alt=""
      aria-hidden="true"
      className={className}
      style={shadow}
      loading="lazy"
      decoding="async"
      onError={() => setUseSvg(true)}
    />
  );
}
