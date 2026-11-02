import { ApiError } from "./api.ts";
import { addCartLine, createCart, getCart, listCarts } from "./queries.ts";
import { hasShopperSession } from "./shopper.ts";
import type { Cart } from "./types.ts";

// The sf_state cookie is HttpOnly and scoped to /api/storefront, so page code cannot read
// the cart id from it. The id the BFF returned is remembered here (an opaque id the
// BFF minted, never invented by the web app) and re-validated on every use.
const KEY = "sf.cartId";

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export const readCartId = (): string | null => store()?.getItem(KEY) ?? null;
export const rememberCartId = (id: string): void => store()?.setItem(KEY, id);
export const forgetCartId = (): void => store()?.removeItem(KEY);

/** The shopper's open cart, or null when there is none (never creates one). */
export async function currentCart(): Promise<Cart | null> {
  const id = readCartId();
  if (id) {
    try {
      const cart = await getCart(id);
      if (cart.state === "OPEN") return cart;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
    }
    forgetCartId();
  }
  // GET /carts needs a shopper session (422 otherwise): an anonymous visitor without a remembered cart has none.
  if (!hasShopperSession()) return null;
  try {
    const res = await listCarts("OPEN");
    const first = (res.items ?? [])[0];
    if (first) {
      rememberCartId(first.cartId);
      return first;
    }
  } catch (e) {
    // 422 session-required: an anonymous visitor with no remembered cart has none.
    if (!(e instanceof ApiError) || (e.status !== 422 && e.status !== 404)) throw e;
  }
  return null;
}

/** Add a product to the open cart, creating the cart first when needed. */
export async function addToCart(catalogItemId: string, quantity: number, actionId?: string): Promise<Cart> {
  let cart = await currentCart();
  if (!cart) {
    cart = await createCart(actionId);
    rememberCartId(cart.cartId);
  }
  return addCartLine(cart.cartId, catalogItemId, quantity, actionId);
}

export const lineCount = (cart: Cart | null): number => cart?.lines.reduce((n, l) => n + l.quantity, 0) ?? 0;
