import { useEffect } from "react";
import { Link, useRevalidator } from "react-router";
import type { Route } from "./+types/confirmation";
import { getCheckout } from "~/lib/queries.ts";
import { formatMinor } from "~/lib/money.ts";

export const POLL_MS = 2000;
export const MAX_POLLS = 30;

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return { session: await getCheckout(params.sessionId) };
}

export function HydrateFallback() {
  return <p aria-busy="true">Confirming your order…</p>;
}

export const isInDoubt = (state: string) => state === "PLACING" || state === "AUTHORIZING";

export default function Confirmation({ loaderData }: Route.ComponentProps) {
  const { session } = loaderData;
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
      <section aria-labelledby="c-h" aria-live="polite">
        <h1 id="c-h">We are placing your order</h1>
        <p>This can take a moment. You can leave this page; your order will appear under Orders once it is placed.</p>
      </section>
    );
  }
  if (session.state === "COMPLETED") {
    return (
      <section aria-labelledby="c-h">
        <h1 id="c-h">Thank you, your order is placed</h1>
        {session.orderId && <p>Order number: <strong data-testid="order-id">{session.orderId}</strong></p>}
        {session.totalMinor !== undefined && session.currency && <p>Total paid: {formatMinor(session.totalMinor, session.currency)}</p>}
        <p>
          {session.orderId && <Link className="button" to={`/orders/${encodeURIComponent(session.orderId)}`}>Track your order</Link>}{" "}
          <Link className="button secondary" to="/orders">All orders</Link>
        </p>
      </section>
    );
  }
  return (
    <section aria-labelledby="c-h">
      <h1 id="c-h">Your order was not placed</h1>
      <p>The checkout ended as {session.state.toLowerCase().replace("_", " ")}. Nothing was charged.</p>
      <Link className="button" to="/cart">Back to your cart</Link>
    </section>
  );
}
