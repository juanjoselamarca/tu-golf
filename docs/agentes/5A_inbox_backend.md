# AGENTE 5A · Backend cloud del Sistema de Inbox

## 0. WHY — por qué esto importa (leer primero)

Golfers+ opera bajo directiva **CERO FALLOS**: cero features nuevas hasta que las
existentes funcionen al 100%. Hoy el cuello de botella para cerrar esa brecha es el
**feedback loop**: Juanjo (PM) y usuarios beta detectan bugs en torneos reales o uso
diario, pero el flujo "anotar → llegar al laptop → reportar a CTO → triage" tarda
horas o días. Muchos bugs se pierden. Otros llegan sin foto/contexto.

Este sistema cierra ese loop a **<30 segundos desde la cancha**:

```
[Juanjo en el green] → foto + "el scorer cuelga al fin de hoyo 14" → Telegram
                                                              ↓
        webhook Vercel (≤ 5s) ──► Supabase (inbox_reports + bucket)
                                                              ↓
                              Claude CTO con `/inbox` triagea y fixea (5B)
```

Por lo tanto **NO es una feature**: es **infraestructura habilitadora del roadmap
CERO FALLOS**. Construir esto antes que el dashboard de torneo y los refactors
pendientes está justificado: acelera el cierre de TODOS los P1 conocidos y los
futuros.

Encaja también con el rol de Claude como CTO: feedback de producto (Juanjo) →
acción técnica (Claude) sin fricción intermedia.

## 1. Identidad y scope

Sos un **backend engineer senior**. Construís infraestructura cloud que recibe
mensajes de un bot privado de Telegram y los persiste en Supabase. Otro agente
(5B) consume este sistema desde la PC local con `/inbox`. Tu scope es
**estrictamente**: webhook + tabla + bucket + bot config + tests + docs +
autonomía de deploy.

NO escribís frontend. NO escribís el slash command `/inbox`. NO escribís cron
jobs. NO mergeás a main.

Trabajás **autónomamente**. NO pausás para preguntar al usuario salvo
ambigüedad bloqueante real (definida en §13). Al terminar, entregás reporte
final en el formato del §12.

## 2. Contexto del proyecto

- **Stack**: Next.js 14 App Router · TypeScript estricto · Supabase · Vercel
- **Repo**: `github.com/juanjoselamarca/tu-golf` · base: `main`
- **Producción**: `https://golfersplus.vercel.app` (alias canónico, NO usar
  `VERCEL_URL` porque cambia con cada preview)
- **Runtime Vercel**: Fluid Compute (default). `maxDuration` default es 300s
  en plan paid. Para este endpoint declarar `export const maxDuration = 60`
  como cap razonable (suficiente para foto 10MB con 3 fetches × 8s + margen).
- **Supabase**: `https://hoswfwhvcgqlqdmzpnce.supabase.co`. Migrations en
  `supabase/migrations/`.
- **OneDrive/Windows**: el repo vive en OneDrive. Vitest ya está configurado
  con `pool: 'vmThreads'` en local (ver `vitest.config.ts`). No tocar.

## 3. Branch y worktree

**Convención del proyecto** (memoria `feedback_branch_por_agente_paralelo.md`):
`feat/<scope>-<who>`. Si hay otro agente paralelo (5B), `feat/inbox-5b-claude`.
Si trabajás solo, `feat/inbox-backend-claude`.

**Usar el script oficial**:

```bash
node scripts/setup-worktree.mjs inbox-backend feat
```

Esto copia `.env.local`, crea branch `feat/inbox-backend-claude` desde
`origin/main`, y deja todo listo en `.claude/worktrees/inbox-backend/`. Operá
desde ese directorio. NUNCA editar archivos en `main` directamente.

## 4. Convenciones SAGRADAS del proyecto

- `profiles.indice` (NO `handicap`)
- `courses.nombre`, `tournaments.nombre` (NO `name`)
- `rounds.status`: solo `'in_progress' | 'closed' | 'official'`
- Arrays Supabase: `(data ?? []).map()` SIEMPRE
- Cero `any` en TypeScript
- Imports Supabase via barrel: `import { createAdminClient } from '@/lib/supabase'`
  (NO crear cliente nuevo — `src/lib/supabaseAdmin.ts` ya existe y exporta
  `createAdminClient()` function)
- Commits en español, scope quirúrgico
- Migration files: nombre `YYYYMMDDHHMMSS_<scope>.sql` formato corto, ej.
  `20260515010500_inbox_system.sql` (mirar `supabase/migrations/` para ver
  los últimos)

## 5. Mejoras críticas vs implementación naive

Estas son las decisiones que diferencian "funciona en demo" de "funciona en
torneo". Leer antes de codear:

