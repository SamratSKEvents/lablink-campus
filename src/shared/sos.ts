/**
 * Staff-verified emergency instructions. Bundled in the app so they work offline and
 * never depend on AI. Edit only with the campus safety officer's sign-off.
 */
import type { SosType } from "./domain.js";

export const SOS_LABELS: Record<SosType, string> = {
  fire: "Fire",
  chemical: "Chemical",
  electrical: "Electrical",
  injury: "Injury",
  gas_leak: "Gas leak",
  malfunction: "Malfunction",
  unspecified: "Emergency",
};

export const SOS_INSTRUCTIONS: Record<SosType, string[]> = {
  fire: [
    "Call 112 now.",
    "Shout “Fire!” and warn people nearby.",
    "If the fire is small and you are trained, use the CO₂ extinguisher. Otherwise leave.",
    "Leave by the nearest exit. Don't use lifts. Close doors behind you.",
  ],
  chemical: [
    "Call 112 now.",
    "Move away from the spill and warn others.",
    "If it's on your skin or in your eyes, rinse at the eyewash or sink for 15 minutes.",
    "Remove contaminated clothing if it's safe to do so.",
  ],
  electrical: [
    "Call 112 now.",
    "Don't touch the person or the equipment while it may be live.",
    "Switch off power at the bench isolator or main switch if you can reach it safely.",
    "Keep everyone back until the power is off.",
  ],
  injury: [
    "Call 112 now if the injury is serious.",
    "Stop bleeding with firm pressure using a clean cloth.",
    "Don't move someone with a suspected head, neck or back injury.",
    "Stay with them until help arrives.",
  ],
  gas_leak: [
    "Call 112 now.",
    "Don't switch anything on or off. No flames or sparks.",
    "Leave the room and keep the door closed.",
    "Warn others and stay out until staff say it's safe.",
  ],
  malfunction: [
    "Stop the equipment with its emergency stop or power switch if safe.",
    "Step back and keep others away.",
    "Call 112 if anyone is hurt or there is smoke or fire.",
    "Don't try to repair it yourself.",
  ],
  unspecified: [
    "Call 112 now.",
    "Move yourself and others away from danger.",
    "Stay where responders can find you if it's safe.",
  ],
};
