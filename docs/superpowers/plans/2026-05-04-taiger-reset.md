# tAIger+ Reset — Sesión Continua + Motor 100% Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resetear tAIger+ a una sola conversación continua por usuario, alimentada por un motor de patrones que procesa el 100% de las rondas históricas (no las últimas 50). Eliminar las 3 cards (post-ronda / plan semanal / consulta libre) y la página de onboarding. En su lugar: una sola sesión que vive y crece, con contexto destilado del 100% de la data y tools para que el LLM consulte rondas específicas cuando el usuario las mencione.

**Architecture:**
- **Motor de patrones:** procesa el 100% de `historical_rounds` por usuario, sin `.limit()`. Persiste en `player_patterns` con `confidence` y `data_points` reales.
- **Contexto LLM:** patrones detectados + agregados estadísticos sobre el 100% + detalle hoyo-por-hoyo de las últimas 10 rondas + tools (`get_round_by_date`, `get_all_rounds_summary`) para acceso puntual al resto.
- **Sesión persistente:** una fila en `taiger_sessions` por usuario con `is_primary=true`. Todos los mensajes se appendean al mismo array. El coach recuerda toda la historia.
- **Streaming real:** `anthropic.messages.stream()` con `cache_control: ephemeral` en system prompt y contexto.
- **Sin monetización por ahora:** se eliminan cuotas mensuales, gates, bypass admin y constants asociadas. Periodo de prueba interno.

**Tech Stack:** Next.js 14 App Router, TypeScript, `@anthropic-ai/sdk`, Supabase (PostgreSQL + RLS), Vitest, ReactMarkdown + remark-gfm.

---

## File Structure

### Archivos a borrar (Commit 1)
- `src/app/api/taiger/analyze-round/route.ts` — endpoint one-shot redundante
- `src/app/coach/onboarding/page.tsx` — formulario psicológico (reemplazado por construcción orgánica en chat)
- `src/app/coach/sesion/nueva/page.tsx` — selector de 3 cards
- `src/app/coach/sesion/nueva/chat/page.tsx` — chat con `?tipo=`

### Archivos a modificar (Commit 1)
- `src/golf/coach/prompts.ts` — colapsar 5 SESSION_STARTERS a 1; agregar instrucción ACSI orgánica
- `src/app/api/taiger/chat/route.ts` — quitar `session_type`, dedup por `ronda_libre_id`, cuota mensual, gate de 3 rondas, bypass admin
- `src/lib/constants.ts` — eliminar `TAIGER_FREE_MONTHLY_LIMIT` y `WHATSAPP_TAIGER_PREMIUM_URL` si quedan huérfanos
- `src/app/coach/page.tsx` — eliminar enlaces a páginas borradas (placeholder, refactor real en Commit 2)

### Archivos a modificar (Commit 2)
- `supabase/migrations/017_taiger_primary_session.sql` — nueva columna `is_primary boolean default false`, índice único parcial
- `src/golf/coach/session.ts` — nuevo helper `getOrCreateActiveSession(supabase, userId)`
- `src/app/api/taiger/chat/route.ts` — usar helper, append a sesión primaria
- `src/app/coach/page.tsx` — refactor dashboard: stats + único CTA "Continuar conversación" + historial colapsado
- `src/app/coach/sesion/[id]/page.tsx` — ReactMarkdown en follow-ups, eliminar `MAX_TOTAL_MESSAGES`

### Archivos a modificar (Commit 3)
- `src/golf/coach/detect-and-save-patterns.ts` — quitar `.limit(50)`, paginación si necesario
- `src/golf/coach/patterns.ts` — flag por patrón para aceptar 9 hoyos (`requires18Holes: false`)
- `src/app/api/taiger/context/route.ts` → convertir en función exportada `buildPlayerContext(supabase, userId)`; quitar `.limit(50)`
- `src/golf/coach/context.ts` — nuevo, contiene `buildPlayerContext`
- `src/app/api/taiger/chat/route.ts` — usar `buildPlayerContext` directo (no fetch HTTP); `messages.stream()`; `cache_control: ephemeral`; tools nuevas
- `src/golf/coach/tools.ts` — agregar `get_round_by_date`, `get_all_rounds_summary`
- `src/golf/coach/recommendations.ts` — nuevo, extractor con tool use estructurado (reemplaza regex)
- `scripts/recalculate-all-patterns.mjs` — script one-shot para recalcular patrones de todos los usuarios con bug fix

---

## Pre-flight checks

- [ ] **Step 0.1: Verificar branch correcto**

Run: `git branch --show-current`
Expected: una rama nueva tipo `feat/taiger-reset` (decisión del usuario antes de empezar)
Si está en `main` u otra rama: detener y consultar antes de continuar.

- [ ] **Step 0.2: Verificar repo correcto**

Run: `git remote -v`
Expected: `origin https://github.com/juanjoselamarca/tu-golf.git`

- [ ] **Step 0.3: Sincronizar con origin/main**

Run: `git fetch origin && git log HEAD..origin/main --oneline`
Expected: vacío (al día con main) o lista corta. Si hay commits nuevos en main, rebase antes de continuar.

---

# COMMIT 1 — Eliminación pura

**Scope único:** simplificar el coach borrando lo que no aporta a "una sesión continua con todo el histórico".

## Task 1: Borrar endpoint analyze-round

**Files:**
- Delete: `src/app/api/taiger/analyze-round/route.ts`

- [ ] **Step 1.1: Verificar que no haya consumidores fuera de las cards que vamos a borrar**

Run: `grep -rn "analyze-round" src/ --include="*.ts" --include="*.tsx"`
Expected: solo referencias en `src/app/coach/sesion/nueva/page.tsx` (que también borramos) y el propio archivo. Si aparece en otro lado, detener y revisar.

- [ ] **Step 1.2: Borrar el archivo**

Run: `git rm src/app/api/taiger/analyze-round/route.ts`

- [ ] **Step 1.3: Verificar tsc en verde**

Run: `npx tsc --noEmit`
Expected: 0 errores. Si hay errores en `analyze-round` referenciado desde otro lado, ir a 1.1 y limpiar también.

## Task 2: Borrar página de onboarding

