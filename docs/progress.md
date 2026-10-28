# Execution ledger — plan: docs/implementation-plan.md

Pre-flight: Auth produces organization/session records consumed by mail and routes; all share PostgreSQL Pool and UUID organization IDs. Worker consumes immutable accepted recipient records; outbox never substitutes for the quota ledger. Dashboard consumes same-origin /api proxy, not a browser-held service credential.

Ruling: Use native PostgreSQL for local verification because the Docker-compatible daemon is unavailable; ship Compose for other hosts. No change to production database semantics.
