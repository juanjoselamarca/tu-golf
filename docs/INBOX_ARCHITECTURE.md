# Sistema de Inbox — Arquitectura

## WHY

Habilitador del roadmap **CERO FALLOS**. Cierra el feedback loop
"bug en cancha → CTO fixea" en <30 segundos sin pasar por el laptop.

Antes: Juanjo detecta bug en torneo → anota → llega al laptop → reporta →
triage → fix. Tarda horas/días. Muchos bugs se pierden.

Ahora: Juanjo manda foto + texto a `@Golfers_App_Bot` desde la cancha →
webhook persiste en Supabase → Claude consume con `/inbox` (Agente 5B).

## Flujo

```
[Juanjo en Telegram con @Golfers_App_Bot]
         │ POST + X-Telegram-Bot-Api-Secret-Token
         ▼
/api/inbox/webhook (Vercel Fluid Compute, maxDuration=60s)
         │
         ├──► Supabase DB (inbox_reports, RLS service_role only)
         └──► Supabase Storage (bucket inbox-photos privado, cap 10MB)
         │
         ▼
[Agente 5B local: /inbox triage → rama_fix → fix → cerrar]
```

## Tabla `inbox_reports`

| Columna | Tipo | Para qué |
|---|---|---|
| `id` | UUID | PK interno |
| `telegram_message_id` | BIGINT | Para dedupe + reply lookup |
| `telegram_chat_id` | BIGINT | Identifica el chat (allowlist) |
| `telegram_user_id` | BIGINT | Quién mandó (opcional) |
| `telegram_media_group_id` | TEXT | Identificador de álbum (foto múltiple) |
| `telegram_msg_date` | TIMESTAMPTZ | Timestamp del payload Telegram (NO `now()` — evita clock skew) |
| `texto` | TEXT | Mensaje de texto |
| `caption` | TEXT | Caption de foto/audio |
| `fotos_paths` | TEXT[] | Paths en bucket (1+ por álbum) |
| `audio_path` | TEXT | Path único de audio |
| `reply_to_report_id` | UUID FK | Hilo: UUID interno, NO telegram_message_id |
| `recibido_en` | TIMESTAMPTZ | Cuándo lo recibió el webhook (server time) |
| `editado_en` | TIMESTAMPTZ | Si el user editó el mensaje en Telegram |
| `procesado_en` | TIMESTAMPTZ | Cuándo 5B lo cerró |
| `status` | TEXT | State machine (ver abajo) |
| `prioridad` | TEXT | `critico` / `alto` / `medio` / `bajo` |
| `categoria` | TEXT | Free-form: "scorer", "auth", "ui", etc. |
| `ruta_afectada` | TEXT | URL del bug (ej. `/torneo/X/score`) |
| `resumen_corto` | TEXT | Para listas/dashboards |
| `rama_fix` | TEXT | Branch que cierra el reporte |
| `enlace_auditoria` | TEXT | Link a Linear, PR, audit |
| `notas` | TEXT | Notas internas del triage |

## State machine

```
nuevo ─► triaged ─► en_progreso ─► resuelto
   │         ▲             │
   │         └── descartado◄
   ▼
 error    (si falla descarga / mime / size)
```

- `nuevo`: recién recibido, sin tocar.
- `triaged`: clasificado (prioridad, categoría) pero sin fix asignado.
- `en_progreso`: hay una rama trabajando.
- `resuelto`: mergeado a main.
- `descartado`: no es bug / duplicado / fuera de scope.
- `error`: fallo de procesamiento (descarga Telegram, upload Storage,
  mime no permitido, size > 10MB). Lo arregla un humano o reintento manual.

## Storage path

```
reports/YYYY/MM/<uuid>.<ext>
```

`<ext>` viene del **MIME whitelist** (`MIME_TO_EXT` en `src/lib/telegram-inbox.ts`),
NUNCA del filename original. Razón: vector path traversal (`../../etc/passwd`).

MIMEs permitidos:
- `image/jpeg` → `jpg`
- `image/png` → `png`
- `image/webp` → `webp`
- `audio/ogg` → `ogg`
- `audio/mpeg` → `mp3`

Cualquier otro mime → `sendMessage("❌ tipo de archivo no soportado")` y
NO se inserta.

## Seguridad (3 capas + redaction)

1. **Telegram secret_token header** (`X-Telegram-Bot-Api-Secret-Token`).
   Timing-safe compare con early return en longitudes distintas. 401 si falla.
2. **chat_id allowlist** (`TELEGRAM_ALLOWED_CHAT_ID`). 200 silencioso si no
   coincide (no leakeamos existencia del bot a terceros).
3. **Supabase RLS** habilitado, sin policies explícitas para anon/authenticated.
   `service_role` bypasea por diseño. El browser nunca toca esta tabla.

