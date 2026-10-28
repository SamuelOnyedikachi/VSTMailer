# Qualification status

This file distinguishes the implemented software foundation from commissioned production infrastructure.

## Implemented checks

Automated PostgreSQL integration tests cover registration/verification/login, tenant boundaries, hashed/revoked credentials, forbidden cross-origin browser mutations, disabled production demo tools, concurrent allowance enforcement, request idempotency, permission checks, suppression after acceptance, durable campaign batches and unknown handoff holds. SMTP capture has a real-socket integration test. Run `npm test` for current evidence.

Run `npm run verify:local` with the app running to test registration email → verification → cookie login → API key → durable acceptance → idempotent replay → background SMTP → persisted test inbox → one consumed credit. All destinations are captured locally; no external mail is sent.

The Next.js production build and TypeScript checks are separate gates. A connected browser was unavailable during development, so desktop/mobile visual QA and interactive browser testing are not represented as completed checks.

## Capacity target, not certification

The approved planning envelope is 10 million recipient emails/month, with a proposed 250-recipient/second acceptance test. Neither receiver acceptance at that scale nor inbox placement has been certified. The local worker and Postgres payload storage are appropriate for proving behavior; use measured workloads to design the production topology.

Before public launch, measure accepted/s and dispatched/s separately, actual payload sizes, sustained storage growth, recipient-provider concentration, queue draining after an outage, per-tenant fairness, backup restore time and failure recovery. Test duplicate/out-of-order transport and payment events, stale leases, corrupt responses, suppression races and quota cycle rollover. A load test against a local SMTP sink cannot establish Internet deliverability.

## Still required for commercial production

* Actual sending/platform domains, permitted static IPs/port 25/PTR and commissioned Postal.
* Live adapter qualification and private authenticated raw Postal event gateway.
* Sender provisioning/approval, destination-aware rate controls and IP warm-up operations.
* Nigeria/USD merchant activation, commercial prices and verified recurring billing lifecycle.
* Production HA/PITR, transport queue recovery, retention/object storage, alerts and abuse staffing.
* Customer webhook subscription/delivery service, broader SDKs and full operator UI.
* Broader security hardening including DB-role/RLS defense in depth and account recovery.
* Legal/privacy/consent policy review for launch markets and final production penetration testing.

Full hosted inboxes, IMAP/POP and actual personal Gmail/Outlook account sending remain outside the approved initial scope.
