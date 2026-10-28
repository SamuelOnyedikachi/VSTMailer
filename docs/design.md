# Mailing platform: first-version design

Date: 27 October 2026
Status: proposal for approval; no product code or infrastructure has been deployed.

## Intent and confirmed requirements

Build a commercial, multi-customer mailing platform with independently operated delivery infrastructure. Customers subscribe to plans that grant a monthly email allowance. The first version must accommodate millions of recipient emails across customers. People using personal Gmail, Outlook, or other inboxes must be able to join and send without owning a domain. Customers with a domain can configure branded sending identities.

Infrastructure independence means the application, database, queues, payload storage, and mail transport can run on ordinary Linux hosts without a proprietary email relay, managed queue, or mandatory hosting platform. Domain registration, DNS delegation, Internet connectivity, recipient mail systems, and payment processing remain external dependencies. Independence does not eliminate those dependencies or server costs.

Success: a customer creates an account, verifies their personal email, obtains an authorized sending identity, gets an allowance, sends through the API or dashboard, and can inspect delivery outcomes. Operators can pause a customer or sending stream, investigate failures, reconcile usage, and restore service.

Anti-goals: spoofing personal email domains, open relaying, unlimited sending, bypassing recipient controls by rotating IPs, claims of guaranteed inbox placement, or a dashboard that appears to send while silently discarding messages.

## Approaches and recommendation

The conversation considered an external relay, self-hosted Postal, Postfix with a custom management layer, and a new SMTP engine. The user chose infrastructure independence and asked to start after the recommendation to operate Postal. This document carries that recommendation forward as a proposed implementation choice, not an explicitly selected technology.

* External relay: simpler launch but conflicts with the user's delivery independence goal.
* Self-hosted Postal: proposed first-version engine. Supplies mature SMTP delivery, queues, signing, events, and suppression foundations; requires operating its dependencies and validating tenant provisioning and event behavior.
* Postfix with our own management layer: credible alternative with more integration work for multi-customer provisioning and event reporting.
* New SMTP engine: maximum implementation control but unnecessary protocol and reliability work for the initial product.

Recommendation: own the product and operate Postal behind a replaceable internal transport interface. Do not fork Postal until a demonstrated requirement makes it necessary. Pin an evaluated release and document its license and dependencies during implementation.

## Proposed product scope

1. Accounts, verified personal email, organizations, owner/member roles, sessions, API key management, and operator-only administration.
2. Hosted sending addresses and customer-domain setup with live DNS verification.
3. Versioned HTTP sending API with idempotency, per-recipient outcomes, templates, test sends, and scheduled sends.
4. Contacts, permission records, suppression lists, CSV import with validation, and basic one-time campaigns. Complex visual automation is deferred.
5. Message history, searchable metadata, aggregate usage, queue state, bounce/complaint indicators, and signed customer webhooks.
6. Configurable subscription plans, allowance enforcement, subscription state changes, and usage reconciliation.
7. Operator approval of new senders, rate controls, suspension, message investigation, and audit logs.

The first runnable milestone is deliberately narrower: account/organization foundation, hosted identity in local test mode, configurable entitlements, quota-safe API acceptance, a durable outbox, and a local email sink. Subsequent milestones connect real Postal and domain verification before live sending is enabled. Local preview must identify simulated delivery explicitly.

## Sender identity and customers without domains

These are proposed interpretations of the user's identity requirement and need approval:

* A customer can sign up with `person@gmail.com` or `person@outlook.com` and verify that inbox. The personal mailbox provider does not transport our platform's outbound messages.
* A customer without a domain receives a send-only address such as `hello@customer-id.send.example.net`. All names here use reserved example domains, not a purchased product domain.
* We control DNS and DKIM signing for the hosted identity. Names are unique, checked for impersonation, and available only to their owning organization. Reply-To can point to a verified personal inbox.
* A customer with a domain can use `hello@their-domain.example` after proving ownership and configuring DKIM and the required DNS. SPF and custom return-path setup receive explicit guidance; existing customer SPF must not be overwritten with a second SPF record.
* We do not directly send as `person@gmail.com` or `person@outlook.com`, since we cannot authenticate those domains. Sending through those actual accounts would require a later OAuth/provider integration, depend on their sending restrictions, and be outside independent delivery.
* A sending identity is not a hosted mailbox. No IMAP, POP, general-purpose inbound inbox, domain purchase, or arbitrary address forwarding is included initially. Replies normally go to Reply-To. The interface clearly labels the hosted address as send-only.