1. **Timing-safe compare del secret token** con manejo de longitudes distintas:

   ```ts
   import { timingSafeEqual } from 'node:crypto';
   function safeEqualHeader(received: string | null, expected: string): boolean {
     if (!received) return false;
     const a = Buffer.from(received);
     const b = Buffer.from(expected);
     if (a.length !== b.length) return false; // early return obligatorio
     return timingSafeEqual(a, b);
   }
   ```

   `timingSafeEqual` LANZA si los buffers tienen longitud distinta. El early
   return es mandatory.

2. **Extension desde `mime_type` whitelist, NUNCA desde filename**. Telegram
   puede mandar filename con `../../etc/passwd`. Mapeo permitido:

   - `image/jpeg` → `jpg`
   - `image/png` → `png`
   - `image/webp` → `webp`
   - `audio/ogg` → `ogg`
   - `audio/mpeg` → `mp3`

   Cualquier otro mime → rechazar con `sendMessage("❌ tipo de archivo no soportado")`.

3. **`/start` y `/help` exentos del chat_id allowlist**. Sin esta excepción,
   la primera vez que Juanjo abra el bot no puede obtener su chat_id (huevo
   y gallina). Todos los demás comandos y mensajes SÍ requieren chat_id válido.

4. **Reply en hilo usa UUID interno, no `telegram_message_id`**. Columna
   `reply_to_report_id UUID REFERENCES inbox_reports(id)`. Resolvés el lookup
   desde `telegram_message_id` al insertar.

5. **`media_group_id` para álbumes**. Telegram manda fotos múltiples como
   mensajes separados con mismo `media_group_id`. Si llega un mensaje con
   `media_group_id` que ya existe en una row reciente, hacer UPDATE agregando
   la foto al array, NO INSERT nuevo.

   **Ventana**: usar `msg.date` del payload de Telegram (timestamp unix del
   mensaje), no `now()` del DB. Esto evita race con clock skew entre Vercel
   y Supabase. Ventana: 60 segundos.

6. **Migration idempotente**. `CREATE TABLE IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS ... CREATE POLICY`,
   bucket con `ON CONFLICT (id) DO NOTHING`. Re-ejecutable sin romperse.

7. **Validar tamaño ANTES de descargar**. `getFile` de Telegram retorna
   `file_size`. Si > 10MB, `sendMessage` "❌ archivo muy grande (máx 10MB)"
   y NO procesar.

8. **Timeouts en TODOS los fetches externos**. `AbortController` con timeout
   8000ms para Telegram API y para Supabase storage upload. Si vence, marcar
   reporte con `status='error'` y avisar al usuario.

9. **Rate limit retry para `sendMessage`**. Si Telegram responde 429, leer
   `retry_after` del JSON body, await, reintentar 1 vez. Si vuelve a fallar,
   log warning pero NO bloquear el flujo (el reporte ya está guardado en DB,
   el ✓ recibido es nice-to-have).

10. **Logger sin pino, con redaction de tokens y bridge a Sentry si está
    disponible**. En `src/lib/inbox-logger.ts` (nombre distinto del logger
    general del proyecto para evitar choque):

    ```ts
    type LogLevel = 'info' | 'warn' | 'error';
    const REDACT_PATTERNS: RegExp[] = [
      /bot\d+:[A-Za-z0-9_-]+/g,           // bot tokens
      /[A-Za-z0-9_-]{40,}/g,              // anything that looks like a secret
    ];
    const redact = (s: string): string =>
      REDACT_PATTERNS.reduce((acc, p) => acc.replace(p, '[REDACTED]'), s);

    export function log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
      const payload = { level, msg: redact(msg), ts: new Date().toISOString(), ...data };
      console[level](JSON.stringify(payload));
      // Si Sentry está configurado, forwarear errors
      if (level === 'error' && typeof globalThis !== 'undefined') {
        const sentry = (globalThis as { Sentry?: { captureMessage: (m: string, l: string) => void } }).Sentry;
        sentry?.captureMessage?.(redact(msg), 'error');
      }
    }
    ```

11. **RLS realista**. `service_role` bypasea RLS por default — la policy
    explícita es defense in depth simbólica. Mejor: dejar la tabla con RLS
    habilitado y SIN policies para anon/authenticated (deny por default),
    confiando en que solo el webhook (service_role) inserta:

    ```sql
    ALTER TABLE inbox_reports ENABLE ROW LEVEL SECURITY;
    -- Sin policies = deny all para anon/authenticated.
    -- service_role bypasea RLS.
    ```

12. **`maxDuration` explícito**. En el route handler:
    ```ts
    export const runtime = 'nodejs';
    export const dynamic = 'force-dynamic';
    export const maxDuration = 60;
    ```

## 6. Paso 0 — Prerequisitos mandatory (verificar al inicio)

Antes de empezar a codear, verificar:

```bash
git remote -v   # DEBE ser origin https://github.com/juanjoselamarca/tu-golf.git
git branch --show-current
git worktree list
```

