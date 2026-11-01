import { describe, expect, it } from "vitest";
import { SCENARIOS, isScenario, tokenFor } from "./payment.ts";

describe("payment scenarios", () => {
  it("maps each scenario to the simulator's PSP token", () => {
    expect(tokenFor("approve")).toBe("tok_approve");
    expect(tokenFor("decline")).toBe("tok_decline");
    expect(tokenFor("timeout")).toBe("tok_timeout");
  });
  it("never produces a PAN-shaped token", () => {
    for (const s of SCENARIOS) expect(tokenFor(s.id)).not.toMatch(/\d{12,}/);
  });
  it("rejects anything that is not a known scenario", () => {
    expect(isScenario("approve")).toBe(true);
    expect(isScenario("4242424242424242")).toBe(false);
    expect(isScenario("")).toBe(false);
  });
});
