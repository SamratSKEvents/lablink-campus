/**
 * Time helpers. Storage is UTC; campus time is Asia/Kolkata (UTC+05:30, no DST),
 * so IST arithmetic is a fixed offset and needs no timezone library.
 */
export const SLOT_MIN = 15;
export const IST_OFFSET_MIN = 330;
const MIN = 60_000;

export function addMinutes(iso: string | Date, minutes: number): Date {
  return new Date(new Date(iso).getTime() + minutes * MIN);
}

/** Round up to the next slot boundary (no change if already aligned). */
export function ceilToSlot(d: Date): Date {
  const step = SLOT_MIN * MIN;
  return new Date(Math.ceil(d.getTime() / step) * step);
}

/** Minutes after IST midnight, 0..1439. */
export function istMinuteOfDay(d: Date): number {
  const m = Math.floor(d.getTime() / MIN) + IST_OFFSET_MIN;
  return ((m % 1440) + 1440) % 1440;
}

/** IST calendar day key, e.g. "2026-11-23". */
export function istDayKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MIN * MIN).toISOString().slice(0, 10);
}

/** Monday-based IST week key: the day key of that week's Monday. */
export function istWeekKey(d: Date): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * MIN);
  const dow = (ist.getUTCDay() + 6) % 7;
  ist.setUTCDate(ist.getUTCDate() - dow);
  return ist.toISOString().slice(0, 10);
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function minutesBetween(a: string | Date, b: string | Date): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / MIN);
}

/** Slot key used in lock ids: YYYYMMDDHHmm (UTC). */
export function slotKey(d: Date): string {
  return d.toISOString().slice(0, 16).replace(/[-:T]/g, "");
}

/** Every slot start covered by [start, end). */
export function slotsIn(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += SLOT_MIN * MIN) out.push(new Date(t));
  return out;
}

const fmtTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
});
const fmtDay = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function formatTime(iso: string | Date): string {
  return fmtTime.format(new Date(iso));
}

export function formatDay(iso: string | Date): string {
  return fmtDay.format(new Date(iso));
}

/** "Tue 24 Nov, 2:00 pm – 4:00 pm" */
export function formatRange(start: string | Date, end: string | Date): string {
  return `${formatDay(start)}, ${formatTime(start)} – ${formatTime(end)}`;
}
