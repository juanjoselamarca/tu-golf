/**
 * Tipos del Sistema de Inbox (Agente 5A).
 * Fuente de verdad: migration supabase/migrations/20260515010800_inbox_system.sql
 */

export type InboxStatus =
  | 'nuevo'
  | 'triaged'
  | 'en_progreso'
  | 'resuelto'
  | 'descartado'
  | 'error';

export type InboxPrioridad = 'critico' | 'alto' | 'medio' | 'bajo';

/**
 * Row tal cual viene de Supabase (snake_case, timestamps ISO).
 * Para uso en el cliente browser convertir a camelCase si hace falta.
 */
export type InboxReportRow = {
  id: string;
  telegram_message_id: number;
  telegram_chat_id: number;
  telegram_user_id: number | null;
  telegram_media_group_id: string | null;
  telegram_msg_date: string;
  texto: string | null;
  caption: string | null;
  fotos_paths: string[];
  audio_path: string | null;
  reply_to_report_id: string | null;
  recibido_en: string;
  editado_en: string | null;
  procesado_en: string | null;
  status: InboxStatus;
  prioridad: InboxPrioridad | null;
  categoria: string | null;
  ruta_afectada: string | null;
  resumen_corto: string | null;
  rama_fix: string | null;
  enlace_auditoria: string | null;
  notas: string | null;
};

/**
 * Insert payload (sin defaults manejados por DB).
 */
export type InboxReportInsert = {
  telegram_message_id: number;
  telegram_chat_id: number;
  telegram_user_id?: number | null;
  telegram_media_group_id?: string | null;
  telegram_msg_date: string;
  texto?: string | null;
  caption?: string | null;
  fotos_paths?: string[];
  audio_path?: string | null;
  reply_to_report_id?: string | null;
  status?: InboxStatus;
};
