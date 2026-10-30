import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useFetchers } from "react-router";
import type { Route } from "./+types/cart";
import { Price } from "~/components/Price.tsx";
import { useSession } from "~/components/Session.tsx";
import { useActionId } from "~/lib/action-id.ts";
import { guarded, formString, type ActionResult } from "~/lib/action-result.ts";
import { announceCartChanged } from "~/lib/cart-events.ts";
import { currentCart, lineCount } from "~/lib/cart-session.ts";
import { arriving } from "~/lib/dates.ts";
import { illustrationFor, mediaSrc } from "~/lib/departments.ts";
import { postalPrefixOf } from "~/lib/destination.ts";
import { formatMinor } from "~/lib/money.ts";
import { chargeText, effectiveCharge, tierLabel } from "~/lib/promise.ts";
import { getProduct, quoteCartDelivery, quoteDeliveryDates, removeLine, selectCartDelivery, setDestination, setLineQuantity } from "~/lib/queries.ts";
import type { Cart, DeliveryDates, ProductView } from "~/lib/types.ts";

export async function clientLoader() {
  const cart = await currentCart();
  announceCartChanged(lineCount(cart));
  const products: Record<string, ProductView | null> = {};
  const first = cart?.lines[0];
  // The quote's offers carry no charge: the tiers' charges and free-over thresholds come from the
  // network's delivery dates for the destination (best effort, shown on the delivery radio cards).
  const [schedule] = await Promise.all([
    first && cart?.destinationPostalPrefix ? quoteDeliveryDates(first.catalogItemId, cart.destinationPostalPrefix).catch(() => null) : Promise.resolve(null),
    ...(cart?.lines ?? []).map(async (l) => {
      products[l.catalogItemId] = await getProduct(l.catalogItemId).catch(() => null);
    }),
  ]);
  return { cart, products, schedule: (schedule ?? null) as DeliveryDates | null };
}

export function HydrateFallback() {
  return <p className="page" aria-busy="true">Loading your cart…</p>;
}

export async function clientAction({ request }: Route.ClientActionArgs): Promise<ActionResult> {
  const form = await request.formData();
  const intent = formString(form, "intent");
  const cartId = formString(form, "cartId");
  const actionId = formString(form, "actionId") || undefined;
  const item = formString(form, "item");
  if (intent === "set-destination") {
    // The network's destination is the postal code's 3-character prefix, never the full ZIP.
    const prefix = postalPrefixOf(formString(form, "zip"));
    if (!prefix) return { ok: false, error: "Enter a valid ZIP code." };
    return guarded(async () => {
      await setDestination(cartId, prefix, actionId);
      return quoteCartDelivery(cartId, actionId);
    });
  }
  return guarded(async () => {
    switch (intent) {
      case "set-quantity":
        return setLineQuantity(cartId, item, Math.max(1, Math.min(99, Number(formString(form, "quantity")) || 1)), actionId);
      case "remove":
        return removeLine(cartId, item, actionId);
      case "quote":
        return quoteCartDelivery(cartId, actionId);
      case "select":
        return selectCartDelivery(cartId, Number(formString(form, "groupNo")), formString(form, "offerId"), actionId);
      default:
        throw new Error("unknown cart intent");
    }
  });
}

/** One fetcher per control; a failed submit keeps its action id (a retry is deduplicated upstream), a success renews it. */
function useCartAction(cart: Cart) {
  const fetcher = useFetcher<ActionResult>();
  const id = useActionId();
  useEffect(() => {
    if (fetcher.data?.ok) id.reset();
  }, [fetcher.data, id]);
  const send = (fields: Record<string, string>) => void fetcher.submit({ ...fields, cartId: cart.cartId, actionId: id.current() }, { method: "post" });
  return { fetcher, send, busy: fetcher.state !== "idle", error: fetcher.data && !fetcher.data.ok ? fetcher.data.error : null };
}

const QUANTITIES = Array.from({ length: 10 }, (_, i) => i + 1);

