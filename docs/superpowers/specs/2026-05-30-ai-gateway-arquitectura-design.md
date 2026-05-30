# Spec — Arquitectura de IA de Golfers+ (AI Gateway central + resiliencia de elite)

**Fecha:** 2026-05-30
**Autor:** Claude (CTO)
**Estado:** aprobado para implementación (autonomía CTO delegada por Juanjo)
**Detonante:** correo de Anthropic — la org personal superó el rate-limit de Haiku 519 veces en 24h, degradando el servicio. En paralelo, agentes recibieron `529 Overloaded`. Ambos exponen el mismo hueco: **no tenemos red de contención cuando un proveedor de IA falla o nos throttlea.**

---

## 1. Problema (causa raíz, con datos)

Diagnóstico verificado el 2026-05-30:

- **claude-mem NO es el culpable.** Sus logs (28–30 may) no tienen errores de rate-limit; corre con auth `cli` sobre el plan Max ($100/mes), no sobre la API console.
- **El rate-limit de Haiku en la API console viene de las features que usan `ANTHROPIC_API_KEY` + `claude-haiku-4-5`:**
  - `src/app/api/torneos/draft/[id]/assistant/route.ts` (asistente de armado de torneo, **en vivo para golfistas**).
  - `scripts/inbox-triage.mjs` + los E2E `e2e/organizar-campeonato-asistente.spec.ts`, que martillan el endpoint del asistente en cada corrida de test.
- **El error de diseño:** desarrollo (E2E, scripts locales, 18 worktrees de agentes) y producción comparten **la misma única llave** sin aislamiento, sin fallback entre proveedores, sin caché, sin observabilidad. Una ráfaga de dev puede throttlear al golfista en pleno torneo → violación directa de CERO FALLOS.

### Lo que YA existe (no arrancamos de cero)

- Tabla `llm_models` en Supabase: registro con `role`, `model_id` en formato `provider/model`, `status`, `fallback_to_model_id`, costo por 1M tokens. Diseñada explícitamente para "lista de modelos a probar en orden".
- `src/lib/cerebro/llm-models.ts`: `resolveModelByRole()` y `resolveFallbackChain()` que devuelven la cadena de model_ids.
- Patrón de logging de IA: `rag_query_log` + query-logger en `src/golf/coach/v3/retrieval/`.
- SDKs ya instalados: `@anthropic-ai/sdk` y `@google/generative-ai`. `GEMINI_API_KEY` ya en el stack.

**El hueco concreto:** (a) nadie EJECUTA la cadena con fallback real — `resolveFallbackChain` devuelve strings y nada los corre; (b) las cadenas son solo intra-Anthropic (sonnet→haiku), sin Gemini, así que si Anthropic se satura no hay red; (c) los call-sites hardcodean el modelo y llaman al SDK directo; (d) no hay separación prod/dev, ni degradación elegante, ni observabilidad accionable, ni caché.

---

## 2. Objetivo

Una capa única (`src/lib/ai/`) por donde pase **toda** llamada a LLM de la app, construida sobre el registro `llm_models` existente, que entregue los 6 puntos pedidos:

1. **Control de tráfico central** — un solo módulo, modelos por rol (no hardcode).
2. **Llaves/entornos separados** prod vs dev — dev jamás consume el cupo del golfista.
3. **Fallback automático multi-proveedor** Claude ↔ Gemini.
4. **Degradación elegante** — el golfista nunca ve un error crudo.
5. **Observabilidad + alerta temprana** — nos enteramos nosotros al 70%, no Anthropic al 519.
6. **Caché de respuestas** — bajar volumen y costo a escala.

Más la lógica de largo plazo (registro de modelos por tarea, guardrails de costo, timeouts, idempotencia en reintentos, validación de salida estructurada centralizada).

### No-objetivos (YAGNI, v1)

- No migrar TODOS los call-sites en la fase 1 (solo los 2 de Haiku que causan el incendio).
- No construir un dashboard completo en v1 (v1: log + widget admin + chequeo diario; dashboard rico después).
- No adoptar Vercel AI Gateway como dependencia obligatoria en v1 — se deja como **proveedor opcional detrás de la misma interfaz** (independencia de vendor = parte de CERO FALLOS).
- No tocar Voice/Vision (descartado por PM).