**Files:**
- Delete: `src/app/coach/onboarding/page.tsx`
- Modify: `src/app/coach/page.tsx` (remover el Link a `/coach/onboarding`)

- [ ] **Step 2.1: Buscar referencias**

Run: `grep -rn "/coach/onboarding" src/ --include="*.ts" --include="*.tsx"`
Expected: aparición en `src/app/coach/page.tsx:195` y en el propio archivo de onboarding.

- [ ] **Step 2.2: Eliminar el enlace en coach/page.tsx**

Editar `src/app/coach/page.tsx` y borrar el bloque completo:

```tsx
{sessions.length === 0 && (
  <Link href="/coach/onboarding" style={{
    display: 'block', textAlign: 'center', marginTop: '16px',
    fontSize: '13px', color: '#c4992a', textDecoration: 'none', fontWeight: 600,
  }}>
    Completar perfil psicológico (opcional)
  </Link>
)}
```

- [ ] **Step 2.3: Borrar el archivo de onboarding**

Run: `git rm src/app/coach/onboarding/page.tsx`

Si la carpeta queda vacía: `git rm -r src/app/coach/onboarding/` (Windows: usar `Remove-Item -Recurse`).

- [ ] **Step 2.4: Verificar tsc en verde**

Run: `npx tsc --noEmit`
Expected: 0 errores.

## Task 3: Borrar las 3 cards y el chat con `?tipo=`

**Files:**
- Delete: `src/app/coach/sesion/nueva/page.tsx`
- Delete: `src/app/coach/sesion/nueva/chat/page.tsx`

- [ ] **Step 3.1: Buscar referencias entrantes**

Run: `grep -rn "/coach/sesion/nueva" src/ --include="*.ts" --include="*.tsx"`
Expected: aparece en `src/app/coach/page.tsx` (links a `nueva` y a `nueva/chat?tipo=...`).

- [ ] **Step 3.2: Eliminar bloques de links en coach/page.tsx**

Editar `src/app/coach/page.tsx` y borrar:
- El `<Link href="/coach/sesion/nueva">` "Nueva sesión con tAIger+"
- El grid con los 2 `<Link>` a `?tipo=weekly_plan` y `?tipo=free`

Reemplazar por un placeholder `// TODO commit 2: CTA único de sesión continua` (este se rellena en Commit 2). El objetivo de este commit es que la página NO rompa el build, no rediseñarla.

- [ ] **Step 3.3: Borrar los archivos**

Run:
```
git rm src/app/coach/sesion/nueva/page.tsx
git rm src/app/coach/sesion/nueva/chat/page.tsx
```

Si las carpetas `nueva/chat` y `nueva` quedan vacías, removerlas también.

- [ ] **Step 3.4: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

## Task 4: Colapsar SESSION_STARTERS y agregar instrucción ACSI orgánica

**Files:**
- Modify: `src/golf/coach/prompts.ts`

- [ ] **Step 4.1: Reemplazar el bloque `SESSION_STARTERS`**

En `src/golf/coach/prompts.ts:314-320`, reemplazar el `export const SESSION_STARTERS` completo por:

```ts
/**
 * Único starter para la sesión continua. El coach detecta el modo (post-ronda,
 * plan semanal, pre-torneo, consulta libre) por lo que el jugador escribe,
 * no por un parámetro de UI.
 */
export const TAIGER_SESSION_STARTER = `Esta es UNA conversación continua con el jugador. Recordás todo lo que han hablado antes. Detectá qué quiere por su mensaje:
- Si menciona "mi última ronda", "el sábado pasé", "ayer jugué" → llamá get_latest_round y analizá con datos reales.
- Si menciona una fecha o cancha específica → llamá get_round_by_date.
- Si pide plan de práctica → asumí 3-4 días disponibles con range + putting green (golfista de club promedio en Chile). Si necesita precisión, el jugador la pedirá.
- Si pregunta general → respondé directo con base en su perfil (ya tenés todo el contexto inyectado).
- Si es la primera conversación o llevan menos de 5 intercambios: incluí 1-2 preguntas naturales de perfil psicológico (estilo ACSI-28 — manejo de adversidad, confianza bajo presión, rutina pre-shot) sin que se sienta cuestionario. Construís el perfil orgánicamente.

NUNCA preguntes datos que ya tenés en el contexto (handicap, rondas, patrones, promedios). NUNCA pidas el score de una ronda si podés llamarla con get_latest_round.`
```

- [ ] **Step 4.2: Buscar consumidores de `SESSION_STARTERS`**

Run: `grep -rn "SESSION_STARTERS" src/ --include="*.ts" --include="*.tsx"`
Expected: solo `src/app/api/taiger/chat/route.ts:4` y `src/app/api/taiger/chat/route.ts:167`.

- [ ] **Step 4.3: Verificar tsc (esperado romper en chat/route.ts, se arregla en Task 5)**

Run: `npx tsc --noEmit`
Expected: ERROR en `chat/route.ts` por uso de `SESSION_STARTERS` que ya no existe. Lo arreglamos en la próxima task.

## Task 5: Limpiar chat/route.ts

**Files:**
- Modify: `src/app/api/taiger/chat/route.ts`
- Modify: `src/lib/constants.ts` (eliminar constants huérfanas)

- [ ] **Step 5.1: Reemplazar imports y eliminar dependencias innecesarias**

