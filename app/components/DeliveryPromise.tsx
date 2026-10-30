import { useEffect, useState } from "react";
import { arriving, promiseDate } from "~/lib/dates.ts";
import { formatMinor } from "~/lib/money.ts";
import { chargeText, pickPromise, tierLabel, type PromiseOption } from "~/lib/promise.ts";
import { quoteDeliveryDates } from "~/lib/queries.ts";
import type { DeliveryDates } from "~/lib/types.ts";
import { PinIcon } from "./Icons.tsx";
import { useSession } from "./Session.tsx";

type State = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; dates: DeliveryDates } | { kind: "error" };

type Result = { key: string; dates?: DeliveryDates; failed?: boolean };

/**
 * The buy box's delivery promise. Dates are the network's delivery promise for the destination's postal
 * prefix, fetched after render (the product page never waits for them) and only once a destination is known.
 */
export function DeliveryPromise({ productId, orderMinor, currency }: { productId: string; orderMinor: number; currency: string }) {
  const { destination, city, setZip } = useSession();
  const [result, setResult] = useState<Result | null>(null);
  const [editing, setEditing] = useState(false);
  const [zip, setZipInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const prefix = destination?.prefix;
  const key = prefix ? `${productId}|${prefix}` : null;

  useEffect(() => {
    if (!key || !prefix) return;
    let live = true;
    quoteDeliveryDates(productId, prefix)
      .then((dates) => live && setResult({ key, dates }))
      .catch(() => live && setResult({ key, failed: true }));
    return () => {
      live = false;
    };
  }, [productId, prefix, key]);

  const current = result && result.key === key ? result : null;
  const state: State = !key ? { kind: "idle" } : !current ? { kind: "loading" } : current.dates ? { kind: "ready", dates: current.dates } : { kind: "error" };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = setZip(zip);
    setInvalid(!d);
    if (d) setEditing(false);
  }

  const showForm = !destination || editing;
  return (
    <div className="promise" aria-live="polite">
      {destination && state.kind === "loading" && <p className="muted">Checking delivery dates…</p>}
      {destination && state.kind === "error" && <p className="muted">Delivery dates are unavailable right now. Please try again shortly.</p>}
      {destination && state.kind === "ready" && <PromiseLines dates={state.dates} orderMinor={orderMinor} currency={currency} zip={destination.zip} />}
      {destination && !editing && (
        <p className="deliver-to">
          <PinIcon />
          <span>Deliver to {city ? `${city} ` : ""}{destination.zip}</span>{" "}
          <button type="button" className="link-button" onClick={() => setEditing(true)}>Change</button>
        </p>
      )}
      {showForm && (
        <form onSubmit={submit} className="zip-form">
          <label htmlFor="promise-zip">{destination ? "Deliver to another ZIP code" : "Enter your ZIP code to see delivery dates"}</label>
          <div className="zip-row">
            <input id="promise-zip" name="zip" value={zip} onChange={(e) => setZipInput(e.target.value)} maxLength={10} autoComplete="postal-code" inputMode="text" placeholder="e.g. 78701" />
            <button type="submit" className="btn btn-secondary">Apply</button>
          </div>
          {invalid && <p className="field-error" role="alert">Enter a valid ZIP code.</p>}
        </form>
      )}
    </div>
  );
}

function Line({ lead, o }: { lead: "main" | "fastest"; o: PromiseOption }) {
  const charge = chargeText(o, formatMinor);
  const when = promiseDate(o.earliest, o.latest, o.timeZone);
  return (
    <p className={`promise-line promise-${lead}`} data-testid={`promise-${lead}`}>
      {lead === "main" ? (
        <>
          <strong>{charge === "FREE" ? "FREE delivery" : charge ? `${charge} delivery` : "Delivery"}</strong> <strong className="promise-date">{when}</strong>
        </>
      ) : (
        <>
          Or fastest delivery <strong className="promise-date">{when}</strong>{charge ? ` · ${charge === "FREE" ? "FREE" : charge}` : ""}
        </>
      )}
      <span className="promise-sub">
        {tierLabel(o.tier)} · {arriving(o.earliest, o.latest, o.timeZone)}
      </span>
    </p>
  );
}

export function PromiseLines({ dates, orderMinor, currency, zip }: { dates: DeliveryDates; orderMinor: number; currency: string; zip: string }) {
  const pick = pickPromise(dates.tiers, orderMinor, currency);
  if (!pick) {
    const notServed = dates.unavailable.some((u) => u.constraint === "DESTINATION_NOT_SERVED") || dates.unavailable.length === 0;
    return (
      <p className="promise-none" role="status">
        {notServed ? `This item cannot be delivered to ZIP ${zip} yet.` : "No delivery option is available for this item right now."}
      </p>
    );
  }
  return (
    <div className="promise-lines">
      <Line lead="main" o={pick.main} />
      {pick.fastest && <Line lead="fastest" o={pick.fastest} />}
      <p className="promise-source muted small">Dates come from the delivery network&apos;s promise for ZIP {zip}.</p>
    </div>
  );
}
