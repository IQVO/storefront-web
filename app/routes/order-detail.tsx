import { Form, Link, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/order-detail";
import { useRenewedActionId } from "~/lib/action-id.ts";
import { guarded, formString, type ActionResult } from "~/lib/action-result.ts";
import { formatMinor, formatRange } from "~/lib/money.ts";
import { canRequestCancel, statusLabel } from "~/lib/order-status.ts";
import { cancelOrder, getOrder } from "~/lib/queries.ts";
import type { Order } from "~/lib/types.ts";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return { order: await getOrder(params.id) };
}

export function HydrateFallback() {
  return <p aria-busy="true">Loading your order…</p>;
}

export async function clientAction({ request, params }: Route.ClientActionArgs): Promise<ActionResult<Order>> {
  const form = await request.formData();
  const reason = formString(form, "reason");
  if (!reason) return { ok: false, error: "Please tell us why you are cancelling." };
  return guarded(() => cancelOrder(params.id, reason.slice(0, 200), formString(form, "actionId") || undefined));
}

export default function OrderDetail({ loaderData }: Route.ComponentProps) {
  const { order } = loaderData;
  const result = useActionData<ActionResult<Order>>();
  const busy = useNavigation().state === "submitting";
  const actionId = useRenewedActionId(result?.ok ? result : null);
  const tracking = order.tracking;
  return (
    <section aria-labelledby="od-h">
      <p><Link to="/orders">← All orders</Link></p>
      <h1 id="od-h">Order {order.orderId}</h1>
      <p>Status: <strong data-testid="order-status">{statusLabel(order.status)}</strong></p>
      {order.totals?.totalMinor !== undefined && order.totals.currency && <p>Total: {formatMinor(order.totals.totalMinor, order.totals.currency)}</p>}
      <h2>Items</h2>
      <ul>{order.lines.map((l) => <li key={l.lineNo}>{l.quantity} × {l.catalogItemId}</li>)}</ul>
      <h2>Tracking</h2>
      {!tracking || tracking.groups.length === 0 ? (
        <p className="muted">Tracking is not available yet.</p>
      ) : (
        tracking.groups.map((g) => (
          <div key={g.groupNo} className="panel">
            <h3>Shipment {g.groupNo}: {statusLabel(g.status)}</h3>
            <p>Expected {formatRange(g.deliverByEarliest, g.deliverByLatest)}</p>
            {g.atRiskReason && <p className="muted">Delay risk: {g.atRiskReason}</p>}
            {g.packages.length === 0 ? <p className="muted">No package scans yet.</p> : (
              <ul>{g.packages.map((p) => <li key={p.trackingNumber}>{p.carrier ? `${p.carrier} ` : ""}{p.trackingNumber}: {p.state ? statusLabel(p.state) : "Label created"}</li>)}</ul>
            )}
          </div>
        ))
      )}
      {canRequestCancel(order) && (
        <Form method="post" className="panel stack">
          <input type="hidden" name="actionId" value={actionId} />
          <h2>Cancel this order</h2>
          <label htmlFor="reason">Reason</label>
          <input id="reason" name="reason" maxLength={200} required />
          <button type="submit" className="danger" disabled={busy}>Cancel order</button>
          {result && !result.ok && <p className="alert" role="alert">{result.error}</p>}
        </Form>
      )}
    </section>
  );
}