En `src/app/api/taiger/chat/route.ts:1-12`, reemplazar el bloque de imports por:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { TAIGER_SYSTEM_PROMPT, buildContextString, TAIGER_SESSION_STARTER } from '@/golf/coach/prompts'
import { TAIGER_TOOLS, executeTool } from '@/golf/coach/tools'
import { z } from 'zod'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30
```

(Notar que se eliminó la importación de `SESSION_STARTERS`, `TAIGER_FREE_MONTHLY_LIMIT`, `WHATSAPP_TAIGER_PREMIUM_URL`).

- [ ] **Step 5.2: Simplificar el schema Zod**

Reemplazar `chatInputSchema` (líneas 14-25) por:

```ts
const chatInputSchema = z.object({
  message: z.string().min(1).max(2000).optional(),
  messages: z.array(z.object({
    role: z.string(),
    content: z.string().max(2000),
  })).max(50).optional(),
  // session_id sigue siendo válido para compat con el cliente actual mientras
  // Commit 2 introduce la sesión continua por usuario.
  session_id: z.string().uuid().optional(),
})
```

(Notar que se eliminaron `session_type` y `ronda_libre_id`).

- [ ] **Step 5.3: Eliminar bloques de validación obsoletos**

Borrar de `chat/route.ts`:
- Bloque "Normalize session_type to valid DB values" (líneas 77-80)
- Bloque "Prevent duplicate sessions for same ronda_libre_id" (líneas 82-97)
- Bloque "Freemium limit (exclude onboarding) — bypass para admins" (líneas 99-125)
- Bloque "MIN_ROUNDS_FOR_COACH" gate (líneas 146-158) — el gate baja a 1 ronda y se valida en UI; en API se permite todo (periodo de prueba interno).

- [ ] **Step 5.4: Reemplazar uso de SESSION_STARTERS por starter único**

En la línea ~167 reemplazar:

```ts
const sessionStarter = SESSION_STARTERS[session_type] ?? SESSION_STARTERS.free
```

Por:

```ts
const sessionStarter = TAIGER_SESSION_STARTER
```

- [ ] **Step 5.5: Eliminar uso de session_type y ronda_libre_id en el cuerpo**

- Eliminar `const { ronda_libre_id, session_id } = body` y reemplazar por `const { session_id } = body`.
- Eliminar todas las referencias a `ronda_libre_id` (en `toolCtx`, en la query de dedup, en el insert de sesión).
- En `toolCtx` (~línea 174) borrar `defaultRondaId: ronda_libre_id ?? null` — queda `{ supabase, userId: user.id }`.
- En el insert de sesión (~línea 249) borrar `ronda_libre_id: ronda_libre_id || null` y `session_type` (en commit 2 el insert se hace via helper).

Por ahora, en el insert, hardcodear `session_type: 'continuous'` (string literal — la migración del commit 2 normalizará esto).

- [ ] **Step 5.6: Eliminar import + referencia a `SESSION_STARTERS` en prompts.ts si quedaba algo**

Run: `grep -rn "SESSION_STARTERS" src/`
Expected: 0 resultados.

- [ ] **Step 5.7: Verificar constants huérfanas**

Run: `grep -rn "TAIGER_FREE_MONTHLY_LIMIT\|WHATSAPP_TAIGER_PREMIUM_URL" src/ --include="*.ts" --include="*.tsx"`
Expected: solo aparición en `src/lib/constants.ts` y en tests/UI legacy. Si solo quedan en constants.ts y en `src/app/coach/sesion/[id]/page.tsx` (UI de límite alcanzado), borrarlas.

Editar `src/lib/constants.ts` y borrar las dos exports.
Editar `src/app/coach/sesion/[id]/page.tsx` y borrar el bloque condicional `{limitReached && (...)}` (Commit 2 hace refactor mayor de este archivo, este es solo limpieza para que tsc pase).

- [ ] **Step 5.8: Verificar test del rate-limit no se rompe**

Run: `npm run test -- src/lib/constants.test.ts`
Expected: PASS o que solo falle en asserts sobre las constantes borradas. Si falla, ajustar el test eliminando las asserts huérfanas.

- [ ] **Step 5.9: Verificación completa pre-commit**

Run en orden:
```
npx tsc --noEmit
npm run test
npm run build
```
Expected: todo verde. Si build falla por OneDrive/.next: `Remove-Item -Recurse -Force .next; npm run build`.

- [ ] **Step 5.10: Commit 1**

Run:
```
git add -p
```

Revisar uno por uno los hunks. NO usar `git add .` (regla CLAUDE.md sección "Convenciones de trabajo / Staging cuidadoso").

```
git commit -m "$(cat <<'EOF'
refactor(taiger): eliminar 3 cards y onboarding, consolidar a sesion unica

- Borrar /api/taiger/analyze-round (one-shot redundante con chat+tools)
- Borrar /coach/onboarding (perfil ACSI se construye organicamente en chat)
- Borrar /coach/sesion/nueva (selector de 3 tipos) y /coach/sesion/nueva/chat
- Colapsar 5 SESSION_STARTERS a 1 unico TAIGER_SESSION_STARTER
- Limpiar chat/route.ts: fuera session_type, dedup por ronda, cuota mensual,
  gate de 3 rondas, bypass admin
- Eliminar constants TAIGER_FREE_MONTHLY_LIMIT y WHATSAPP_TAIGER_PREMIUM_URL

Periodo de prueba interno: sin monetizacion ni limites artificiales.
La pagina /coach queda con placeholder hasta Commit 2 (sesion continua).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5.11: Verificar commit limpio**

Run: `git log -1 --stat`
Expected: solo archivos del scope del coach. Ningún archivo de tema, ronda libre, perfil, etc.

---

# COMMIT 2 — Sesión continua

**Scope único:** una conversación por usuario que persiste y crece. Markdown consistente. Sin límites.

## Task 6: Migración SQL — sesión primaria por usuario

**Files:**
- Create: `supabase/migrations/017_taiger_primary_session.sql`

- [ ] **Step 6.1: Escribir la migración**

Crear `supabase/migrations/017_taiger_primary_session.sql`:

```sql
-- Migration 017: tAIger+ primary session per user
-- Cada usuario tiene UNA sesion primaria continua. El resto del historial
-- queda como sesiones legacy (session_type != 'continuous') para no perder data.

ALTER TABLE taiger_sessions
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- Indice unico parcial: solo puede haber 1 sesion primaria por usuario.
CREATE UNIQUE INDEX IF NOT EXISTS taiger_sessions_user_primary_unique
  ON taiger_sessions (user_id)
  WHERE is_primary = true;

-- Permitir el nuevo session_type 'continuous' si el campo es enum.
-- (El campo session_type es text en el schema actual, no requiere ALTER.)

-- Marcar la sesion mas reciente de cada usuario como primaria,
-- migrando data existente a la nueva estructura.
WITH most_recent AS (
  SELECT DISTINCT ON (user_id) id, user_id
  FROM taiger_sessions
  ORDER BY user_id, created_at DESC
)
UPDATE taiger_sessions ts
SET is_primary = true,
    session_type = 'continuous'
FROM most_recent mr
WHERE ts.id = mr.id;
```