**Variables que DEBEN existir en `.env.local`** (verificar con `grep`, NO
imprimir los valores):

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ACCESS_TOKEN` (para `run-sql.mjs`)
- `VERCEL_TOKEN` (para subir env vars via API)
- `VERCEL_TEAM_ID` (si aplica)
- `VERCEL_PROJECT_ID`

Variable que **MANDATORY** debe darte Juanjo si no existe:

- `TELEGRAM_BOT_TOKEN` — solo se obtiene hablando con BotFather (persona
  física). Si NO está en `.env.local`, parar y reportar BLOCKED 5A pidiendo
  que Juanjo cree el bot vía `@BotFather` en Telegram y pegue el token a
  `.env.local`.

Si todas las variables existen → proceder. Si falta `TELEGRAM_BOT_TOKEN` →
reportar BLOCKED en formato §13. Es el ÚNICO punto del flujo que requiere
intervención manual irreductible.

## 7. Paso 1 — Investigación silenciosa (10 min, sin pausa)

Sin pedir confirmación:

- Confirmar que `src/lib/supabaseAdmin.ts` exporta `createAdminClient()`. El
  barrel `@/lib/supabase` también re-exporta esto. Usarlo en lugar de crear
  cliente nuevo.
- Identificar el último prefix numérico en `supabase/migrations/` (más alto
  es `041_align_tournaments_format_check.sql`, pero los nuevos usan formato
  fecha `YYYYMMDD_<scope>.sql`). Usar formato fecha para el archivo nuevo.
- Decidir lib de validación: **zod** pinneado a `^3.22.0` (ya está en
  `package.json` del proyecto, verificar con `grep '"zod"' package.json`).
  Si no está, instalar exactamente esa versión.
- Confirmar que `.env.example` (no `.env.local.example`) es el archivo de
  documentación de env vars.

Documentar decisiones en línea, proceder al Paso 2.

## 8. Paso 2 — Migration de Supabase

Crear `supabase/migrations/<YYYYMMDDHHMM>_inbox_system.sql` (timestamp
actual). Estructura:

```sql
-- =========================================================
-- Migration: Inbox System (5A)
-- WHY: cierra el feedback loop "bug en cancha → CTO" sin intermediarios.
-- =========================================================

-- Tabla
CREATE TABLE IF NOT EXISTS inbox_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_message_id BIGINT NOT NULL,
  telegram_chat_id BIGINT NOT NULL,
  telegram_user_id BIGINT,
  telegram_media_group_id TEXT,
  telegram_msg_date TIMESTAMPTZ NOT NULL, -- msg.date del payload, NO now()
  texto TEXT,
  caption TEXT,
  fotos_paths TEXT[] NOT NULL DEFAULT '{}',
  audio_path TEXT,
  reply_to_report_id UUID REFERENCES inbox_reports(id) ON DELETE SET NULL,
  recibido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  editado_en TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'nuevo'
    CHECK (status IN ('nuevo', 'triaged', 'en_progreso', 'resuelto', 'descartado', 'error')),
  prioridad TEXT CHECK (prioridad IN ('critico', 'alto', 'medio', 'bajo')),
  categoria TEXT,
  ruta_afectada TEXT,
  resumen_corto TEXT,
  rama_fix TEXT,                 -- renombrado: español consistente
  enlace_auditoria TEXT,         -- renombrado: español consistente
  notas TEXT,                    -- renombrado: español consistente
  procesado_en TIMESTAMPTZ,
  UNIQUE (telegram_message_id, telegram_chat_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_status_nuevo
  ON inbox_reports(recibido_en DESC) WHERE status = 'nuevo';
CREATE INDEX IF NOT EXISTS idx_inbox_media_group
  ON inbox_reports(telegram_media_group_id, telegram_msg_date DESC)
  WHERE telegram_media_group_id IS NOT NULL;

-- RLS: deny para anon/authenticated, service_role bypasea
ALTER TABLE inbox_reports ENABLE ROW LEVEL SECURITY;

-- Bucket de Storage (idempotente)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inbox-photos',
  'inbox-photos',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'audio/ogg', 'audio/mpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies: deny anon/authenticated, service_role lee/escribe
DROP POLICY IF EXISTS "inbox_photos_no_anon" ON storage.objects;
-- Sin policy explícita para storage.objects en este bucket = service_role only.
```

**Aplicar autónomamente** (memoria `reference_supabase_access.md`):

```bash
node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/<archivo>.sql
```

NO pedir a Juanjo que pegue SQL en el editor web. NO usar el dashboard. El
script usa Supabase Management API con `SUPABASE_ACCESS_TOKEN`.

Verificar idempotencia ejecutando el script DOS veces seguidas. Segunda
ejecución debe imprimir success sin errores.

## 9. Paso 3 — Tipos TS

Crear `src/types/inbox.ts`:

```ts
export type InboxStatus =
  | 'nuevo'
  | 'triaged'
  | 'en_progreso'
  | 'resuelto'
  | 'descartado'
  | 'error';

export type InboxPrioridad = 'critico' | 'alto' | 'medio' | 'bajo';

export type InboxReportRow = {
  id: string;
  telegram_message_id: number;
  telegram_chat_id: number;
  telegram_user_id: number | null;
  telegram_media_group_id: string | null;
  telegram_msg_date: string; // ISO timestamp from DB
  texto: string | null;
  caption: string | null;
  fotos_paths: string[];
  audio_path: string | null;
  reply_to_report_id: string | null;
  recibido_en: string;
  editado_en: string | null;
  status: InboxStatus;
  prioridad: InboxPrioridad | null;
  categoria: string | null;
  ruta_afectada: string | null;
  resumen_corto: string | null;
  rama_fix: string | null;
  enlace_auditoria: string | null;
  notas: string | null;
  procesado_en: string | null;
};
```

NO crear cliente Supabase nuevo. Importar siempre `createAdminClient` del barrel:

```ts
import { createAdminClient } from '@/lib/supabase';
const supabase = createAdminClient();
```

## 10. Paso 4 — Helper de Telegram (`src/lib/telegram-inbox.ts`)

Nombre con sufijo `-inbox` para no chocar con futuros helpers de Telegram que
no sean del inbox.

Funciones a exportar:

```ts
import { log } from './inbox-logger';

const TG_BASE = 'https://api.telegram.org';

const fetchWithTimeout = async (url: string, init: RequestInit, ms: number): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
};

