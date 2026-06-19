-- profiles: add birth_date (replaces age as the identity field),
-- last_used_organization_id (multi-org last-used routing),
-- and a partial unique index on phone_number (account-level uniqueness).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS last_used_organization_id uuid
    REFERENCES organizations(id) ON DELETE SET NULL;

-- NULL and empty phone rows are excluded so incomplete onboarding rows
-- do not conflict; uniqueness is enforced only once a phone is set.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_number_unique
  ON profiles(phone_number)
  WHERE phone_number IS NOT NULL AND phone_number <> '';
