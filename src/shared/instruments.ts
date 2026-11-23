/**
 * Instrument explainer: controls that the 3D models can highlight, plus static quick-start
 * steps (the no-AI fallback). Covers two instruments, done well.
 */
export interface InstrumentDef {
  controls: { id: string; label: string }[];
  quickStart: { text: string; control: string }[];
}

export const INSTRUMENTS: Record<string, InstrumentDef> = {
  oscilloscope: {
    controls: [
      { id: "probe", label: "CH1 probe input" },
      { id: "default", label: "Default Setup button" },
      { id: "autoscale", label: "Auto Scale button" },
      { id: "vertical", label: "Vertical scale knob (V/div)" },
      { id: "horizontal", label: "Horizontal scale knob (s/div)" },
      { id: "trigger", label: "Trigger level knob" },
      { id: "measure", label: "Measure button" },
      { id: "runstop", label: "Run/Stop button" },
      { id: "screen", label: "Screen" },
    ],
    quickStart: [
      { text: "Connect the probe to CH1 and clip its ground lead to your circuit's ground.", control: "probe" },
      { text: "Press Default Setup to clear the last user's settings.", control: "default" },
      { text: "Press Auto Scale to find your signal.", control: "autoscale" },
      { text: "Turn the vertical knob until the wave fills about half the screen.", control: "vertical" },
      { text: "Turn the horizontal knob to show two or three cycles.", control: "horizontal" },
      { text: "Adjust the trigger level until the wave stops sliding.", control: "trigger" },
      { text: "Press Measure and add Frequency and Peak-to-peak.", control: "measure" },
      { text: "Press Run/Stop to freeze the trace for a screenshot.", control: "runstop" },
    ],
  },
  "3d-printer": {
    controls: [
      { id: "knob", label: "Control knob and screen" },
      { id: "spool", label: "Filament spool" },
      { id: "nozzle", label: "Nozzle / print head" },
      { id: "bed", label: "Heated bed" },
      { id: "sheet", label: "Spring-steel print sheet" },
      { id: "usb", label: "USB port" },
    ],
    quickStart: [
      { text: "Check the print sheet is clean and seated on the bed pins.", control: "sheet" },
      { text: "Load filament from the spool using the control knob menu.", control: "spool" },
      { text: "Run first-layer calibration if this is your first print today.", control: "knob" },
      { text: "Insert your USB drive with the sliced file.", control: "usb" },
      { text: "Select your file with the control knob and start.", control: "knob" },
      { text: "Watch the first layer go down. Stop if it isn't sticking.", control: "nozzle" },
      { text: "Let the bed cool, then flex the sheet to release the print.", control: "bed" },
    ],
  },
};
