import { Link, Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/root";
import appCss from "./app.css?url";
import { SessionProvider } from "./components/Session.tsx";
import { SiteHeader } from "./components/SiteHeader.tsx";
import { ApiError } from "./lib/api.ts";
import { serverOpts } from "./lib/api.server.ts";
import { departments } from "./lib/departments.ts";
import { readDestination } from "./lib/destination.ts";
import { listCategories } from "./lib/queries.ts";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: appCss }];

export const meta: Route.MetaFunction = () => [{ title: "Sample Storefront" }];

/**
 * The department navigation (BFF GET /categories) and the shopper's typed ZIP (sf_dest cookie). The
 * category tree is optional: a BFF that does not serve it yet (404) or fails leaves the bar with "All".
 */
export async function loader({ request }: Route.LoaderArgs) {
  const categories = await listCategories(serverOpts(request)).catch(() => null);
  return { categories, destination: readDestination(request.headers.get("cookie")) };
}

/** Read once per document: the tree changes rarely and the destination is kept in the browser after that. */
export function shouldRevalidate() {
  return false;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <SessionProvider initialDestination={data?.destination ?? null}>
          <SiteHeader depts={departments(data?.categories)} />
          <main id="main">{children}</main>
        </SessionProvider>
        <footer className="site-footer">
          <nav aria-label="Footer" className="footer-links">
            <Link to="/account">Your Account</Link>
            <Link to="/orders">Your Orders</Link>
            <Link to="/cart">Shopping Cart</Link>
            <Link to="/search">All products</Link>
          </nav>
          <p>
            This project is a domain-driven design study. It is not associated with, endorsed by or affiliated with any company,
            and it uses no company&apos;s code, data, logos or trademarks. All names, figures and examples are illustrative or
            synthetic. Payments are simulated; never enter real card data.
          </p>
        </footer>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let detail = "Please try again in a moment.";
  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Page not found" : `Error ${error.status}`;
    detail = error.status === 404 ? "We could not find what you were looking for." : detail;
  } else if (error instanceof ApiError) {
    title = error.problem?.title ?? title;
    detail = error.problem?.detail ?? (error.status >= 500 ? "The store is temporarily unavailable. Please retry shortly." : detail);
  }
  return (
    <section className="page narrow" role="alert">
      <h1>{title}</h1>
      <p>{detail}</p>
      <p><Link to="/">Back to the home page</Link></p>
    </section>
  );
}
