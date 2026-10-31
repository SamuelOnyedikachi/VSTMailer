# Delivery controls and the Brevo references

The owner’s screenshots informed these workflows. Screenshot account names, credentials and IP addresses are not copied into VSTMailer.

| Capability | Current behavior |
| --- | --- |
| Google / GitHub / GitLab signup and login | Server-side OAuth; owner must configure provider apps. Explicit account linking in Security. |
| Senders and domains | Hosted send-only address, custom-domain ownership verification, pending sender activation. Authentication TXT diagnostics distinguish missing records, lookup errors and unprovisioned DKIM. Record presence is not an alignment certification. |
| SMTP submission | Separate authenticated server, hashed one-time credentials, expiry, last use, revocation, active sender checks. Feeds the shared quota-safe queue. |
| API keys | One-time token, hashed storage, expiry, last use and revocation. |
| Authorized IPs | IPv4/IPv6 CIDRs; separate API/SMTP enforcement and recent denied-source counts. Browser owner settings remain reachable. Forwarding headers trusted only from explicitly configured proxy CIDRs. |
| Sessions | View and revoke your own active browser sessions. |
| Blocked recipients / domains | Tenant-scoped suppression; domain blocks include subdomains. Rechecked immediately before worker handoff. |
| Tags | Saved workspace tags; send up to ten per API message request using `tags: ["receipt"]`. Attached to message details. |
| Retention | Finished previews default seven days, events thirty days; adjustable within documented bounds. Worker sweeps once a minute. Pending/ambiguous submissions and accounting records retained. |
| Dedicated IPs / cadence | Production provisioning and reputation controls still required; no IPs assigned by this build. |
| 2FA | Planned; not implemented. |
| Outbound webhooks / open-click tracking | Planned. Internal authenticated Postal ingress exists; customer subscriptions and tracking pixels do not. |
| SMS | Planned carrier integration. No SMS purchase or delivery is active. |

## SMTP startup

`npm run dev` starts the authenticated submission server at loopback port **2587** as well as the delivery capture inbox at **1025**. These are different services. Create credentials under **SMTP & API → SMTP credentials** and use the generated username/password in your server application. Use an active workspace From address. Reuse the same Message-ID on a retry of the same payload. A changed payload with the same ID is rejected. Without Message-ID, a client cannot rely on submission deduplication.

Marketing submissions must set `X-VSTMailer-Category: marketing` and have recipient consent recorded. Maximum 100 recipients and 6 MiB MIME input, no attachments in this version. Use an explicit Message-ID for retry safety. SMTP acknowledges only durable acceptance, not inbox delivery. Quota exhaustion returns a temporary SMTP error; check the cycle and avoid uncontrolled client retry loops.

Production requires `APP_MODE=production`, `SMTP_SUBMISSION_ENABLED=true`, TLS key/certificate files and commissioned self-hosted Postal delivery. Select `SMTP_SUBMISSION_HOST`, `SMTP_SUBMISSION_PORT` and `SMTP_PUBLIC_HOST` deliberately. Local plaintext AUTH binds to loopback. Compose exposes the development port only on loopback; it is not a production deployment recipe.

`TRUSTED_PROXY_CIDRS` must contain only known reverse-proxy networks. With no value, the API uses its actual socket peer and ignores forwarded IP headers. TLS termination and SMTP peer-IP handling require deployment-specific validation.

Retention preserves message summaries, idempotency results, billing cycles and usage ledger rows. Full account deletion and compliance-specific retention require a separate policy. Backups must follow the same policy; deleting previews here does not purge old database backups.
