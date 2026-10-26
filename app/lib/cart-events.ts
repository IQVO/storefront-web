export const CART_CHANGED = "sf:cart-changed";

export function announceCartChanged(count: number): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<number>(CART_CHANGED, { detail: count }));
}
