import { Link } from "react-router";
import type { Route } from "./+types/home";
import { ProductCard } from "~/components/ProductCard.tsx";
import { serverOpts } from "~/lib/api.server.ts";
import { searchProducts } from "~/lib/queries.ts";

export async function loader({ request }: Route.LoaderArgs) {
  const result = await searchProducts({ limit: 8, sort: "relevance" }, serverOpts(request));
  const categories = result.facets.find((f) => f.name === "category")?.values ?? [];
  return { hits: result.hits, categories };
}

export function headers() {
  return { "Cache-Control": "private, max-age=0, must-revalidate" };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { hits, categories } = loaderData;
  return (
    <div>
      <section className="panel" aria-labelledby="hero-h">
        <h1 id="hero-h">Everyday essentials, delivered</h1>
        <p className="muted">Browse the catalogue, pick a delivery date and check out with a simulated payment.</p>
      </section>
      {categories.length > 0 && (
        <nav aria-label="Categories" className="row">
          {categories.map((c) => (
            <Link key={c.value} className="button secondary" to={`/search?categoryId=${encodeURIComponent(c.value)}`}>
              {c.value} ({c.count})
            </Link>
          ))}
        </nav>
      )}
      <h2>Featured products</h2>
      {hits.length === 0 ? (
        <p>No products are available right now.</p>
      ) : (
        <ul className="grid">{hits.map((h, i) => <ProductCard key={h.catalogItemId} hit={h} priority={i < 4} />)}</ul>
      )}
    </div>
  );
}
