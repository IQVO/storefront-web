import type { Order } from "./types.ts";

const LOCKED_STATUSES = new Set(["SHIPPED", "PARTIALLY_SHIPPED", "PARTIALLY_DELIVERED", "DELIVERED", "LOST", "RETURNED", "CANCELLED"]);

/** Cancel is offered only before any group shipped; the network still refuses after a lock (409). */
export function canRequestCancel(order: Order): boolean {
  return !LOCKED_STATUSES.has(order.status);
}

export function statusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const TERMINAL_SESSION_STATES = new Set(["COMPLETED", "DECLINED", "EXPIRED", "FAILED", "REQUOTE_REQUIRED"]);
