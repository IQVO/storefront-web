import { Form, Link, useNavigation, useRouteLoaderData, useSubmit } from "react-router";
import type { Route } from "./+types/search";
import type { loader as rootLoader } from "~/root.tsx";
import { ProductCard } from "~/components/ProductCard.tsx";
import { serverOpts } from "~/lib/api.server.ts";
import { categoryNames, facetValues, priceBand } from "~/lib/departments.ts";
import { searchProducts } from "~/lib/queries.ts";
import { PAGE_SIZE, SORTS, offsetFromUrl, paramsFromUrl, searchHref } from "~/lib/search-params.ts";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const params = paramsFromUrl(url);
  const result = await searchProducts(params, serverOpts(request));
  return { params, offset: offsetFromUrl(url), result };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.params.q ? `Sample Storefront: ${data.params.q}` : "Sample Storefront: all products" }];
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const { params, result } = loaderData;
  const offset = loaderData.offset ?? 0;
  const nav = useNavigation();
  const submit = useSubmit();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const names = categoryNames(root?.categories, result.hits);
  const cats = facetValues(result.facets, "category");
  const bands = facetValues(result.facets, "price-band").map((v) => ({ ...v, band: priceBand(v.value) })).filter((v) => v.band);
  const stock = facetValues(result.facets, "in-stock");
  const total = stock.length > 0 ? stock.reduce((n, v) => n + v.count, 0) : offset + result.hits.length;
  const nameOf = (id: string) => names.get(id) ?? id;
  const scope = params.q ? <> for <span className="results-q">&ldquo;{params.q}&rdquo;</span></> : params.categoryId ? <> in <span className="results-q">{nameOf(params.categoryId)}</span></> : null;
  const bandActive = (b: { priceMin?: number; priceMax?: number }) => b.priceMin === params.priceMin && b.priceMax === params.priceMax;

  return (
    <div className="search-page">
      <div className="results-bar">
        <p className="results-count" role="status">
          {result.hits.length === 0 ? "No results" : `${offset + 1}-${offset + result.hits.length} of ${total} results`}
          {scope}
        </p>
        <Form method="get" action="/search" className="sort-form" onChange={(e) => submit(e.currentTarget)}>
          {params.q && <input type="hidden" name="q" value={params.q} />}
          {params.categoryId && <input type="hidden" name="categoryId" value={params.categoryId} />}
          {params.inStock && <input type="hidden" name="inStock" value="true" />}
          {params.priceMin !== undefined && <input type="hidden" name="priceMin" value={params.priceMin} />}
          {params.priceMax !== undefined && <input type="hidden" name="priceMax" value={params.priceMax} />}
          <label htmlFor="sort">Sort by:</label>
          <select id="sort" name="sort" defaultValue={params.sort ?? "relevance"}>
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button type="submit" className="btn btn-secondary btn-sm">Go</button>
        </Form>
      </div>
      <div className="search-layout">
        <aside className="facets" aria-label="Filters">
          <section aria-labelledby="f-dept">
            <h2 id="f-dept">Department</h2>
            <ul>
              {params.categoryId && (
                <li><Link to={searchHref(params, { categoryId: undefined })}>‹ Any Department</Link></li>
              )}
              {cats.map((c) => (
                <li key={c.value}>
                  <Link to={searchHref(params, { categoryId: c.value })} className={c.value === params.categoryId ? "is-active" : undefined}>
                    {nameOf(c.value)} <span className="facet-count">({c.count})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          {bands.length > 0 && (
            <section aria-labelledby="f-price">
              <h2 id="f-price">Price</h2>
              <ul>
                {bands.map(({ value, count, band }) => band && (
                  <li key={value}>
                    <Link to={searchHref(params, { priceMin: band.priceMin, priceMax: band.priceMax })} className={bandActive(band) ? "is-active" : undefined}>
                      {band.label} <span className="facet-count">({count})</span>
                    </Link>
                  </li>
                ))}
                {(params.priceMin !== undefined || params.priceMax !== undefined) && (
                  <li><Link to={searchHref(params, { priceMin: undefined, priceMax: undefined })}>‹ Any Price</Link></li>
                )}
              </ul>
            </section>
          )}
          <section aria-labelledby="f-avail">
            <h2 id="f-avail">Availability</h2>
            <Link to={searchHref(params, { inStock: params.inStock ? undefined : true })} className="facet-check" role="checkbox" aria-checked={params.inStock === true}>
              <span className="box" aria-hidden="true" /> In stock only
            </Link>
          </section>
        </aside>
        <section aria-labelledby="results-h" aria-busy={nav.state === "loading"} className="results">
          <h1 id="results-h" className="results-h">{params.q ? "Results" : params.categoryId ? nameOf(params.categoryId) : "All products"}</h1>
          {result.hits.length === 0 ? (
            <p className="panel">No products matched. Try a different search or remove a filter.</p>
          ) : (
            <ul className="tile-grid">{result.hits.map((h, i) => <ProductCard key={h.catalogItemId} hit={h} priority={i < 4} />)}</ul>
          )}
          {result.next && (
            <p className="pager">
              <Link className="btn btn-secondary" to={searchHref(params, { after: result.next, from: offset + PAGE_SIZE })}>Next page</Link>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