function LineRow({ cart, itemId, quantity, product }: { cart: Cart; itemId: string; quantity: number; product: ProductView | null }) {
  const qty = useCartAction(cart);
  const del = useCartAction(cart);
  const media = product?.media?.[0];
  const image = media ? mediaSrc(media.url) : illustrationFor(product?.categoryPath?.[0]);
  const options = quantity > 10 ? [...QUANTITIES, quantity] : QUANTITIES;
  const title = product?.title ?? itemId;
  return (
    <li className="cart-line">
      <span className="cart-thumb">{image ? <img src={image} alt="" width="120" height="90" loading="lazy" /> : <span className="no-image" />}</span>
      <div className="cart-line-body">
        <Link to={`/products/${encodeURIComponent(itemId)}`} className="cart-line-title">{title}</Link>
        {product && (product.purchasable ? <p className="stock in">In stock</p> : <p className="stock out">Currently unavailable</p>)}
        <div className="cart-line-actions">
          <label htmlFor={`q-${itemId}`} className="sr-only">Quantity for {title}</label>
          <select id={`q-${itemId}`} className="qty-select" value={quantity} disabled={qty.busy} onChange={(e) => qty.send({ intent: "set-quantity", item: itemId, quantity: e.target.value })}>
            {options.map((n) => <option key={n} value={n}>Qty: {n}</option>)}
          </select>
          <span className="sep" aria-hidden="true">|</span>
          <button type="button" className="link-button" disabled={del.busy} onClick={() => del.send({ intent: "remove", item: itemId })} aria-label={`Delete ${title}`}>Delete</button>
        </div>
        {(qty.error ?? del.error) && <p className="alert" role="alert">{qty.error ?? del.error}</p>}
      </div>
      <div className="cart-line-price"><Price money={product?.effectivePrice} size="sm" /></div>
    </li>
  );
}

function DestinationForm({ cart }: { cart: Cart }) {
  const { destination, setZip } = useSession();
  const dest = useCartAction(cart);
  const [zip, setZipInput] = useState(destination?.zip ?? "");
  const showing = cart.destinationPostalPrefix && destination?.prefix === cart.destinationPostalPrefix ? destination.zip : cart.destinationPostalPrefix;
  return (
    <form
      className="dest-form"
      onSubmit={(e) => {
        e.preventDefault();
        setZip(zip);
        dest.send({ intent: "set-destination", zip });
      }}
    >
      <label htmlFor="cart-zip">Deliver to ZIP code</label>
      <div className="zip-row">
        <input id="cart-zip" name="zip" value={zip} onChange={(e) => setZipInput(e.target.value)} maxLength={10} autoComplete="postal-code" required placeholder="e.g. 78701" />
        <button type="submit" className="btn btn-secondary" disabled={dest.busy}>{dest.busy ? "Updating…" : "Update"}</button>
      </div>
      {showing && <p className="muted small">Delivering to ZIP {showing}</p>}
      {dest.error && <p className="alert" role="alert">{dest.error}</p>}
    </form>
  );
}

/** Quotes delivery automatically once per cart version when the destination is known but not (or no longer) quoted. */
function useAutoQuote(cart: Cart) {
  const { destination } = useSession();
  const auto = useCartAction(cart);
  const tried = useRef<string | null>(null);
  // Any cart mutation in flight (the ZIP form, a selection) revalidates the cart when done: wait for it.
  const inFlight = useFetchers().some((f) => f.state !== "idle");
  useEffect(() => {
    if (!destination || cart.lines.length === 0 || inFlight) return;
    const key = `${cart.cartId}:${cart.version}:${destination.prefix}`;
    if (tried.current === key) return;
    if (cart.destinationPostalPrefix !== destination.prefix) {
      tried.current = key;
      auto.send({ intent: "set-destination", zip: destination.zip });
    } else if (!cart.deliveryQuote) {
      tried.current = key;
      auto.send({ intent: "quote" });
    }
  });
  return auto;
}

function GroupOptions({ cart, groupNo, total, offers, selected, schedule }: { cart: Cart; groupNo: number; total: number; offers: NonNullable<Cart["deliveryQuote"]>["groups"][number]["offers"]; selected: string | undefined; schedule: DeliveryDates | null }) {
  const pick = useCartAction(cart);
  const itemsMinor = cart.estimate?.itemsMinor ?? 0;
  const currency = cart.estimate?.currency ?? "USD";
  return (
    // Native radios (re-mounted per cart version): the choice shows at once while it is saved and the cart reloads.
    <fieldset className="delivery-group" key={`${cart.cartId}-${cart.version}`}>
      <legend>{total > 1 ? `Shipment ${groupNo} of ${total}` : "Choose your delivery option"}</legend>
      <div className="radio-cards">
        {offers.map((o) => {
          const t = schedule?.tiers.find((x) => x.tier === o.tier);
          const charge = t ? chargeText({ chargeMinor: effectiveCharge(t, itemsMinor), currency: t.charge?.currency ?? currency }, formatMinor) : null;
          return (
            <label key={o.offerId} className="radio-card">
              <input type="radio" name={`group-${groupNo}`} value={o.offerId} defaultChecked={selected === o.offerId} onChange={() => pick.send({ intent: "select", groupNo: String(groupNo), offerId: o.offerId })} />
              <span className="radio-card-text">
                <strong className="promise-date">{arriving(o.deliverByEarliest, o.deliverByLatest)}</strong>{" "}
                <span>{tierLabel(o.tier)}{charge ? ` · ${charge}` : ""}</span>
              </span>
            </label>
          );
        })}
      </div>
      {pick.error && <p className="alert" role="alert">{pick.error}</p>}
    </fieldset>
  );
}