The hosted sending domain is separate from our login, corporate, and password-reset domains. Tenant subdomains improve attribution and management but do not guarantee reputation isolation: receivers may aggregate reputation across the parent domain and shared IPs. Platform identities get stricter onboarding and traffic limits. Marketing and transactional streams use distinct sending identities and operational queues, with separate IP pools when commissioned.

## Capacity assumptions and measurable targets

Provisional planning envelope, chosen by the builder because no exact monthly or peak requirement was supplied:

* 10 million recipient emails per 30-day month, approximately 3.86 recipients/second on average.
* A controlled performance test targeting 250 accepted recipients/second for 15 minutes, with fair scheduling between tenants. This is a test target, not a verified result or a promise that receivers accept that rate.
* Sending speed varies by IP reputation, customer approval, provider throttling, payload size, and recipient domain. A monthly allowance is not a guarantee of instant delivery.
* Initial API limit: 100 recipients per request and 5 MiB of rendered message content. Attachments are deferred from the first runnable milestone and must have a separately budgeted size limit before introduction.
* Defaults: full payload retention 7 days after terminal disposition, searchable metadata 30 days, and aggregate usage 13 billing cycles. Suppression and consent records have separately documented retention and deletion rules. Product privacy and retention decisions need review before public launch.
* Capacity testing includes recipient-domain concentration, queue buildup during receiver outages, storage growth, database maintenance, and recovery after worker failure.

At 10 million emails and a 50 KB average payload, one copy of monthly payloads is roughly 500 GB before replication, indexes, and logs. Seven days is roughly 117 GB at uniform traffic, excluding retained deferred mail and transient copies. We must budget PostgreSQL metadata, app payload storage, Postal's own message storage, and backups separately; payload retention cannot remove a message still needed for delivery.

## Proposed stack and boundaries

| Part | Proposed choice | Responsibility |
| --- | --- | --- |
| Workspace | TypeScript monorepo | Shared validated contracts and repeatable local development |
| Dashboard | Next.js | Customer and operator experiences |
| API | Fastify | Authentication, authorization, requests, quota acceptance |
| Product state | PostgreSQL | Tenants, identities, immutable allowance ledger, messages and outbox |
| App work | PostgreSQL-backed durable jobs | Scheduling, imports, dispatch, events and customer webhook retries |
| Delivery engine | Self-hosted Postal | SMTP delivery and its retry queue, DKIM and transport events |
| Postal state | Postal-supported services | Separate from the application's PostgreSQL; verify exact release dependencies |
| Payloads | Self-hosted S3-compatible storage | Encrypted payload/assets with lifecycle and separate backup destination |
| Edge | Caddy or equivalent | HTTPS termination and routing |
| Packaging | Docker Compose locally | Portable service definitions; production topology documented separately |
| Operations | OpenTelemetry, Prometheus, Grafana, centralized logs | Tracing, latency, queue age, rate and failure alerts |
| Payments | Adapter with local simulator initially | No live paid plan until merchant country, currency and processor are selected |

Redis is not required for the first application milestone. Use database-backed rate controls at first, then introduce a self-hosted cache only if measured contention warrants it. A durable transaction outbox remains the acceptance authority regardless of queue library.

Do not add a proprietary hosting layer as a deployment requirement. No infrastructure purchase, DNS change, payment charge, or live customer email is authorized by this document alone.

## Message flow and delivery semantics

1. Validate authentication, organization, approved identity, current entitlement, content and size. Check recipient suppression, consent requirements for marketing, and idempotency.
2. In one PostgreSQL transaction, reserve recipient credits and create recipient message records plus outbox records. Commit before returning accepted IDs. No in-memory-only acceptance.
3. A leased worker rechecks suspension, suppression, unsubscribe state, scheduled time and traffic limits, then hands messages to the chosen Postal instance. Store our correlation IDs and Postal IDs when available.
4. Postal owns retries once it has positively accepted a message. Application retries must not independently create another Postal message after confirmed acceptance.
5. Persist incoming Postal events in an inbox before processing. Authenticate the internal endpoint using the exact release's supported mechanism plus private-network controls; validate documented signature support rather than assume it. Deduplicate event IDs or stable event fingerprints, tolerate reordered events, update recipient state, then enqueue customer webhooks.
6. Deliver signed customer webhook events with stable event IDs, bounded retries and manual replay. Treat customer endpoints as SSRF-sensitive: block private/metadata destinations, validate redirects and DNS results, and cap response sizes/timeouts.