---

## 3. Decisiones de arquitectura (tomadas, CTO)

### 3.1 Interfaz única `callLLM`

Todo el código de la app llama a UNA función:

```ts
// src/lib/ai/index.ts
const result = await callLLM({
  role: 'evaluator',              // mapea a llm_models.role → cadena de modelos
  system,                          // prompt de sistema (cacheable)
  messages,                        // historial
  schema,                          // opcional: Zod para salida estructurada validada
  signal,                          // opcional: AbortSignal (timeout/cancelación)
  cacheKey,                        // opcional: si presente, intenta caché de respuesta
})
// result: { text, model_used, provider, fallback_used, tokens, cached, latency_ms }
```

Los call-sites quedan **desacoplados del proveedor**: piden un *rol* ("evaluador", "chat primario"), no un modelo. Cambiar de modelo/proveedor = cambiar datos en `llm_models`, no código.

### 3.2 Motor de ejecución con fallback

`src/lib/ai/gateway.ts`:

- Resuelve la cadena vía `resolveFallbackChain(role)` (con la mejora 3.4: cadenas que cruzan proveedores).
- Itera la cadena. Para cada `provider/model`:
  - Enruta al SDK correcto por prefijo: `anthropic/*` → `@anthropic-ai/sdk`; `google/*` o `gemini/*` → `@google/generative-ai`.
  - Aplica **retry con backoff exponencial** (config: 2 reintentos, base 500ms, jitter) ante `429`, `529`, `5xx`, timeout o error de red.
  - Si agota reintentos → **pasa al siguiente proveedor de la cadena** (esto es el fallback que hoy no existe).
- Si la cadena entera falla → lanza `AllProvidersFailedError` (lo captura la capa de degradación 3.5).
- **Timeout duro por llamada** (config por rol; default 30s) — nunca cuelga una request en un torneo.
- **Idempotencia:** las tareas con efectos (ej. asistente que confirma acciones) reciben un `idempotencyKey`; el motor garantiza que un fallback/reintento no duplica el efecto (el caller registra el efecto una sola vez por key).

### 3.3 Separación prod/dev (corrige el error de diseño)

Mismo problema real: **una sola org de Anthropic comparte el rate-limit aunque generes N llaves.** Por lo tanto la separación NO es por llave sino **por cadena de proveedor según entorno**:

- Variable `AI_ENV` derivada de `VERCEL_ENV` (`production` → `prod`; resto → `dev`).
- **prod:** cadena normal (`anthropic/... → google/gemini-...`).
- **dev / E2E / scripts locales:** cadena que arranca en **Gemini free-tier** y NO toca la llave Anthropic de producción. Implementación: `gateway` filtra/reescribe la cadena cuando `AI_ENV !== 'prod'` para excluir proveedores marcados `prod_only` en `llm_models.config`.
- `scripts/inbox-triage.mjs` y los E2E pasan a usar `callLLM` con `AI_ENV=dev` → dejan de quemar el cupo del golfista. **Esto solo elimina la mayor parte de las 519 llamadas.**
- A futuro (opcional, cuando haya presupuesto): org Anthropic separada para prod → aislamiento total del rate-limit. Documentado, no requerido para v1.

### 3.4 Cadenas cross-proveedor (data)

Migración de datos en `llm_models`: agregar entradas Gemini como fallback de los roles de chat/evaluación.

- `evaluator`: `anthropic/claude-haiku-4-5` → `google/gemini-2.5-flash-lite` (fallback nuevo).
- `primary_chat`: `anthropic/claude-sonnet-4-6` → `anthropic/claude-haiku-4-5` → `google/gemini-2.5-flash` (extiende la cadena con Gemini al final).
- Marcar proveedores `prod_only` donde aplique vía `config`.

