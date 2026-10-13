-- Columnas base de suscripción en profiles.
-- Default = free/active: todos los usuarios existentes quedan en el plan gratis
-- sin cambio de comportamiento (el gating real lo decide NEXT_PUBLIC_PAYWALL_ENABLED).

DO $$ BEGIN
  CREATE TYPE subscription_tier AS ENUM ('free', 'pro', 'pro_plus');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('active', 'trialing', 'past_due', 'paused', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_tier        subscription_tier   NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status      subscription_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_rounds_remaining   integer,
  ADD COLUMN IF NOT EXISTS trial_ends_at            timestamptz,
  ADD COLUMN IF NOT EXISTS is_founding_member       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founding_member_at       timestamptz;

COMMENT ON COLUMN profiles.subscription_tier IS 'Plan del usuario: free | pro | pro_plus.';
COMMENT ON COLUMN profiles.subscription_status IS 'Estado de suscripción: active | trialing | past_due | paused | canceled.';
COMMENT ON COLUMN profiles.trial_rounds_remaining IS 'Rondas restantes del reverse trial (NULL = no en trial).';
COMMENT ON COLUMN profiles.is_founding_member IS 'Socio Fundador: precio bloqueado de por vida.';
