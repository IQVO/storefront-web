// The shopper's delivery destination. The retail network keys every delivery quote by the FIRST 3
// characters of the normalised postal code (customer-ordering shipto.PrefixLength = 3; service areas
// look like "787"), so a full ZIP such as "78701" is never sent as a destination: the shopper types and
// sees the ZIP, the BFF only ever receives postalPrefixOf(zip).

/** Length of the network's destination postal prefix. */
export const PREFIX_LENGTH = 3;

/** The network destination of a postal code: upper-case, letters and digits only, first 3 characters ("" when shorter). */
export function postalPrefixOf(postalCode: string): string {
  const normalised = postalCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalised.length >= PREFIX_LENGTH ? normalised.slice(0, PREFIX_LENGTH) : "";
}

/** The ZIP as the shopper typed it, reduced to postal-code characters (kept for display only). */
export function cleanZip(zip: string): string {
  return zip.toUpperCase().replace(/[^A-Z0-9 -]/g, "").trim().slice(0, 10);
}

export interface Destination {
  /** The ZIP the shopper typed (or of their saved address), shown back to them. */
  zip: string;
  /** postalPrefixOf(zip): what the BFF receives. */
  prefix: string;
}

export function destinationOf(zip: string): Destination | null {
  const z = cleanZip(zip);
  const prefix = postalPrefixOf(z);
  return prefix ? { zip: z, prefix } : null;
}

// A first-party cookie readable by SSR (so the header renders the chip without a layout shift). It
// holds ONLY the 3-character prefix and the typed ZIP: no name, address or other personal data.
export const DEST_COOKIE = "sf_dest";
const MAX_AGE = 60 * 60 * 24 * 30;

export function readDestination(cookieHeader: string | null | undefined): Destination | null {
  const m = new RegExp(`(?:^|;\\s*)${DEST_COOKIE}=([^;]*)`).exec(cookieHeader ?? "");
  if (!m) return null;
  try {
    return destinationOf(new URLSearchParams(decodeURIComponent(m[1] ?? "")).get("z") ?? "");
  } catch {
    return null;
  }
}

export function destinationCookie(d: Destination): string {
  const value = new URLSearchParams({ p: d.prefix, z: d.zip }).toString();
  return `${DEST_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`;
}

/** Remembers the destination in the cookie (browser only) and returns it, or null for an unusable ZIP. */
export function saveDestination(zip: string): Destination | null {
  const d = destinationOf(zip);
  if (d && typeof document !== "undefined") document.cookie = destinationCookie(d);
  return d;
}