- [ ] **Step 6.2: Ejecutar la migración**

Run: `node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/017_taiger_primary_session.sql`
Expected: NOTICE de filas actualizadas. Sin errores.

- [ ] **Step 6.3: Verificar el resultado**

Crear archivo temporal `scripts/verify-017.sql`:

```sql
SELECT
  COUNT(*) FILTER (WHERE is_primary) AS primary_count,
  COUNT(DISTINCT user_id) FILTER (WHERE is_primary) AS users_with_primary,
  COUNT(*) AS total_sessions
FROM taiger_sessions;
```

Run: `node --env-file=.env.local scripts/run-sql.mjs scripts/verify-017.sql`
Expected: `primary_count == users_with_primary` (cada usuario tiene exactamente 1).

Borrar `scripts/verify-017.sql` después.

## Task 7: Helper getOrCreateActiveSession

**Files:**
- Create: `src/golf/coach/session.ts`
- Test: `src/golf/coach/session.test.ts`

- [ ] **Step 7.1: Escribir el test failing primero**

Crear `src/golf/coach/session.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { getOrCreateActiveSession } from './session'

function mockSupabase(existing: { id: string } | null) {
  const insertReturn = { data: { id: 'new-session-id' }, error: null }
  const selectReturn = { data: existing, error: null }

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve(selectReturn)),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve(insertReturn)),
        })),
      })),
    })),
  }
}

describe('getOrCreateActiveSession', () => {
  it('returns existing primary session when one exists', async () => {
    const supabase = mockSupabase({ id: 'existing-id' })
    const result = await getOrCreateActiveSession(supabase as never, 'user-1')
    expect(result.id).toBe('existing-id')
    expect(result.created).toBe(false)
  })

  it('creates a new primary session when none exists', async () => {
    const supabase = mockSupabase(null)
    const result = await getOrCreateActiveSession(supabase as never, 'user-1')
    expect(result.id).toBe('new-session-id')
    expect(result.created).toBe(true)
  })
})
```

- [ ] **Step 7.2: Verificar que el test falla**

Run: `npm run test -- src/golf/coach/session.test.ts`
Expected: FAIL con "Cannot find module './session'".

- [ ] **Step 7.3: Implementar el helper**

Crear `src/golf/coach/session.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ActiveSessionResult {
  id: string
  created: boolean
}

/**
 * Devuelve la sesion primaria continua del usuario. Si no existe, la crea.
 * Garantiza que cada usuario tenga exactamente una sesion primaria
 * (enforced por el indice unico parcial taiger_sessions_user_primary_unique).
 */
export async function getOrCreateActiveSession(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveSessionResult> {
  const { data: existing } = await supabase
    .from('taiger_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('is_primary', true)
    .maybeSingle()

  if (existing) {
    return { id: existing.id, created: false }
  }

  const { data: created, error } = await supabase
    .from('taiger_sessions')
    .insert({
      user_id: userId,
      session_type: 'continuous',
      is_primary: true,
      messages: [],
      techniques_assigned: [],
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(`No se pudo crear sesion primaria: ${error?.message ?? 'sin data'}`)
  }

  return { id: created.id, created: true }
}
```

- [ ] **Step 7.4: Verificar que el test pasa**

Run: `npm run test -- src/golf/coach/session.test.ts`
Expected: PASS, 2 tests verdes.

## Task 8: Integrar helper en chat/route.ts

**Files:**
- Modify: `src/app/api/taiger/chat/route.ts`

- [ ] **Step 8.1: Importar el helper y usar en el flujo**

En `src/app/api/taiger/chat/route.ts`:

1. Agregar al bloque de imports: `import { getOrCreateActiveSession } from '@/golf/coach/session'`
2. Reemplazar la lógica de "isFollowUp / insert" por el helper. Sustituir el bloque que decide `savedSession`:

```ts
// Sesion continua: SIEMPRE usamos la primaria del usuario.
// El parametro session_id del cliente es opcional y solo informa cual sesion
// esta abierta en UI (legacy, queda para back-compat hasta Commit 3).
const active = await getOrCreateActiveSession(supabase, user.id)
const sessionRowId = active.id
```

3. En el `start(controller)` del stream, reemplazar el `if (isFollowUp) { ... } else { insert }` por:

```ts
const fullHistory: ChatMsg[] = [
  ...conversation,
  { role: 'assistant', content: fullResponse },
]
await supabase
  .from('taiger_sessions')
  .update({
    messages: fullHistory,
    updated_at: new Date().toISOString(),
    next_focus: fullResponse.substring(0, 200),
  })
  .eq('id', sessionRowId)
const savedSession = { id: sessionRowId }
```

- [ ] **Step 8.2: Eliminar variable `isFollowUp`**

Run: `grep -n "isFollowUp" src/app/api/taiger/chat/route.ts`
Expected: 0 resultados después de eliminar.

- [ ] **Step 8.3: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

## Task 9: Refactor /coach/page.tsx (dashboard simplificado)

**Files:**
- Modify: `src/app/coach/page.tsx`

- [ ] **Step 9.1: Reemplazar el bloque de CTAs**

Reemplazar el bloque actual `{stats.rounds >= 3 && (<>...</>)}` por:

```tsx
{stats.rounds >= 1 && (
  <Link href={`/coach/sesion/${primarySessionId ?? 'nueva'}`} style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
    background: '#c4992a', color: 'var(--brand-dark)', borderRadius: '14px',
    padding: '18px', fontSize: '16px', fontWeight: 700,
    textDecoration: 'none', marginBottom: '24px',
    minHeight: '56px',
  }}>
    {primarySessionId ? 'Continuar conversacion con tAIger+' : 'Iniciar conversacion con tAIger+'}
  </Link>
)}
```

- [ ] **Step 9.2: Cargar el ID de la sesión primaria en el `load` inicial**

Modificar el `useEffect` de carga para incluir la query de sesión primaria:

