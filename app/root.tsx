import { Form, Link, Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/root";
import appCss from "./app.css?url";
import { CartLink } from "./components/CartLink.tsx";
import { ApiError } from "./lib/api.ts";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: appCss }];

export const meta: Route.MetaFunction = () => [{ title: "Sample Storefront" }];

export function Layout({ children }: { children: React.ReactNode }) {
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
        <header className="site-header">
          <Link to="/" className="brand">Sample Storefront</Link>
          <Form method="get" action="/search" role="search" className="search">
            <label htmlFor="q" className="sr-only">Search products</label>
            <input id="q" name="q" type="search" placeholder="Search products" autoComplete="off" />
            <button type="submit">Search</button>
          </Form>
          <nav aria-label="Primary">
            <Link to="/orders">Orders</Link>
            <Link to="/account">Account</Link>
            <CartLink />
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
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
    <section className="page" role="alert">
      <h1>{title}</h1>
      <p>{detail}</p>
      <p><Link to="/">Back to the home page</Link></p>
    </section>
  );
}
