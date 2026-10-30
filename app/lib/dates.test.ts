import { afterEach, describe, expect, it } from "vitest";
import { arriving, formatDay, formatHour, formatLongDay, formatPlaced, formatRange, promiseDate, zoneFor } from "./dates.ts";

const CHICAGO = "America/Chicago";
// The real promise shape (ADR 0006): one local delivery day in Chicago is 14:00Z to 02:00Z the next UTC day.
const EARLIEST = "2026-10-31T14:00:00Z";
const LATEST = "2026-11-01T02:00:00Z";

describe("promise windows in the window's time zone", () => {
  it("renders a 14:00Z..02:00Z Chicago window as one day with its hours", () => {
    expect(arriving(EARLIEST, LATEST, CHICAGO)).toBe("Arriving Saturday, Oct 31, 9 AM – 9 PM");
    expect(promiseDate(EARLIEST, LATEST, CHICAGO)).toBe("Saturday, October 31");
    expect(formatRange(EARLIEST, LATEST, CHICAGO)).toBe("Sat, Oct 31");
  });

  it("reads a window without a zone in UTC, where the same instants span two days", () => {
    expect(arriving(EARLIEST, LATEST)).toBe("Arriving Oct 31 – Nov 1");
    expect(arriving(EARLIEST, LATEST, null)).toBe("Arriving Oct 31 – Nov 1");
    expect(promiseDate(EARLIEST, LATEST, undefined)).toBe("Sat, Oct 31 – Sun, Nov 1");
  });

  it("falls back to UTC for a zone name this runtime does not know", () => {
    expect(zoneFor("Mars/Olympus_Mons")).toBe("UTC");
    expect(zoneFor("Mars/Olympus_Mons")).toBe("UTC");
    expect(zoneFor(CHICAGO)).toBe(CHICAGO);
    expect(zoneFor("")).toBe("UTC");
    expect(arriving(EARLIEST, LATEST, "Mars/Olympus_Mons")).toBe("Arriving Oct 31 – Nov 1");
  });

  it("keeps the local day across a daylight-saving change (winter window is 8 AM – 8 PM)", () => {
    expect(arriving("2026-11-07T14:00:00Z", "2026-11-08T02:00:00Z", CHICAGO)).toBe("Arriving Saturday, Nov 7, 8 AM – 8 PM");
  });

  it("shows minutes only when an end is not on the hour, and only days for a multi-day window", () => {
    expect(formatHour("2026-10-31T14:30:00Z", CHICAGO)).toBe("9:30 AM");
    expect(formatHour("2026-10-31T09:00:00Z", "Asia/Kolkata")).toBe("2:30 PM");
    expect(arriving("2026-10-31T14:00:00Z", "2026-11-03T02:00:00Z", CHICAGO)).toBe("Arriving Oct 31 – Nov 2");
  });

  it("shows a single instant and calendar days without hours", () => {
    expect(arriving("2026-10-31T18:00:00Z", "2026-10-31T18:00:00Z", CHICAGO)).toBe("Arriving Saturday, Oct 31");
    expect(arriving("2026-10-31", "2026-10-31", CHICAGO)).toBe("Arriving Saturday, Oct 31");
    expect(arriving("2026-10-31", "2026-11-01")).toBe("Arriving Oct 31 – Nov 1");
    expect(promiseDate("2026-10-31", "2026-11-01")).toBe("Sat, Oct 31 – Sun, Nov 1");
    expect(formatRange("2030-01-10", "2030-01-12", CHICAGO)).toBe("Thu, Jan 10 – Sat, Jan 12");
  });

  it("formats single days and placed dates in the given zone, UTC without one", () => {
    // 03:00 UTC on Jan 6 is still Jan 5 in Chicago.
    expect(formatDay("2030-01-06T03:00:00Z", CHICAGO)).toBe("Sat, Jan 5");
    expect(formatDay("2030-01-06T03:00:00Z")).toBe("Sun, Jan 6");
    expect(formatDay("2030-01-05")).toBe("Sat, Jan 5");
    expect(formatLongDay("2026-10-31T18:00:00Z", CHICAGO)).toBe("Saturday, October 31");
    expect(formatPlaced("2026-10-30T03:00:00Z", CHICAGO)).toBe("Oct 29, 2026");
    expect(formatPlaced("2026-10-30T03:00:00Z")).toBe("Oct 30, 2026");
  });
});

describe("independence from the runtime's zone", () => {
  const saved = process.env["TZ"];
  afterEach(() => {
    if (saved === undefined) delete process.env["TZ"];
    else process.env["TZ"] = saved;
  });

  it("renders the same text whatever zone the server or browser runs in", () => {
    const seen = new Set<string>();
    for (const tz of ["Asia/Tokyo", "Pacific/Honolulu", "UTC"]) {
      process.env["TZ"] = tz;
      expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(tz);
      seen.add([arriving(EARLIEST, LATEST, CHICAGO), arriving(EARLIEST, LATEST), formatPlaced(EARLIEST)].join("|"));
    }
    expect([...seen]).toEqual(["Arriving Saturday, Oct 31, 9 AM – 9 PM|Arriving Oct 31 – Nov 1|Oct 31, 2026"]);
  });
});
