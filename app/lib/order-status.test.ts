import { describe, expect, it } from "vitest";
import { canRequestCancel, statusLabel } from "./order-status.ts";
import type { Order } from "./types.ts";

const order = (status: string): Order => ({ orderId: "o", shopperId: "s", status, destinationPostalPrefix: "1", placedAt: "2030-01-01T00:00:00Z", lines: [], groups: [] });

describe("order status", () => {
  it.each(["PLACED", "IN_FULFILLMENT"])("offers cancel while %s", (s) => expect(canRequestCancel(order(s))).toBe(true));
  it.each(["SHIPPED", "PARTIALLY_SHIPPED", "DELIVERED", "CANCELLED", "LOST", "RETURNED"])("hides cancel once %s", (s) =>
    expect(canRequestCancel(order(s))).toBe(false),
  );
  it("labels statuses", () => expect(statusLabel("PARTIALLY_SHIPPED")).toBe("Partially Shipped"));
});
