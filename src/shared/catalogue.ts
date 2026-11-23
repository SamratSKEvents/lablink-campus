import type { EquipmentClass } from "./domain.js";

/**
 * Equipment classes LabLink knows about. AI plans must map onto these ids;
 * anything else is rejected by validation (see server/ai/plan.ts).
 */
export const EQUIPMENT_CLASSES: readonly EquipmentClass[] = [
  { id: "3d-printer", label: "3D printer", hazard: "low", icon: "printer" },
  { id: "laser-cutter", label: "Laser cutter", hazard: "high", icon: "zap" },
  { id: "cnc-mill", label: "CNC mill", hazard: "high", icon: "cog" },
  { id: "soldering-station", label: "Soldering station", hazard: "medium", icon: "flame" },
  { id: "workstation", label: "Electronics workstation", hazard: "low", icon: "cpu" },
  { id: "oscilloscope", label: "Oscilloscope", hazard: "low", icon: "activity" },
  { id: "logic-analyzer", label: "Logic analyser", hazard: "none", icon: "binary" },
  { id: "power-supply", label: "Bench power supply", hazard: "medium", icon: "battery-charging" },
  { id: "fpga-kit", label: "FPGA dev kit", hazard: "none", icon: "circuit-board" },
  { id: "microscope", label: "Microscope", hazard: "none", icon: "microscope" },
  { id: "spectrometer", label: "Spectrometer", hazard: "low", icon: "rainbow" },
  { id: "fume-hood", label: "Fume hood", hazard: "high", icon: "wind" },
] as const;

export const CLASS_IDS = EQUIPMENT_CLASSES.map((c) => c.id);

export function classById(id: string): EquipmentClass | undefined {
  return EQUIPMENT_CLASSES.find((c) => c.id === id);
}

export function classLabel(id: string): string {
  return classById(id)?.label ?? id;
}
