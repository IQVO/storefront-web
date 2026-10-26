import { Link } from "react-router";
import { formatMoney } from "~/lib/money.ts";
import type { ProductHit } from "~/lib/types.ts";

/** `priority` marks above-the-fold cards: their image loads eagerly (LCP) instead of lazily. */
export function ProductCard({ hit, priority = false }: { hit: ProductHit; priority?: boolean }) {
  return (
    <li className="card">
      <Link className="card-link" to={`/products/${encodeURIComponent(hit.catalogItemId)}`}>
        {hit.primaryMedia ? (
          <img className="thumb" src={hit.primaryMedia.url} alt={hit.primaryMedia.altText} width="400" height="300" loading={priority ? "eager" : "lazy"} {...(priority ? { fetchPriority: "high" as const } : {})} />
        ) : (
          <div className="thumb" role="img" aria-label="No image available" />
        )}
        <div className="body">
          <h3>{hit.title}</h3>
          <p className="price">{formatMoney(hit.effectivePrice)}</p>
          {hit.purchasable ? (
            <span className="badge">{hit.inStock ? "In stock" : "Available"}</span>
          ) : (
            <span className="badge out">Currently unavailable</span>
          )}
        </div>
      </Link>
    </li>
  );
}
