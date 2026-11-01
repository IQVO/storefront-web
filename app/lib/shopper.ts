import { ApiError } from "./api.ts";
import { getMe } from "./queries.ts";
import type { Shopper } from "./types.ts";

// The sf_state cookie is HttpOnly, so page code cannot tell whether the BFF holds a shopper session.
// The BFF-minted shopper id is remembered here (an opaque id, no personal data) once a sign-in,
// registration or /me succeeded, so calls that need a session (GET /carts, the header's /me) are
// never made for an anonymous visitor. /me stays the authority: a 422 forgets the marker.
const KEY = "sf.shopperId";

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export const hasShopperSession = (): boolean => Boolean(store()?.getItem(KEY));
export const rememberShopper = (shopperId: string): void => store()?.setItem(KEY, shopperId);
export const forgetShopper = (): void => store()?.removeItem(KEY);

/** The signed-in shopper, or null when the cookie holds none (422 session-required). */
export async function currentShopper(): Promise<Shopper | null> {
  try {
    const me = await getMe();
    rememberShopper(me.shopperId);
    return me;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 422 || e.status === 404)) {
      forgetShopper();
      return null;
    }
    throw e;
  }
}