API idempotency is scoped to organization plus key, includes a request hash, and returns a conflict for a changed request under the same key. Proposed minimum retention is 7 days; scheduled records retain the association through completion plus that window. Crash recovery after an uncertain handoff must reconcile with transport state using persisted correlation data where supported. If acceptance cannot be determined, mark `submission_unknown`, alert operators, and do not blindly resubmit. SMTP cannot guarantee exactly-once end-to-end delivery.

States include accepted, scheduled, submitting, submission_unknown, transport_queued, deferred, delivered_to_server, bounced, suppressed, cancelled and expired. Complaint and unsubscribe events are separate facts and can arrive after delivery. Do not describe server acceptance as inbox placement or make opens/clicks authoritative evidence of human engagement.

App workers use leases, bounded retries, dead-letter states and replay tools. Transactional traffic gets reserved scheduling capacity. Bulk traffic is chunked, with tenant fairness and destination-aware backpressure enforced before handoff, plus matching transport controls. Workers stop admitting more into a congested transport rather than filling disks.

## Subscription plans and exact quota rules

Plan names and prices are not yet business decisions. Use editable seed tiers for development: 10,000 / 100,000 / 1,000,000 recipient emails per billing cycle; custom tiers support larger accounts. No currency or live payment amount is implied.

* Count one credit per accepted recipient, including separate To/Cc/Bcc recipients; duplicate addresses within one request are normalized and counted once. Reject recipient overlap across To/Cc/Bcc rather than silently change visibility. One-recipient messages are the transport unit.
* Persist the precise recipient set before reservation. Idempotent replays consume no new credits. Suppressed recipients known before acceptance consume none; return their status explicitly.
* Invalid requests consume no quota. A reservation is held for scheduled mail. Cancellation or newly discovered suppression before transport submission releases the reservation exactly once. Confirmed Postal acceptance converts reservation to consumed usage. Subsequent transport retries, deferrals and bounces incur no extra credits and do not refund the send.
* Reservations for future scheduled work consume the current cycle at API acceptance; the UI states this clearly. Cycle rollover does not create credits for already reserved work. Refunds apply to the original reservation's cycle, never credit a newer cycle.
* The default is a hard cap: no silent overage charges. Reject quota-exceeding API requests atomically; a campaign scheduler stops and shows the unsubmitted remainder. Rate limits and monthly allowance are separate controls.
* The billing cycle uses stored UTC start/end instants from the subscription, not a server-local monthly cron. No rollover by default. Frozen cycle records and an immutable recipient-level ledger support audits and reconciliation.
* Reserve with an atomic conditional database write and a unique acceptance key so concurrent workers cannot exceed remaining allowance. Released/consumed transitions are conditional and idempotent. Reconciliation repairs projections from the ledger, not by guessing from dashboard counts.
* Payment callbacks are signature-verified, deduplicated and order-aware; they never accept a plan identifier or amount supplied only by a client. Upgrades, downgrades and cancellation default to next cycle with no proration initially. A failed payment does not extend the next paid cycle. A safety suspension stops new acceptance and new handoffs immediately; already accepted transport mail may be in flight and needs an explicit queue hold procedure.
* A verified administrator can assign development subscriptions in local mode. Production must refuse simulator payment events and development entitlement overrides unless explicitly operated through audited administration.

## Security, tenancy and abuse controls

Derive organization access from sessions or scoped API credentials; never trust a request's organization ID alone. Store API key hashes, support revocation, protect sessions, and audit privileged actions. Use tenant-aware constraints and database row-level policies as defense in depth, with workers operating through explicit least-privilege roles. Test cross-tenant reads and writes.

Encrypt network traffic and disks/backups. Keep DKIM/private credentials out of source code, browser bundles and logs; isolate signing secrets and document rotation. Customer SMTP submission, if exposed later, requires authenticated credentials, TLS, per-tenant identity restrictions and rate controls. Internet-facing bounce ingress must not become an open relay or arbitrary content forwarding service.

New users verify their contact email and undergo operator approval before meaningful live sending. Hosted identities have conservative limits. Add complaint/bounce thresholds, per-tenant kill switches, content checks, consent provenance and sender contact information for campaigns, and an accessible abuse reporting address. Purchased quota never bypasses reputation limits. Recipients can unsubscribe without logging in; implement RFC 8058 one-click unsubscribe for marketing and a human-readable preference page. Complaint feedback is integrated where available, without promising individual complaints from every receiver.