const tgUrl = (path: string): string => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  return `${TG_BASE}/bot${token}${path}`;
};

export async function sendMessage(chatId: number, text: string): Promise<void> {
  // POST a /sendMessage con timeout 8s, retry 1× en 429 leyendo retry_after.
  // Si retry falla, log warning y NO throw (degrade graceful).
}

export async function getFile(fileId: string): Promise<{
  filePath: string;
  fileSize: number;
  mimeType: string | null;
}> {
  // GET /getFile con timeout 8s. Throw si Telegram retorna error.
}

export async function downloadFile(filePath: string): Promise<ArrayBuffer> {
  // GET https://api.telegram.org/file/bot<TOKEN>/<filePath> timeout 8s.
}

export const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
} as const;

export type AllowedMime = keyof typeof MIME_TO_EXT;

export function extFromMime(mime: string | null): string | null {
  if (!mime) return null;
  return (MIME_TO_EXT as Record<string, string>)[mime] ?? null;
}
```

**CRÍTICO**:

- Ninguna función imprime el token directamente.
- Todos los `catch` wrapean el error usando `log()` (que redactea automático).
- Cero `any`.

## 11. Paso 5 — Webhook endpoint (`src/app/api/inbox/webhook/route.ts`)

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
```

POST handler — secuencia:

1. **Auth de Telegram**: validar header `X-Telegram-Bot-Api-Secret-Token` con
   `safeEqualHeader` contra `TELEGRAM_WEBHOOK_SECRET`. Si falla → 401.

2. **Parse del body** con zod schema `TelegramUpdateSchema` (define `message`
   y `edited_message` ambos opcionales). Si parse falla → log warn + 200
   (no es nuestro error, no queremos que Telegram reintente).

3. Extraer `msg = update.message ?? update.edited_message`. Si ninguno → 200.

4. **Si `msg.text?.startsWith('/')` (comando)**:

   a. **`/start` o `/help`**: responder SIN validar allowlist. `/start`
      incluye: "Tu chat_id es `<chat.id>`. Agregalo a `TELEGRAM_ALLOWED_CHAT_ID`
      en Vercel y redeployea."

   b. Para otros comandos: validar `chat.id === Number(process.env.TELEGRAM_ALLOWED_CHAT_ID)`.
      Si no coincide → 200 silencioso (NO `sendMessage`, no leakeamos
      existencia).

   c. Comandos válidos:
      - `/pendientes` → `SELECT count(*) WHERE status='nuevo'` → "Tenés N pendientes."
      - `/historial` → `SELECT id, texto, recibido_en, status FROM inbox_reports
        ORDER BY recibido_en DESC LIMIT 10` → lista numerada con texto truncado
        a 50 chars.
      - `/borrar_ultimo` → `DELETE` el más reciente con `status='nuevo'`.
        Confirma "✓ borrado" o "no hay nada para borrar".

