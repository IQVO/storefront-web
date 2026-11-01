import { useId } from "react";
import { SCENARIOS, type ScenarioId } from "~/lib/payment.ts";

/**
 * SIMULATED payment method (ADR 0004). No card number, expiry or CVC input exists anywhere: each
 * radio card stands in for a provider-hosted test card and names the outcome the payment-provider
 * simulator should play. The only value that ever leaves the browser is the scenario token.
 */
export function PaymentFields({ value, onChange, disabled }: { value: ScenarioId; onChange: (s: ScenarioId) => void; disabled?: boolean }) {
  const name = useId();
  return (
    <fieldset className="pay-methods" disabled={disabled}>
      <legend className="sr-only">Payment method (simulated)</legend>
      <div role="group" aria-label="Simulated hosted card fields" className="radio-cards">
        {SCENARIOS.map((s) => (
          <label key={s.id} className={`radio-card pay-card${value === s.id ? " is-selected" : ""}`}>
            <input type="radio" name={name} value={s.id} checked={value === s.id} onChange={() => onChange(s.id)} />
            <span className={`test-card test-card-${s.id}`} aria-hidden="true">
              <span className="test-card-chip" />
              <span className="test-card-dots">•••• {s.id.toUpperCase()}</span>
            </span>
            <span className="radio-card-text">
              <strong>{s.label}</strong> <span className="muted">Simulated test card</span>
              <span className="radio-card-hint">{s.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="muted small">Payments are simulated. No card data is collected: pick what the simulated payment provider should do.</p>
    </fieldset>
  );
}