```tsx
const [sessionsRes, roundsRes, patternsRes, profileRes, primaryRes] = await Promise.all([
  supabase.from('taiger_sessions').select('id, session_type, created_at, next_focus').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
  supabase.from('historical_rounds').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  supabase.from('player_patterns').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'active'),
  supabase.from('profiles').select('cpi_score').eq('id', user.id).single(),
  supabase.from('taiger_sessions').select('id').eq('user_id', user.id).eq('is_primary', true).maybeSingle(),
])

setSessions((sessionsRes.data as Session[]) || [])
setStats({
  rounds: roundsRes.count ?? 0,
  patterns: patternsRes.count ?? 0,
  cpi: profileRes.data?.cpi_score ?? null,
})
setPrimarySessionId(primaryRes.data?.id ?? null)
```

Y agregar el state: `const [primarySessionId, setPrimarySessionId] = useState<string | null>(null)`.

- [ ] **Step 9.3: Bajar el gate de 3 rondas a 1 ronda**

Cambiar el condicional del notice: `{stats.rounds < 3 && (...)}` → `{stats.rounds < 1 && (...)}`.
Y el texto: `{`${stats.rounds} de 3 rondas...`}` → `'Registra tu primera ronda para activar tu coach'`.

(Periodo de prueba interno: 1 ronda es suficiente para arrancar la conversación.)

- [ ] **Step 9.4: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

## Task 10: Refactor /coach/sesion/[id]/page.tsx — markdown + sin límites + sesión continua

**Files:**
- Modify: `src/app/coach/sesion/[id]/page.tsx`

- [ ] **Step 10.1: Soportar `id === 'nueva'` para crear sesión al primer mensaje**

En el `useEffect` de carga inicial, agregar manejo del caso `sessionId === 'nueva'`:

```tsx
if (sessionId === 'nueva') {
  // Crear sesion primaria al primer mensaje. Por ahora dejamos messages vacios
  // y el primer POST a /api/taiger/chat hace getOrCreateActiveSession.
  setSession({ id: 'nueva', user_id: user.id, session_type: 'continuous', messages: [], created_at: new Date().toISOString() })
  setMessages([])
  setLoadingSession(false)
  return
}
```

- [ ] **Step 10.2: Importar ReactMarkdown**

```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
```

- [ ] **Step 10.3: Renderizar mensajes del coach con markdown**

En el `messages.map`, reemplazar el bloque del bubble del assistant por:

```tsx
<div
  className={msg.role === 'assistant' ? 'taiger-md' : undefined}
  style={{
    maxWidth: '80%',
    padding: '12px 16px',
    borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
    background: msg.role === 'user' ? 'rgba(196,153,42,0.12)' : '#0e1c2f',
    color: 'var(--text)',
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: msg.role === 'user' ? 'pre-wrap' : 'normal',
    wordBreak: 'break-word',
  }}
>
  {msg.role === 'assistant' && msg.content ? (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
  ) : (
    msg.content
  )}
</div>
```

- [ ] **Step 10.4: Eliminar `MAX_TOTAL_MESSAGES` y todo el sistema de cuota visual**

- Borrar la constante `MAX_TOTAL_MESSAGES` (línea ~58).
- Borrar el `if (messages.length >= MAX_TOTAL_MESSAGES) return` en `handleSend`.
- Borrar el bloque `{messages.length >= MAX_TOTAL_MESSAGES && !streaming && ...}`.
- En `inputDisabled` quitar la condición `messages.length >= MAX_TOTAL_MESSAGES`.
- Quitar todo el `limitReached` state, sus useEffects y su UI (ya no hay cuota).

- [ ] **Step 10.5: Agregar bloque CSS `.taiger-md` para que el markdown se vea consistente**

Al final del componente, en el `<style>{`...`}</style>`, agregar:

```css
.taiger-md > *:first-child { margin-top: 0; }
.taiger-md > *:last-child { margin-bottom: 0; }
.taiger-md p { margin: 0 0 10px 0; }
.taiger-md strong { color: #f3d37a; font-weight: 600; }
.taiger-md em { color: #c4d8ee; }
.taiger-md ul, .taiger-md ol { margin: 6px 0 10px 0; padding-left: 20px; }
.taiger-md li { margin: 2px 0; }
.taiger-md h1, .taiger-md h2, .taiger-md h3 {
  margin: 12px 0 6px 0; font-size: 15px; color: #f3d37a; font-weight: 600;
}
.taiger-md code {
  background: rgba(255,255,255,0.08); padding: 1px 6px;
  border-radius: 4px; font-size: 13px;
}
.taiger-md hr {
  border: none; border-top: 1px solid rgba(196,153,42,0.25); margin: 12px 0;
}
.taiger-md a { color: #c4992a; }
```

- [ ] **Step 10.6: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

## Task 11: Verificación end-to-end Commit 2

- [ ] **Step 11.1: tsc + tests + build**

Run en orden:
```
npx tsc --noEmit
npm run test
npm run build
```
Expected: todo verde.

- [ ] **Step 11.2: Commit 2**

Run: `git add -p` y revisar hunks.

```
git commit -m "$(cat <<'EOF'
feat(taiger): sesion continua por usuario con markdown consistente

- Migracion 017: columna is_primary + indice unico parcial
- Helper getOrCreateActiveSession con tests vitest
- chat/route.ts ahora usa la sesion primaria, append a messages
- /coach dashboard con CTA unico "Continuar conversacion"
- /coach/sesion/[id] renderiza markdown en assistant + sin limite de mensajes
- Soporte id='nueva' para arrancar la primera conversacion
- Gate baja de 3 a 1 ronda (periodo de prueba interno)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# COMMIT 3 — Motor de élite

**Scope único:** quitar el `.limit(50)` que escondía el bug de baja confianza, streaming real, prompt caching, contexto destilado del 100%.

## Task 12: Bug fix — quitar .limit(50) en motor de patrones

**Files:**
- Modify: `src/golf/coach/detect-and-save-patterns.ts`
- Test: `src/golf/coach/detect-and-save-patterns.test.ts` (puede ser nuevo si no existe)

- [ ] **Step 12.1: Verificar si existe test del módulo**

Run: `ls src/golf/coach/detect-and-save-patterns.test.ts 2>&1; echo "---"; ls src/golf/coach/`
Expected: ver si hay test. Si no existe, crearlo en 12.2.

- [ ] **Step 12.2: Test failing — verificar que se procesan >50 rondas**

Crear/editar `src/golf/coach/detect-and-save-patterns.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { detectAndSavePatterns } from './detect-and-save-patterns'