5. **Si NO es comando**:

   a. Validar `chat.id` contra allowlist. Si no coincide → 200 silencioso.

   b. Detectar tipo: texto puro, foto(s), audio, álbum.

   c. **Fotos**: tomar `msg.photo[msg.photo.length - 1]` (mayor resolución).
      `getFile` → validar `file_size <= 10MB`. Si excede → `sendMessage("❌
      archivo muy grande (máx 10MB)")` y abortar (NO insertar row, NO
      descargar). Si OK → descargar y subir a `reports/YYYY/MM/<uuid>.<ext>`
      donde `ext` viene de `extFromMime`. Si `mime` no whitelist →
      `sendMessage("❌ tipo de archivo no soportado")` y abortar.

   d. **Audio**: idem fotos, path `reports/YYYY/MM/<uuid>.<ext>`.

   e. **`edited_message`**: UPDATE existente WHERE
      `(telegram_message_id, telegram_chat_id)`. Actualizar `editado_en` y
      campos de texto. NO re-procesar fotos.

   f. **`media_group_id`**:
      ```sql
      SELECT id, fotos_paths, caption FROM inbox_reports
      WHERE telegram_media_group_id = $1
        AND telegram_chat_id = $2
        AND telegram_msg_date > to_timestamp($3 - 60)  -- ventana 60s en msg.date
      ORDER BY recibido_en DESC LIMIT 1
      ```
      Si existe → UPDATE agregando foto al array y mergeando `caption` si
      llega. Si no → INSERT.

   g. **`reply_to_message`**: SELECT `id` WHERE
      `telegram_message_id = reply_to_message.message_id AND telegram_chat_id = chat.id`.
      Setear `reply_to_report_id` (puede ser null si no existe).

   h. INSERT/UPDATE en `inbox_reports`.

   i. `sendMessage("✓ recibido")` (sin contador, rápido).

6. **SIEMPRE retornar 200** al final (incluso ante errores internos). Errores
   se loguean vía `log('error', ...)` pero NO se propagan: Telegram reintenta
   indefinidamente con 5xx.

## 12. Paso 6 — Setup endpoint (`src/app/api/inbox/setup/route.ts`)

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
```

GET handler:

- Validar query param `?key=<INBOX_SETUP_SECRET>` con `safeEqualHeader`. Si
  falla → 401.
- Llamar Telegram `setWebhook`:
  ```ts
  const webhookUrl = `https://golfersplus.vercel.app/api/inbox/webhook`;
  // ↑ Hardcodeado al dominio canónico de production.
  //   NO usar VERCEL_URL (cambia con cada preview deploy).
  const resp = await fetchWithTimeout(tgUrl('/setWebhook'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message', 'edited_message'],
      drop_pending_updates: true,
    }),
  }, 8000);
  ```
- También llamar `getWebhookInfo` y devolver ambas respuestas:
  ```json
  { "ok": true, "setWebhook": {...}, "webhookInfo": {...} }
  ```
- Si Telegram falla → 500 con `{ ok: false, error: ... }`.

## 13. Paso 7 — Env vars y Vercel deploy (AUTÓNOMO)

7.1 — Generar secrets random (32 chars cada uno):

```ts
import { randomBytes } from 'node:crypto';
const webhookSecret = randomBytes(24).toString('base64url');
const setupSecret = randomBytes(24).toString('base64url');
```

7.2 — Actualizar `.env.example` agregando al final:

```
# Telegram Bot (Inbox System 5A)
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_CHAT_ID=
TELEGRAM_WEBHOOK_SECRET=
INBOX_SETUP_SECRET=
```

7.3 — Actualizar `.env.local` con los secrets generados Y con
`TELEGRAM_BOT_TOKEN` (que Juanjo ya pegó en Paso 0). Dejar
`TELEGRAM_ALLOWED_CHAT_ID` vacío (se llena después del primer `/start`).

7.4 — **Crear `scripts/setup-inbox-vercel-env.mjs`** siguiendo el patrón de
`scripts/rotate-e2e-callback-secret.mjs` (memoria
`reference_vercel_env_add_windows_bug.md`: NO usar `vercel env add`, tiene
bug Windows con stdin pipe). El script:

- Lee `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` de `.env.local`.
- Para cada var de las 4 (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID`,
  `TELEGRAM_WEBHOOK_SECRET`, `INBOX_SETUP_SECRET`):
  - DELETE en Vercel API (si existe).
  - POST `https://api.vercel.com/v10/projects/<PROJECT_ID>/env` con
    `{ key, value, type: 'encrypted', target: ['production', 'preview', 'development'] }`.
- Imprime al final: "✅ 4 env vars sincronizadas a Vercel (production+preview+dev)".

7.5 — Ejecutar el script:

```bash
node --env-file=.env.local scripts/setup-inbox-vercel-env.mjs
```

Esto deja `TELEGRAM_ALLOWED_CHAT_ID` vacío en Vercel — se completa después
del primer `/start`.

7.6 — Verificar `.gitignore` incluye `.env.local` y `.env`. Si no → agregar.
**NO** commitear el `.env.local` con secrets.

## 14. Paso 8 — Tests (8 críticos, no 4)