Validación obligatoria: Gemini debe pasar el banco de pruebas para esos roles antes de quedar como fallback productivo (calidad — el coach tiene contrato de comunicación de 6 piezas). Si la calidad de Gemini no alcanza para `primary_chat`, queda como último recurso de *disponibilidad* (mejor degradado que caído), nunca como default.

### 3.5 Degradación elegante (el golfista nunca ve error crudo)

- **Interactivo (asistente de torneo, coach):** si `AllProvidersFailedError` → la API responde `200` con un payload tipado `{ degraded: true, message: "El asistente está ocupado, probá de nuevo en unos segundos." }`. La UI muestra un estado amable + botón "reintentar". Nunca un `502`/`500` crudo.
  - **Desviación consciente en Fase 1 (asistente de torneo):** la ruta `draft/assistant` **mantiene su contrato previo `503` + `{ error: 'IA no disponible, editá manualmente' }`** en vez de `200 {degraded}`. Razón: ese 503 ya existía y el cliente lo maneja; cambiar el contrato HTTP + el cliente excede el alcance de Fase 1 y agrega riesgo a una ruta en vivo. El payload `200 {degraded}` se adopta en Fase 4 junto con la actualización del cliente. No es regresión (comportamiento idéntico al de `main`).
  - **Follow-up (Fase 2):** cablear un `AbortSignal` real al `withTimeout` del gateway para CANCELAR la llamada del proveedor al vencer el timeout (hoy la promesa descartada sigue consumiendo tokens hasta completar). Agregar `abort` ya está contemplado en `isTransient`.
- **No interactivo (inbox triage):** ante fallo total → el reporte queda en estado `pendiente_retry` y se reintenta en la próxima corrida (no se pierde, no se marca error de cara al usuario).
- Todo fallo total se captura con `captureError()` (contexto único por call-site) para que lo veamos.

### 3.6 Observabilidad + alerta temprana

- Tabla nueva `ai_usage` (o extender `rag_query_log`): por llamada → `ts, ai_env, role, provider, model, status, fallback_used, retries, tokens_in, tokens_out, latency_ms, cost_est`. Escritura best-effort (no bloquea ni rompe la request si falla el log).
- Widget en `/admin/sistema`: llamadas/día, % fallback, % error, costo estimado, headroom vs rate-limit conocido.
- **Alerta temprana:** chequeo (cron o en `health-check`) que dispara aviso al inbox/Telegram cuando: tasa de `429/529` en la última hora supera umbral, o llamadas Haiku del día > 70% del tier conocido. Nos enteramos nosotros antes que Anthropic.

### 3.7 Caché

- **Prompt caching de Anthropic** para los system prompts grandes (coach v3, asistente) — marca `cache_control` en los bloques estables. Ahorro inmediato de tokens/costo, cero cambio de comportamiento.
- **Caché de respuesta** para llamadas idempotentes: clave `hash(role + system + input)`. v1 aplica a inbox-triage (textos repetidos) y consultas idénticas del asistente. TTL configurable; store: tabla `ai_response_cache` o KV. `cached: true` se reporta en el resultado y en `ai_usage`.

### 3.8 Lógica de largo plazo

- **Registro de modelos por tarea:** `llm_models` es la única fuente; agregar `role`s finos si una feature necesita modelo propio. Nada de strings de modelo en código de app.
- **Guardrails de costo:** tope duro diario por entorno (config); al superarlo, el gateway degrada a Gemini free o responde `degraded` (nunca runaway de gasto).
- **Vercel AI Gateway como proveedor opcional:** detrás de la misma interfaz `callLLM`, se puede enrutar por AI Gateway (provider strings ya compatibles) para sumar su observabilidad/fallback sin acoplarnos — flip por env.
- **Validación de salida estructurada centralizada:** Zod + reintento controlado vive en el gateway, no duplicado en cada ruta.

---

## 4. Componentes y límites (cada unidad, un propósito)

