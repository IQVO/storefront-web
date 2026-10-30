import { useState } from "react";
import { Link, data, useNavigate, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/product";
import type { loader as rootLoader } from "~/root.tsx";
import { DeliveryPromise } from "~/components/DeliveryPromise.tsx";
import { Price } from "~/components/Price.tsx";
import { ProblemAlert } from "~/components/ProblemAlert.tsx";
import { useActionId } from "~/lib/action-id.ts";
import { ApiError } from "~/lib/api.ts";
import { serverOpts } from "~/lib/api.server.ts";
import { announceCartChanged } from "~/lib/cart-events.ts";
import { addToCart, lineCount } from "~/lib/cart-session.ts";
import { breadcrumb, illustrationFor, mediaSrc } from "~/lib/departments.ts";
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

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.product.title ? `${data.product.title} : Sample Storefront` : "Product" }];
}

const QUANTITIES = Array.from({ length: 10 }, (_, i) => i + 1);

export default function Product({ loaderData }: Route.ComponentProps) {
  const { product } = loaderData;
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const action = useActionId();
  const media = product.media?.find((m) => m.role.toUpperCase() === "PRIMARY") ?? product.media?.[0];
  const fallbackImage = illustrationFor(product.categoryPath?.[0]);
  const price = product.effectivePrice;
  const wasPrice = product.listPrice && price && product.listPrice.amountMinor > price.amountMinor ? product.listPrice : undefined;
  const path = breadcrumb(product.categoryId, product.categoryPath, root?.categories);

  async function add(thenGo: boolean) {
    setBusy(true);
    setError(null);
    setAdded(false);
    try {
      const cart = await addToCart(product.catalogItemId, qty, action.current());
      action.reset();
      announceCartChanged(lineCount(cart));
      setAdded(true);
      if (thenGo) void navigate("/cart");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="pdp">
      {path.length > 0 && (
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <ol>
            {path.map((c, i) => (
              <li key={`${c.name}-${i}`}>{c.id ? <Link to={`/search?categoryId=${encodeURIComponent(c.id)}`}>{c.name}</Link> : c.name}</li>
            ))}
          </ol>
        </nav>
      )}
      <div className="pdp-grid">
        <div className="pdp-media">
          {media ? (
            <img src={mediaSrc(media.url)} alt={media.altText} width="400" height="300" fetchPriority="high" />
          ) : fallbackImage ? (
            <img src={fallbackImage} alt={product.title} width="400" height="300" fetchPriority="high" />
          ) : (
            <div className="no-image" role="img" aria-label="No image available" />
          )}
        </div>

        <div className="pdp-info">
          <h1 className="pdp-title">{product.title}</h1>
          <p className="pdp-byline">Sold by Sample Storefront</p>
          <div className="pdp-price">
            <Price money={price} size="lg" />
            {wasPrice && <p className="was">List Price: <s>{formatMoney(wasPrice)}</s></p>}
          </div>
          {product.bullets && product.bullets.length > 0 && (
            <section aria-labelledby="about-h" className="pdp-section">
              <h2 id="about-h">About this item</h2>
              <ul className="bullets">{product.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
            </section>
          )}
          {product.attributes && product.attributes.length > 0 && (
            <section aria-labelledby="info-h" className="pdp-section">
              <h2 id="info-h">Product information</h2>
              <table className="attr-table">
                <tbody>
                  {product.attributes.map((a) => (
                    <tr key={a.name}><th scope="row">{a.name}</th><td>{a.unit ? `${a.value} ${a.unit}` : a.value}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {product.description && (
            <section aria-labelledby="desc-h" className="pdp-section">
              <h2 id="desc-h">Product description</h2>
              <p>{product.description}</p>
            </section>
          )}
        </div>

        <aside className="buy-box" aria-label="Buy box">
          <Price money={price} size="lg" />
          {product.purchasable ? (
            <>
              <DeliveryPromise productId={product.catalogItemId} orderMinor={(price?.amountMinor ?? 0) * qty} currency={price?.currency ?? "USD"} />
              <p className="in-stock">In Stock</p>
              <form className="buy-form" onSubmit={(e) => { e.preventDefault(); void add(false); }}>
                <label htmlFor="qty" className="qty-label">Quantity:</label>
                <select id="qty" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="qty-select">
                  {QUANTITIES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <button type="submit" className="btn btn-cart" disabled={busy}>{busy ? "Adding…" : "Add to Cart"}</button>
                <button type="button" className="btn btn-buy" disabled={busy} onClick={() => void add(true)}>Buy Now</button>
              </form>
              {added && <p className="added" role="status">Added to your cart. <Link to="/cart">Go to Cart</Link></p>}
              <ProblemAlert error={error} />
              <dl className="ships">
                <div><dt>Ships from</dt><dd>Austin, TX</dd></div>
                <div><dt>Sold by</dt><dd>Sample Storefront</dd></div>
              </dl>
              <p className="muted small">Payments are simulated: no real card is ever charged.</p>
            </>
          ) : (
            <p className="unavailable">Currently unavailable. We don&apos;t know when or if this item will be back in stock.</p>
          )}
        </aside>
      </div>
    </article>
  );
}