CERO FALLOS no se cumple con smoke tests. Crear
`src/app/api/inbox/webhook/__tests__/route.test.ts` con vitest. Cobertura
mínima:

1. **401 sin header `X-Telegram-Bot-Api-Secret-Token`**.
2. **401 con header incorrecto** (verificar `safeEqualHeader` no crashea con
   longitudes distintas).
3. **`/start` responde con `chat_id` sin validar allowlist** (mock
   `sendMessage`).
4. **Mensaje válido con `chat_id` correcto inserta row** en mock de
   `createAdminClient`.
5. **`chat_id` no autorizado → 200 silencioso, NO insert, NO sendMessage**.
6. **`mime_type` no whitelist (ej. `application/pdf`) → `sendMessage` error
   y NO insert**.
7. **`file_size > 10MB` → `sendMessage` error, NO download, NO insert**.
8. **`media_group_id` con row reciente (<60s msg.date) → UPDATE, no INSERT**.

Patrón de mock para `createAdminClient`:

```ts
vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => mockSupabaseClient,
}));
```

Patrón de mock para `fetch` (Telegram):

```ts
vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
  // routing por url
});
```

Vitest config ya está OK en OneDrive (vmThreads). NO tocar `vitest.config.ts`.

## 15. Paso 9 — Documentación de arquitectura

Crear `docs/INBOX_ARCHITECTURE.md` (conciso):

```markdown
# Sistema de Inbox — Arquitectura

## WHY
Habilitador del roadmap CERO FALLOS. Cierra "bug en cancha → CTO fixea"
en <30s sin pasar por el laptop.

## Flujo
[Telegram bot privado]
        │ POST + X-Telegram-Bot-Api-Secret-Token
        ▼
/api/inbox/webhook (Vercel, Fluid Compute, 60s maxDuration)
        │
        ├─► Supabase DB (tabla inbox_reports, RLS service_role only)
        └─► Supabase Storage (bucket inbox-photos privado, 10MB cap)
        │
        ▼
[Agente 5B local: /inbox triage]

## Tabla inbox_reports
(Documentar cada columna con 1 línea: para qué sirve, valores permitidos.)

## State machine
nuevo → triaged → en_progreso → resuelto
            ↘                  ↗
             descartado ←──────
nuevo → error (si falla descarga / mime / size)

## Storage path
reports/YYYY/MM/<uuid>.<ext> donde <ext> viene de MIME whitelist.

## Seguridad (3 capas + redaction)
1. Telegram secret_token header (timing-safe compare, early return en
   longitud distinta).
2. chat_id allowlist (excepto /start y /help).
3. Supabase RLS habilitado, sin policies para anon/authenticated
   (service_role bypasea).
4. Logger redactea bot tokens y strings tipo secret antes de console.log,
   forwarea errors a Sentry si está disponible.

## Contrato para Agente 5B
- Leer pendientes:
    SELECT * FROM inbox_reports WHERE status='nuevo'
    ORDER BY recibido_en
- Marcar:
    UPDATE inbox_reports
    SET status=..., procesado_en=now(), rama_fix=..., notas=...
    WHERE id=$1
- Descargar fotos:
    supabase.storage.from('inbox-photos').createSignedUrl(path, 3600)

## Debugging
- Logs JSON estructurados en Vercel Functions logs.
- Token siempre redacted (regex bot\d+:[A-Za-z0-9_-]+).
- Para reproducir errores:
    curl -X POST https://golfersplus.vercel.app/api/inbox/webhook \
      -H 'Content-Type: application/json' \
      -H 'X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>' \
      -d @sample-payload.json
- Verificar estado del webhook:
    https://golfersplus.vercel.app/api/inbox/setup?key=<INBOX_SETUP_SECRET>
    (también devuelve getWebhookInfo).

## Hallazgos colaterales
[Bugs preexistentes detectados pero NO fixeados acá. Anotar con file:line
y P0/P1/P2.]
```

## 16. Paso 10 — Doc de runbook para Juanjo

Crear `docs/INBOX_SETUP_INSTRUCTIONS.md`:

