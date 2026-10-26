import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api.ts";
import { addToCart, currentCart, forgetCartId, lineCount, readCartId, rememberCartId } from "./cart-session.ts";
import * as q from "./queries.ts";
import type { Cart } from "./types.ts";

vi.mock("./queries.ts");
const cart = (id: string, state = "OPEN", qty = 1): Cart => ({ cartId: id, state, lines: [{ catalogItemId: "i", quantity: qty }], version: 1 });
const problem = (status: number) => new ApiError(status, { type: "/problems/x", title: "x", status });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("cart session", () => {
  it("remembers and forgets the BFF-minted cart id", () => {
    expect(readCartId()).toBeNull();
    rememberCartId("cart-1");
    expect(readCartId()).toBe("cart-1");
    forgetCartId();
    expect(readCartId()).toBeNull();
  });

  it("returns the remembered open cart", async () => {
    rememberCartId("cart-1");
    vi.mocked(q.getCart).mockResolvedValue(cart("cart-1"));
    expect((await currentCart())?.cartId).toBe("cart-1");
  });

  it("drops a remembered cart that is gone or no longer open and recovers via the shopper's carts", async () => {
    rememberCartId("cart-old");
    vi.mocked(q.getCart).mockRejectedValue(problem(404));
    vi.mocked(q.listCarts).mockResolvedValue({ items: [cart("cart-2")] });
    expect((await currentCart())?.cartId).toBe("cart-2");
    expect(readCartId()).toBe("cart-2");
  });

  it("treats an anonymous visitor without a cart as having none", async () => {
    vi.mocked(q.listCarts).mockRejectedValue(problem(422));
    expect(await currentCart()).toBeNull();
  });

  it("propagates unexpected failures", async () => {
    rememberCartId("cart-1");
    vi.mocked(q.getCart).mockRejectedValue(problem(503));
    await expect(currentCart()).rejects.toBeInstanceOf(ApiError);
  });

  it("creates a cart when none exists, then adds the line", async () => {
    vi.mocked(q.listCarts).mockRejectedValue(problem(422));
    vi.mocked(q.createCart).mockResolvedValue({ ...cart("cart-9"), lines: [] });
    vi.mocked(q.addCartLine).mockResolvedValue(cart("cart-9", "OPEN", 2));
    const result = await addToCart("i", 2, "act");
    expect(q.addCartLine).toHaveBeenCalledWith("cart-9", "i", 2, "act");
    expect(readCartId()).toBe("cart-9");
    expect(lineCount(result)).toBe(2);
  });

  it("counts units", () => {
    expect(lineCount(null)).toBe(0);
  });
});
