CREATE TABLE IF NOT EXISTS domain_setup_flows (
 state_hash text PRIMARY KEY, domain_id uuid NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL
);