```markdown
# Inbox System — Runbook para Juanjo (CTO Claude lo ejecuta)

## Pasos one-shot (5 minutos total)

1. **Crear el bot de Telegram** (solo vos podés):
   - Abrir Telegram, hablar con @BotFather.
   - `/newbot` → nombre `Golfers+ Inbox` → username
     `golfersplus_inbox_bot` (o similar).
   - Copiar el token que devuelve BotFather.
   - Pegarlo en `.env.local` como `TELEGRAM_BOT_TOKEN=...`.

2. **Avisar a Claude que el token está listo.** Claude continúa:
   - Aplica migration.
   - Sube secrets a Vercel (production+preview+dev).
   - Push branch `feat/inbox-backend-claude`.

3. **Mergear la branch** (Claude espera tu OK):
   - Revisás el PR.
   - Mergeás a main.
   - Vercel auto-deployea production.

4. **Obtener tu chat_id** (solo vos podés):
   - Abrir el bot en Telegram, mandarle `/start`.
   - El bot responde con tu `chat_id`.

5. **Avisar el chat_id a Claude.** Claude lo escribe a Vercel via API y
   dispara redeploy.

6. **Llamar al setup endpoint** (Claude lo hace, no vos).

7. **Test E2E** (Claude te pide una foto de prueba):
   - Mandás "test" + una foto al bot.
   - Bot responde "✓ recibido" en <5s.
   - Claude verifica row en Supabase y archivo en bucket.
   - Si ✅ → sistema listo.

## TL;DR de tu intervención
- 1× pegar token de BotFather a `.env.local`.
- 1× mandar `/start` al bot y pegar el chat_id al chat.
- 1× mandar foto de prueba.

Total: ~3 minutos tuyos. El resto lo hace Claude.
```

## 17. Paso 11 — Verificaciones ejecutables

Antes de declarar listo, correr y reportar resultado de:

1. **Cero `any` en código nuevo**:
   ```bash
   grep -rn ": any\b\|<any>\|as any" src/app/api/inbox/ src/lib/telegram-inbox.ts \
     src/lib/inbox-logger.ts src/types/inbox.ts 2>/dev/null
   ```
   Esperado: 0 matches.

2. **Token nunca en console**:
   ```bash
   grep -rn "TELEGRAM_BOT_TOKEN" src/app/api/inbox/ src/lib/telegram-inbox.ts
   ```
   Esperado: solo usos vía `process.env.TELEGRAM_BOT_TOKEN`, NUNCA en strings
   de log/error.

3. **Tests pasan**:
   ```bash
   npm test -- inbox
   ```
   Esperado: 8/8 ✅.

4. **TypeScript**:
   ```bash
   npx tsc --noEmit
   ```
   Esperado: 0 errores.

5. **Build**:
   ```bash
   npm run build
   ```
   Esperado: success, sin warnings nuevos.

6. **Lint**:
   ```bash
   npm run lint
   ```
   Esperado: 0 errors, 0 warnings nuevos.

7. **Migration idempotente**:
   ```bash
   node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/<archivo>.sql
   node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/<archivo>.sql
   ```
   Esperado: ambas exitosas, segunda sin errores.

8. **Regenerar grafo** (memoria `feedback_graphify_cto.md`):
   ```bash
   graphify update .
   ```

Si alguna de las 8 falla → NO declarar listo. Corregir y re-correr.

## 18. Paso 12 — Commit, push, PR (NO merge)

```bash
git add -A
git status   # revisar que .env.local NO esté staged
git commit -m "$(cat <<'EOF'
feat(inbox): backend cloud para Sistema de Inbox Telegram→Supabase

WHY: habilitador del roadmap CERO FALLOS. Cierra feedback loop
"bug en cancha → CTO" en <30s sin pasar por laptop.

Componentes:
- POST /api/inbox/webhook con 3 capas de seguridad (timing-safe
  secret_token + chat_id allowlist + RLS service_role)
- Soporta texto, fotos, audio, captions, edits, replies, álbumes
  (media_group_id con ventana basada en msg.date)
- GET /api/inbox/setup para configurar webhook (idempotente)
- Migration idempotente con state machine
  (nuevo→triaged→en_progreso→resuelto/descartado, +error)
- Bucket inbox-photos privado, 10MB cap, MIME whitelist
- Logger con redaction de tokens, bridge a Sentry si está disponible
- Script scripts/setup-inbox-vercel-env.mjs para sync de secrets

Comandos: /start, /help, /pendientes, /historial, /borrar_ultimo

Tests: 8 críticos (auth, mime, size, media_group, allowlist).
E2E manual per docs/INBOX_SETUP_INSTRUCTIONS.md.

NO mergeado a main: esperar Agente 5B + CTO review.
EOF
)"

git push -u origin feat/inbox-backend-claude
gh pr create --base main --head feat/inbox-backend-claude \
  --title "feat(inbox): backend cloud Telegram→Supabase (5A)" \
  --body-file docs/agentes/5A_inbox_pr_body.md
```

(Generar `docs/agentes/5A_inbox_pr_body.md` con resumen del PR antes de
ejecutar el `gh pr create`.)

**NO mergear**. CTO + 5B revisan.

## 19. Paso 13 — Sync de secrets si Juanjo ya proveyó chat_id

Si durante la sesión Juanjo manda su `chat_id` (después del `/start` al
preview/prod), actualizar Vercel sin requerir su intervención:

```bash
TELEGRAM_ALLOWED_CHAT_ID=<el-chat-id> \
  node --env-file=.env.local scripts/setup-inbox-vercel-env.mjs --only=TELEGRAM_ALLOWED_CHAT_ID
```

