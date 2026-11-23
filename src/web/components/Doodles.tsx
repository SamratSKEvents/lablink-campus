/**
 * The playful layer: hand-drawn lab doodles (flasks, test tubes, beakers, atoms),
 * sparkles, loops and arrows that draw themselves in. Purely decorative: always
 * aria-hidden, sparse, low opacity, and still under prefers-reduced-motion.
 */
import type { CSSProperties, ReactNode } from "react";

type P = { className?: string; style?: CSSProperties };

const Svg = ({ children, viewBox, className = "", style }: P & { children: ReactNode; viewBox: string }) => (
  <svg viewBox={viewBox} className={`doodle ${className}`} style={style} aria-hidden="true" focusable="false">
    {children}
  </svg>
);

export const Flask = (p: P & { fill?: string }) => (
  <Svg viewBox="0 0 64 80" {...p}>
    <path className="fill" d="M14 58 L26 36 h12 L50 58 Q52 70 40 70 H24 Q12 70 14 58Z" style={{ fill: p.fill ?? "var(--green)" }} />
    <path d="M26 6 h12 M28 6 v26 L10 62 Q6 74 22 74 H42 Q58 74 54 62 L36 32 V6" />
    <circle cx="28" cy="58" r="3" className="bubble" />
    <circle cx="38" cy="52" r="2" className="bubble b2" />
  </Svg>
);

export const TestTube = (p: P & { fill?: string }) => (
  <Svg viewBox="0 0 40 90" {...p}>
    <path className="fill" d="M12 46 h16 v26 a8 8 0 0 1 -16 0Z" style={{ fill: p.fill ?? "var(--orange)" }} />
    <path d="M8 6 h24 M12 6 v66 a8 8 0 0 0 16 0 V6" />
  </Svg>
);

export const Beaker = (p: P & { fill?: string }) => (
  <Svg viewBox="0 0 70 70" {...p}>
    <path className="fill" d="M16 40 h38 v18 q0 6 -6 6 H22 q-6 0 -6 -6Z" style={{ fill: p.fill ?? "var(--blue)" }} />
    <path d="M10 6 h44 M14 6 v52 q0 8 8 8 h26 q8 0 8 -8 V6 M56 6 l6 -2 M44 20 h8 M44 30 h8" />
  </Svg>
);

export const Atom = (p: P) => (
  <Svg viewBox="0 0 80 80" {...p}>
    <ellipse cx="40" cy="40" rx="34" ry="12" />
    <ellipse cx="40" cy="40" rx="34" ry="12" transform="rotate(60 40 40)" />
    <ellipse cx="40" cy="40" rx="34" ry="12" transform="rotate(-60 40 40)" />
    <circle cx="40" cy="40" r="5" className="fill" style={{ fill: "var(--yellow)" }} />
  </Svg>
);

export const Spark = (p: P & { color?: string }) => (
  <svg viewBox="0 0 24 24" className={`spark ${p.className ?? ""}`} style={p.style} aria-hidden="true" focusable="false">
    <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z" fill={p.color ?? "var(--yellow)"} />
  </svg>
);

export const Loop = (p: P) => (
  <Svg viewBox="0 0 120 56" className={`draw ${p.className ?? ""}`} style={p.style}>
    <path style={{ ["--len" as string]: 240 }} d="M4 46C18 14 40 6 46 26s-18 22-10 4 30-26 46-10 14 20 30 6" />
  </Svg>
);

export const Burst = (p: P) => (
  <Svg viewBox="0 0 44 40" {...p}>
    <path d="M6 30 16 22M14 8l6 12M34 4l-4 14" />
  </Svg>
);

/** A hand-drawn arrow that draws itself in. */
export const Arrow = (p: P & { flip?: boolean }) => (
  <Svg viewBox="0 0 120 80" className={`draw ${p.className ?? ""}`} style={{ ...p.style, ...(p.flip ? { transform: "scaleX(-1)" } : {}) }}>
    <path style={{ ["--len" as string]: 220 }} d="M6 10C20 50 54 62 104 56M92 44l14 12-16 10" />
  </Svg>
);

/** Squiggly underline for one word in a heading. */
export function Squiggle({ children, color = "var(--orange)" }: { children: ReactNode; color?: string }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg viewBox="0 0 200 20" preserveAspectRatio="none" className="squig draw" aria-hidden="true">
        <path style={{ ["--len" as string]: 260, stroke: color }} d="M4 12c18-12 30 10 48 0s30-12 48 0 30 10 48 0 30-10 48 0" />
      </svg>
    </span>
  );
}

const SETS: Record<string, ReactNode> = {
  flask: (
    <>
      <Flask className="bob w-12" style={{ right: "4%", top: "-6px" }} />
      <Spark className="twinkle w-4" style={{ right: "12%", top: "-14px" }} />
      <Burst className="w-8" style={{ right: "-2%", top: "34px" }} />
    </>
  ),
  tube: (
    <>
      <TestTube className="bob w-7" style={{ right: "6%", top: "-10px", ["--rot" as string]: "12deg" }} />
      <TestTube className="bob w-6 b2" fill="var(--violet)" style={{ right: "11%", top: "6px", ["--rot" as string]: "-8deg" }} />
      <Spark className="twinkle w-3.5" color="var(--green)" style={{ right: "2%", top: "0" }} />
    </>
  ),
  beaker: (
    <>
      <Beaker className="bob w-12" style={{ right: "5%", top: "-4px" }} />
      <Loop className="w-24" style={{ right: "13%", top: "18px" }} />
      <Spark className="twinkle w-4" color="var(--orange)" style={{ right: "1%", top: "-12px" }} />
    </>
  ),
  atom: (
    <>
      <Atom className="spin w-14" style={{ right: "5%", top: "-10px" }} />
      <Spark className="twinkle w-4" style={{ right: "15%", top: "-4px" }} />
      <Burst className="w-8" style={{ right: "0", top: "36px" }} />
    </>
  ),
};

/** A small cluster of doodles in the top-right of a page header. */
export function HeaderDoodles({ set = "flask" }: { set?: keyof typeof SETS }) {
  return (
    <div className="deco hidden md:block" aria-hidden="true">
      {SETS[set]}
    </div>
  );
}

/** Very faint doodles in the page margins, fixed behind content (wide screens only). */
export function BackgroundDoodles() {
  return (
    <div className="bg-deco hidden xl:block" aria-hidden="true">
      <Flask className="bob" style={{ left: "2.5%", top: "28%", width: 54, ["--rot" as string]: "-10deg" }} />
      <TestTube className="bob b2" fill="var(--yellow)" style={{ right: "3%", top: "58%", width: 26, ["--rot" as string]: "14deg" }} />
      <Atom className="spin" style={{ left: "4%", top: "74%", width: 60 }} />
      <Beaker className="bob b3" fill="var(--green)" style={{ right: "2.5%", top: "20%", width: 50 }} />
      <Spark className="twinkle" style={{ left: "7%", top: "48%", width: 14 }} />
      <Spark className="twinkle b2" color="var(--blue)" style={{ right: "7%", top: "40%", width: 12 }} />
      <Spark className="twinkle b3" color="var(--orange)" style={{ right: "6%", top: "84%", width: 16 }} />
    </div>
  );
}
