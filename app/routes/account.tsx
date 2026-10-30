import { useEffect } from "react";
import { Form, Link, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/account";
import { useSession } from "~/components/Session.tsx";
import { useRenewedActionId } from "~/lib/action-id.ts";
import { guarded, formString, type ActionResult } from "~/lib/action-result.ts";
import { addMyAddress, createSession, registerShopper } from "~/lib/queries.ts";
import { currentShopper, hasShopperSession, rememberShopper } from "~/lib/shopper.ts";
import type { Shopper } from "~/lib/types.ts";

export async function clientLoader() {
  // /me answers 422 for an anonymous visitor: only ask when the browser holds a session marker.
  return { shopper: hasShopperSession() ? await currentShopper() : null };
}

export function HydrateFallback() {
  return <p className="page" aria-busy="true">Loading your account…</p>;
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
      case "sign-in": {
        const s = await createSession(formString(form, "email"));
        rememberShopper(s.shopperId);
        return s;
      }
      case "register": {
        const s = await registerShopper({ email: formString(form, "email"), savedAddresses: [addressFrom(form)] }, actionId);
        rememberShopper(s.shopperId);
        return s;
      }
      case "add-address":
        return addMyAddress(addressFrom(form), actionId);
      default:
        throw new Error("unknown account intent");
    }
  });
}

/** Address fields with an Austin example (the network delivers to ZIP codes 786xx and 787xx). */
function AddressFields({ prefix }: { prefix: string }) {
  const id = (k: string) => `${prefix}-${k}`;
  return (
    <>
      <div className="field"><label htmlFor={id("name")}>Full name</label><input id={id("name")} name="name" required maxLength={100} autoComplete="name" placeholder="Sample Shopper" /></div>
      <div className="field"><label htmlFor={id("line1")}>Street address</label><input id={id("line1")} name="line1" required maxLength={100} autoComplete="address-line1" placeholder="1100 Congress Ave" /></div>
      <div className="field-row">
        <div className="field"><label htmlFor={id("city")}>City</label><input id={id("city")} name="city" required maxLength={100} autoComplete="address-level2" placeholder="Austin" /></div>
        <div className="field field-sm"><label htmlFor={id("region")}>State</label><input id={id("region")} name="region" required maxLength={100} autoComplete="address-level1" placeholder="TX" /></div>
      </div>
      <div className="field-row">
        <div className="field"><label htmlFor={id("postalCode")}>ZIP code</label><input id={id("postalCode")} name="postalCode" required maxLength={20} autoComplete="postal-code" placeholder="78701" /></div>
        <div className="field field-sm"><label htmlFor={id("countryCode")}>Country code</label><input id={id("countryCode")} name="countryCode" required minLength={2} maxLength={2} autoComplete="country" placeholder="US" defaultValue="US" /></div>
      </div>
    </>
  );
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { shopper } = loaderData;
  const { setShopper } = useSession();
  const result = useActionData<ActionResult>();
  const busy = useNavigation().state === "submitting";
  const error = result && !result.ok ? result.error : null;
  const actionId = useRenewedActionId(result?.ok ? result : null);
  useEffect(() => {
    if (shopper) setShopper(shopper);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopper]);

  if (shopper) {
    return (
      <section className="page account-page" aria-labelledby="acct-h">
        <h1 id="acct-h">Your Account</h1>
        <p>Signed in as <strong>{shopper.email}</strong></p>
        {error && <p className="alert" role="alert">{error}</p>}
        <div className="account-grid">
          <Link to="/orders" className="account-tile"><strong>Your Orders</strong><span className="muted">Track, cancel or review orders</span></Link>
          <Link to="/cart" className="account-tile"><strong>Your Cart</strong><span className="muted">Review items and delivery options</span></Link>
        </div>
        <h2>Your Addresses</h2>
        {shopper.savedAddresses.length === 0 ? <p>No saved addresses yet.</p> : (
          <ul className="address-cards">
            {shopper.savedAddresses.map((a, i) => (
              <li key={a.addressId} className="address-card">
                {i === 0 && <span className="badge-default">Default</span>}
                <strong>{a.name}</strong>
                <span>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</span>
                <span>{a.city}, {a.region} {a.postalCode}</span>
                <span>{a.countryCode}</span>
              </li>
            ))}
          </ul>
        )}
        <Form method="post" className="auth-card">
          <input type="hidden" name="intent" value="add-address" />
          <input type="hidden" name="actionId" value={actionId} />
          <h2>Add an address</h2>
          <AddressFields prefix="add" />
          <button type="submit" className="btn btn-cart btn-block" disabled={busy}>Save address</button>
        </Form>
      </section>
    );
  }

  return (
    <section className="page account-page" aria-labelledby="acct-h">
      <h1 id="acct-h" className="sr-only">Sign in or create your account</h1>
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="auth-grid">
        <Form method="post" className="auth-card">
          <input type="hidden" name="intent" value="sign-in" />
          <h2>Sign in</h2>
          <div className="field"><label htmlFor="signin-email">E-mail</label><input id="signin-email" name="email" type="email" required maxLength={254} autoComplete="email" /></div>
          <button type="submit" className="btn btn-cart btn-block" disabled={busy}>Sign in</button>
          <p className="muted small">There is no password: this study only remembers which shopper the browser acts for. Use synthetic data only.</p>
        </Form>
        <Form method="post" className="auth-card">
          <input type="hidden" name="intent" value="register" />
          <input type="hidden" name="actionId" value={actionId} />
          <h2>Create account</h2>
          <div className="field"><label htmlFor="reg-email">E-mail</label><input id="reg-email" name="email" type="email" required maxLength={254} autoComplete="email" /></div>
          <AddressFields prefix="reg" />
          <button type="submit" className="btn btn-cart btn-block" disabled={busy}>Create your account</button>
        </Form>
      </div>
    </section>
  );
}
