import { Form, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/account";
import { useRenewedActionId } from "~/lib/action-id.ts";
import { guarded, formString, type ActionResult } from "~/lib/action-result.ts";
import { ApiError } from "~/lib/api.ts";
import { addMyAddress, createSession, getMe, registerShopper } from "~/lib/queries.ts";
import type { Shopper } from "~/lib/types.ts";

/** The signed-in shopper, or null when the cookie holds none (422 session-required). */
export async function currentShopper(): Promise<Shopper | null> {
  try {
    return await getMe();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 422 || e.status === 404)) return null;
    throw e;
  }
}

export async function clientLoader() {
  return { shopper: await currentShopper() };
}

export function HydrateFallback() {
  return <p aria-busy="true">Loading your account…</p>;
}

function addressFrom(form: FormData) {
  const f = (k: string) => formString(form, k);
  return { name: f("name"), line1: f("line1"), city: f("city"), region: f("region"), postalCode: f("postalCode"), countryCode: f("countryCode").toUpperCase() };
}

export async function clientAction({ request }: Route.ClientActionArgs): Promise<ActionResult<Shopper | unknown>> {
  const form = await request.formData();
  const intent = formString(form, "intent");
  const actionId = formString(form, "actionId") || undefined;
  return guarded(async () => {
    switch (intent) {
      case "sign-in":
        return createSession(formString(form, "email"));
      case "register":
        return registerShopper({ email: formString(form, "email"), savedAddresses: [addressFrom(form)] }, actionId);
      case "add-address":
        return addMyAddress(addressFrom(form), actionId);
      default:
        throw new Error("unknown account intent");
    }
  });
}

function AddressFields() {
  return (
    <div className="stack">
      <label>Name <input name="name" required maxLength={100} autoComplete="name" /></label>
      <label>Address <input name="line1" required maxLength={100} autoComplete="address-line1" /></label>
      <label>City <input name="city" required maxLength={100} autoComplete="address-level2" /></label>
      <label>Region <input name="region" required maxLength={100} autoComplete="address-level1" /></label>
      <label>Postal code <input name="postalCode" required maxLength={20} autoComplete="postal-code" /></label>
      <label>Country (2 letters) <input name="countryCode" required minLength={2} maxLength={2} autoComplete="country" /></label>
    </div>
  );
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { shopper } = loaderData;
  const result = useActionData<ActionResult>();
  const busy = useNavigation().state === "submitting";
  const error = result && !result.ok ? result.error : null;
  const actionId = useRenewedActionId(result?.ok ? result : null);
  return (
    <section aria-labelledby="acct-h">
      <h1 id="acct-h">Account</h1>
      <p className="muted">There is no password: this study only remembers which shopper the browser acts for. Use synthetic data.</p>
      {error && <p className="alert" role="alert">{error}</p>}
      {shopper ? (
        <>
          <p>Signed in as <strong>{shopper.email}</strong></p>
          <h2>Saved addresses</h2>
          {shopper.savedAddresses.length === 0 ? <p>No saved addresses yet.</p> : (
            <ul>{shopper.savedAddresses.map((a) => <li key={a.addressId}>{a.name}, {a.line1}, {a.city} {a.postalCode}</li>)}</ul>
          )}
          <Form method="post" className="panel">
            <input type="hidden" name="intent" value="add-address" />
            <input type="hidden" name="actionId" value={actionId} />
            <h2>Add an address</h2>
            <AddressFields />
            <button type="submit" disabled={busy}>Save address</button>
          </Form>
        </>
      ) : (
        <div className="layout-2">
          <Form method="post" className="panel stack">
            <input type="hidden" name="intent" value="sign-in" />
            <h2>Sign in</h2>
            <label>E-mail <input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
            <button type="submit" disabled={busy}>Sign in</button>
          </Form>
          <Form method="post" className="panel stack">
            <input type="hidden" name="intent" value="register" />
            <input type="hidden" name="actionId" value={actionId} />
            <h2>Register</h2>
            <label>E-mail <input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
            <AddressFields />
            <button type="submit" disabled={busy}>Register</button>
          </Form>
        </div>
      )}
    </section>
  );
}
