import { act, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { announceCartChanged } from "~/lib/cart-events.ts";
import * as session from "~/lib/cart-session.ts";
import { CartLink } from "./CartLink.tsx";

vi.mock("~/lib/cart-session.ts", async (orig) => ({ ...(await orig<typeof session>()), currentCart: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

const mount = () => {
  const Stub = createRoutesStub([{ path: "/", Component: CartLink }]);
  return render(<Stub />);
};

describe("CartLink", () => {
  it("shows the item count after hydration and follows cart changes", async () => {
    vi.mocked(session.currentCart).mockResolvedValue({ cartId: "c", state: "OPEN", version: 1, lines: [{ catalogItemId: "i", quantity: 3 }] });
    mount();
    expect(await screen.findByRole("link", { name: "Cart, 3 items" })).toBeInTheDocument();
    act(() => announceCartChanged(5));
    expect(screen.getByRole("link", { name: "Cart, 5 items" })).toBeInTheDocument();
  });
  it("shows a plain link when there is no cart or the lookup fails", async () => {
    vi.mocked(session.currentCart).mockRejectedValue(new Error("down"));
    mount();
    expect(await screen.findByRole("link", { name: "Cart" })).toBeInTheDocument();
  });
});
