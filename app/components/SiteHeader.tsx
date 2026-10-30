import { useRef, useState } from "react";
import { Form, Link, NavLink, useLocation } from "react-router";
import type { Category } from "~/lib/types.ts";
import { CartLink } from "./CartLink.tsx";
import { PinIcon, SearchIcon } from "./Icons.tsx";
import { useSession } from "./Session.tsx";

/** The "Deliver to" chip: the shopper's destination, or a ZIP form behind a disclosure. */
function DeliverTo() {
  const { destination, city, setZip } = useSession();
  const [zip, setZipInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = setZip(zip);
    setInvalid(!d);
    if (d && details.current) details.current.open = false;
  }
  return (
    <details className="deliver-chip" ref={details}>
      <summary aria-label={destination ? `Deliver to ${city ? `${city} ` : ""}${destination.zip}. Change` : "Deliver to: enter ZIP"}>
        <PinIcon />
        <span className="chip-text">
          <span className="nav-small">{destination ? `Deliver to${city ? ` ${city}` : ""}` : "Deliver to"}</span>
          <span className="nav-strong">{destination ? destination.zip : "Enter ZIP"}</span>
        </span>
      </summary>
      <form className="chip-pop" onSubmit={submit}>
        <label htmlFor="chip-zip">Choose your location</label>
        <p className="muted small">Delivery dates and options depend on where you are.</p>
        <div className="zip-row">
          <input id="chip-zip" value={zip} onChange={(e) => setZipInput(e.target.value)} maxLength={10} autoComplete="postal-code" placeholder="e.g. 78701" />
          <button type="submit" className="btn btn-secondary">Apply</button>
        </div>
        {invalid && <p className="field-error" role="alert">Enter a valid ZIP code.</p>}
      </form>
    </details>
  );
}

function SearchBar({ depts }: { depts: Category[] }) {
  const { search, pathname } = useLocation();
  const sp = new URLSearchParams(pathname === "/search" ? search : "");
  const q = sp.get("q") ?? "";
  const cat = sp.get("categoryId") ?? "";
  return (
    <Form method="get" action="/search" role="search" className="search" key={`${pathname}${search}`}>
      <label htmlFor="search-dept" className="sr-only">Department</label>
      <select id="search-dept" name="categoryId" defaultValue={depts.some((d) => d.categoryId === cat) ? cat : ""} className="search-dept">
        <option value="">All</option>
        {depts.map((d) => <option key={d.categoryId} value={d.categoryId}>{d.name}</option>)}
      </select>
      <label htmlFor="q" className="sr-only">Search products</label>
      <input id="q" name="q" type="search" placeholder="Search Sample Storefront" autoComplete="off" defaultValue={q} />
      <button type="submit" className="search-go" aria-label="Search"><SearchIcon /></button>
    </Form>
  );
}

export function SiteHeader({ depts }: { depts: Category[] }) {
  const { shopper } = useSession();
  const greeting = shopper ? `Hello, ${shopper.savedAddresses[0]?.name.split(" ")[0] ?? "shopper"}` : "Hello, sign in";
  return (
    <header className="site-header">
      <div className="nav-main">
        <Link to="/" className="brand">Sample Storefront</Link>
        <DeliverTo />
        <SearchBar depts={depts} />
        <nav aria-label="Primary" className="nav-links">
          <Link to="/account" className="nav-item">
            <span className="nav-small">{greeting}</span>
            <span className="nav-strong">Account</span>
          </Link>
          <Link to="/orders" className="nav-item nav-orders">
            <span className="nav-small">Returns</span>
            <span className="nav-strong">&amp; Orders</span>
          </Link>
          <CartLink />
        </nav>
      </div>
      <nav aria-label="Departments" className="nav-sub">
        <NavLink to="/search" end className="sub-link sub-all">All</NavLink>
        {depts.map((d) => (
          <Link key={d.categoryId} to={`/search?categoryId=${encodeURIComponent(d.categoryId)}`} className="sub-link">{d.name}</Link>
        ))}
      </nav>
    </header>
  );
}
