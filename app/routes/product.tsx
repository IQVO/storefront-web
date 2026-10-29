import { useState } from "react";
import { Link, data } from "react-router";
import type { Route } from "./+types/product";
import { DeliveryDates } from "~/components/DeliveryDates.tsx";
import { ProblemAlert } from "~/components/ProblemAlert.tsx";
import { useActionId } from "~/lib/action-id.ts";
import { ApiError } from "~/lib/api.ts";
import { serverOpts } from "~/lib/api.server.ts";
import { announceCartChanged } from "~/lib/cart-events.ts";
import { addToCart, lineCount } from "~/lib/cart-session.ts";
import { formatMoney } from "~/lib/money.ts";
import { getProduct } from "~/lib/queries.ts";

export async function loader({ request, params }: Route.LoaderArgs) {
  try {
    return { product: await getProduct(params.id, serverOpts(request)) };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) throw data("Product not found", { status: 404 });
    throw e;
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData?.product.title ?? "Product" }];
}

export default function Product({ loaderData }: Route.ComponentProps) {
  const { product } = loaderData;
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const action = useActionId();
  const media = product.media?.[0];

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setAdded(false);
    try {
      const cart = await addToCart(product.catalogItemId, qty, action.current());
      action.reset();
      announceCartChanged(lineCount(cart));
      setAdded(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="product">
      {media ? (
        <img className="hero" src={media.url} alt={media.altText} width="800" height="600" fetchPriority="high" />
      ) : (
        <div className="hero" role="img" aria-label="No image available" />
      )}
      <div className="stack">
        {product.categoryPath && <p className="muted">{product.categoryPath.join(" › ")}</p>}
        <h1>{product.title}</h1>
        <p className="price">
          {formatMoney(product.effectivePrice)}
          {product.listPrice && product.effectivePrice && product.listPrice.amountMinor > product.effectivePrice.amountMinor && (
            <> <s className="muted">{formatMoney(product.listPrice)}</s></>
          )}
        </p>
        {product.purchasable ? (
          <form onSubmit={add} className="row">
            <label htmlFor="qty">Quantity</label>
            <input id="qty" className="qty" type="number" min={1} max={99} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />
            <button type="submit" disabled={busy}>{busy ? "Adding…" : "Add to cart"}</button>
          </form>
        ) : (
          <p className="alert info">This product is currently unavailable.</p>
        )}
        {added && <p className="alert info" role="status">Added to your cart. <Link to="/cart">View cart</Link></p>}
        <ProblemAlert error={error} />
        <DeliveryDates productId={product.catalogItemId} />
        {product.description && <p>{product.description}</p>}
        {product.bullets && <ul>{product.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
        {product.attributes && (
          <dl>{product.attributes.map((a) => (<div key={a.name}><dt>{a.name}</dt><dd>{a.value}</dd></div>))}</dl>
        )}
      </div>
    </article>
  );
}
