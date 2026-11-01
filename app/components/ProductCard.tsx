import { Link } from "react-router";
import { mediaSrc } from "~/lib/departments.ts";
import type { ProductHit } from "~/lib/types.ts";
import { Price } from "./Price.tsx";

/** A product tile. `priority` marks above-the-fold tiles: their image loads eagerly (LCP) instead of lazily. */
export function ProductCard({ hit, priority = false }: { hit: ProductHit; priority?: boolean }) {
  return (
    <li className="tile">
      <Link className="tile-link" to={`/products/${encodeURIComponent(hit.catalogItemId)}`}>
        <span className="tile-media">
          {hit.primaryMedia ? (
            <img src={mediaSrc(hit.primaryMedia.url)} alt={hit.primaryMedia.altText} width="200" height="150" loading={priority ? "eager" : "lazy"} {...(priority ? { fetchPriority: "high" as const } : {})} />
          ) : (
            <span className="no-image" role="img" aria-label="No image available" />
          )}
        </span>
        <h3 className="tile-title">{hit.title}</h3>
      </Link>
      <div className="tile-body">
        <Price money={hit.effectivePrice} />
        {hit.purchasable ? <p className="stock in">In stock</p> : <p className="stock out">Currently unavailable</p>}
      </div>
    </li>
  );
}