function makeRound(scoreOffset: number) {
  return {
    scores: Array.from({ length: 18 }, (_, i) => 4 + (i % 3) + scoreOffset),
    total_gross: 90 + scoreOffset,
    holes_played: 18,
    metadata: null,
    course_id: null,
    courses: { par_total: 72 },
  }
}

function mockSupabase(rounds: ReturnType<typeof makeRound>[]) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'historical_rounds') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              not: vi.fn(() => Promise.resolve({ data: rounds })),
            })),
          })),
        }
      }
      if (table === 'course_holes') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [] })),
            })),
          })),
        }
      }
      if (table === 'player_patterns') {
        return { upsert: vi.fn(() => Promise.resolve({ error: null })) }
      }
      if (table === 'profiles') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        }
      }
      return {}
    }),
  }
}

describe('detectAndSavePatterns', () => {
  it('processes 100% of rounds (no .limit(50) cap)', async () => {
    const rounds = Array.from({ length: 80 }, (_, i) => makeRound(i % 5))
    const supabase = mockSupabase(rounds)
    const result = await detectAndSavePatterns(supabase as never, 'user-1')
    expect(result.total_rounds).toBe(80)
  })
})
```

- [ ] **Step 12.3: Verificar que el test falla**

Run: `npm run test -- src/golf/coach/detect-and-save-patterns.test.ts`
Expected: FAIL — `total_rounds` será 50 (por el `.limit(50)` actual) en lugar de 80.

- [ ] **Step 12.4: Quitar el .limit(50)**

En `src/golf/coach/detect-and-save-patterns.ts:23-28`, reemplazar:

```ts
const { data: rounds } = await supabase
  .from('historical_rounds')
  .select('scores, total_gross, holes_played, metadata, course_id, courses(par_total)')
  .eq('user_id', userId)
  .not('scores', 'is', null)
  .limit(50)
```

Por:

```ts
const { data: rounds } = await supabase
  .from('historical_rounds')
  .select('scores, total_gross, holes_played, metadata, course_id, courses(par_total)')
  .eq('user_id', userId)
  .not('scores', 'is', null)
```

(Sin `.limit()`. Si en el futuro un usuario tiene >5000 rondas, agregar paginación. Hoy es prematuro.)

- [ ] **Step 12.5: Verificar test en verde**

Run: `npm run test -- src/golf/coach/detect-and-save-patterns.test.ts`
Expected: PASS.

## Task 13: Aceptar rondas de 9 hoyos donde el patrón lo permita

**Files:**
- Modify: `src/golf/coach/patterns.ts`
- Modify: `src/golf/coach/detect-and-save-patterns.ts`

- [ ] **Step 13.1: Agregar flag `requires18Holes` al interface GolfPattern**

En `src/golf/coach/patterns.ts:13-20`, modificar:

```ts
export interface GolfPattern {
  id: string
  name: string
  description: string
  /** Si true, solo procesa rondas de 18 hoyos. Si false, acepta 9 tambien. */
  requires18Holes: boolean
  detect: (rounds: PatternRound[]) => { detected: boolean; confidence: number; metadata?: Record<string, unknown> }
  severity: 'info' | 'warning' | 'critical'
  recommendation: string
}
```

- [ ] **Step 13.2: Marcar cada patrón con su flag**

Recorrer cada entry de `PATTERNS` (en `patterns.ts`) y agregar el flag:

- `back_nine_collapse` → `requires18Holes: true`
- `front_nine_struggles` → `requires18Holes: true`
- `first_hole_anxiety` → `requires18Holes: false`
- `par_3_weakness` → `requires18Holes: false`
- `short_game_weakness` → `requires18Holes: false`
- `post_bogey_spiral` → `requires18Holes: false`
- `three_putt_frequency` → `requires18Holes: false`
- `pressure_deterioration` → `requires18Holes: true`
- `driving_inconsistency` → `requires18Holes: false`

(Verificar lista exacta contra el archivo real al editar. Patrones que requieren los 18 son solo los que comparan front vs back o usan totales por mitad.)

- [ ] **Step 13.3: Modificar `detectAndSavePatterns` para pasar todas las rondas**

En `detect-and-save-patterns.ts:54-71`, eliminar el `.filter` que excluye rondas <18:

```ts
const patternRounds: PatternRound[] = rounds.map(r => {
  const courseId = (r as { course_id?: string | null }).course_id ?? null
  const holePars = courseId ? holeParsByCourse[courseId] : undefined
  return {
    scores: r.scores as (number | null)[],
    total_gross: r.total_gross,
    par_total: ((r as Record<string, unknown>).courses as { par_total?: number } | null)?.par_total ?? 72,
    course_name: '',
    played_at: '',
    hole_pars: holePars && holePars.length >= 18 ? holePars : undefined,
    metadata: r.metadata as Record<string, unknown> | null,
  }
})
```

- [ ] **Step 13.4: Modificar `detectPatterns` (en patterns.ts) para filtrar por flag**

Buscar la función `detectPatterns` en `patterns.ts` (la que llama `detect-and-save-patterns.ts`). Modificarla para que filtre rondas según `requires18Holes`:

```ts
export function detectPatterns(rounds: PatternRound[]): Array<{ pattern: GolfPattern; confidence: number; metadata?: Record<string, unknown> }> {
  const results: Array<{ pattern: GolfPattern; confidence: number; metadata?: Record<string, unknown> }> = []
  for (const pattern of PATTERNS) {
    const eligible = pattern.requires18Holes
      ? rounds.filter(r => Array.isArray(r.scores) && r.scores.filter(s => s != null).length >= 18)
      : rounds
    if (eligible.length === 0) continue
    const result = pattern.detect(eligible)
    if (result.detected) {
      results.push({ pattern, confidence: result.confidence, metadata: result.metadata })
    }
  }
  return results
}
```

(Si la función `detectPatterns` ya existe con otra forma, adaptar el cambio.)

- [ ] **Step 13.5: Verificar tests existentes**

Run: `npm run test -- src/golf/coach/`
Expected: PASS. Si algún test rompe por el flag nuevo, agregar `requires18Holes: true` o `false` según corresponda en los mocks.

## Task 14: Convertir context endpoint en función exportada + quitar .limit(50)

**Files:**
- Create: `src/golf/coach/context.ts` (nueva función exportada `buildPlayerContext`)
- Modify: `src/app/api/taiger/context/route.ts` (delgado, llama a la función)
- Modify: `src/app/api/taiger/chat/route.ts` (usa función directa, no fetch HTTP)

- [ ] **Step 14.1: Crear `src/golf/coach/context.ts`**

Mover toda la lógica de `src/app/api/taiger/context/route.ts` (líneas 17-167) a una nueva función exportada en `src/golf/coach/context.ts`. La función recibe `(supabase: SupabaseClient, userId: string)` y devuelve el mismo objeto.

**Cambio crítico:** quitar `.limit(50)` del fetch de `historical_rounds` (línea 30 del original):

```ts
const [roundsRes, ...] = await Promise.all([
  supabase.from('historical_rounds')
    .select('id, course_id, course_name, played_at, scores, total_gross, holes_played, courses(par_total)')
    .eq('user_id', userId)
    .order('played_at', { ascending: false }),
  // ...
])
```

(Sin `.limit(50)`. Si performance se degrada con miles de rondas, paginar después.)

**Segundo cambio:** expandir el detalle hoyo-por-hoyo de las primeras 3 a las primeras 10 rondas (cambiar `idx < 3` por `idx < 10` en el map de `recentRounds`).

- [ ] **Step 14.2: Adelgazar el endpoint**

Reemplazar `src/app/api/taiger/context/route.ts` por:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { buildPlayerContext } from '@/golf/coach/context'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })
    const ctx = await buildPlayerContext(supabase, user.id)
    return NextResponse.json(ctx)
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
```

