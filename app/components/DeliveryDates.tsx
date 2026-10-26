import { useState } from "react";
import { ApiError } from "~/lib/api.ts";
import { formatMinor, formatRange } from "~/lib/money.ts";
import { quoteDeliveryDates } from "~/lib/queries.ts";
import type { DeliveryDates as Dates, Tier } from "~/lib/types.ts";

const TIER_LABEL: Record<Tier, string> = { SAME_DAY: "Same day", NEXT_DAY: "Next day", TWO_DAY: "Two day", STANDARD: "Standard" };

type State = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; dates: Dates } | { kind: "error"; message: string };

/** Delivery dates are fetched after the page rendered: the product page never waits for them. */
export function DeliveryDates({ productId }: { productId: string }) {
  const [postal, setPostal] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const prefix = postal.trim();
    if (!prefix) return;
    setState({ kind: "loading" });
    try {
      setState({ kind: "ready", dates: await quoteDeliveryDates(productId, prefix) });
    } catch (err) {
      const timedOut = err instanceof ApiError && err.status === 504;
      setState({ kind: "error", message: timedOut ? "Enter your postal code to see delivery dates." : "Delivery dates are unavailable right now." });
    }
  }

  return (
    <section className="panel" aria-labelledby="dd-h">
      <h2 id="dd-h">Delivery</h2>
      <form onSubmit={submit} className="row">
        <label htmlFor="postal">Postal code</label>
        <input id="postal" name="postalPrefix" value={postal} onChange={(e) => setPostal(e.target.value)} maxLength={10} inputMode="text" autoComplete="postal-code" />
        <button type="submit" className="secondary">See delivery dates</button>
      </form>
      <div className="dates" aria-live="polite">
        {state.kind === "idle" && <p className="muted">Enter your postal code to see delivery dates.</p>}
        {state.kind === "loading" && <p className="muted">Checking delivery dates…</p>}
        {state.kind === "error" && <p className="muted">{state.message}</p>}
        {state.kind === "ready" && <DatesList dates={state.dates} />}
      </div>
    </section>
  );
}

export function DatesList({ dates }: { dates: Dates }) {
  if (dates.tiers.length === 0) return <p>This item cannot be delivered to {dates.postalPrefix}.</p>;
  return (
    <ul>
      {dates.tiers.map((t) => (
        <li key={t.tier}>
          <strong>{TIER_LABEL[t.tier]}</strong>: {formatRange(t.deliverByEarliest, t.deliverByLatest)}
          {t.charge?.amountMinor !== undefined && t.charge.currency
            ? ` · ${t.charge.amountMinor === 0 ? "Free" : formatMinor(t.charge.amountMinor, t.charge.currency)}`
            : ""}
        </li>
      ))}
    </ul>
  );
}
