import { useEffect, useRef } from "react";
import { Link, useFetcher } from "react-router";
import type { Route } from "./+types/cart";
import { useActionId } from "~/lib/action-id.ts";
import { guarded, formString, type ActionResult } from "~/lib/action-result.ts";
import { announceCartChanged } from "~/lib/cart-events.ts";
import { currentCart, lineCount } from "~/lib/cart-session.ts";
import { formatMinor, formatMoney, formatRange } from "~/lib/money.ts";
import { getProduct, quoteCartDelivery, removeLine, selectCartDelivery, setDestination, setLineQuantity } from "~/lib/queries.ts";
import type { Cart, ProductView } from "~/lib/types.ts";

export async function clientLoader() {
  const cart = await currentCart();
  announceCartChanged(lineCount(cart));
  const products: Record<string, ProductView | null> = {};
  await Promise.all(
    (cart?.lines ?? []).map(async (l) => {
      products[l.catalogItemId] = await getProduct(l.catalogItemId).catch(() => null);
    }),
  );
  return { cart, products };
}

export function HydrateFallback() {
  return <p aria-busy="true">Loading your cart…</p>;
}

export async function clientAction({ request }: Route.ClientActionArgs): Promise<ActionResult> {
  const form = await request.formData();
  const intent = formString(form, "intent");
  const cartId = formString(form, "cartId");
  const actionId = formString(form, "actionId") || undefined;
  const item = formString(form, "item");
  return guarded(async () => {
    switch (intent) {
      case "set-quantity":
        return setLineQuantity(cartId, item, Math.max(1, Math.min(99, Number(formString(form, "quantity")) || 1)), actionId);
      case "remove":
        return removeLine(cartId, item, actionId);
      case "set-destination":
        return setDestination(cartId, formString(form, "postalPrefix"), actionId);
      case "quote":
        return quoteCartDelivery(cartId, actionId);
      case "select":
        return selectCartDelivery(cartId, Number(formString(form, "groupNo")), formString(form, "offerId"), actionId);
      default:
        throw new Error("unknown cart intent");
    }
  });
}

function CartForm({ cart, intent, children, label, className }: { cart: Cart; intent: string; children?: React.ReactNode; label: string; className?: string }) {
  const fetcher = useFetcher<ActionResult>();
  const id = useActionId();
  const idField = useRef<HTMLInputElement>(null);
  const busy = fetcher.state !== "idle";
  // A failed submit keeps its action id so a retry of the same click is deduplicated upstream;
  // a successful one starts the next action with a fresh id.
  useEffect(() => {
    if (fetcher.data?.ok) id.reset();
  }, [fetcher.data, id]);
  return (
    <fetcher.Form
      method="post"
      className={className ?? "row"}
      onSubmit={() => {
        if (idField.current) idField.current.value = id.current();
      }}
    >
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="cartId" value={cart.cartId} />
      <input type="hidden" name="actionId" ref={idField} />
      {children}
      <button type="submit" className="secondary" disabled={busy}>{busy ? "…" : label}</button>
      {fetcher.data && !fetcher.data.ok && <span role="alert" className="alert">{fetcher.data.error}</span>}
    </fetcher.Form>
  );
}

export default function CartPage({ loaderData }: Route.ComponentProps) {
  const { cart, products } = loaderData;
  if (!cart || cart.lines.length === 0) {
    return (
      <section>
        <h1>Your cart</h1>
        <p>Your cart is empty.</p>
        <Link className="button" to="/search">Browse products</Link>
      </section>
    );
  }
  const est = cart.estimate;
  return (
    <section aria-labelledby="cart-h">
      <h1 id="cart-h">Your cart</h1>
      <table className="lines">
        <thead><tr><th>Item</th><th className="num">Price</th><th>Quantity</th><th><span className="sr-only">Remove</span></th></tr></thead>
        <tbody>
          {cart.lines.map((l) => {
            const p = products[l.catalogItemId];
            return (
              <tr key={l.catalogItemId}>
                <td>{p ? <Link to={`/products/${encodeURIComponent(l.catalogItemId)}`}>{p.title}</Link> : l.catalogItemId}</td>
                <td className="num">{formatMoney(p?.effectivePrice, "—")}</td>
                <td>
                  <CartForm cart={cart} intent="set-quantity" label="Update">
                    <input type="hidden" name="item" value={l.catalogItemId} />
                    <label className="sr-only" htmlFor={`q-${l.catalogItemId}`}>Quantity</label>
                    <input id={`q-${l.catalogItemId}`} className="qty" name="quantity" type="number" min={1} max={99} defaultValue={l.quantity} />
                  </CartForm>
                </td>
                <td>
                  <CartForm cart={cart} intent="remove" label="Remove">
                    <input type="hidden" name="item" value={l.catalogItemId} />
                  </CartForm>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <DeliveryPanel cart={cart} />
      {est && (
        <section className="panel" aria-labelledby="est-h">
          <h2 id="est-h">Estimated total</h2>
          <p className="muted">A non-binding estimate. The binding total is shown at checkout.</p>
          <dl>
            <div className="row"><dt>Items</dt><dd>{formatMinor(est.itemsMinor, est.currency)}</dd></div>
            <div className="row"><dt>Delivery</dt><dd>{formatMinor(est.deliveryMinor, est.currency)}</dd></div>
            <div className="row"><dt>Tax</dt><dd>{formatMinor(est.taxMinor, est.currency)}</dd></div>
            <div className="row"><dt><strong>Total</strong></dt><dd><strong>{formatMinor(est.totalMinor, est.currency)}</strong></dd></div>
          </dl>
        </section>
      )}
      {cart.checkoutReadiness?.ready ? (
        <Link className="button" to="/checkout">Proceed to checkout</Link>
      ) : (
        <p className="muted">Choose a destination and a delivery option for every shipment to check out.</p>
      )}
    </section>
  );
}

function DeliveryPanel({ cart }: { cart: Cart }) {
  const groups = cart.deliveryQuote?.groups ?? [];
  const selected = new Map((cart.selections ?? []).map((s) => [s.groupNo, s.offerId]));
  return (
    <section className="panel" aria-labelledby="deliv-h">
      <h2 id="deliv-h">Delivery</h2>
      <CartForm cart={cart} intent="set-destination" label="Set destination">
        <label htmlFor="postal">Postal code</label>
        <input id="postal" name="postalPrefix" defaultValue={cart.destinationPostalPrefix ?? ""} maxLength={10} required />
      </CartForm>
      {cart.destinationPostalPrefix && groups.length === 0 && (
        <CartForm cart={cart} intent="quote" label="Get delivery options">
          <span className="muted">Delivery to {cart.destinationPostalPrefix}</span>
        </CartForm>
      )}
      {groups.map((g) => (
        <fieldset key={g.groupNo} className="fieldset">
          <legend>Shipment {g.groupNo}</legend>
          {g.offers.map((o) => (
            <CartForm key={o.offerId} cart={cart} intent="select" label={selected.get(g.groupNo) === o.offerId ? "Selected" : "Choose"}>
              <input type="hidden" name="groupNo" value={g.groupNo} />
              <input type="hidden" name="offerId" value={o.offerId} />
              <span>{o.tier.replace("_", " ").toLowerCase()}: {formatRange(o.deliverByEarliest, o.deliverByLatest)}</span>
            </CartForm>
          ))}
        </fieldset>
      ))}
    </section>
  );
}
