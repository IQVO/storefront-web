import { useState } from "react";
import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/checkout";
import { PaymentFields } from "~/components/PaymentFields.tsx";
import { useRenewedActionId } from "~/lib/action-id.ts";
import { guarded, formString, type ActionResult } from "~/lib/action-result.ts";
import { ApiError } from "~/lib/api.ts";
import { announceCartChanged } from "~/lib/cart-events.ts";
import { currentCart, forgetCartId, lineCount } from "~/lib/cart-session.ts";
import { outcomeMessage, reviewGroups } from "~/lib/checkout.ts";
import { arriving } from "~/lib/dates.ts";
import { formatMinor } from "~/lib/money.ts";
import { isScenario, tokenFor, type ScenarioId } from "~/lib/payment.ts";
import { tierLabel } from "~/lib/promise.ts";
import { confirmCheckout, getCart, getCheckout, getProduct, openCheckout } from "~/lib/queries.ts";
import { currentShopper } from "~/lib/shopper.ts";
import type { Cart, CheckoutSession, ProductView } from "~/lib/types.ts";

const SESSION_KEY = "sf.checkoutId";
const rememberedSession = () => (typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(SESSION_KEY));

export async function clientLoader() {
  const shopper = await currentShopper();
  if (!shopper) throw redirect("/account");
  let session: CheckoutSession | null = null;
  const remembered = rememberedSession();
  if (remembered) {
    session = await getCheckout(remembered).catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (session && session.state !== "OPEN" && session.state !== "DECLINED") session = null;
  }
  // The session's cart carries the quote whose promised windows the review shows.
  const cart: Cart | null = session ? await getCart(session.cartId).catch(() => null) : await currentCart();
  if (!session && (!cart || !cart.checkoutReadiness?.ready)) throw redirect("/cart");
  const products: Record<string, ProductView | null> = {};
  const ids = new Set([...(cart?.lines ?? []), ...(session?.lines ?? [])].map((l) => l.catalogItemId));
  await Promise.all([...ids].map(async (id) => (products[id] = await getProduct(id).catch(() => null))));
  return { shopper, session, cart, products };
}

