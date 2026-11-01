import { useEffect } from "react";
import { Link, useRevalidator } from "react-router";
import type { Route } from "./+types/confirmation";
import { CheckIcon } from "~/components/Icons.tsx";
import { isInDoubt, reviewGroups } from "~/lib/checkout.ts";
import { arriving } from "~/lib/dates.ts";
import { formatMinor } from "~/lib/money.ts";
import { tierLabel } from "~/lib/promise.ts";
import { getCart, getCheckout, getOrder } from "~/lib/queries.ts";

const POLL_MS = 2000;
const MAX_POLLS = 30;

/**
 * The checkout session, and once placed the order: the promise per shipment comes from the order's
 * group promises (customer-ordering), else from the quoted offers of the session's cart.
 */
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const session = await getCheckout(params.sessionId);
  if (session.state !== "COMPLETED") return { session, order: null, cart: null };
  const [order, cart] = await Promise.all([
    session.orderId ? getOrder(session.orderId).catch(() => null) : Promise.resolve(null),
    getCart(session.cartId).catch(() => null),
  ]);
  return { session, order, cart };
}

export function HydrateFallback() {
  return <p className="page" aria-busy="true">Confirming your order…</p>;
}

export default function Confirmation({ loaderData }: Route.ComponentProps) {
  const { session } = loaderData;
  const order = loaderData.order ?? null;
  const cart = loaderData.cart ?? null;
  const revalidator = useRevalidator();
  const pending = isInDoubt(session.state);

  // A placement that is in doubt settles server-side; poll the session until it does.
  useEffect(() => {
    if (!pending) return;
    let polls = 0;
    const t = setInterval(() => {
      polls += 1;
      if (polls > MAX_POLLS) clearInterval(t);
      else void revalidator.revalidate();
    }, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  if (pending) {
    return (
      <section className="page narrow confirm-box" aria-labelledby="c-h" aria-live="polite">
        <h1 id="c-h">We are placing your order</h1>
        <p>This can take a moment. You can leave this page; your order will appear under Your Orders once it is placed.</p>
      </section>
    );
  }
  if (session.state === "COMPLETED") {
    const promises = order && order.groups.length > 0
      ? order.groups.map((g) => ({ groupNo: g.groupNo, tier: g.tier as string, window: arriving(g.deliverByEarliest, g.deliverByLatest, g.timeZone) }))
      : reviewGroups(cart, session).map((g) => ({ groupNo: g.groupNo, tier: g.tier, window: g.offer ? arriving(g.offer.deliverByEarliest, g.offer.deliverByLatest) : null }));
    return (
      <section className="page narrow confirm-box" aria-labelledby="c-h">
        <h1 id="c-h" className="confirm-h"><CheckIcon /> Order placed, thank you!</h1>
        <p>Confirmation will be available under Your Orders.</p>
        <ul className="confirm-promises">
          {promises.map((p) => (
            <li key={p.groupNo} className="confirm-promise">
              <strong className="promise-window" data-testid="promise-window">{p.window ?? "Delivery date confirmed shortly"}</strong>
              <span className="muted small">{tierLabel(p.tier)}{promises.length > 1 ? ` · Shipment ${p.groupNo} of ${promises.length}` : ""}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">Dates are the delivery network&apos;s promise for your address.</p>
        {session.orderId && <p>Order # <strong data-testid="order-id">{session.orderId}</strong></p>}
        {session.totalMinor !== undefined && session.currency && <p>Order total: <strong>{formatMinor(session.totalMinor, session.currency)}</strong></p>}
        <p className="row">
          {session.orderId && <Link className="btn btn-cart" to={`/orders/${encodeURIComponent(session.orderId)}`}>Review or track your order</Link>}
          <Link className="btn btn-secondary" to="/">Continue shopping</Link>
        </p>
      </section>
    );
  }
  return (
    <section className="page narrow" aria-labelledby="c-h">
      <h1 id="c-h">Your order was not placed</h1>
      <p>The checkout ended as {session.state.toLowerCase().replace("_", " ")}. Nothing was charged.</p>
      <Link className="btn btn-primary" to="/cart">Back to your cart</Link>
    </section>
  );
}
