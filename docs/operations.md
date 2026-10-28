# VSTMailer operations

## Runtime boundaries

The API, worker and web application are separate processes. PostgreSQL owns users, allowances, durable messages, outbox, campaign snapshots and events. Local SMTP capture is a separate loopback-only process; it is prohibited when APP_MODE=production. The Next.js dashboard proxies same-origin `/api` to Fastify; keys remain server-side for integrations.

The root `.env` is ignored. Never commit credentials, mail content, database backups or `.env.production`. Keep a separate application auth domain, hosted sending domain, and corporate domain. Preserve the original logo asset's provenance: user attachment, unmodified.

## Postal commissioning

Use the upstream installation and prerequisites at https://docs.postalserver.io/getting-started/installation/ and https://docs.postalserver.io/getting-started/prerequisites/. Evaluate and pin the exact release, image digest, license and its database/broker dependencies before deployment. Postal is not installed or configured on this machine, and the adapter is not yet validated against a live Postal instance.

1. Confirm the host permits a commercial multi-customer mail service and outbound TCP 25. Confirm static IPv4, PTR control and existing IP reputation before purchasing.
2. Provision Postal on separate hosts with durable storage and the release's supported dependencies. Do not assume application PostgreSQL replaces Postal's database.
3. Configure forward/reverse DNS, DKIM, SPF, DMARC, bounce routing and TLS. Keep auth mail and transactional/marketing sending streams distinct.
4. Provision platform/customer domains in Postal's operator UI. The public Postal API does not support all management functions, so VSTMailer does not pretend to automate provisioning.
5. Create a server API credential and configure POSTAL_URL and POSTAL_API_KEY. Production startup refuses local transport, example sending domains, missing HTTPS and missing service secrets.
6. Confirm actual sender authorization in Postal, then approve a hosted workspace using the secret-protected operator endpoint. Never approve an identity just because a customer paid.
7. Commission a private event gateway for the chosen Postal version. Validate the actual raw webhook authentication, map tags and per-recipient transport IDs to our message UUID, and persist/retry delivery to `/internal/delivery-events` with `X-VST-Ingress-Token`. This endpoint accepts normalized events; it is not a drop-in raw Postal webhook or an unverified signature check.
8. Exercise SMTP deferrals, negative responses, bounce routing and uncertain HTTP handoff recovery using authorized pilot recipients. Expand traffic gradually according to receiver feedback.

Custom domains remain pending after ownership verification until transport/DKIM provisioning is complete. Activating custom identities needs an operator provisioning workflow; the initial UI never marks them live from a TXT ownership check alone.

## Operator endpoints

Treat operator/API ingress routes as private network resources. Block `/api/operator/*` and `/api/internal/*` at the public reverse proxy and access Fastify privately. Use separate random secrets (at least 32 characters) for OPERATOR_TOKEN and POSTAL_INGRESS_TOKEN; rotate them outside the source repository.

* `POST /operator/workspaces/:id/approve`, X-VST-Operator-Token, body `{"confirmProvisioned":true}`: approve a provisioned hosted identity and workspace.
* `POST /operator/workspaces/:id/suspend`: stop new API acceptance and application handoff. Already submitted Postal mail requires an explicit transport queue hold.
* `POST /operator/messages/:id/resolve`, body `{"outcome":"accepted|not_accepted","evidence":"operator investigation reference"}`: reconcile an uncertain handoff. Resubmit only after proving the transport did not accept it.
* `POST /internal/delivery-events`, X-VST-Ingress-Token, body `{eventId,messageId,kind,detail}`. Kinds: delivered_to_server, deferred, bounced, complaint. Deduplication uses stable external event IDs; the gateway must include the transport-node namespace.

Do not expose local-mode database or inbox endpoints to the Internet. Local inbox messages include account verification links. Disable demo/simulator routes in production; never reuse the development database or credentials for public production.

## Accounting

One recipient reserves one credit at durable acceptance. Successful transport handoff consumes it. Post-acceptance suppression releases it once; transport retries do not add charges. Unknown handoffs retain reservations until reconciled. Scheduled work reserves against the original cycle. Known suppressed recipients reserve nothing. Marketing requires recorded consent and uses one-click unsubscribe. A monthly allowance does not override sender or recipient-provider throttling.

Campaign recipients are snapshotted once and prepared in batches of 100; permission and suppressions are rechecked before dispatch. If a batch exceeds the available quota, preparation pauses as quota_exhausted. After an allowance change, Resume uses the existing snapshot and cursor. Already accepted mail remains traceable by recipient.

## Availability and storage

The current local deployment is a single-database development topology. Public million-scale readiness additionally needs database replication/PITR, independently durable transport nodes, fair destination-aware throttling, transport-node namespaces and credentials, congestion controls, persistent payload storage/lifecycle, tested restore and operator alerting. These are qualification/commissioning work, not supplied guarantees.

Back up PostgreSQL and Postal state independently and encrypt the off-server copies. Test restores on separate hosts. Monitor pending/unknown counts, age of oldest queued mail, cycle projections vs usage_ledger, worker liveness, database/disk growth and receiver feedback. A replica is not a backup. Do not delete deferred or uncertain payloads. Automated retention sweeps and object-storage migration have not been enabled in this first local foundation.

## Payments and USD

Owner-confirmed country: Nigeria. Currency: USD. No final plan prices or merchant credentials exist in this checkout. Paystack documents USD collection for Nigerian businesses, subject to account eligibility and a Zenith Bank USD domiciliary payout account: https://support.paystack.com/en/articles/2130690. Its recurring billing documentation is https://paystack.com/docs/payments/subscriptions/.

Before selecting/activating Paystack, verify the merchant account can use USD recurring card payments, confirm settlement eligibility, agree plan prices, implement signature-verified and independently verified payments, idempotent entitlement changes and cancellation/failed-renewal behavior, and run sandbox lifecycle tests. Local simulation is not a payment integration and must not grant production paid entitlements.
