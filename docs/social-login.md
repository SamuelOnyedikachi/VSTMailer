# Google, GitHub and GitLab sign-in

Both signup and login show all three providers. A button becomes available only when the API process has that provider’s client ID and secret. No developer credentials are bundled. OAuth authenticates identity only; it does not connect a mailbox or grant sending rights through Gmail.

Create a web OAuth application with each provider, then set its variables in the ignored `.env` (or production secret manager):

| Provider | Variables | Exact callback for local development |
| --- | --- | --- |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `http://localhost:3000/api/auth/oauth/google/callback` |
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | `http://localhost:3000/api/auth/oauth/github/callback` |
| GitLab.com | `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET` | `http://localhost:3000/api/auth/oauth/gitlab/callback` |

Use the production HTTPS `APP_URL` instead of localhost for deployed callbacks. Register separate local and production apps. Restart the API after changing secrets. Keep provider app test-user restrictions in mind during a pilot.

Scopes: Google `openid email profile`; GitHub `read:user user:email`; GitLab `openid email profile read_user`. GitLab’s `read_user` is used to confirm a private verified email when OIDC userinfo does not expose it. This release supports GitLab.com, not arbitrary self-hosted issuers.

Flows use authorization codes, PKCE S256, one-use server-side state with a ten-minute expiry and an HTTP-only browser cookie. Provider API responses establish the verified email and stable subject; browser-supplied identity claims are not trusted. Provider access tokens are used transiently and are not saved.

An existing email account is never silently linked to a provider. Sign in using the existing method, open **Security**, and explicitly link it. A new social user gets a verified account and a workspace; production workspace approval is still required. A provider account can belong to only one local account.

Validation includes simulated provider responses for success, replay, mismatched state, expiry, unverified emails and explicit linking. Live provider sign-in still requires owner-supplied apps and a live browser test.

Official setup references: [Google web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [GitHub OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [GitLab OAuth](https://docs.gitlab.com/api/oauth2/).
