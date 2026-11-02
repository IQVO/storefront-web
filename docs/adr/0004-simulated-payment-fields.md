# 4. Simulated hosted payment fields

Status: Accepted. Design source: campaign rule 4 (the storefront never sees a card number, only PSP tokens).

## Decision

- The checkout page renders a clearly labelled sandbox in place of a provider-hosted iframe. There is **no** card
  number, expiry or CVC input anywhere in the app; a component test and a Playwright assertion fail if one appears.
- The shopper picks a scenario (`approve`, `decline`, `timeout`). The only payment value that leaves the browser is
  the simulator's PSP token for it, `tok_<scenario>`, posted as `paymentMethodToken` to
  `POST /checkout/{id}/confirmations`. `isScenario` rejects anything else, so even a tampered form never forwards a
  PAN-shaped string; the BFF independently refuses card-shaped tokens with 422.
- Outcomes: 200 COMPLETED goes to the confirmation page; 200 DECLINED stays on the review step with a message;
  202 (in doubt, `PLACING`) goes to the confirmation page, which polls `GET /checkout/{id}` every 2 s (30 polls);
  `REQUOTE_REQUIRED`, `EXPIRED` and `FAILED` explain that nothing was charged and link back to the cart.
