// Delivery dates as a retailer shows them, from the network's delivery promise. The only service
// areas are in Texas (prefixes 786/787), so instants are shown on the delivery area's calendar;
// date-only values (the cart quote's "2030-01-10") are calendar days already and are shown as such.
export const DELIVERY_TIME_ZONE = "America/Chicago";
const LOCALE = "en-US";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function fmt(iso: string, opts: Intl.DateTimeFormatOptions): string {
  const timeZone = DATE_ONLY.test(iso) ? "UTC" : DELIVERY_TIME_ZONE;
  return new Intl.DateTimeFormat(LOCALE, { ...opts, timeZone }).format(new Date(iso));
}

const dayKey = (iso: string) => fmt(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
const sameDay = (a: string, b: string) => dayKey(a) === dayKey(b);

/** "Sat, Jan 5" */
export function formatDay(iso: string): string {
  return fmt(iso, { weekday: "short", month: "short", day: "numeric" });
}

/** "Saturday, January 5" */
export function formatLongDay(iso: string): string {
  return fmt(iso, { weekday: "long", month: "long", day: "numeric" });
}

/** "Oct 31" */
export function formatMonthDay(iso: string): string {
  return fmt(iso, { month: "short", day: "numeric" });
}

/** "Sat, Jan 5" for one day, "Thu, Jan 10 – Sat, Jan 12" for a window. */
export function formatRange(earliest: string, latest: string): string {
  return sameDay(earliest, latest) ? formatDay(earliest) : `${formatDay(earliest)} – ${formatDay(latest)}`;
}

/** The headline date of a promise: "Saturday, October 31" or "Sat, Oct 31 – Sun, Nov 1". */
export function promiseDate(earliest: string, latest: string): string {
  return sameDay(earliest, latest) ? formatLongDay(earliest) : formatRange(earliest, latest);
}

/** "Arriving Saturday, Oct 31" for one day, "Arriving Oct 31 – Nov 1" for a window. */
export function arriving(earliest: string, latest: string): string {
  if (sameDay(earliest, latest)) return `Arriving ${fmt(earliest, { weekday: "long", month: "short", day: "numeric" })}`;
  return `Arriving ${formatMonthDay(earliest)} – ${formatMonthDay(latest)}`;
}

/** "Oct 29, 2026" for an order's placed date. */
export function formatPlaced(iso: string): string {
  return fmt(iso, { month: "short", day: "numeric", year: "numeric" });
}
