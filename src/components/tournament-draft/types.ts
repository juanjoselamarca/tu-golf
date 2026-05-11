// src/components/tournament-draft/types.ts
//
// Tipos compartidos del AssistantPanel y subcomponentes.
// Self-contained: no depende de la UI específica del editor de torneos.

import type {
  TournamentConfig,
  TournamentConfigPartial,
} from '@/lib/draft/types'

/**
 * Rol del mensaje en el chat del asistente.
 * - 'user'      → el organizador
 * - 'assistant' → tAIger+ (IA)
 * - 'system'    → mensaje de sistema (errores, avisos)
 */
export type MessageRole = 'user' | 'assistant' | 'system'

/**
 * Mensaje del chat (estado local del AssistantPanel).
 */
export interface AssistantMessage {
  /** id local generado en cliente (uuid v4 o `${Date.now()}-${rand}`) */
  id: string
  role: MessageRole
  text: string
  /** timestamp ms (Date.now()) — para sort y display relativo */
  timestamp: number
  /** Para mensajes 'assistant': campos que la IA marcó como needs_confirmation */
  needsConfirmation?: string[]
  /** Para mensajes 'system': severidad del aviso */
  severity?: 'info' | 'warning' | 'error'
}

/**
 * Shape de la respuesta del endpoint `/api/torneos/draft/[id]/assistant`.
 * Espejo del response del route (Wave 2).
 */
export interface AssistantApiResponse {
  ok: true
  draft: {
    id: string
    version: number
    config: TournamentConfig
  }
  explanation: string
  needs_confirmation: string[]
  cost_usd: number
}

/**
 * Shape de error del endpoint. Códigos típicos:
 * - 401 no autenticado
 * - 404 draft no encontrado
 * - 409 conflict (otro admin editó)
 * - 429 rate_limit | loop_detected
 * - 502 IA inválido (formato o estructura)
 * - 503 IA no disponible (timeout/circuit breaker)
 */
export interface AssistantApiError {
  error: string
  retry_after_ms?: number
  details?: unknown
}

/**
 * Callback que el AssistantPanel invoca cuando aplica un cambio.
 * El editor (Agent G) escucha esto para actualizar el store, disparar
 * highlight visual y abrir el UndoToast.
 *
 * @param partial  Estimación local del partial aplicado (solo informativo;
 *                 el state real viene de `nextConfig`). Útil para saber qué
 *                 campos resaltar en amarillo si el editor no quiere diffear.
 * @param nextConfig  El config completo que devolvió el servidor luego del
 *                    merge. **Fuente de verdad** — el editor debe setear esto
 *                    como nuevo state.
 * @param explanation  Texto en español del IA explicándole al organizador.
 * @param needsConfirmation  Field paths que la IA marcó como inseguros.
 */
export type OnAssistantChangeApplied = (
  partial: TournamentConfigPartial,
  nextConfig: TournamentConfig,
  explanation: string,
  needsConfirmation: string[],
) => void

/**
 * Callback opcional para el botón "Deshacer" del UndoToast.
 * El editor debe revertir el último cambio aplicado (de su propio undo stack).
 */
export type OnAssistantUndo = () => void

/**
 * Estado de loading del AssistantPanel.
 */
export type AssistantStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; retryAfterMs?: number }

/**
 * Props del AssistantPanel.
 */
export interface AssistantPanelProps {
  /** UUID del draft activo (lo pasa el editor desde la URL). */
  draftId: string
  /** Callback invocado cuando el server confirma un cambio. */
  onChangeApplied: OnAssistantChangeApplied
  /** Callback opcional del botón Deshacer del toast. */
  onUndo?: OnAssistantUndo
  /** Mensajes iniciales del chat (greeting opcional). */
  initialMessages?: AssistantMessage[]
  /** Override de URL del endpoint (para testing). */
  endpointOverride?: string
  /** className adicional para el contenedor raíz. */
  className?: string
}
