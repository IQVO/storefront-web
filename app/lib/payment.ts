// SIMULATED hosted card fields (ADR 0004). The page never collects, shapes or sends a card
// number: the "fields" are an inert sandbox widget and the only thing that leaves the
// browser is a scenario token for the payment-provider simulator.
export const SCENARIOS = [
  { id: "approve", label: "Approve", hint: "The authorization succeeds and the order is placed." },
  { id: "decline", label: "Decline", hint: "The issuer declines; the session returns to payment." },
  { id: "timeout", label: "Time out", hint: "The provider does not answer; the placement is in doubt and settles later." },
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]["id"];

export function isScenario(v: string): v is ScenarioId {
  return SCENARIOS.some((s) => s.id === v);
}

/** The PSP token for a scenario, as the simulator issues them. */
export function tokenFor(scenario: ScenarioId): string {
  return `tok_${scenario}`;
}