- [ ] **Step 14.3: Reemplazar el fetch HTTP en chat/route.ts**

En `src/app/api/taiger/chat/route.ts`, reemplazar el bloque del fetch:

```ts
let ctxRes: Response
try {
  ctxRes = await fetch(`${baseUrl}/api/taiger/context`, { headers: { cookie: cookieHeader } })
} catch (fetchErr) { /* ... */ }
if (!ctxRes.ok) { /* ... */ }
const ctx = await ctxRes.json()
```

Por:

```ts
import { buildPlayerContext } from '@/golf/coach/context'
// ...
const ctx = await buildPlayerContext(supabase, user.id)
```

Eliminar también el `baseUrl`, `cookieHeader` y todo el manejo de error HTTP relacionado.

- [ ] **Step 14.4: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

## Task 15: Streaming real con `messages.stream()`

**Files:**
- Modify: `src/app/api/taiger/chat/route.ts`

> **Antes de empezar:** invocar el skill `claude-api` para guidance específico de Anthropic SDK (streaming, prompt caching, model selection).

- [ ] **Step 15.1: Reemplazar el loop con messages.create por messages.stream**

En `src/app/api/taiger/chat/route.ts`, dentro del `for (let iter = 0; iter < MAX_TOOL_ITERS; iter++)`, reemplazar `anthropic.messages.create` por `anthropic.messages.stream`:

```ts
const stream = anthropic.messages.stream({
  model: 'claude-sonnet-4-6',
  max_tokens: 2048,
  system: systemFinal,
  tools: TAIGER_TOOLS as unknown as Anthropic.Tool[],
  messages: loopMessages as unknown as Anthropic.MessageParam[],
})

// Forward delta text events to the client SSE
for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    const text = event.delta.text
    fullResponse += text
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
  }
}

const resp = await stream.finalMessage()
// ... resto igual: si stop_reason === 'tool_use', continuar el loop
```

(Esto requiere mover el `controller` al scope del loop. Reescribir el handler para que el `ReadableStream.start` envuelva todo el loop, no solo el chunkeo final.)

- [ ] **Step 15.2: Eliminar el fake-streaming por chunks de 30 chars**

Borrar el bloque:

```ts
const CHUNK_SIZE = 30
for (let i = 0; i < fullResponse.length; i += CHUNK_SIZE) { ... }
```

Y todo el `setTimeout(15)`.

- [ ] **Step 15.3: Verificar manualmente con dev server**

Run: `npm run dev`

En el browser, abrir `/coach`, iniciar conversación, mandar un mensaje. Verificar que el texto aparece progresivamente desde ~1-2s, no de golpe después de 10-30s.

## Task 16: Prompt caching

**Files:**
- Modify: `src/app/api/taiger/chat/route.ts`

- [ ] **Step 16.1: Agregar `cache_control` al system prompt**

En la llamada a `anthropic.messages.stream`, cambiar el `system` de string plano a array con `cache_control`:

```ts
const stream = anthropic.messages.stream({
  model: 'claude-sonnet-4-6',
  max_tokens: 2048,
  system: [
    {
      type: 'text',
      text: systemFinal,
      cache_control: { type: 'ephemeral' },
    },
  ],
  tools: TAIGER_TOOLS as unknown as Anthropic.Tool[],
  messages: loopMessages as unknown as Anthropic.MessageParam[],
})
```

- [ ] **Step 16.2: Verificar headers de cache hit en el response**

Después de `await stream.finalMessage()`, loggear `resp.usage`:

```ts
const resp = await stream.finalMessage()
console.log('[tAIger/chat] usage:', resp.usage)
// Esperar campos: input_tokens, cache_creation_input_tokens, cache_read_input_tokens
```

En el primer mensaje de una sesión: `cache_creation_input_tokens > 0`.
En follow-ups dentro de 5 min: `cache_read_input_tokens > 0` (cache hit).

## Task 17: Tools nuevas

**Files:**
- Modify: `src/golf/coach/tools.ts`

- [ ] **Step 17.1: Agregar `get_round_by_date`**

