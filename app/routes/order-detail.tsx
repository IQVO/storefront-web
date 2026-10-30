import { Form, Link, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/order-detail";
import { useRenewedActionId } from "~/lib/action-id.ts";
import { guarded, formString, type ActionResult } from "~/lib/action-result.ts";
import { arriving, formatPlaced } from "~/lib/dates.ts";
import { formatMinor } from "~/lib/money.ts";
import { TRACK_STEPS, canRequestCancel, statusLabel, trackStep } from "~/lib/order-status.ts";
import { tierLabel } from "~/lib/promise.ts";
import { cancelOrder, getOrder, getProduct } from "~/lib/queries.ts";
import type { Order, ProductView, TrackingGroup } from "~/lib/types.ts";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const order = await getOrder(params.id);
  const products: Record<string, ProductView | null> = {};
  await Promise.all([...new Set(order.lines.map((l) => l.catalogItemId))].map(async (id) => (products[id] = await getProduct(id).catch(() => null))));
  return { order, products };
}

export function HydrateFallback() {
  return <p className="page" aria-busy="true">Loading your order…</p>;
}

export async function clientAction({ request, params }: Route.ClientActionArgs): Promise<ActionResult<Order>> {
  const form = await request.formData();
  const reason = formString(form, "reason");
  if (!reason) return { ok: false, error: "Please tell us why you are cancelling." };
  return guarded(() => cancelOrder(params.id, reason.slice(0, 200), formString(form, "actionId") || undefined));
}

function Tracker({ status, packages }: { status: string; packages: TrackingGroup["packages"] }) {
  const step = trackStep(status, packages.map((p) => p.state));
  if (step < 0) return <p className="tracker-stopped">{statusLabel(status)}</p>;
  return (
    <ol className="tracker" aria-label="Shipment progress">
      {TRACK_STEPS.map((label, i) => (
        <li key={label} className={i <= step ? "done" : undefined} aria-current={i === step ? "step" : undefined}>
          <span className="tracker-dot" aria-hidden="true" />
          <span className="tracker-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

export default function OrderDetail({ loaderData }: Route.ComponentProps) {
  const { order } = loaderData;
  const products = loaderData.products ?? {};
  const result = useActionData<ActionResult<Order>>();
  const busy = useNavigation().state === "submitting";
  const actionId = useRenewedActionId(result?.ok ? result : null);
  const tracking = new Map((order.tracking?.groups ?? []).map((g) => [g.groupNo, g]));
  const groupNos = [...new Set([...order.groups.map((g) => g.groupNo), ...tracking.keys()])].sort((a, b) => a - b);
  const lineByNo = new Map(order.lines.map((l) => [l.lineNo, l]));
  return (
    <section className="page order-detail" aria-labelledby="od-h">
      <p className="crumbs"><Link to="/orders">Your Orders</Link> › Order Details</p>
      <h1 id="od-h">Order Details</h1>
      <p className="order-meta">
        Ordered on {formatPlaced(order.placedAt)} <span className="sep" aria-hidden="true">|</span> Order# <span data-testid="order-number">{order.orderId}</span>
      </p>
      <div className="order-summary-box">
        <p>Status: <strong data-testid="order-status">{statusLabel(order.status)}</strong></p>
        <p>Ship to ZIP {order.destinationPostalPrefix}xx</p>
        {order.totals?.totalMinor !== undefined && order.totals.currency && <p>Order total: <strong>{formatMinor(order.totals.totalMinor, order.totals.currency)}</strong></p>}
      </div>
      <h2>Shipments</h2>
      {groupNos.length === 0 && <p className="muted">Tracking is not available yet.</p>}
      {groupNos.map((no) => {
        const promise = order.groups.find((g) => g.groupNo === no);
        const track = tracking.get(no);
        const earliest = track?.deliverByEarliest ?? promise?.deliverByEarliest;
        const latest = track?.deliverByLatest ?? promise?.deliverByLatest;
        const lines = (promise?.lineNos ?? []).map((n) => lineByNo.get(n)).filter((l): l is NonNullable<typeof l> => Boolean(l));
        return (
          <article key={no} className="shipment">
            <header className="shipment-head">
              <p className="promise-window" data-testid="promise-window">{earliest && latest ? arriving(earliest, latest) : "Delivery date pending"}</p>
              <p className="muted small">
                {promise ? tierLabel(promise.tier) : ""}{groupNos.length > 1 ? ` · Shipment ${no} of ${groupNos.length}` : ""} · the delivery network&apos;s promise
              </p>
            </header>
            <Tracker status={track?.status ?? promise?.status ?? "PROMISED"} packages={track?.packages ?? []} />
            {track?.atRiskReason && <p className="alert">Delivery may be late: {track.atRiskReason}</p>}
            {track && track.packages.length > 0 && (
              <ul className="packages">{track.packages.map((p) => <li key={p.trackingNumber}>{p.carrier ? `${p.carrier} ` : ""}{p.trackingNumber}: {p.state ? statusLabel(p.state) : "Label created"}</li>)}</ul>
            )}
            {lines.length > 0 && (
              <ul className="review-lines">
                {lines.map((l) => <li key={l.lineNo}><Link to={`/products/${encodeURIComponent(l.catalogItemId)}`}>{products[l.catalogItemId]?.title ?? l.catalogItemId}</Link> <span className="muted">Qty: {l.quantity}</span></li>)}
              </ul>
            )}
          </article>
        );
      })}
      {groupNos.length === 0 && (
        <ul className="review-lines">{order.lines.map((l) => <li key={l.lineNo}>{products[l.catalogItemId]?.title ?? l.catalogItemId} <span className="muted">Qty: {l.quantity}</span></li>)}</ul>
      )}
      {canRequestCancel(order) && (
        <Form method="post" className="cancel-box stack">
          <input type="hidden" name="actionId" value={actionId} />
          <h2>Cancel this order</h2>
          <label htmlFor="reason">Reason</label>
          <input id="reason" name="reason" maxLength={200} required />
          <div><button type="submit" className="btn btn-danger" disabled={busy}>Cancel order</button></div>
          {result && !result.ok && <p className="alert" role="alert">{result.error}</p>}
        </Form>
      )}
    </section>
  );
}