Disparar redeploy via Vercel API. Esperar Ready. Hacer probe al setup
endpoint. Reportar ✅.

## 20. Formato de reporte final

```
🟢 LISTO 5A
─────────────
branch: feat/inbox-backend-claude (pusheado, PR #<n> abierto)
PR: https://github.com/juanjoselamarca/tu-golf/pull/<n>

archivos creados:
  - supabase/migrations/<ts>_inbox_system.sql
  - src/lib/telegram-inbox.ts
  - src/lib/inbox-logger.ts
  - src/types/inbox.ts
  - src/app/api/inbox/webhook/route.ts
  - src/app/api/inbox/webhook/__tests__/route.test.ts
  - src/app/api/inbox/setup/route.ts
  - scripts/setup-inbox-vercel-env.mjs
  - docs/INBOX_ARCHITECTURE.md
  - docs/INBOX_SETUP_INSTRUCTIONS.md
  - docs/agentes/5A_inbox_pr_body.md

archivos modificados:
  - .env.example (4 vars nuevas, sin valores)
  - .env.local (4 vars con valores, NO commiteado)
  - .gitignore (verificado)

verificaciones (todas ✅):
  - any: 0
  - tests: 8/8
  - tsc: 0 errores
  - build: success
  - lint: 0 errors / 0 warnings nuevos
  - migration idempotente: 2/2 runs
  - graphify update: regenerado

deploy:
  - 4 env vars subidas a Vercel (production+preview+dev) via API REST
  - TELEGRAM_ALLOWED_CHAT_ID dejado vacío (pendiente /start de Juanjo)
  - migration aplicada a Supabase production

PENDIENTES MANDATORY DE JUANJO (3 minutos totales):
  1. Mergear PR a main (revisión).
  2. Mandar /start al bot → pegar chat_id en chat de Claude.
  3. Mandar foto de prueba al bot para E2E.
─────────────
```

## 21. Formato si bloqueado

```
🟡 BLOCKED 5A
─────────────
fase: paso N
hallazgo: [qué encontraste]
duda: [qué necesita decidir Juanjo o qué prerequisite falta]
─────────────
```

**Único bloqueo aceptable**: falta `TELEGRAM_BOT_TOKEN` (Juanjo no ha
hablado con BotFather). Todo lo demás se resuelve sin pausa.

## 22. Restricciones duras (no negociables)

- **NO instalar paquetes salvo**: `zod@^3.22.0` (si no está ya). NO pino, NO
  `node-telegram-bot-api`, NO `@types/node-telegram-bot-api`, NO `pino-pretty`,
  nada más.
- **NO `any`** en código nuevo.
- **NO commitear `.env.local`** con valores reales.
- **NO imprimir el bot token** jamás (verificable con grep en §17).
- **NO usar polling** de Telegram, solo webhook.
- **NO escribir** `/inbox` slash command (es scope de 5B).
- **NO escribir** cron jobs (es scope de 5C si existe).
- **NO mergear a main** (queda PR abierto, CTO revisa).
- **NO modificar código existente** del proyecto fuera de:
  - `.env.example` (agregar 4 vars)
  - `.gitignore` (verificar)
  - `package.json` (solo si hace falta agregar `zod`)
- **NO crear cliente Supabase nuevo**: usar `createAdminClient` del barrel
  `@/lib/supabase`.
- **NO usar `VERCEL_URL`** para configurar webhook: usar
  `https://golfersplus.vercel.app` hardcoded.
- **NO usar `vercel env add` con stdin** (bug Windows): usar el script
  `scripts/setup-inbox-vercel-env.mjs` que llama Vercel REST API.
- **NO pedir a Juanjo que pegue SQL en el dashboard**: aplicar con
  `scripts/run-sql.mjs`.
- Si encontrás bugs preexistentes del proyecto: anotar en
  `docs/INBOX_ARCHITECTURE.md` → "Hallazgos colaterales" con `file:line`
  y prioridad. NO fixearlos acá (memoria `feedback_no_kanban_inutil.md` y
  `feedback_cero_fallos.md`: scope quirúrgico).

## 23. Resumen de autonomía vs intervención

**Claude hace solo** (0 intervención):
- Branch + worktree.
- Migration SQL aplicada via Management API.
- Bucket creado en SQL (no en dashboard).
- 4 archivos de código + 2 docs + 1 script.
- Secrets generados y subidos a Vercel via REST API.
- Tests + tsc + build + lint + graphify.
- Commit + push + PR abierto.

**Juanjo hace** (3 toques, ~3 minutos):
1. Crear bot en BotFather y pegar token a `.env.local` (ÚNICO blocker
   pre-trabajo).
2. Mergear PR después de revisarlo.
3. Mandar `/start` + foto de prueba al bot.

**Nada más requiere intervención humana.**
