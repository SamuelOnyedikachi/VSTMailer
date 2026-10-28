BEGIN;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
CREATE TABLE IF NOT EXISTS oauth_identities (
 provider text NOT NULL CHECK(provider IN ('google','github','gitlab')),
 subject text NOT NULL, user_id uuid NOT NULL REFERENCES users(id), email_at_link text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(provider,subject), UNIQUE(user_id,provider)
);
CREATE TABLE IF NOT EXISTS oauth_flows (
 state_hash text PRIMARY KEY, provider text NOT NULL, verifier text NOT NULL,
 link_user_id uuid REFERENCES users(id), expires_at timestamptz NOT NULL
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_used_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address text NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent text NOT NULL DEFAULT '';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
CREATE TABLE IF NOT EXISTS delivery_settings (
 org_id uuid PRIMARY KEY REFERENCES organizations(id),
 enforce_api_ips boolean NOT NULL DEFAULT false,
 enforce_smtp_ips boolean NOT NULL DEFAULT false,
 payload_retention_days integer NOT NULL DEFAULT 7 CHECK(payload_retention_days BETWEEN 1 AND 90),
 log_retention_days integer NOT NULL DEFAULT 30 CHECK(log_retention_days BETWEEN 7 AND 365),
 CHECK(log_retention_days>=payload_retention_days)
);
CREATE TABLE IF NOT EXISTS authorized_ips (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), network cidr NOT NULL,
 label text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,network)
);
CREATE TABLE IF NOT EXISTS denied_ips (
 org_id uuid NOT NULL REFERENCES organizations(id), address inet NOT NULL,
 channel text NOT NULL CHECK(channel IN ('api','smtp')), last_seen timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 1, PRIMARY KEY(org_id,address,channel)
);
CREATE TABLE IF NOT EXISTS smtp_credentials (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
 username text NOT NULL UNIQUE, secret_hash text NOT NULL, prefix text NOT NULL,
 expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS blocked_domains (
 org_id uuid NOT NULL REFERENCES organizations(id), domain text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,domain)
);
CREATE TABLE IF NOT EXISTS tags (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,name)
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS payload_purged_at timestamptz;
CREATE TABLE IF NOT EXISTS message_tag_links (
 message_id uuid NOT NULL REFERENCES messages(id), tag_id uuid NOT NULL REFERENCES tags(id),
 PRIMARY KEY(message_id,tag_id)
);
COMMIT;
