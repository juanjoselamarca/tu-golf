-- =========================================================
-- Migration: Inbox System (Agente 5A)
-- WHY: cierra el feedback loop "bug en cancha → CTO fixea" en <30s.
--      Habilitador del roadmap CERO FALLOS — sin pasar por laptop.
-- Idempotente: re-ejecutable sin romperse.
-- =========================================================

-- ──────────────────────────────────────────────
-- Tabla
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbox_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Telegram refs
  telegram_message_id BIGINT NOT NULL,
  telegram_chat_id BIGINT NOT NULL,
  telegram_user_id BIGINT,
  telegram_media_group_id TEXT,
  telegram_msg_date TIMESTAMPTZ NOT NULL,  -- msg.date del payload, NO now() (evita clock skew)

  -- Contenido
  texto TEXT,
  caption TEXT,
  fotos_paths TEXT[] NOT NULL DEFAULT '{}',
  audio_path TEXT,

  -- Hilo
  reply_to_report_id UUID REFERENCES inbox_reports(id) ON DELETE SET NULL,

  -- Timestamps
  recibido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  editado_en TIMESTAMPTZ,
  procesado_en TIMESTAMPTZ,

  -- Triage (lo llena el agente 5B con /inbox)
  status TEXT NOT NULL DEFAULT 'nuevo'
    CHECK (status IN ('nuevo', 'triaged', 'en_progreso', 'resuelto', 'descartado', 'error')),
  prioridad TEXT CHECK (prioridad IN ('critico', 'alto', 'medio', 'bajo')),
  categoria TEXT,
  ruta_afectada TEXT,
  resumen_corto TEXT,
  rama_fix TEXT,
  enlace_auditoria TEXT,
  notas TEXT,

  -- Dedupe: un mismo (message_id, chat_id) solo existe una vez
  UNIQUE (telegram_message_id, telegram_chat_id)
);

-- ──────────────────────────────────────────────
-- Índices
-- ──────────────────────────────────────────────
-- Listar pendientes rápido (Agente 5B)
CREATE INDEX IF NOT EXISTS idx_inbox_status_nuevo
  ON inbox_reports(recibido_en DESC) WHERE status = 'nuevo';

-- Lookup de álbum reciente (ventana 60s en msg.date)
CREATE INDEX IF NOT EXISTS idx_inbox_media_group
  ON inbox_reports(telegram_media_group_id, telegram_msg_date DESC)
  WHERE telegram_media_group_id IS NOT NULL;

-- Lookup de reply (telegram_message_id dentro de un chat)
CREATE INDEX IF NOT EXISTS idx_inbox_msgid_chat
  ON inbox_reports(telegram_message_id, telegram_chat_id);

-- ──────────────────────────────────────────────
-- RLS
-- Deny por default para anon/authenticated.
-- service_role bypasea RLS por diseño de Supabase.
-- El webhook usa service_role; ningún cliente browser toca esta tabla.
-- ──────────────────────────────────────────────
ALTER TABLE inbox_reports ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────
-- Comentarios (documentación inline para que se vea desde Supabase Studio)
-- ──────────────────────────────────────────────
COMMENT ON TABLE inbox_reports IS
  'Reportes recibidos via bot privado Telegram → triage por Claude CTO con /inbox.';
COMMENT ON COLUMN inbox_reports.telegram_msg_date IS
  'Timestamp original del mensaje Telegram (msg.date). Usado para ventana media_group sin clock skew vs now().';
COMMENT ON COLUMN inbox_reports.status IS
  'State machine: nuevo → triaged → en_progreso → resuelto/descartado. error si falla descarga.';
COMMENT ON COLUMN inbox_reports.reply_to_report_id IS
  'UUID interno (NO telegram_message_id) — resuelto al insertar para mantener integridad referencial.';

-- ──────────────────────────────────────────────
-- Bucket de Storage (idempotente via ON CONFLICT)
-- ──────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inbox-photos',
  'inbox-photos',
  false,
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'audio/ogg', 'audio/mpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS: sin policies explícitas para anon/authenticated.
-- service_role bypasea. El webhook firma signed URLs cuando 5B necesite leer.
