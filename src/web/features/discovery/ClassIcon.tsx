import { Activity, BatteryCharging, Binary, CircuitBoard, Cog, Cpu, Flame, Microscope, Printer, Rainbow, Wind, Zap, type LucideIcon } from "lucide-react";
import { classById } from "@shared/catalogue";

const ICONS: Record<string, LucideIcon> = {
  printer: Printer,
  zap: Zap,
  cog: Cog,
  flame: Flame,
  cpu: Cpu,
  activity: Activity,
  binary: Binary,
  "battery-charging": BatteryCharging,
  "circuit-board": CircuitBoard,
  microscope: Microscope,
  rainbow: Rainbow,
  wind: Wind,
};

const TONE: Record<string, string> = { none: "tone-blue", low: "tone-green", medium: "tone-yellow", high: "tone-orange" };

/** Lucide icon in a 44 px tinted square; tint follows the class hazard level. */
export function ClassIcon({ classId }: { classId: string }) {
  const c = classById(classId);
  const Icon = ICONS[c?.icon ?? ""] ?? Cpu;
  return (
    <span className={`appicon ${TONE[c?.hazard ?? "low"]}`} aria-hidden="true">
      <Icon size={22} strokeWidth={2} />
    </span>
  );
}
