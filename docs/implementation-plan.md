# VSTMailer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build the runnable, independently deployable foundation of VSTMailer and the first customer workflows.
**Architecture:** Next.js dashboard proxies a Fastify API. PostgreSQL transactions own authentication state, quota reservations, messages and durable work. A separate worker dispatches to a local SMTP inbox or an operator-configured Postal instance.
**Tech Stack:** TypeScript, Next.js, Fastify, PostgreSQL, Nodemailer, Postal adapter, Docker Compose.
**Spec:** docs/design.md

## Global Constraints
Infrastructure independence; hosted addresses are send-only; actual Gmail/Outlook From addresses are not impersonated; hard per-cycle recipient quotas; no paid charges or live email during development. 10 million/month is a provisional capacity target requiring separate qualification. The user selected /home/psalmcodes/Projects01/VSTMailer as the project path and approved proceeding, so execute inline without another approval gate.

## Review Focus
* Concurrent quota requests must not overspend; test competing accepts at a small boundary.
* Idempotent retries and ambiguous handoffs must not blindly duplicate sends; test request hashes and uncertain worker state.
* Unverified users and cross-tenant IDs must not grant access; test API and session boundaries.
* Suppression added after acceptance must prevent queued dispatch; test release exactly once.
* Local tools must not become production authentication/billing bypasses; test production config and disabled routes.

### Task 1: Persistence, identity and sessions
Files: src/config.ts, db.ts, auth.ts, migrations/001_initial.sql, scripts/migrate.ts; tests/auth.test.ts.
Produces: migrate(pool), register(pool,input), login(pool,input), authenticate(pool,rawToken), verifyEmail(pool,token).
- [ ] Write tests for registration, failed login, token verification and independent organizations; watch failure.
- [ ] Implement PostgreSQL schema, scrypt credentials, hashed expiring sessions and verification tokens.
- [ ] Run tests and typecheck.

### Task 2: Quota-safe acceptance and transport worker
Files: src/mail.ts, worker-service.ts, transports.ts; tests/mail.test.ts and worker.test.ts.
Consumes: organization/session tables. Produces: acceptMail(pool,orgId,input,key), dispatchOne(pool,transport).
- [ ] Write tests for concurrent allowance limits, idempotency conflict/replay, identity ownership and suppression; watch failure.
- [ ] Implement transactional recipient reservation and durable outbox.
- [ ] Write worker restart/unknown outcome and post-acceptance suppression tests; watch failure.
- [ ] Implement leased dispatch, SMTP-local and Postal transport adapters, preserving uncertain outcomes.
- [ ] Verify all backend tests against actual PostgreSQL.

### Task 3: Customer API and product operations
Files: src/app.ts, routes/*.ts, local-inbox.ts, scripts/seed.ts; tests/api.test.ts.
Produces: buildApp(pool), protected CRUD endpoints, local inbox and operator hooks.
- [ ] Write route tests for authentication, isolation, API keys and disabled production simulation; watch failure.
- [ ] Add domains, API keys, templates, consent-aware contacts, campaigns, usage, plan simulator, message history and operator reconciliation endpoints.
- [ ] Add verification emails and local SMTP capture.
- [ ] Verify end-to-end registration/verification/send/inbox and full tests.

### Task 4: Branded customer dashboard
Files: apps/web/app/*, components/*, public/velion-brand.png.
Consumes: /api proxied customer endpoints; produces responsive signup/login, overview, send, messages, senders, contacts, templates, plans, keys and settings.
- [ ] Implement real form-driven workflows and truthful loading/error/empty states using the approved brand.
- [ ] Run TypeScript and production build; inspect desktop/mobile and perform a browser send flow.

### Task 5: Deployment, qualification and handoff
Files: compose.yaml, Dockerfile, docs/operations.md, README.md, tests/qualification.test.ts.
- [ ] Document local start, Postal provisioning, authenticated event ingress, DNS, backups, secrets and unresolved launch dependencies.
- [ ] Run backend tests, types, web build and a controlled local quota stress test. Record evidence and limits.
- [ ] Have a fresh reviewer check the implementation, fix material issues and rerun affected checks.

## Execution ledger
No existing repository or user code at the selected path. Build in the selected new directory on a new feature branch. Native PostgreSQL is used for verification because the container daemon is unavailable; portable Compose remains provided. Remaining cloud/payment/domain inputs stay explicit, not fabricated.