| Unidad | Propósito | Depende de |
|---|---|---|
| `src/lib/ai/index.ts` | API pública: `callLLM`, tipos. Único import para call-sites. | gateway |
| `src/lib/ai/gateway.ts` | Ejecuta cadena con retry+fallback+timeout. | providers, registry, usage-log |
| `src/lib/ai/providers/anthropic.ts` | Adaptador SDK Anthropic → forma común. | `@anthropic-ai/sdk` |
| `src/lib/ai/providers/gemini.ts` | Adaptador SDK Gemini → forma común. | `@google/generative-ai` |
| `src/lib/ai/registry.ts` | Resuelve cadena por rol + filtro prod/dev. | `cerebro/llm-models` |
| `src/lib/ai/usage-log.ts` | Escritura best-effort a `ai_usage`. | supabase |
| `src/lib/ai/cache.ts` | Caché de respuesta (get/set por clave). | store |
| `src/lib/ai/degrade.ts` | Payloads tipados de degradación. | — |

Cada uno testeable en aislamiento; los providers se mockean para testear el gateway sin pegar a la red.

---

## 5. Plan por fases

- **Fase 1 — Apagar el incendio + base del gateway (esta entrega):**
  `src/lib/ai/` (index + gateway + 2 providers + registry), migración de `draft/assistant` (ruta en vivo) a `callLLM`, separación prod/dev (dev→Gemini), degradación elegante vía `captureError` + 503 amable, tests unit (gateway con providers mockeados: happy path, fallback 429/529, retry, no-transitorio, prod/dev, cadena agotada — 11 tests). El asistente en dev/preview deja de tocar la llave Haiku de prod → corta el contribuyente dominante de las 519 (E2E que martillaban la ruta).
  **Diferido conscientemente:** `scripts/inbox-triage.mjs` es **multimodal** (vision) y de baja frecuencia (corre solo en `/inbox`); su migración a Gemini-vision va en Fase 4 para no inflar esta entrega. La tabla `ai_usage` (observabilidad) también es Fase 2.
- **Fase 2 — Observabilidad + alerta:** tabla `ai_usage`, widget admin, alerta 70%.
- **Fase 3 — Caché:** prompt caching en system prompts grandes + caché de respuesta en triage.
- **Fase 4 — Migración total:** mover `taiger/chat`, `playground`, `import/confirm` (Sonnet), `inbox-triage` (multimodal → Gemini-vision) y el resto al gateway; retirar todo `new Anthropic()` directo de los call-sites; canario "ningún call-site instancia el SDK directo fuera de `src/lib/ai/`". Aplica "el que toca, ordena" a `import/screenshot/route.ts` (767 LOC) si se toca.
- **Fase 5 (opcional):** Vercel AI Gateway como proveedor; org Anthropic prod separada.

Cada fase: worktree, tests, `/pre-push`, `superpowers:code-reviewer` (>100 LOC), demo/aviso a Juanjo, deploy confirmado.

---

## 6. Testing

- Unit: gateway (fallback al 2º proveedor ante 429/529; backoff; timeout; corte de cadena; idempotencia), registry (filtro prod/dev), providers (forma de salida con SDK mockeado), degrade (payloads).
- Canario: ningún call-site de app hace `new Anthropic()`/`getGenerativeModel()` directo fuera de `src/lib/ai/` (regla anti-regresión).
- Integración liviana: `inbox-triage` en `AI_ENV=dev` no instancia el cliente Anthropic.
- Smoke prod post-deploy: asistente de torneo responde; forzar 429 simulado → cae a Gemini sin error de cara al usuario.

---

## 7. Riesgos y mitigaciones

- **Calidad Gemini ≠ Claude:** validar contra banco de pruebas antes de fallback productivo; Gemini como disponibilidad, no como default de calidad (3.4).
- **Gemini free-tier también tiene límite:** suficiente para dev y para fallback de baja frecuencia; no es la respuesta a escala (por eso guardrails + caché + a futuro org separada).
- **Punto único de falla si todo va a un proveedor:** la cadena multi-proveedor es justamente lo contrario; nunca todo a uno.
- **Tocar ruta productiva (asistente en vivo):** worktree + TDD + code-review + smoke; `draft/assistant` es 169 LOC (limpio), no gatilla "el que toca, ordena".
