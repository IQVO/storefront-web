import { ApiError } from "./api.ts";
import { getMe } from "./queries.ts";
import type { Shopper } from "./types.ts";

/** The signed-in shopper, or null when the cookie holds none (422 session-required). */
export async function currentShopper(): Promise<Shopper | null> {
  try {
    return await getMe();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 422 || e.status === 404)) return null;
    throw e;
  }
}
