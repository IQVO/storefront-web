import { formatMinor, priceParts } from "~/lib/money.ts";
import type { Money } from "~/lib/types.ts";

/** A big price with small superscript cents; screen readers get the plain amount. */
export function Price({ money, size = "md" }: { money: Money | undefined; size?: "sm" | "md" | "lg" }) {
  if (!money) return <span className="price-na">Price unavailable</span>;
  const p = priceParts(money.amountMinor, money.currency);
  return (
    <span className={`price-tag price-${size}`}>
      <span className="sr-only">{formatMinor(money.amountMinor, money.currency)}</span>
      <span aria-hidden="true">
        <sup className="price-sym">{p.symbol}</sup>
        <span className="price-whole">{p.whole}</span>
        {p.cents && <sup className="price-cents">{p.cents}</sup>}
      </span>
    </span>
  );
}
