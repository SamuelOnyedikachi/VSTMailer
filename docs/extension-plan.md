# Social login and delivery controls

Owner request, 28 October 2026: resume VSTMailer; add Continue with Google, GitHub and GitLab on login/signup; study the supplied Brevo settings references and extend the platform.

## Implementation decisions

Preserve the existing stack, original Velion logo, Nigeria registration and USD billing. Use server-side authorization-code OAuth with one-time browser-bound state, PKCE S256, verified provider email and stable provider subject IDs. Existing email accounts are never silently linked; linking requires an authenticated account. Request identity scopes only, never mailbox sending access. Buttons remain visible but unavailable until provider app credentials are configured.

Implement SMTP submission as a separate authenticated entry point that feeds the same quota-safe durable acceptance service. SMTP keys are distinct from API keys, hashed at rest and revocable. Production SMTP requires TLS. IP restrictions are separately configurable for API and SMTP credentials, enforce the real peer address, and cannot lock the owner out of browser settings. Add sender/domain diagnostics, blocked recipients/domains, tags and retention policies based on the reference screenshots. Dedicated IPs, SMS carrier integrations, webhooks and tracking are represented only to the extent actually implemented; never show fabricated infrastructure or active integrations.

## Work and verification

- Recover the prior local services and record the interrupted test/review status.
- Add idempotent schema extensions and OAuth services, with tests for PKCE/state, replay, verified email, explicit linking and account isolation.
- Add OAuth routes and buttons to both auth modes, provider configuration guidance and clear setup states.
- Add SMTP credentials, real SMTP submission, API key expiry/last-use metadata and separate CIDR policies. Test correct/incorrect credentials, unauthorized senders, quota consumption and spoofed forwarding headers.
- Extend sender and transactional settings with actual database-backed controls, and document remaining Brevo-inspired features.
- Run full PostgreSQL integration tests, TypeScript, production build and HTTP/SMTP smoke checks. Inspect desktop/mobile in the available browser if supported; disclose unavailable checks.

No third-party OAuth app registration, secret discovery, public deployment, external email, carrier purchase or live payment is implied. The owner supplies app credentials through the ignored environment file. Continue the already approved implementation without another design approval round.
