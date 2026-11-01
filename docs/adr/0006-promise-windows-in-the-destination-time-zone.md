# 6. Promise windows are shown in the destination's time zone

Status: Accepted. Design source: delivery-promise ADR 0011 (optional `timeZone` on every delivery window) and the
storefront campaign brief "carry the delivery window's time zone to every place a shopper sees a promise".

## Context

A delivery window (`deliverByEarliest`..`deliverByLatest`) is a span of instants. A shopper reads it as days and
hours of the DESTINATION. The network's real shape for one local day in the Texas service areas is
`14:00Z..02:00Z` (9 AM – 9 PM CDT): read in UTC it spans two days, read in the browser's or server's zone it
changes with wherever the page is rendered. Until now the web hard-coded `America/Chicago` for every instant,
which is right for today's service areas only.

delivery-promise now sends an optional IANA `timeZone` next to each window; storefront-bff passes it through on
`POST /products/{id}:delivery-dates` tiers and customer-ordering exposes it on order groups (and tracking groups).
It is absent only for rows stored before, which the network reads as UTC.

## Decision

- Every promise window is formatted with `Intl.DateTimeFormat`'s `timeZone` option set to the window's
  `timeZone` when present, else `UTC` (`app/lib/dates.ts`: `zoneFor`). Never the server's or the browser's zone:
  every formatter gets an explicit zone. Places: product buy box (tiers), confirmation, orders list, order
  detail and tracking.
- A name the runtime's ICU does not know falls back to UTC rather than throwing on render.
- A window of two distinct instants that starts and ends on the same local day shows its hours:
  "Arriving Saturday, Oct 31, 9 AM – 9 PM" (minutes only when an end is not on the hour). A multi-day window
  shows days only ("Arriving Oct 31 – Nov 2").
- A tracking group without its own `timeZone` uses its order group's (same shipment, same destination).
- An order's placed date is shown on its first group's calendar, else UTC.
- Date-only values (shopping-cart's quoted offers, already local calendar days) stay calendar days; they carry
  no zone and need none.
- The stub BFF sends the real shape: `14:00Z..02:00Z` with `timeZone: "America/Chicago"` on product tiers,
  order groups and tracking groups.
- **A1** The narrow no-break space some ICU builds put before AM/PM is replaced by a plain space, so server and
  browser render the same text.
- **A2** All `timeZone` fields are optional in every upstream contract; the web treats absent as UTC.

## Consequences

- A new service area in another zone needs no web change.
- Old orders without a zone read in UTC, matching how the network reads them; their dates may differ by one day
  from what the old hard-coded Chicago reading showed.
- `app/lib/dates.test.ts` pins the Chicago one-day case, the UTC fallback, an unknown zone and independence from
  the runtime's `TZ`.
