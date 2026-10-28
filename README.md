# VSTMailer

Independent email infrastructure by **Velion Smart Technologies**. TypeScript, Next.js, Fastify and PostgreSQL, with a self-hosted Postal transport adapter.

## What runs today

* Verified email signup, login, hashed sessions, separate workspaces and revocable API keys.
* Hosted send-only addresses; Gmail/Outlook are verified account and Reply-To addresses.
* Durable per-recipient send acceptance, atomic monthly quotas, idempotency and scheduled sends.
* A separate worker, real local SMTP inbox, uncertain-handoff holds and operator reconciliation.
* Message history/activity, templates, consent-aware contacts and durable campaign batches.
* Custom-domain ownership checks and pending custom sender provisioning.
* Branded responsive dashboard using the owner's original Velion image.
* Local plan simulation with 10k / 100k / 1m recipient allowances. **No live payment charges.**

This is a runnable foundation and controlled-pilot implementation, not a claim of qualified multi-million production delivery. See [operations](docs/operations.md) and [qualification](docs/qualification.md).

## Run with Docker

Requires a running Docker-compatible daemon and Compose.

```bash
docker compose up --build
```

Open http://localhost:3000 and choose **Open local workspace**, or register and use http://localhost:3000/inbox to verify your account. Compose is configured for local testing; it does not send messages externally. Its container deployment could not be exercised on the development machine because its daemon was unavailable.

## Run natively

Requires Node.js 22+ and PostgreSQL 18. Create two separate databases named `vstmailer` and `vstmailer_test`, then:

```bash
cp .env.example .env
# Edit DATABASE_URL and TEST_DATABASE_URL for your PostgreSQL server.
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

The development machine currently uses an isolated PostgreSQL cluster at `/tmp/vstmailer-pg`, listening on **127.0.0.1:55439**. Its active connection URLs are in the ignored `.env`; do not replace that file with the example when continuing this checkout. `/tmp` storage is temporary: move to a durable PostgreSQL installation before relying on stored data.

Web: http://localhost:3000 · API: http://127.0.0.1:4010 · local SMTP: 127.0.0.1:1025. The native demo login is created locally; the UI provides an explicit local-workspace button, disabled in production.

## Verify

```bash
npm test
npm run typecheck
npm run build
npm run verify:local  # requires npm run dev in another terminal
```

Tests refuse a database URL whose database name does not end in `_test`. They truncate that dedicated test database; never point it at customer data. `verify:local` creates a disposable local workspace and sends only to the SMTP capture service.

## Project structure

`apps/web` — Next.js dashboard and original logo asset.
`src/routes` — customer, auth, operator and normalized delivery-event HTTP boundaries.
`src/mail.ts` — atomic acceptance and quota reservations.
`src/worker-service.ts` — leased dispatch, accounting and recovery.
`src/campaigns.ts` — durable snapshot/batch preparation.
`migrations` — idempotent bootstrap schema; introduce versioned forward migrations before a production rollout.
`docs` — approved design, implementation plan, operations and measured qualification status.

## Ownership and billing

VST means Velion Smart Technologies. The business is registered in **Nigeria** and the owner selected **USD** billing. Commercial prices and merchant credentials have not been supplied. The current plan controls are explicitly labelled local simulations; no NGN conversion, checkout or auto-charge is active.

## Before enabling external delivery

Do not expose the local-mode deployment publicly. Configure HTTPS, secrets, Postal domains/signing, suitable static IPs, reverse DNS and permitted port 25; validate ingress authentication, backups, rate limits and sender approvals. A personal Gmail/Outlook From address cannot be authenticated by our independent servers. Full hosted mailboxes are outside the current scope.
# VSTMailer
# VSTMailer