Consent, privacy policy, terms, data deletion/export, required sender disclosures and jurisdiction-specific duties need qualified review for launch markets. This document does not claim legal compliance or select a business jurisdiction.

## Production infrastructure and launch prerequisites

Local development uses a test SMTP sink and simulated DNS, payment and transport events; all simulation is visibly labeled. It needs no sending IP, paid account, or externally delivered test email.

A controlled live pilot needs a platform-owned sending domain, dedicated application and Postal hosts, a suitable static IPv4, approved outbound port 25, inbound bounce routing, reverse-DNS control, TLS, evaluated IP reputation, off-server backups and operator availability. Hosting must explicitly permit the service's use case. Confirm these before buying hosting; cheap VPS pricing is insufficient.

For public production at the proposed envelope, plan independent transport nodes with independently persisted queues and evaluated/warmed IPs, multiple app/worker instances, PostgreSQL replication plus point-in-time recovery, redundant payload storage and tested restore/failover procedures. A PostgreSQL replica alone is not a backup. Postal HA behavior and its database/broker topology must be validated for the pinned release; two containers do not establish failover. Ambiguous in-flight delivery is reconciled during node failures, never replayed wholesale. A new IP is not assumed to inherit another IP's reputation or capacity.

Capacity expansion must be justified by load measurements and receiver feedback. Do not promise 10 million/month delivery on day one of IP warm-up. Budgeting depends on the actual payload sizes, available IPs, retained data, redundancy and operator costs; there is no established monthly cost commitment yet.

## Implementation sequence

1. Foundation: runnable local monorepo, authentication and tenancy, schemas, hosted identity proposal, plan editor, local subscription simulator, quota-safe send acceptance and local SMTP sink.
2. Delivery: pinned Postal deployment guide, tested transport adapter, signing/DNS verification, event ingestion and unknown-handoff recovery.
3. Product: templates, contacts/consent/import, campaign scheduling, unsubscribe, usage and message investigation, customer webhooks and operator suspensions.
4. Commercial: select payment processor/currency, implement verified lifecycle callbacks, invoices and entitlement reconciliation; remove production simulator paths.
5. Qualification: tenant leakage, quota races, duplicate requests/events, queue worker crashes, recovery, safety holds, marketing opt-outs, load and storage tests.
6. Controlled live pilot: verify port 25/PTR/authentication, pilot only with authorized recipients, monitor receiver responses, exercise on-call and backup recovery, gradually admit more traffic.

## Acceptance evidence

Before claiming the first milestone works: start services from documented commands; prove a complete local account-to-send-to-test-inbox path; verify two organizations cannot access each other's messages; run a concurrent quota test and an idempotent retry test; prove a worker restart preserves accepted work; verify unsubscribe/suppression blocks further applicable handoffs as features land. Never substitute screenshots for these integration checks.

Before claiming million-scale readiness: publish load-test environment and workload, accepted/processed recipient rates, backlog drain and recovery times, disk and database utilization, per-tenant fairness and duplicate outcomes; exercise a receiving-server outage, ambiguous handoff, billing rollover, duplicate/out-of-order payment event, database restore and transport-node failure. Synthetic tests validate software capacity, not real-world inbox placement. Production receiver acceptance requires a separate observed pilot.

## Builder choices and outstanding launch inputs

Builder-proposed defaults: Postal, TypeScript application stack, 10-million/month planning envelope, 250 recipients/second acceptance test, send-only hosted addresses, verified personal Reply-To, editable development tiers, hard quotas, next-cycle plan changes, and the staged scope above. These require approval as a whole before product scaffolding.

The business owner will later provide the brand/platform domain, merchant country and billing currency, final commercial tiers/prices, infrastructure budget, hosting account, target pilot customers and operator responsibility. These do not block local implementation with clearly marked placeholders. Full hosted mailboxes or actual Gmail/Outlook account sending would materially expand scope and need an explicit new design decision.

## Reference material checked on 27 October 2026

* Google sender guidelines: https://support.google.com/mail/answer/81126?hl=en
* Postal features: https://docs.postalserver.io/welcome/feature-list/
* Postal prerequisites: https://docs.postalserver.io/getting-started/prerequisites/
* Hetzner port restrictions: https://docs.hetzner.com/cloud/servers/faq/
