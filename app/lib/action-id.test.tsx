import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useActionId, useRenewedActionId } from "./action-id.ts";

describe("action ids", () => {
  it("reuses the id until reset (a retried click is the same action)", () => {
    const { result } = renderHook(() => useActionId());
    const first = result.current.current();
    expect(result.current.current()).toBe(first);
    result.current.reset();
    expect(result.current.current()).not.toBe(first);
  });

  it("keeps the id across failed submits and renews it after a success", () => {
    const { result, rerender } = renderHook(({ ok }: { ok: unknown }) => useRenewedActionId(ok), { initialProps: { ok: null as unknown } });
    const first = result.current;
    rerender({ ok: null });
    expect(result.current).toBe(first);
    act(() => rerender({ ok: { done: 1 } }));
    expect(result.current).not.toBe(first);
  });
});
