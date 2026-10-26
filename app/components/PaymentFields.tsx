import { useId } from "react";
import { SCENARIOS, type ScenarioId } from "~/lib/payment.ts";

/**
 * SIMULATED hosted card fields. No card number, expiry or CVC input exists anywhere:
 * the sandbox box stands in for a provider-hosted iframe and the shopper picks the
 * outcome scenario the payment-provider simulator should play.
 */
export function PaymentFields({ value, onChange, disabled }: { value: ScenarioId; onChange: (s: ScenarioId) => void; disabled?: boolean }) {
  const name = useId();
  return (
    <fieldset className="fieldset" disabled={disabled}>
      <legend>Payment (simulated)</legend>
      <div className="card-sandbox" role="group" aria-label="Simulated hosted card fields">
        <p className="fake" aria-hidden="true">•••• •••• •••• ••••</p>
        <p className="muted">
          These fields are a sandbox. No card data is collected: pick what the simulated payment provider should do.
        </p>
      </div>
      <div className="stack">
        {SCENARIOS.map((s) => (
          <label key={s.id}>
            <input type="radio" name={name} value={s.id} checked={value === s.id} onChange={() => onChange(s.id)} /> <strong>{s.label}</strong>{" "}
            <span className="muted">{s.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
