import type { LiveStatus } from './types'

// Normaliza `tournaments.status` (draft|open|in_progress|closed|published) al
// vocabulario de la vista en-vivo. La cabecera es la ÚNICA consumidora y usa la
// fuente canónica `tournament-status.ts` para label+tono, así que acá el único
// deber es NO MENTIR: 'open' (inscripciones abiertas, NO arrancado) jamás debe
// decir "en vivo", y 'published' (finalizado) jamás debe decir "borrador".
// 'active' sí es sinónimo histórico de in_progress (ver tournament-live-status).
export function normalizeStatus(raw: unknown): LiveStatus {
  if (raw === 'draft' || raw === 'open' || raw === 'in_progress' || raw === 'closed') return raw
  if (raw === 'active') return 'in_progress'
  if (raw === 'published' || raw === 'finished') return 'closed'
  return 'draft'
}
