import { Link } from "react-router";
import type { Route } from "./+types/home";
import { ProductCard } from "~/components/ProductCard.tsx";
import { serverOpts } from "~/lib/api.server.ts";
import { departments, illustrationFor } from "~/lib/departments.ts";
import { listCategories, searchProducts } from "~/lib/queries.ts";
import type { ProductHit } from "~/lib/types.ts";

const ROWS = 4;
const PER_ROW = 6;

interface Row {
  title: string;
  categoryId?: string;
  hits: ProductHit[];
}

/**
 * Department cards from the category tree, then one "Popular in" row per busiest department (one
 * search each, SSR). Without a tree (a BFF that does not serve /categories yet) the rows come from
 * one search grouped by the department name the hits carry.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const opts = serverOpts(request);
  const depts = departments(await listCategories(opts).catch(() => null));
  let rows: Row[];
  if (depts.length > 0) {
    const busiest = [...depts].sort((a, b) => b.purchasableCount - a.purchasableCount).slice(0, ROWS);
    rows = await Promise.all(
      busiest.map(async (d) => ({ title: d.name, categoryId: d.categoryId, hits: (await searchProducts({ categoryId: d.categoryId, limit: PER_ROW }, opts)).hits })),
    );
  } else {
    const { hits } = await searchProducts({ limit: 48 }, opts);
    const byDept = new Map<string, ProductHit[]>();
    for (const h of hits) {
      const name = h.categoryPath?.[0] ?? "Featured";
      byDept.set(name, [...(byDept.get(name) ?? []), h]);
    }
    rows = [...byDept].sort((a, b) => b[1].length - a[1].length).slice(0, ROWS).map(([title, list]) => ({ title, hits: list.slice(0, PER_ROW) }));
  }
  return {
    departments: depts.map((d) => ({ categoryId: d.categoryId, name: d.name, count: d.purchasableCount, image: illustrationFor(d.name) })),
    rows: rows.filter((r) => r.hits.length > 0),
  };
}

export function headers() {
  return { "Cache-Control": "private, max-age=0, must-revalidate" };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { departments: depts, rows } = loaderData;
  return (
    <div className="home">
      <section className="hero" aria-labelledby="hero-h">
        <div className="hero-inner">
          <h1 id="hero-h">Everything for home, work and play, delivered</h1>
          <p>Thousands of everyday products with a delivery date you can count on. Enter your ZIP code to see when your order arrives.</p>
          <Link to="/search" className="btn btn-primary hero-cta">Shop all products</Link>
        </div>
      </section>

      {depts.length > 0 && (
        <section className="shelf" aria-labelledby="dept-h">
          <h2 id="dept-h">Shop by department</h2>
          <ul className="dept-grid">
            {depts.map((d) => (
              <li key={d.categoryId} className="dept-card">
                <Link to={`/search?categoryId=${encodeURIComponent(d.categoryId)}`} className="dept-link">
                  <span className="dept-media">
                    {d.image ? <img src={d.image} alt="" width="200" height="150" loading="lazy" /> : <span className="no-image" />}
                  </span>
                  <span className="dept-name">{d.name}</span>{" "}
                  <span className="dept-count">{d.count} {d.count === 1 ? "item" : "items"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <p className="panel">No products are available right now.</p>
      ) : (
        rows.map((r, i) => (
          <section key={r.title} className="shelf" aria-labelledby={`row-${i}`}>
            <div className="shelf-head">
              <h2 id={`row-${i}`}>Popular in {r.title}</h2>
              {r.categoryId && <Link to={`/search?categoryId=${encodeURIComponent(r.categoryId)}`} className="see-more">See more</Link>}
            </div>
            <ul className="tile-row">{r.hits.map((h, j) => <ProductCard key={h.catalogItemId} hit={h} priority={i === 0 && j < 4} />)}</ul>
          </section>
        ))
      )}
    </div>
  );
}
