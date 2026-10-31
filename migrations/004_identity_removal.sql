ALTER TABLE identities ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE identities DROP CONSTRAINT IF EXISTS identities_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS identities_live_email ON identities(email) WHERE deleted_at IS NULL;
