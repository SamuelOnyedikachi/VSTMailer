# Execution ledger — plan: docs/implementation-plan.md

Pre-flight: Auth produces organization/session records consumed by mail and routes; all share PostgreSQL Pool and UUID organization IDs. Worker consumes immutable accepted recipient records; outbox never substitutes for the quota ledger. Dashboard consumes same-origin /api proxy, not a browser-held service credential.

Ruling: Use native PostgreSQL for local verification because the Docker-compatible daemon is unavailable; ship Compose for other hosts. No change to production database semantics.

## Continuation — 30 October 2026

Plan: docs/extension-plan.md. Restored after interrupted work and machine restart. Only the owner-approved npm download cache was deleted. Temporary source/dependencies/database were lost across restart; rebuilt source and PostgreSQL on persistent storage. The authoritative checkout is `/home/psalmcodes/Projects01/VSTMailer`; chat staging remains a recovery copy, not an automatic sync source.

Implemented: Google/GitHub/GitLab identity OAuth and explicit linking; server callback routes and both auth-mode buttons; separate authenticated SMTP submission; API/SMTP credential metadata and expiry; separate CIDR policies with denied-source history; session revocation; blocked domains/recipients; message tags; terminal preview/event retention; domain authentication record diagnostics; truthful pending integration states. Original brand image preserved.

Validation: complete PostgreSQL/socket suite 34/34 passed (including OAuth route cookie lifecycle and GitLab private email); backend and frontend TypeScript passed; optimized Next.js build passed. HTTP→worker→real SMTP capture smoke passed with exactly one credit consumed for an idempotent retry, zero external emails. Final checkout build and browser checks are being recorded below.

Fresh reviewer: extension_review. Important finding reproduced RED→GREEN: standalone SMTP must fail closed when NODE_ENV=production lacks a valid explicit APP_MODE; both SMTP entry point and factory now use shared loadConfig validation. Full suite 34/34 after fix.

Final: minor (deferred): session last_used_at is not yet updated on session activity; UI displays creation time rather than claiming it is last activity.

Final: Ruling: throughput certification and pending integrations remain unqualified — do not activate or claim SMS, customer webhooks, tracking, dedicated IP assignment or live billing without implementation/provisioning — cost if wrong is misleading readiness or untested external delivery. Production Postal, TLS and OAuth provider apps require owner configuration and live validation; current tests use local transport and simulated provider responses.

31 October continuation: fixed settings navigation crash by keying ControlViews to its view, so React cannot render transactional controls with retained SMTP/security response data. Reproduced in the prior browser session; verified Security → Transactional email in the browser after fix, with loaded controls and no error overlay. Full suite 34/34 and production build including TypeScript pass again. Local services restored. Screenshots saved in chat outputs. Provider credentials, production delivery qualification and pending features remain as documented above.

31 October customer workflows: added tenant-scoped saved-template editing, full sender-email onboarding with domain TXT setup, preserved saved HTML in Compose, custom mailbox Reply-To, and founder session-only administration (usage, status changes, verified-domain sender activation, audit). Founder email configured only in ignored local environment following explicit owner reply; account must register/verify before access. Regression test observed RED (missing PUT route), then GREEN; full suite 36/36. Review found dropped HTML in Compose; corrected and production build rerun. Browser confirmed editing a saved template with success notification. No live DNS/Postal provisioning claimed. Customer workflow guide contains direct application HTML example.
