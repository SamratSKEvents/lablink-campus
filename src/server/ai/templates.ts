/**
 * Deterministic project templates: the no-AI fallback for "describe → plan".
 * Also seed the demo projects. Every class id here exists in the catalogue.
 */
import type { PlanPart, Task } from "../../shared/domain.js";

export interface PlanTemplate {
  category: string;
  emoji: string;
  keywords: RegExp;
  tasks: Task[];
  parts: PlanPart[];
}

export const TEMPLATES: PlanTemplate[] = [
  {
    category: "robotics",
    emoji: "🦾",
    keywords: /robot|arm|gripper|servo|rover|manipulator/i,
    tasks: [
      { id: "fab", name: "Print the links and brackets", classId: "3d-printer", durationMin: 180, dependsOn: [] },
      { id: "solder", name: "Solder the motor driver board", classId: "soldering-station", durationMin: 90, dependsOn: [] },
      { id: "asm", name: "Assemble and wire", classId: "workstation", durationMin: 180, dependsOn: ["fab", "solder"] },
      { id: "test", name: "Tune the PWM signals", classId: "oscilloscope", durationMin: 60, dependsOn: ["asm"], alternatives: ["logic-analyzer"] },
    ],
    parts: [
      { name: "Printed links", shape: "casing", taskId: "fab" },
      { name: "Servo motors", shape: "motor", quantity: { kind: "current", label: "~1.2 A per servo under load" }, taskId: "asm" },
      { name: "Driver board", shape: "board", quantity: { kind: "heat", label: "Driver warms to ~55 °C" }, taskId: "solder" },
      { name: "LiPo battery", shape: "battery", quantity: { kind: "current", label: "7.4 V supply" } },
      { name: "Encoder", shape: "sensor", taskId: "test" },
    ],
  },
  {
    category: "fluid",
    emoji: "💧",
    keywords: /pump|fluid|water|irrigat|hydro|pipe|flow|cool/i,
    tasks: [
      { id: "fab", name: "Cut the enclosure panels", classId: "laser-cutter", durationMin: 60, dependsOn: [] },
      { id: "elec", name: "Build the pump controller", classId: "workstation", durationMin: 120, dependsOn: [] },
      { id: "test", name: "Measure the sensor signals", classId: "oscilloscope", durationMin: 60, dependsOn: ["elec"] },
      { id: "asm", name: "Final assembly and leak test", classId: "workstation", durationMin: 90, dependsOn: ["fab", "test"] },
    ],
    parts: [
      { name: "Pipes", shape: "pipe", quantity: { kind: "fluid", label: "Flow ~2 L/min" }, taskId: "asm" },
      { name: "Pump", shape: "motor", quantity: { kind: "pressure", label: "~0.3 bar head" }, taskId: "elec" },
      { name: "Flow sensor", shape: "sensor", taskId: "test" },
      { name: "Controller", shape: "board", taskId: "elec" },
      { name: "Enclosure", shape: "casing", taskId: "fab" },
    ],
  },
  {
    category: "iot",
    emoji: "📡",
    keywords: /iot|sensor|monitor|esp32|arduino|weather|smart|wireless/i,
    tasks: [
      { id: "proto", name: "Breadboard prototype", classId: "workstation", durationMin: 120, dependsOn: [] },
      { id: "debug", name: "Debug the I2C bus", classId: "logic-analyzer", durationMin: 60, dependsOn: ["proto"], alternatives: ["oscilloscope"] },
      { id: "case", name: "Print the enclosure", classId: "3d-printer", durationMin: 150, dependsOn: [] },
      { id: "solder", name: "Solder onto perfboard", classId: "soldering-station", durationMin: 90, dependsOn: ["debug"] },
    ],
    parts: [
      { name: "Microcontroller", shape: "board", quantity: { kind: "current", label: "~80 mA average" }, taskId: "proto" },
      { name: "Sensors", shape: "sensor", quantity: { kind: "heat", label: "Reads −10 to 60 °C" }, taskId: "debug" },
      { name: "Display", shape: "display", taskId: "solder" },
      { name: "Enclosure", shape: "casing", taskId: "case" },
      { name: "Battery", shape: "battery" },
    ],
  },
  {
    category: "fpga",
    emoji: "🧠",
    keywords: /fpga|verilog|vhdl|accelerat|hdl|processor|risc/i,
    tasks: [
      { id: "synth", name: "Synthesise and flash the design", classId: "fpga-kit", durationMin: 120, dependsOn: [] },
      { id: "probe", name: "Probe the timing", classId: "logic-analyzer", durationMin: 60, dependsOn: ["synth"] },
      { id: "verify", name: "Verify the analog outputs", classId: "oscilloscope", durationMin: 60, dependsOn: ["probe"] },
    ],
    parts: [
      { name: "FPGA board", shape: "board", quantity: { kind: "heat", label: "Core ~45 °C at full load" }, taskId: "synth" },
      { name: "Display output", shape: "display", taskId: "verify" },
      { name: "Signal probe", shape: "sensor", taskId: "probe" },
    ],
  },
  {
    category: "chemistry",
    emoji: "⚗️",
    keywords: /chem|acid|solution|titrat|spectro|sample|bio|enzyme|dye/i,
    tasks: [
      { id: "prep", name: "Prepare samples", classId: "fume-hood", durationMin: 90, dependsOn: [] },
      { id: "measure", name: "Measure absorbance", classId: "spectrometer", durationMin: 60, dependsOn: ["prep"] },
      { id: "image", name: "Image the results", classId: "microscope", durationMin: 45, dependsOn: ["prep"] },
    ],
    parts: [
      { name: "Sample cells", shape: "pipe", quantity: { kind: "fluid", label: "1 mL cuvettes" }, taskId: "prep" },
      { name: "Light sensor", shape: "sensor", taskId: "measure" },
      { name: "Readout", shape: "display", taskId: "image" },
    ],
  },
];

export const GENERIC_TEMPLATE: PlanTemplate = {
  category: "general",
  emoji: "🧪",
  keywords: /.*/,
  tasks: [
    { id: "build", name: "Build the prototype", classId: "workstation", durationMin: 120, dependsOn: [] },
    { id: "test", name: "Test and measure", classId: "oscilloscope", durationMin: 60, dependsOn: ["build"], alternatives: ["logic-analyzer"] },
  ],
  parts: [
    { name: "Main board", shape: "board", taskId: "build" },
    { name: "Sensor", shape: "sensor", taskId: "test" },
    { name: "Enclosure", shape: "casing" },
  ],
};

export function pickTemplate(description: string): PlanTemplate {
  return TEMPLATES.find((t) => t.keywords.test(description)) ?? GENERIC_TEMPLATE;
}