function DeliveryOptions({ cart, schedule }: { cart: Cart; schedule: DeliveryDates | null }) {
  const auto = useAutoQuote(cart);
  const { destination } = useSession();
  const quote = cart.deliveryQuote;
  const groups = quote?.groups ?? [];
  const selected = new Map((cart.selections ?? []).map((s) => [s.groupNo, s.offerId]));
  const notServed = quote && groups.length === 0;
  const zip = destination?.prefix === cart.destinationPostalPrefix ? destination?.zip : cart.destinationPostalPrefix;
  return (
    <section className="cart-delivery" aria-labelledby="deliv-h">
      <h2 id="deliv-h">Choose your delivery options</h2>
      <DestinationForm cart={cart} />
      {auto.busy && <p className="muted" role="status">Getting delivery options…</p>}
      {auto.error && <p className="alert" role="alert">{auto.error}</p>}
      {cart.destinationPostalPrefix && !quote && !auto.busy && <QuoteButton cart={cart} />}
      {notServed && (
        <p className="alert" role="alert">
          {quote.unavailable?.some((u) => u.constraint === "DESTINATION_NOT_SERVED") || quote.unavailableTiers.length > 0
            ? `We don't deliver to ZIP ${zip ?? ""} yet. Try a ZIP code in an area we serve.`
            : "No delivery option is available for this cart right now."}
        </p>
      )}
      {groups.map((g) => (
        <GroupOptions key={g.groupNo} cart={cart} groupNo={g.groupNo} total={groups.length} offers={g.offers} selected={selected.get(g.groupNo)} schedule={schedule} />
      ))}
      {groups.length > 0 && <p className="muted small">Delivery dates are the delivery network&apos;s promise for your ZIP code.</p>}
    </section>
  );
}

function QuoteButton({ cart }: { cart: Cart }) {
  const q = useCartAction(cart);
  return (
    <p>
      <button type="button" className="btn btn-secondary" disabled={q.busy} onClick={() => q.send({ intent: "quote" })}>Get delivery options</button>
      {q.error && <span className="alert" role="alert">{q.error}</span>}
    </p>
  );
}

export default function CartPage({ loaderData }: Route.ComponentProps) {
  const { cart, products } = loaderData;
  const schedule = loaderData.schedule ?? null;
  if (!cart || cart.lines.length === 0) {
    return (
      <section className="page cart-empty" aria-labelledby="cart-h">
        <h1 id="cart-h">Your Sample Storefront Cart is empty</h1>
        <p>Your shopping cart is waiting. Give it purpose: fill it with everyday essentials.</p>
        <Link className="btn btn-primary" to="/search">Continue shopping</Link>
      </section>
    );
  }
  const units = lineCount(cart);
  const est = cart.estimate;
  const subtotal = est?.itemsMinor ?? cart.lines.reduce((n, l) => n + (products[l.catalogItemId]?.effectivePrice?.amountMinor ?? 0) * l.quantity, 0);
  const currency = est?.currency ?? "USD";
  const ready = cart.checkoutReadiness?.ready === true;
  const label = `Subtotal (${units} ${units === 1 ? "item" : "items"}):`;
  return (
    <div className="cart-page">
      <section className="cart-main" aria-labelledby="cart-h">
        <h1 id="cart-h">Shopping Cart</h1>
        <p className="cart-price-head" aria-hidden="true">Price</p>
        <ul className="cart-lines">
          {cart.lines.map((l) => <LineRow key={l.catalogItemId} cart={cart} itemId={l.catalogItemId} quantity={l.quantity} product={products[l.catalogItemId] ?? null} />)}
        </ul>
        <p className="cart-subtotal">{label} <strong>{formatMinor(subtotal, currency)}</strong></p>
        <DeliveryOptions cart={cart} schedule={schedule} />
      </section>
      <aside className="cart-summary" aria-labelledby="sum-h">
        <h2 id="sum-h" className="summary-subtotal">{label} <strong>{formatMinor(subtotal, currency)}</strong></h2>
        {est && (
          <dl className="summary-lines">
            <div><dt>Items</dt><dd>{formatMinor(est.itemsMinor, est.currency)}</dd></div>
            <div><dt>Delivery</dt><dd>{est.deliveryMinor === 0 && ready ? "FREE" : formatMinor(est.deliveryMinor, est.currency)}</dd></div>
            <div><dt>Estimated tax</dt><dd>{formatMinor(est.taxMinor, est.currency)}</dd></div>
            <div className="summary-total"><dt>Estimated total</dt><dd>{formatMinor(est.totalMinor, est.currency)}</dd></div>
          </dl>
        )}
        <p className="muted small">A non-binding estimate. The binding total is shown at checkout.</p>
        {ready ? (
          <Link className="btn btn-cart btn-block" to="/checkout">Proceed to checkout</Link>
        ) : (
          <p className="muted">Choose a ZIP code and a delivery option for every shipment to check out.</p>
        )}
      </aside>
    </div>
  );
}