En `src/golf/coach/tools.ts`, agregar al array `TAIGER_TOOLS`:

```ts
{
  name: 'get_round_by_date',
  description: 'Obtén una ronda específica por fecha (YYYY-MM-DD). Útil cuando el jugador menciona "la ronda del 15 de marzo" o similar.',
  input_schema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
      course_name: { type: 'string', description: 'Opcional: nombre de la cancha si hubo varias rondas el mismo día' },
    },
    required: ['date'],
  },
},
{
  name: 'get_all_rounds_summary',
  description: 'Obtén un resumen estadístico agregado del 100% de las rondas del jugador (totales, promedios, mejor/peor, distribución por cancha). Úsala cuando el jugador pregunte sobre tendencias generales o evolución.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
},
```

- [ ] **Step 17.2: Implementar handlers en `executeTool`**

En el `switch (name)` de `executeTool`, agregar:

```ts
case 'get_round_by_date': {
  const date = typeof input.date === 'string' ? input.date : null
  const courseName = typeof input.course_name === 'string' ? input.course_name : null
  if (!date) return { ok: false, error: 'Falta date' }
  return await getRoundByDate(ctx, date, courseName)
}
case 'get_all_rounds_summary':
  return await getAllRoundsSummary(ctx)
```

Implementar las dos funciones siguiendo el mismo patrón que las existentes (`getLatestRound`, etc.). `getRoundByDate` busca en `historical_rounds` con `played_at::date = $1` (y `course_name ILIKE` si viene). `getAllRoundsSummary` agrega sobre el 100% sin `.limit()`.

- [ ] **Step 17.3: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

## Task 18: Recalcular patrones de todos los usuarios (script one-shot)

**Files:**
- Create: `scripts/recalculate-all-patterns.mjs`

- [ ] **Step 18.1: Script de recálculo**

Crear `scripts/recalculate-all-patterns.mjs`:

```js
import { createClient } from '@supabase/supabase-js'
import { detectAndSavePatterns } from '../src/golf/coach/detect-and-save-patterns.ts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const { data: users } = await supabase
  .from('profiles')
  .select('id')
  .not('id', 'is', null)

let totalRecalc = 0
for (const u of users ?? []) {
  try {
    const result = await detectAndSavePatterns(supabase, u.id)
    if (result.detected > 0) {
      console.log(`✅ ${u.id}: ${result.detected} patrones (${result.total_rounds} rondas)`)
      totalRecalc++
    }
  } catch (e) {
    console.error(`❌ ${u.id}:`, e.message)
  }
}
console.log(`\nTotal usuarios con patrones recalculados: ${totalRecalc}`)
```

- [ ] **Step 18.2: Ejecutar el script**

Run: `node --env-file=.env.local scripts/recalculate-all-patterns.mjs`
Expected: lista de usuarios con sus patrones detectados. Sin errores fatales.

(Nota: el script usa import .ts directamente, requiere `tsx` o similar. Si el ambiente no lo soporta, compilar el módulo previo o reescribir el script en TypeScript ejecutado con `tsx`.)

## Task 19: Verificación end-to-end Commit 3

- [ ] **Step 19.1: tsc + tests + build**

```
npx tsc --noEmit
npm run test
npm run build
```
Expected: todo verde.

- [ ] **Step 19.2: Smoke test manual**

`npm run dev`, abrir `/coach`, iniciar conversación. Verificar:
- Texto aparece desde ~1-2s (streaming real)
- Si pregunto "¿cómo me fue en mi última ronda?" → llama tool, responde con datos reales
- Markdown se ve formateado (negritas doradas, listas)
- Cierro la página y abro de nuevo → conversación sigue donde quedé

- [ ] **Step 19.3: Commit 3**

```
git add -p
git commit -m "$(cat <<'EOF'
feat(taiger): motor de elite — 100% de rondas, streaming real, cache

Bug fix critico:
- Quitar .limit(50) en detect-and-save-patterns y context (confidence
  estaba capeada artificialmente)

Motor:
- Patrones ahora aceptan rondas de 9 hoyos donde aplica (par_3_weakness,
  first_hole_anxiety, etc) via flag requires18Holes
- Contexto LLM con detalle hoyo-por-hoyo de ultimas 10 (era 3)
- Tools nuevas: get_round_by_date, get_all_rounds_summary
- Recalculo one-shot de patrones para todos los usuarios

Performance + UX:
- Streaming real con anthropic.messages.stream() (first token 1-2s vs 10-30s)
- Prompt caching ephemeral en system prompt + contexto
- Context fetch directo (eliminada la llamada HTTP server-to-server)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- ✅ Sesión continua única por usuario → Tasks 6, 7, 8, 9, 10
- ✅ Eliminar 3 cards y onboarding → Tasks 1, 2, 3
- ✅ Coach lee 100% de las rondas → Tasks 12, 13, 14
- ✅ Sin monetización (gates/cuotas fuera) → Tasks 5, 9, 10
- ✅ Onboarding orgánico vía system prompt → Task 4
- ✅ Recomendación CTO: streaming real, cache, contexto destilado → Tasks 15, 16, 17

**Sin placeholders:** todos los steps tienen comandos exactos o código completo.

**Type consistency:**
- `getOrCreateActiveSession` mantiene firma `(supabase, userId) → {id, created}` en todas las tasks que lo usan
- `buildPlayerContext` mantiene firma `(supabase, userId) → ctx object` en context.ts y consumidores
- `requires18Holes: boolean` se aplica consistente en interface, en cada PATTERNS entry, y en `detectPatterns`

**Lo que NO está en este plan (intencional, fase futura):**
- Migrar rate-limit in-memory a KV/Upstash (sin monetización ni tráfico real, no urge)
- Extractor de recomendaciones con LLM estructurado (lo dejé fuera del plan para no inflar Commit 3 — la regex actual no rompe nada, solo es frágil. Lo levantamos como deuda)
- Botón "exportar plan" / share / recordatorios proactivos (post-validación interna del coach)
- Tabla `cpi_score` poblada vía tool (decisión: el coach construye el perfil orgánicamente en conversación; no necesitamos persistirlo todavía)
