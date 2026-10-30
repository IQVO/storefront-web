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

/** The shopper-facing progress of a shipment. */
export const TRACK_STEPS = ["Ordered", "Shipped", "Out for delivery", "Delivered"] as const;

const STOPPED = new Set(["CANCELLED", "CANCELLATION_REQUESTED", "LOST", "RETURNED"]);

/**
 * Where a shipment group is on Ordered -> Shipped -> Out for delivery -> Delivered, from the tracking
 * view: the group status, and a package scanned out for delivery. -1 when the shipment stopped.
 */
export function trackStep(groupStatus: string, packageStates: (string | undefined)[] = []): number {
  if (STOPPED.has(groupStatus)) return -1;
  if (groupStatus === "DELIVERED" || (packageStates.length > 0 && packageStates.every((s) => s === "DELIVERED"))) return 3;
  if (packageStates.some((s) => s?.includes("OUT_FOR_DELIVERY"))) return 2;
  if (groupStatus === "SHIPPED" || packageStates.some((s) => s && s !== "LABELLED" && s !== "VOIDED")) return 1;
  return 0;
}
