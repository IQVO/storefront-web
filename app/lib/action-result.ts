import { problemMessage } from "~/components/ProblemAlert.tsx";

export type ActionResult<T = unknown> = { ok: true; value?: T } | { ok: false; error: string };

/** Runs a mutation and turns a failure into shopper-facing text so route actions never throw to the boundary. */
export async function guarded<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: problemMessage(e) };
  }
}

export function formString(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}
