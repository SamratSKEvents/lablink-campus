/** Shared 3D palette (mirrors design/tokens.css) and helpers. */
export const PALETTE = {
  ink: "#0c0a09",
  stone: "#f6f5f3",
  stone2: "#e2dfdb",
  green: "#2fcf8a",
  yellow: "#ffd54a",
  orange: "#ff8a3d",
  red: "#ff4d4f",
  blue: "#4c8dff",
  violet: "#8b6cff",
  white: "#ffffff",
} as const;

export const STATUS_COLOR: Record<string, string> = {
  free: PALETTE.green,
  held: PALETTE.yellow,
  booked: PALETTE.orange,
  maintenance: PALETTE.red,
  sos: PALETTE.red,
};

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
