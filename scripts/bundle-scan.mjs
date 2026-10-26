// Sensor logic for `no-network-url-in-bundle` (plan section 0b): the client bundle may reach the
// backend only through the relative base /api/storefront.
const NETWORK_SERVICES = [
  "customer-ordering", "product-discovery", "shopping-cart", "delivery-promise", "customer-payments",
  "payment-provider-simulator", "product-content", "offer-availability", "order-management", "order-sourcing",
  "network-fulfillment", "network-inventory-planning", "storefront-bff", "pricing", "checkout",
];
const svc = NETWORK_SERVICES.join("|");

// Hosts a browser bundle legitimately carries as plain strings (XML namespaces, error-doc links).
// "localhost" without a port is the dummy base React Router passes to new URL(); a port makes it an in-cluster-host hit.
export const ALLOWED_HOSTS = new Set(["localhost", "www.w3.org", "react.dev", "reactrouter.com", "github.com", "reactjs.org", "developer.mozilla.org"]);

export const RULES = [
  {
    id: "other-api-route",
    why: "an /api/ or /graphql/ path other than /api/storefront",
    re: /\/(?:api|graphql)\/(?!storefront(?:[/"'`?#:]|$))[A-Za-z0-9_.-]+/g,
  },
  {
    id: "in-cluster-host",
    why: "an in-cluster or loopback host",
    re: /[A-Za-z0-9.-]+\.svc(?:\.cluster\.local)?\b|cluster\.local|(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/g,
  },
  {
    id: "service-endpoint",
    why: "a named network service used as an endpoint",
    re: new RegExp(`(?:\\/\\/|["'\`])(?:${svc})(?:\\.[a-z0-9-]+)*(?::\\d+|\\.svc)|\\b(?:${svc}):\\d{2,5}\\b`, "g"),
  },
  {
    id: "backend-env",
    why: "the server-only BFF_URL setting",
    re: /\bBFF_URL\b/g,
  },
];

const ABS_URL = /https?:\/\/([A-Za-z0-9.-]+)(?::\d+)?/g;

/** Returns [{rule, why, match}] for every violation in one file's text. */
export function scanText(text) {
  const out = [];
  for (const r of RULES) {
    for (const m of text.matchAll(r.re)) out.push({ rule: r.id, why: r.why, match: m[0] });
  }
  for (const m of text.matchAll(ABS_URL)) {
    if (!ALLOWED_HOSTS.has(m[1])) out.push({ rule: "absolute-url", why: "an absolute URL to a host that is not allow-listed", match: m[0] });
  }
  return out;
}