export function HydrateFallback() {
  return <p className="page" aria-busy="true">Preparing checkout…</p>;
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
    if (!isScenario(scenario)) return { ok: false, error: "Choose a payment method." } satisfies ActionResult;
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

export default function Checkout({ loaderData }: Route.ComponentProps) {
  const { shopper, session, cart, products } = loaderData;
  const result = useActionData<ActionResult<CheckoutSession>>();
  const busy = useNavigation().state === "submitting";
  const [scenario, setScenario] = useState<ScenarioId>("approve");
  const [changing, setChanging] = useState(false);
  const fresh = result?.ok && result.value ? result.value : null;
  const current = fresh ?? session;
  const error = result && !result.ok ? result.error : null;
  const note = fresh ? outcomeMessage(fresh) : null;
  const actionId = useRenewedActionId(result?.ok ? result : null);
  const reviewing = Boolean(current && (current.state === "OPEN" || current.state === "DECLINED")) && !changing;
  const addresses = shopper.savedAddresses;
  const shipTo = addresses.find((a) => a.addressId === current?.shipToAddressId);
  const groups = reviewGroups(cart, reviewing ? current : null);
  const units = cart ? lineCount(cart) : (current?.lines.reduce((n, l) => n + l.quantity, 0) ?? 0);
  const est = cart?.estimate;
  const currency = current?.currency ?? est?.currency ?? "USD";

  return (
    <div className="checkout-page">
      <h1 className="checkout-h">Checkout ({units} {units === 1 ? "item" : "items"})</h1>
      {error && <p className="alert" role="alert">{error}</p>}
      {note && <p className="alert" role="alert">{note} {fresh?.state !== "DECLINED" && <Link to="/cart">Back to cart</Link>}</p>}
      <div className="checkout-grid">
        <div className="checkout-steps">
          <section className="step" aria-labelledby="step-1">
            <h2 id="step-1"><span className="step-no">1</span> Delivery address</h2>
            {reviewing && shipTo ? (
              <div className="step-done">
                <address>{shipTo.name}<br />{shipTo.line1}{shipTo.line2 ? `, ${shipTo.line2}` : ""}<br />{shipTo.city}, {shipTo.region} {shipTo.postalCode}</address>
                <button type="button" className="link-button" onClick={() => setChanging(true)}>Change</button>
              </div>
            ) : addresses.length === 0 ? (
              <p>You have no saved address. <Link to="/account">Add one on your account page.</Link></p>
            ) : (
              <Form method="post" id="address-form" className="stack" onSubmit={() => setChanging(false)}>
                <input type="hidden" name="intent" value="open" />
                <input type="hidden" name="actionId" value={actionId} />
                <fieldset className="radio-cards">
                  <legend className="sr-only">Ship to</legend>
                  {addresses.map((a, i) => (
                    <label key={a.addressId} className="radio-card">
                      <input type="radio" name="shipToAddressId" value={a.addressId} defaultChecked={current ? a.addressId === current.shipToAddressId : i === 0} required />
                      <span className="radio-card-text">
                        <strong>{a.name}</strong>{" "}
                        <span>{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.region} {a.postalCode}, {a.countryCode}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p className="row">
                  <button type="submit" className="btn btn-cart" disabled={busy}>Use this address</button>
                  <Link to="/account">Add a new address</Link>
                </p>
              </Form>
            )}
          </section>

          <section className={`step${reviewing ? "" : " step-locked"}`} aria-labelledby="step-2">
            <h2 id="step-2"><span className="step-no">2</span> Payment method</h2>
            {reviewing ? <PaymentFields value={scenario} onChange={setScenario} disabled={busy} /> : <p className="muted">Choose a delivery address first.</p>}
          </section>

          <section className="step" aria-labelledby="step-3">
            <h2 id="step-3"><span className="step-no">3</span> Review items and delivery</h2>
            {groups.length === 0 && <p className="muted">Your shipments appear here.</p>}
            {groups.map((g) => (
              <div key={g.groupNo} className="review-group">
                <p className="review-arriving">{g.offer ? arriving(g.offer.deliverByEarliest, g.offer.deliverByLatest) : "Delivery date confirmed with your order"}</p>
                <p className="muted small">{tierLabel(g.tier)}{groups.length > 1 ? ` · Shipment ${g.groupNo} of ${groups.length}` : ""} · the delivery network&apos;s promise for ZIP prefix {cart?.destinationPostalPrefix ?? ""}</p>
                <ul className="review-lines">
                  {g.lines.map((l) => (
                    <li key={l.catalogItemId}><span>{products[l.catalogItemId]?.title ?? l.catalogItemId}</span> <span className="muted">Qty: {l.quantity}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>

        <aside className="order-box" aria-label="Order summary">
          {reviewing && current ? (
            <Form method="post" id="place-order">
              <input type="hidden" name="intent" value="confirm" />
              <input type="hidden" name="sessionId" value={current.sessionId} />
              <input type="hidden" name="actionId" value={actionId} />
              <input type="hidden" name="scenario" value={scenario} />
              <button type="submit" className="btn btn-cart btn-block" disabled={busy}>{busy ? "Placing your order…" : "Place your order"}</button>
            </Form>
          ) : (
            <button type="submit" form="address-form" className="btn btn-cart btn-block" disabled={busy || addresses.length === 0}>Use this address</button>
          )}
          <p className="muted small">By placing your order you agree that this is a study store: payments are simulated.</p>
          <h2 className="order-box-h">Order Summary</h2>
          <dl className="summary-lines">
            {est && <div><dt>Items:</dt><dd>{formatMinor(est.itemsMinor, est.currency)}</dd></div>}
            {est && <div><dt>Delivery:</dt><dd>{est.deliveryMinor === 0 ? "FREE" : formatMinor(est.deliveryMinor, est.currency)}</dd></div>}
            {est && <div><dt>Estimated tax:</dt><dd>{formatMinor(est.taxMinor, est.currency)}</dd></div>}
            <div className="summary-total">
              <dt>Order total:</dt>
              <dd>{current?.totalMinor !== undefined && reviewing ? formatMinor(current.totalMinor, currency) : est ? formatMinor(est.totalMinor, est.currency) : "—"}</dd>
            </div>
          </dl>
          {reviewing && current && (
            <p className="muted small">Price held until {new Date(current.quoteExpiresAt).toLocaleTimeString("en-US", { timeStyle: "short", timeZone: "UTC" })} UTC.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
