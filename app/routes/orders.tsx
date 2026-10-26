import { Link } from "react-router";
import type { Route } from "./+types/orders";
import { ApiError } from "~/lib/api.ts";
import { formatDay } from "~/lib/money.ts";
import { statusLabel } from "~/lib/order-status.ts";
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
  return <p aria-busy="true">Loading your orders…</p>;
}

export default function Orders({ loaderData }: Route.ComponentProps) {
  const { orders, signedOut } = loaderData;
  if (signedOut || !orders) {
    return (
      <section>
        <h1>Your orders</h1>
        <p>Please <Link to="/account">sign in</Link> to see your orders.</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="o-h">
      <h1 id="o-h">Your orders</h1>
      {orders.items.length === 0 ? (
        <p>You have no orders yet. <Link to="/search">Start shopping</Link></p>
      ) : (
        <table className="lines">
          <thead><tr><th>Order</th><th>Placed</th><th>Status</th><th>Items</th></tr></thead>
          <tbody>
            {orders.items.map((o) => (
              <tr key={o.orderId}>
                <td><Link to={`/orders/${encodeURIComponent(o.orderId)}`}>{o.orderId}</Link></td>
                <td>{formatDay(o.placedAt)}</td>
                <td>{statusLabel(o.status)}</td>
                <td>{o.lines.reduce((n, l) => n + l.quantity, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {orders.nextCursor && <p><Link className="button secondary" to={`/orders?after=${encodeURIComponent(orders.nextCursor)}`}>Older orders</Link></p>}
    </section>
  );
}
