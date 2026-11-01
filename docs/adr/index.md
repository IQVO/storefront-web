---
id: index
title: Architecture decision records
sidebar_label: ADR index
slug: /
sidebar_position: 0
---

# Architecture decision records

The decisions of `storefront-web`, in the order they were taken. The ADR bodies are
immutable; a changed decision gets a new ADR that supersedes the old one. The
*Status* column is copied from each ADR's own status line.

| ADR | Title | Status |
| --- | --- | --- |
| [0001](/docs/adr/0001-react-router-7-framework-ssr) | React Router 7 framework mode with SSR on Node | Accepted. Design source: campaign plan section 0b (storefront-web row) and Phase 5. |
| [0002](/docs/adr/0002-bff-only-and-state-cookie) | The web app talks only to the BFF and never invents ids | Accepted. Design source: plan section 4.7 (storefront-bff) and rules 3 and 4 of the campaign. |
| [0003](/docs/adr/0003-strict-csp) | Strict Content-Security-Policy | Accepted. |
| [0004](/docs/adr/0004-simulated-payment-fields) | Simulated hosted payment fields | Accepted. Design source: campaign rule 4 (the storefront never sees a card number, only PSP tokens). |
| [0005](/docs/adr/0005-ci-sensors-and-stub-bff) | CI sensors and the stub BFF | Accepted. Design source: plan section 0b (storefront sensors) and section 8 (web budgets). |
| [0006](/docs/adr/0006-promise-windows-in-the-destination-time-zone) | Promise windows are shown in the destination's time zone | Accepted. Design source: delivery-promise ADR 0011 (optional `timeZone` on every delivery window) and the storefront campaign brief "carry the delivery window's time zone to every place a shopper sees a promise". |
