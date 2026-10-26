import { useState } from "react";
import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/checkout";
import { useRenewedActionId } from "~/lib/action-id.ts";
import { PaymentFields } from "~/components/PaymentFields.tsx";
import { guarded, formString, type ActionResult } from "~/lib/action-result.ts";
import { ApiError } from "~/lib/api.ts";
import { currentCart, forgetCartId } from "~/lib/cart-session.ts";
import { announceCartChanged } from "~/lib/cart-events.ts";
import { formatMinor } from "~/lib/money.ts";
import { isScenario, tokenFor, type ScenarioId } from "~/lib/payment.ts";
import { confirmCheckout, getCheckout, openCheckout } from "~/lib/queries.ts";
import type { CheckoutSession } from "~/lib/types.ts";
import { currentShopper } from "~/lib/shopper.ts";

const SESSION_KEY = "sf.checkoutId";
const rememberedSession = () => (typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(SESSION_KEY));

export async function clientLoader() {
  const shopper = await currentShopper();
  if (!shopper) throw redirect("/account");
  const cart = await currentCart();
  let session: CheckoutSession | null = null;
  const remembered = rememberedSession();
  if (remembered) {
    session = await getCheckout(remembered).catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (session && session.state !== "OPEN" && session.state !== "DECLINED") session = null;
  }
  if (!session && (!cart || !cart.checkoutReadiness?.ready)) throw redirect("/cart");
  return { shopper, session };
}

export function HydrateFallback() {
  return <p aria-busy="true">Preparing checkout…</p>;
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  const form = await request.formData();
  const intent = formString(form, "intent");
  const actionId = formString(form, "actionId") || undefined;
  if (intent === "open") {
    const res = await guarded(() => openCheckout(formString(form, "shipToAddressId"), undefined, actionId));
    if (res.ok && res.value) sessionStorage.setItem(SESSION_KEY, res.value.sessionId);
    return res;
  }
  if (intent === "confirm") {
    const scenario = formString(form, "scenario");
    const sessionId = formString(form, "sessionId");
    if (!isScenario(scenario)) return { ok: false, error: "Choose a payment scenario." } satisfies ActionResult;
    const res = await guarded(() => confirmCheckout(sessionId, tokenFor(scenario), actionId));
    if (!res.ok) return res;
    const s = res.value;
    if (s && (s.state === "COMPLETED" || s.state === "PLACING" || s.state === "AUTHORIZING")) {
      if (s.state === "COMPLETED") {
        sessionStorage.removeItem(SESSION_KEY);
        forgetCartId();
        announceCartChanged(0);
      }
      return redirect(`/confirmation/${encodeURIComponent(s.sessionId)}`);
    }
    return res;
  }
  return { ok: false, error: "Unknown checkout step." } satisfies ActionResult;
}

/** What the shopper sees when a confirm answered with a session that is not a success. */
export function outcomeMessage(s: CheckoutSession): string | null {
  switch (s.state) {
    case "DECLINED":
      return "Your payment was declined. You can try again with a different payment scenario.";
    case "REQUOTE_REQUIRED":
      return "Delivery options changed while you were checking out. Please review your cart again.";
    case "EXPIRED":
      return "This checkout expired. Start again from your cart.";
    case "FAILED":
      return `We could not complete the order${s.failureCode ? ` (${s.failureCode})` : ""}. Nothing was charged.`;
    default:
      return null;
  }
}

export default function Checkout({ loaderData }: Route.ComponentProps) {
  const { shopper, session } = loaderData;
  const result = useActionData<ActionResult<CheckoutSession>>();
  const busy = useNavigation().state === "submitting";
  const [scenario, setScenario] = useState<ScenarioId>("approve");
  const current = result?.ok && result.value ? result.value : session;
  const error = result && !result.ok ? result.error : null;
  const note = result?.ok && result.value ? outcomeMessage(result.value) : null;
  const actionId = useRenewedActionId(result?.ok ? result : null);
  const reviewing = current && (current.state === "OPEN" || current.state === "DECLINED");

  return (
    <section aria-labelledby="co-h">
      <h1 id="co-h">Checkout</h1>
      {error && <p className="alert" role="alert">{error}</p>}
      {note && <p className="alert" role="alert">{note} <Link to="/cart">Back to cart</Link></p>}
      {!reviewing ? (
        <Form method="post" className="panel stack">
          <input type="hidden" name="intent" value="open" />
          <input type="hidden" name="actionId" value={actionId} />
          <h2>Delivery address</h2>
          {shopper.savedAddresses.length === 0 ? (
            <p>You have no saved address. <Link to="/account">Add one on your account page.</Link></p>
          ) : (
            <>
              <label htmlFor="addr">Ship to</label>
              <select id="addr" name="shipToAddressId" required>
                {shopper.savedAddresses.map((a) => <option key={a.addressId} value={a.addressId}>{a.name}, {a.line1}, {a.city} {a.postalCode}</option>)}
              </select>
              <button type="submit" disabled={busy}>Review order</button>
            </>
          )}
        </Form>
      ) : (
        <Review session={current} scenario={scenario} onScenario={setScenario} busy={busy} actionId={actionId} />
      )}
    </section>
  );
}

function Review({ session, scenario, onScenario, busy, actionId }: { session: CheckoutSession; scenario: ScenarioId; onScenario: (s: ScenarioId) => void; busy: boolean; actionId: string }) {
  const cur = session.currency ?? "USD";
  return (
    <Form method="post" className="stack">
      <input type="hidden" name="intent" value="confirm" />
      <input type="hidden" name="sessionId" value={session.sessionId} />
      <input type="hidden" name="actionId" value={actionId} />
      <input type="hidden" name="scenario" value={scenario} />
      <section className="panel" aria-labelledby="rev-h">
        <h2 id="rev-h">Review your order</h2>
        <ul>
          {session.lines.map((l) => <li key={l.lineNo}>{l.quantity} × {l.catalogItemId}</li>)}
        </ul>
        {session.groups.map((g) => (
          <p key={g.groupNo}>Shipment {g.groupNo}: {g.tier.replace("_", " ").toLowerCase()} · {formatMinor(g.amountMinor, cur)}</p>
        ))}
        {session.totalMinor !== undefined && <p><strong>Total {formatMinor(session.totalMinor, cur)}</strong></p>}
        <p className="muted">Price held until {new Date(session.quoteExpiresAt).toLocaleTimeString("en-US", { timeStyle: "short", timeZone: "UTC" })} UTC.</p>
      </section>
      <PaymentFields value={scenario} onChange={onScenario} disabled={busy} />
      <div><button type="submit" disabled={busy}>{busy ? "Placing order…" : "Place order"}</button></div>
    </Form>
  );
}
