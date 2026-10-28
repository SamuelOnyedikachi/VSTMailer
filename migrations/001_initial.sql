BEGIN;
CREATE TABLE IF NOT EXISTS plans (slug text PRIMARY KEY, name text NOT NULL, allowance integer NOT NULL CHECK (allowance > 0));
INSERT INTO plans VALUES ('launch','Launch',10000),('growth','Growth',100000),('scale','Scale',1000000) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS organizations (
 id uuid PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('active','pending','suspended')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), email text NOT NULL UNIQUE,
 name text NOT NULL, password_hash text NOT NULL, verified boolean NOT NULL DEFAULT false,
 verification_hash text UNIQUE, verification_expires timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
 token_hash text NOT NULL UNIQUE, prefix text NOT NULL, created_at timestamptz DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS cycles (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), plan_slug text NOT NULL REFERENCES plans(slug),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, allowance integer NOT NULL CHECK (allowance>0),
 reserved integer NOT NULL DEFAULT 0 CHECK (reserved>=0), consumed integer NOT NULL DEFAULT 0 CHECK (consumed>=0),
 CHECK (reserved+consumed<=allowance), CHECK (ends_at>starts_at), UNIQUE(org_id,starts_at)
);
CREATE INDEX IF NOT EXISTS cycle_lookup ON cycles(org_id,ends_at);
CREATE TABLE IF NOT EXISTS domains (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL UNIQUE,
 verification_token text NOT NULL, status text NOT NULL DEFAULT 'pending',
 dkim_selector text, dkim_value text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS identities (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), email text NOT NULL UNIQUE,
 label text NOT NULL, kind text NOT NULL CHECK(kind IN ('hosted','custom')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('active','pending')), domain_id uuid REFERENCES domains(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS suppressions (
 org_id uuid NOT NULL REFERENCES organizations(id), email text NOT NULL, reason text NOT NULL,
 created_at timestamptz DEFAULT now(), PRIMARY KEY(org_id,email)
);
CREATE TABLE IF NOT EXISTS templates (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
 subject text NOT NULL, html text NOT NULL DEFAULT '', text_body text NOT NULL DEFAULT '', updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contacts (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), email text NOT NULL,
 name text NOT NULL DEFAULT '', consent boolean NOT NULL DEFAULT false, consent_source text NOT NULL DEFAULT '',
 created_at timestamptz DEFAULT now(), UNIQUE(org_id,email)
);
CREATE TABLE IF NOT EXISTS campaigns (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
 subject text NOT NULL, html text NOT NULL DEFAULT '', text_body text NOT NULL DEFAULT '',
 identity_id uuid NOT NULL REFERENCES identities(id), status text NOT NULL DEFAULT 'draft',
 created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), cycle_id uuid NOT NULL REFERENCES cycles(id),
 identity_id uuid NOT NULL REFERENCES identities(id), campaign_id uuid REFERENCES campaigns(id),
 recipient text NOT NULL, subject text NOT NULL, html text NOT NULL DEFAULT '', text_body text NOT NULL DEFAULT '',
 reply_to text NOT NULL, kind text NOT NULL CHECK(kind IN ('transactional','marketing')),
 status text NOT NULL DEFAULT 'accepted', transport_id text,
 scheduled_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz DEFAULT now(),
 credit_state text NOT NULL DEFAULT 'reserved' CHECK (credit_state IN ('reserved','consumed','released')),
 unsubscribe_token text NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS messages_org_date ON messages(org_id,created_at DESC);
CREATE TABLE IF NOT EXISTS send_requests (
 org_id uuid NOT NULL REFERENCES organizations(id), key text NOT NULL, request_hash text NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,key)
);
CREATE TABLE IF NOT EXISTS outbox (
 id uuid PRIMARY KEY, message_id uuid NOT NULL UNIQUE REFERENCES messages(id), org_id uuid NOT NULL REFERENCES organizations(id),
 state text NOT NULL DEFAULT 'pending', claimed_at timestamptz, available_at timestamptz NOT NULL DEFAULT now(), attempts integer DEFAULT 0
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(available_at) WHERE state='pending';
CREATE TABLE IF NOT EXISTS usage_ledger (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), cycle_id uuid NOT NULL REFERENCES cycles(id),
 message_id uuid NOT NULL REFERENCES messages(id), action text NOT NULL CHECK(action IN ('reserve','consume','release')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(message_id,action)
);
CREATE TABLE IF NOT EXISTS events (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), message_id uuid REFERENCES messages(id),
 kind text NOT NULL, detail text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), external_id text UNIQUE
);
CREATE INDEX IF NOT EXISTS events_org_date ON events(org_id,created_at DESC);
CREATE TABLE IF NOT EXISTS local_inbox (
 id uuid PRIMARY KEY, recipient text NOT NULL, sender text NOT NULL, subject text NOT NULL,
 text_body text NOT NULL, html text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_log (
 id uuid PRIMARY KEY, org_id uuid REFERENCES organizations(id), action text NOT NULL, detail text NOT NULL DEFAULT '', created_at timestamptz DEFAULT now()
);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS batch_cursor integer NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS lease_at timestamptz;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS last_error text;
CREATE TABLE IF NOT EXISTS campaign_recipients (
 campaign_id uuid NOT NULL REFERENCES campaigns(id), ordinal integer NOT NULL,
 email text NOT NULL, PRIMARY KEY(campaign_id,ordinal), UNIQUE(campaign_id,email)
);
COMMIT;