**Redaction**: `src/lib/inbox-logger.ts` aplica regex de redaction a todos
los strings antes de imprimir. Patterns:
- `bot\d+:[A-Za-z0-9_-]+` (bot tokens)
- `sbp_[A-Za-z0-9]{40,}` (Supabase Management tokens)
- JWTs (`eyJ...`).

Errors hacen bridge a `Sentry.captureMessage` si está disponible globalmente.

## Webhook flow (POST /api/inbox/webhook)

```
[Telegram update]
        ▼
auth header ─► 401 si falla
        ▼
parse zod ─► 200 silencioso si rompe
        ▼
msg = update.message ?? update.edited_message
        ▼
¿comando?
   /start, /help ──► responder SIN allowlist (bootstrap)
   otro comando  ──► validar allowlist ──► /pendientes /historial /borrar_ultimo
   no-comando    ──► validar allowlist ──► procesar media + INSERT/UPDATE
        ▼
✓ recibido (o ✓ editado si edit)
        ▼
200 (siempre)
```

## Comandos disponibles

- **`/start`** — info inicial + chat_id del usuario. **Exento de allowlist**
  (bootstrap huevo-gallina).
- **`/help`** — lista de comandos. **Exento de allowlist**.
- **`/pendientes`** — count de `status='nuevo'`.
- **`/historial`** — últimos 10 reportes (texto truncado a 50 chars).
- **`/borrar_ultimo`** — DELETE del más reciente con `status='nuevo'`.

## Edge cases manejados

- **Álbumes (múltiples fotos)**: Telegram manda cada foto como mensaje
  separado con mismo `media_group_id`. Si llega un mensaje con
  `media_group_id` que matchea row existente (ventana 60s en
  `telegram_msg_date`), hacemos UPDATE agregando la foto al array, no INSERT
  nuevo. La ventana usa `msg.date` del payload, NO `now()` del DB, para
  evitar clock skew entre Vercel y Supabase.
- **Edited messages**: UPDATE de la row existente buscando por
  `(telegram_message_id, telegram_chat_id)`. Actualizamos `editado_en` y
  campos de texto. NO re-procesamos fotos (asumimos edit es texto).
- **Reply en hilo**: lookup del `reply_to_message.message_id` →
  `inbox_reports.id` (UUID interno) → seteamos `reply_to_report_id`.
- **File size > 10MB**: validado ANTES de descargar via `getFile.file_size`.
  `sendMessage("❌ archivo muy grande")` y no se procesa.
- **MIME no whitelist**: idem (rechazo + mensaje), no se descarga.
- **Rate limit 429 en sendMessage**: lee `retry_after`, reintenta 1×. Si
  falla, log warning pero NO bloquea (la DB ya tiene el reporte).
- **Timeouts**: AbortController 8s en todos los fetches a Telegram.

## Contrato para Agente 5B

```sql
-- Listar pendientes
SELECT * FROM inbox_reports WHERE status='nuevo' ORDER BY recibido_en;

-- Triage
UPDATE inbox_reports
SET status='triaged',
    prioridad='alto',
    categoria='scorer',
    ruta_afectada='/score/X',
    resumen_corto='scorer cuelga al fin hoyo 14',
    procesado_en=now()
WHERE id=$1;

-- En progreso (atándolo a una rama)
UPDATE inbox_reports
SET status='en_progreso', rama_fix='fix/scorer-hang-claude'
WHERE id=$1;

-- Cerrar
UPDATE inbox_reports
SET status='resuelto', enlace_auditoria='https://github.com/.../pull/123'
WHERE id=$1;
```

Para descargar fotos desde 5B (cliente local):

```ts
const supabase = createAdminClient();
const { data, error } = await supabase
  .storage
  .from('inbox-photos')
  .createSignedUrl(path, 3600); // URL válida 1h
```

## Debugging

- Logs JSON estructurados en Vercel Functions logs. Buscar `inbox`.
- Token siempre redacted (regex `bot\d+:[A-Za-z0-9_-]+`).
- Para reproducir errores:
  ```bash
  curl -X POST https://golfersplus.vercel.app/api/inbox/webhook \
    -H 'Content-Type: application/json' \
    -H 'X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>' \
    -d '{"update_id":1,"message":{"message_id":1,"date":1234567890,"chat":{"id":<CHAT_ID>},"text":"test"}}'
  ```
- Verificar estado del webhook:
  ```
  GET https://golfersplus.vercel.app/api/inbox/setup?key=<INBOX_SETUP_SECRET>
  ```
  Retorna `setWebhook` y `getWebhookInfo` de Telegram.

## Hallazgos colaterales

(Sin hallazgos preexistentes durante este trabajo. Si surgen en futuras
sesiones del 5B, anotar acá con `file:line` y prioridad P0/P1/P2.)
