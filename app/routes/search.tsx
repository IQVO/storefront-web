import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/search";
import { ProductCard } from "~/components/ProductCard.tsx";
import { serverOpts } from "~/lib/api.server.ts";
import { searchProducts, type SearchParams } from "~/lib/queries.ts";

const SORTS = ["relevance", "price-asc", "price-desc", "title"] as const;

/** Reads the search form's query string; unknown values are dropped, not forwarded. */
export function paramsFromUrl(url: URL): SearchParams {
  const g = (k: string) => url.searchParams.get(k) || undefined;
  const num = (k: string) => {
    const v = g(k);
    return v !== undefined && /^\d+$/.test(v) ? Number(v) : undefined;
  };
  const sort = g("sort");
  return {
    q: g("q"),
    categoryId: g("categoryId"),
    inStock: g("inStock") === "true" ? true : undefined,
    priceMin: num("priceMin"),
    priceMax: num("priceMax"),
    sort: SORTS.find((s) => s === sort),
    after: g("after"),
    limit: 24,
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  const params = paramsFromUrl(new URL(request.url));
  const result = await searchProducts(params, serverOpts(request));
  return { params, result };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.params.q ? `Search: ${data.params.q}` : "Browse products" }];
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const { params, result } = loaderData;
  const nav = useNavigation();
  const categories = result.facets.find((f) => f.name === "category")?.values ?? [];
  return (
    <div className="layout-2">
      <aside className="facets" aria-label="Filters">
        <Form method="get" className="stack">
          <input type="hidden" name="q" value={params.q ?? ""} />
          <label htmlFor="sort">Sort by</label>
          <select id="sort" name="sort" defaultValue={params.sort ?? "relevance"}>
            {SORTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label><input type="checkbox" name="inStock" value="true" defaultChecked={params.inStock === true} /> In stock only</label>
          <button type="submit" className="secondary">Apply</button>
        </Form>
        {categories.length > 0 && (
          <>
            <h2>Category</h2>
            <ul>
              {categories.map((c) => (
                <li key={c.value}>
                  <Link to={`/search?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), categoryId: c.value }).toString()}`}>
                    {c.value} ({c.count})
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
      <section aria-labelledby="results-h" aria-busy={nav.state === "loading"}>
        <h1 id="results-h">{params.q ? `Results for “${params.q}”` : "Browse products"}</h1>
        {result.hits.length === 0 ? (
          <p>No products matched. Try a different search.</p>
        ) : (
          <ul className="grid">{result.hits.map((h, i) => <ProductCard key={h.catalogItemId} hit={h} priority={i < 4} />)}</ul>
        )}
        {result.next && (
          <p>
            <Link className="button secondary" to={`/search?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(params.categoryId ? { categoryId: params.categoryId } : {}), after: result.next }).toString()}`}>
              Next page
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
