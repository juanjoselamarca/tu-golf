# Eventos de Telemetria — Organizar Campeonato

Documento canonico de los eventos PostHog emitidos por el flow
"Organizar Campeonato" (tabla `tournament_drafts`).

Helper centralizado: `src/lib/draft/telemetry.ts` (export `trackDraftEvent`, `DRAFT_EVENTS`).
Para errores: `captureError` en `src/lib/error-tracking.ts` (PostHog + Supabase `error_logs`).

## PostHog events

Todos los eventos se almacenan en `analytics_events` via `trackEvent(supabase, userId, eventType, eventData)`.
El campo `event_type` corresponde a la columna "Evento" abajo; el campo `event_data` (jsonb)
recibe el objeto "Props".

| Evento | Trigger | Props | Wired? |
|---|---|---|---|
| `tournament_draft_created` | POST /api/torneos/draft (crear nuevo) | `{ schema_version, source: 'fresh' \| 'duplicate' }` | DONE (POST /api/torneos/draft) |
| `tournament_draft_updated` | PATCH /api/torneos/draft/[id] | `{ draft_id, source: 'manual' \| 'ai', section_changed?: string }` | TODO |
| `tournament_draft_assistant_called` | POST /api/torneos/draft/[id]/assistant | `{ draft_id, cost_usd, latency_ms, needs_confirmation_count }` | TODO |
| `tournament_draft_abandoned` | Cron cleanup (al archivar) | `{ draft_id, days_since_creation, sections_completed }` | TODO |
| `tournament_draft_collaborator_added` | POST collaborators | `{ draft_id, via: 'search' \| 'share_link' }` | TODO |
| `tournament_draft_preview_opened` | POST /preview | `{ draft_id, format }` | TODO |
| `tournament_created_from_draft` | POST /create-tournament (exito) | `{ tournament_id, format, total_rounds, has_categories, was_assisted_by_ai, was_duplicated }` | TODO |

## Error capture

Para errores ocurridos dentro del flow, usar `captureError` con contexto semántico:

```ts
import { captureError } from '@/lib/error-tracking'

try {
  // ...
} catch (err) {
  captureError(err, {
    context: 'tournament_draft.update',
    meta: { draft_id, version, actor_id, last_action },
  })
}
```

PostHog recibe el evento (cliente) y `error_logs` (Supabase) lo persiste como backup.
El campo `meta` queda como JSONB consultable desde admin.

> Histórico: hasta el 12-may-2026 usábamos Sentry vía `setDraftSentryContext`. Se
> retiró al expirar el trial gratis — el reemplazo `captureError` es vendor-neutral.

## Wire-up status

El helper `trackDraftEvent` esta creado en `src/lib/draft/telemetry.ts`. La integracion
de las llamadas en los demas endpoints es follow-up explicito — se dejo intencionalmente
sin wirear para mantener el cambio minimo de Wave 4 (un solo lugar como ejemplo:
`POST /api/torneos/draft`).

Una sub-fase posterior de "telemetria on" agrega los `trackDraftEvent(...)` en cada
endpoint donde el evento aplique (ver columna "Wired?").

## Dashboard

URL pendiente: `/admin/torneos-stats`. Schema y vista estan listos para implementacion
en Fase 6.5 del spec.

## Alarmas

- Costo IA mensual > $100 USD → email al admin del proyecto. Implementacion en cron
  `cleanup-drafts` o cron dedicado `ai-cost-monitor`.
