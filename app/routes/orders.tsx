import { Link } from "react-router";
import type { Route } from "./+types/orders";
import { ApiError } from "~/lib/api.ts";
import { arriving, formatPlaced } from "~/lib/dates.ts";
import { formatMinor } from "~/lib/money.ts";
import { statusLabel } from "~/lib/order-status.ts";
import { tierLabel } from "~/lib/promise.ts";
import { listOrders } from "~/lib/queries.ts";

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const after = new URL(request.url).searchParams.get("after") ?? undefined;
  try {
    return { orders: await listOrders(after), signedOut: false };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 422 || e.status === 404)) return { orders: null, signedOut: true };
    throw e;
  }
}

export function HydrateFallback() {
  return <p className="page" aria-busy="true">Loading your orders…</p>;
}

export default function Orders({ loaderData }: Route.ComponentProps) {
  const { orders, signedOut } = loaderData;
  if (signedOut || !orders) {
    return (
      <section className="page narrow" aria-labelledby="o-h">
        <h1 id="o-h">Your Orders</h1>
        <p>Please <Link to="/account">sign in</Link> to see your orders.</p>
      </section>
    );
  }
  return (
    <section className="page orders-page" aria-labelledby="o-h">
      <h1 id="o-h">Your Orders</h1>
      {orders.items.length === 0 ? (
        <p>You have no orders yet. <Link to="/search">Start shopping</Link></p>
      ) : (
        <ul className="order-cards">
          {orders.items.map((o) => {
            const units = o.lines.reduce((n, l) => n + l.quantity, 0);
            return (
              <li key={o.orderId} className="order-card">
                <dl className="order-card-head">
                  <div><dt>Order placed</dt><dd>{formatPlaced(o.placedAt, o.groups[0]?.timeZone)}</dd></div>
                  {o.totals?.totalMinor !== undefined && o.totals.currency && <div><dt>Total</dt><dd>{formatMinor(o.totals.totalMinor, o.totals.currency)}</dd></div>}
                  <div><dt>Ship to ZIP</dt><dd>{o.destinationPostalPrefix}xx</dd></div>
                  <div className="order-no"><dt>Order #</dt><dd><Link to={`/orders/${encodeURIComponent(o.orderId)}`}>{o.orderId}</Link></dd></div>
                </dl>
                <div className="order-card-body">
                  <p className="order-status-line"><strong>{statusLabel(o.status)}</strong> · {units} {units === 1 ? "item" : "items"}</p>
                  {o.groups.map((g) => (
                    <p key={g.groupNo} className="order-arriving">
                      <strong>{arriving(g.deliverByEarliest, g.deliverByLatest, g.timeZone)}</strong> <span className="muted small">{tierLabel(g.tier)}</span>
                    </p>
                  ))}
                  <Link to={`/orders/${encodeURIComponent(o.orderId)}`} className="btn btn-secondary btn-sm">View order details</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {orders.nextCursor && <p><Link className="btn btn-secondary" to={`/orders?after=${encodeURIComponent(orders.nextCursor)}`}>Older orders</Link></p>}
    </section>
  );
}
