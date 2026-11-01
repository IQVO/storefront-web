import { ApiError } from "~/lib/api.ts";

/** Maps the stable problem slugs the BFF relays to shopper-facing text. */
export function problemMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.slug) {
      case "session-required":
        return "Please sign in or register on the Account page first.";
      case "cancel-after-lock":
        return "This order can no longer be cancelled because fulfilment has started.";
      case "payment-declined":
        return "The payment was declined. Choose another scenario and try again.";
      case "stale-delivery-selection":
        return "Delivery options were just refreshed. Please choose your delivery option again.";
    }
    if (error.status === 504) return "That took too long. Nothing was changed; please try again.";
    if (error.status === 503) return "The store is temporarily unavailable. Please try again shortly.";
    return error.problem?.detail ?? error.problem?.title ?? "The request could not be completed.";
  }
  return "Something went wrong. Please try again.";
}

export function ProblemAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="alert" role="alert">
      {problemMessage(error)}
    </p>
  );
}
