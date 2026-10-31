# Manual and automatic domain setup

Domain cards now offer Configure manually (the exact TXT ownership record, provisioned DKIM values, copy controls and verification) and Configure automatically (Domain Connect provider handoff).

Automatic DNS is an integration boundary, not an active universal provider connection. Localhost cannot serve a provider-approved HTTPS callback. The current registry is empty. DKIM provisioning is also required before a complete automatic record request. The UI explains missing prerequisites rather than redirecting to a guessed hosting website.

## Commissioning a provider

1. Choose the public HTTPS APP_URL for VSTMailer.
2. Publish/onboard a Domain Connect template with the DNS provider using VST's real providerId/serviceId, approved return domain, ownershipToken, dkimSelector and dkimValue variables.
3. The template must write TXT `_vstmailer` = `vstmailer-verification=%ownershipToken%` and TXT `%dkimSelector%._domainkey` = `%dkimValue%`. Do not overwrite MX, existing SPF or DMARC.
4. Configure DOMAIN_CONNECT_PROVIDERS as an operator-owned JSON registry, keyed by the exact `_domainconnect.<customer-domain>` discovery TXT hostname. Each entry supplies applyUrl (the provider's trusted urlSyncUX base), providerId and serviceId. Only registered providers may receive handoffs. No untrusted DNS-discovered HTTP endpoint is fetched by the server.
5. Test login, consent, cancellation, callback, DNS propagation and actual template support for that provider before enabling its registry entry. The user authenticates directly with the DNS provider; VST does not collect the password.

Registry shape (illustrative, not a working provider):

```json
{"dns.provider.example":{"applyUrl":"https://dns.provider.example/domain-connect","providerId":"YOUR_REAL_VST_DOMAIN","serviceId":"mail"}}
```

Providers requiring digitally signed requests are rejected by this release. Cloudflare requires signing and template onboarding; it is not enabled by adding an ordinary registry entry. Set requiresSigning:true for such providers until a signing implementation is commissioned. The callback nonce is embedded in the return URI as well as state, since provider state handling varies.

The callback requires the same authenticated user, a matching HTTP-only browser cookie, an unexpired one-use server flow and a domain in that user's workspace. It independently checks ownership and DKIM DNS after return. DNS changes may propagate later; Check authentication records can retry. Ownership status can advance, but no sender automatically activates and no return parameter can declare successful verification.

Official protocol/setup references: https://www.domainconnect.org/getting-started and https://developers.cloudflare.com/dns/reference/domain-connect/ . An Entri or provider-specific alternative would require a separate integration and service credentials.
