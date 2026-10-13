-- Cooldown independiente para el sync de tarjetas (spec D4: desacoplado del
-- sync de índice, que usa fedegolf_credentials.ultimo_sync).
ALTER TABLE fedegolf_credentials
  ADD COLUMN IF NOT EXISTS ultimo_sync_tarjetas TIMESTAMPTZ;

COMMENT ON COLUMN fedegolf_credentials.ultimo_sync_tarjetas IS
  'Último sync de tarjetas del índice (cooldown propio, independiente de ultimo_sync).';
