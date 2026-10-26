import { useMemo, useRef, useState } from "react";

/**
 * One X-Action-Id per user action: the same click retried reuses the id, so the BFF's
 * minted Idempotency-Key deduplicates it. Call reset() once the action succeeded.
 */
export function useActionId(): { current: () => string; reset: () => void } {
  const ref = useRef<string | null>(null);
  return useMemo(
    () => ({
      current: () => (ref.current ??= crypto.randomUUID()),
      reset: () => {
        ref.current = null;
      },
    }),
    [],
  );
}

/**
 * An action id for a form that renders only in the browser: stable across retries of a failed
 * submit, renewed once a submit succeeded (pass the action's result as `succeeded`, falsy otherwise).
 */
export function useRenewedActionId(succeeded: unknown): string {
  const [id, setId] = useState(() => crypto.randomUUID());
  const [seen, setSeen] = useState(succeeded);
  if (succeeded !== seen) {
    setSeen(succeeded);
    if (succeeded) setId(crypto.randomUUID());
  }
  return id;
}
