# Spec — Medición real de costo de IA por item (PR-0 observabilidad)

**Fecha:** 2026-06-11
**Objetivo:** Saber, con número real y de fácil acceso, cuánto cuesta cada fuente de gasto de IA — para responder **¿esta app puede ser rentable?** La métrica que decide todo: **costo de IA por usuario activo / mes** y **costo por conversación del coach**.
**Por qué ahora (PR-0, antes del plan WOW):** el credit-out del 11-jun nos agarró ciegos porque el coach gasta sin medición. Medir primero; el plan WOW sube tokens/turno y hay que verlo en vivo.

---

## Los items a medir por separado

| Item | Key / fuente | Cómo se separa |
|---|---|---|
| **Claude Code (dev agent)** | suscripción Max o key propia de la CLI | Anthropic Console por workspace/key. NO se instrumenta en la app. |
| **Scripts dev/eval** | hoy usan la key de la app (`.env.local`) | mover a key/workspace "Dev" + taggear `ai_env='dev'` en la app |
| **Coach (prod)** | key prod de la app | `surface='coach_chat'` en `ai_usage` |
| **Import (visión Gemini)** | key prod | `surface='import_vision'` |
| **RAG reglas** | key prod | `surface='rag_search'` |
| **Asistente torneos** | key prod | `surface='tournament_assistant'` |

Dos capas de medición (las dos hacen falta):
- **Anthropic Console (gratis, ya):** separa Claude-Code / Dev / Prod por **workspace + key**, por modelo y día. Acción de Juanjo (solo él entra a la consola). Responde la pregunta histórica HOY.
- **App-side (`ai_usage` + dashboard):** separa DENTRO de prod por **usuario, feature, modelo**. Es la que da el unit-economics. Esto es lo que construimos acá.

---

## Decisiones de diseño (no menú — esto es lo que se hace)

### 1. Migración `ai_usage` — agregar 4 columnas
```sql
ALTER TABLE ai_usage
  ADD COLUMN IF NOT EXISTS user_id uuid,                 -- quién (null = sistema/cron/script)
  ADD COLUMN IF NOT EXISTS surface text,                -- coach_chat|import_vision|rag_search|tournament_assistant|eval|other
  ADD COLUMN IF NOT EXISTS cache_read_tokens int NOT NULL DEFAULT 0,   -- input servido de caché (0.1×)
  ADD COLUMN IF NOT EXISTS cache_write_tokens int NOT NULL DEFAULT 0;  -- input escrito a caché (1.25×)
CREATE INDEX IF NOT EXISTS idx_ai_usage_surface_created ON ai_usage (surface, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created    ON ai_usage (user_id, created_at DESC);
```
`role` queda (evaluator/primary_chat/reasoning), pero `surface` es el corte de negocio. `user_id` NUNCA en el dashboard público — solo agregados; RLS ya es service-role only.

### 2. Costo cache-aware (el fix que hace el número REAL)
`estimateCostUsd` hoy miente con caché. Nueva firma:
```ts
// rates por modelo: { in, out, cacheWrite: in*1.25, cacheRead: in*0.10 }
estimateCostUsd(model, { tokensIn, tokensOut, cacheRead=0, cacheWrite=0 }): number
// costo = (tokensIn*in + cacheWrite*in*1.25 + cacheRead*in*0.10 + tokensOut*out) / 1e6
```
`tokensIn` pasa a ser SOLO input no-cacheado (lo que Anthropic llama `input_tokens` cuando hay caché). Mantener overload viejo por compat de los call-sites del gateway hasta migrarlos.

### 3. Instrumentar el coach (el agujero principal)
El coach llama directo a Anthropic en `chat-engine.ts` (stream + tool-loop) y NO loguea. Fix:
- Capturar `message.usage` del stream final del SDK: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` (el stream de Anthropic los expone en `message_start` + `message_delta`; usar `stream.finalMessage()` o acumular del evento `message_stop`).
- **Acumular sobre TODAS las iteraciones del tool-loop** (cada vuelta es una llamada facturada) + la regeneración aritmética + el fallback Gemini.
- Al cerrar el turno, `logAiUsage({ surface:'coach_chat', userId, aiEnv, role:'primary_chat', provider:'anthropic', model: coachModel(), tokensIn, tokensOut, cacheRead, cacheWrite, costUsd, latencyMs, ... })`. Fire-and-forget, NUNCA bloquea el turno (mismo patrón actual).
- El fallback a Gemini loguea con `provider:'google'`, `fallback_used:true`.

### 4. Taggear las demás surfaces
`logAiUsage` extendido con `userId?`, `surface`, `cacheRead?`, `cacheWrite?`. Donde ya se llama (gateway → import, RAG, tournament-assistant), pasar `surface` + `userId`. Los scripts de eval/smoke setean `ai_env='dev'` (o corren con la key Dev) → excluidos del cálculo de rentabilidad prod.

### 5. Dashboard de fácil acceso — `/admin/costos`
Server Component detrás de auth admin, lee `ai_usage` con service-role. Rango por defecto 30 días. Muestra:
- **KPI grande (la pregunta):** costo IA por **usuario activo/mes** (Σ costo prod ÷ usuarios distintos) y **costo por conversación del coach** (Σ coach ÷ sesiones distintas). Al lado, el precio del plan pago → **margen estimado**.
- Costo total **prod vs dev** (separa nuestro testing del gasto real).
- Desglose **por surface** (coach/import/rag/torneos), **por modelo**, **por día** (tendencia).
- **Top 20 usuarios por costo** (para cazar un usuario anómalo antes de que sea un problema).
- % de turnos del coach servidos por caché (mide si el caching está rindiendo).
Reusa `usage-stats.ts` (extendido con los nuevos cortes).

### 6. Alertas (cierra el loop CERO FALLOS)
- El cron `health-check` ya mira IA; agregar: si el costo del día > umbral configurable → alerta Telegram (reusa el canal de PR #81).
- Anthropic Console: Juanjo setea **spend limit por workspace** (Dev y Prod) + billing alert. Tope duro = un eval no puede volver a vaciar prod.

---

## Lo que NO es scope
- Atribuir el gasto de Claude Code (el agente) dentro de la app — eso vive en la consola por key, no se instrumenta. Solo se separa con key/workspace propio.
- Optimizar el costo (ruteo por tiers, Gemini para turnos simples) — ese es el PASO SIGUIENTE, habilitado por esta medición. Acá solo MEDIMOS.

## Plan de ejecución (TDD, 1 PR)
1. Migración (run-sql.mjs, verificar columnas vivas).
2. `costs.ts` cache-aware + test (caso con cache_read/write → costo correcto).
3. `usage-log.ts` extendido (userId/surface/cache) + test.
4. Instrumentar `chat-engine.ts` (capturar usage del stream, acumular loop, log) + test del acumulador. **Aditivo y fire-and-forget → no cambia el comportamiento del coach** (bajo riesgo, pero igual demo + code-reviewer porque toca el path del coach).
5. Taggear surfaces del gateway (import/rag/torneos).
6. `/admin/costos` + extender `usage-stats.ts` + test de los agregados.
7. Alerta de costo en health-check.
8. `/pre-push` + code-reviewer + demo + deploy. Seed de unas llamadas reales en preview para validar que el dashboard muestra número correcto.

## Quick-win inmediato (Juanjo, hoy, gratis)
Mientras se construye esto: `console.anthropic.com → Usage`. Filtrar por API key y por modelo, últimos 30 días. Eso ya te dice el gasto histórico real por key (separa Claude-Code / app) y si Fable estuvo activo. Es la foto retroactiva; el dashboard es la película en vivo y por-usuario.
