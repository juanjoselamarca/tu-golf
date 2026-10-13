-- Gate de acceso al coach tAIger+. Default false = pantalla "próximamente".
-- Beta testers se habilitan manualmente.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS coach_access_enabled boolean NOT NULL DEFAULT false;

-- Habilitar beta testers actuales
UPDATE profiles SET coach_access_enabled = true
WHERE id IN (
  '98c5cb7a-1c0b-4a64-a773-8bd013a92317',  -- Juanjo
  'a6e0df09-e259-4229-bdb0-f1cb0558e98b'   -- Nicolás Claro
);
