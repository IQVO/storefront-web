// Delivery dates as a retailer shows them, from the network's delivery promise (ADR 0006).
// A promise window is a span of instants that the shopper reads as days and hours of the DESTINATION, so every
// instant is formatted in the window's IANA `timeZone` when the BFF sends one, else in UTC (how the delivery
// network reads a window stored before it carried a zone). Never the server's or the browser's zone: every
// formatter below is given an explicit timeZone. Date-only values (the cart quote's "2030-01-10") are calendar
// days already and are shown as such.
export const FALLBACK_TIME_ZONE = "UTC";
const LOCALE = "en-US";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const known = new Map<string, boolean>();

/** The zone a window is shown in: its own IANA name when this runtime knows it, else UTC. */
export function zoneFor(timeZone?: string | null): string {
  if (!timeZone) return FALLBACK_TIME_ZONE;
  let ok = known.get(timeZone);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat(LOCALE, { timeZone });
      ok = true;
    } catch {
      ok = false;
    }
    known.set(timeZone, ok);
  }
  return ok ? timeZone : FALLBACK_TIME_ZONE;
}

const isDateOnly = (iso: string) => DATE_ONLY.test(iso);

// ICU builds differ on the space before AM/PM (U+202F or U+00A0); one plain space keeps server and browser text equal.
const plain = (s: string) => s.replace(/[\u202f\u00a0]/g, " ");

function formatter(iso: string, opts: Intl.DateTimeFormatOptions, timeZone?: string | null): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(LOCALE, { ...opts, timeZone: isDateOnly(iso) ? FALLBACK_TIME_ZONE : zoneFor(timeZone) });
}

function fmt(iso: string, opts: Intl.DateTimeFormatOptions, timeZone?: string | null): string {
  return plain(formatter(iso, opts, timeZone).format(new Date(iso)));
}

const dayKey = (iso: string, tz?: string | null) => fmt(iso, { year: "numeric", month: "2-digit", day: "2-digit" }, tz);
const sameDay = (a: string, b: string, tz?: string | null) => dayKey(a, tz) === dayKey(b, tz);

/** "Sat, Jan 5" */
export function formatDay(iso: string, timeZone?: string | null): string {
  return fmt(iso, { weekday: "short", month: "short", day: "numeric" }, timeZone);
}

/** "Saturday, January 5" */
export function formatLongDay(iso: string, timeZone?: string | null): string {
  return fmt(iso, { weekday: "long", month: "long", day: "numeric" }, timeZone);
}

/** "Oct 31" */
export function formatMonthDay(iso: string, timeZone?: string | null): string {
  return fmt(iso, { month: "short", day: "numeric" }, timeZone);
}

/** "9 AM", or "9:30 AM" when the instant is not on the hour in the window's zone. */
export function formatHour(iso: string, timeZone?: string | null): string {
  const parts = formatter(iso, { hour: "numeric", minute: "2-digit" }, timeZone).formatToParts(new Date(iso));
  const onTheHour = parts.find((p) => p.type === "minute")?.value === "00";
  return fmt(iso, onTheHour ? { hour: "numeric" } : { hour: "numeric", minute: "2-digit" }, timeZone);
}

/** "Sat, Jan 5" for one day, "Thu, Jan 10 – Sat, Jan 12" for a window. */
export function formatRange(earliest: string, latest: string, timeZone?: string | null): string {
  return sameDay(earliest, latest, timeZone) ? formatDay(earliest, timeZone) : `${formatDay(earliest, timeZone)} – ${formatDay(latest, timeZone)}`;
}

/** The headline date of a promise: "Saturday, October 31" or "Sat, Oct 31 – Sun, Nov 1". */
export function promiseDate(earliest: string, latest: string, timeZone?: string | null): string {
  return sameDay(earliest, latest, timeZone) ? formatLongDay(earliest, timeZone) : formatRange(earliest, latest, timeZone);
}

/** Hours are shown for a window of two distinct instants (not calendar days). */
const hasHours = (earliest: string, latest: string) => !isDateOnly(earliest) && !isDateOnly(latest) && Date.parse(earliest) < Date.parse(latest);

/**
 * "Arriving Saturday, Oct 31, 9 AM – 9 PM" for a window within one local day, "Arriving Saturday, Oct 31" for a
 * calendar day, "Arriving Oct 31 – Nov 1" for a window over several days.
 */
export function arriving(earliest: string, latest: string, timeZone?: string | null): string {
  if (sameDay(earliest, latest, timeZone)) {
    const day = `Arriving ${fmt(earliest, { weekday: "long", month: "short", day: "numeric" }, timeZone)}`;
    return hasHours(earliest, latest) ? `${day}, ${formatHour(earliest, timeZone)} – ${formatHour(latest, timeZone)}` : day;
  }
  return `Arriving ${formatMonthDay(earliest, timeZone)} – ${formatMonthDay(latest, timeZone)}`;
}

/** "Oct 29, 2026" for an order's placed date, on the destination's calendar when the order carries its zone. */
export function formatPlaced(iso: string, timeZone?: string | null): string {
  return fmt(iso, { month: "short", day: "numeric", year: "numeric" }, timeZone);
}
