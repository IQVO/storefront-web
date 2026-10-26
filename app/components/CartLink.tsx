import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CART_CHANGED } from "~/lib/cart-events.ts";
import { currentCart, lineCount } from "~/lib/cart-session.ts";

/** Header cart link; the count is read after hydration because the cart id lives in the browser. */
export function CartLink() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    currentCart()
      .then((c) => live && setCount(lineCount(c)))
      .catch(() => undefined);
    const onChange = (e: Event) => setCount((e as CustomEvent<number>).detail);
    window.addEventListener(CART_CHANGED, onChange);
    return () => {
      live = false;
      window.removeEventListener(CART_CHANGED, onChange);
    };
  }, []);
  return (
    <Link to="/cart" aria-label={count > 0 ? `Cart, ${count} items` : "Cart"}>
      Cart{count > 0 ? ` (${count})` : ""}
    </Link>
  );
}
