# AI Gateway — Fase 3: streaming + tool-calling con fallback (diseño)

**Fecha:** 2026-06-01
**Estado:** ❌ **RECHAZADO en `plan-eng-review` (01-jun-2026). NO implementar.** Ver veredicto abajo.
**Autor:** Claude (CTO)
**Spec padre:** `docs/superpowers/specs/2026-05-30-ai-gateway-arquitectura-design.md`

---

## VEREDICTO DEL ENG-REVIEW (01-jun-2026) — NO CONSTRUIR

El `plan-eng-review` + una voz externa independiente (subagente adversarial) concluyeron que **este diseño no debe implementarse**. Decisión de Juanjo (delegada a CTO por ser íntegramente técnica): **el coach se queda con degradación honesta ("tAIger+ está descansando, reintentá"), ya en prod desde el endurecimiento del 529 (PR #84). No se construye fallback a Gemini para el coach.**

### Las tres razones que mataron el diseño

1. **Over-engineering vs CERO FALLOS.** Reconstruir streaming+tools en el gateway es la versión más grande y riesgosa, sobre el hot-path más crítico del producto. La regla correcta: la versión más chica que cumple gana. La versión más chica es la que YA tenemos (degradación honesta).

2. **El fallback propuesto no cubre el caso real.** El coach hace hasta 5 iteraciones de tool-use. El `LLMMessage` del gateway (`types.ts`) ni siquiera representa bloques `tool_use`/`tool_result`, y el historial se acumula en formato Anthropic nativo (`route.ts:189-306`). Caer a Gemini solo es posible en la **primera** vuelta, **antes** de cualquier tool. Pero el coach v3 con RAG casi siempre llama `search_knowledge_chunks` en la primera vuelta → el fallback no se activaría justo en el caso que importa. Además el 529 de Anthropic streaming probablemente sale *dentro* del `for await`, no en la apertura, así que "fallback antes del primer byte" o es indefinido o exige bufferear (matando el streaming que el diseño dice proteger).

3. **Riesgo de reputación irreversible (el corazón de la directiva).** Gemini Flash con el schema anidado de `save_plan` (enums estrictos, `tools.ts:85-156`) tiene historial de ignorar enums y aplanar objetos → **escrituras corruptas a `coach_plans`** y/o **scores alucinados**. Un coach que afirma un dato falso con confianza es PEOR para la reputación que uno que dice "descansando, reintentá". "Mejor tools imperfectas que nada" es un supuesto de producto **falso** bajo CERO FALLOS.

### Qué SÍ quedó hecho (el objetivo de fondo, cumplido por la vía segura)

- Coach endurecido: 529/overloaded → mensaje transitorio honesto (PR #84, en prod). Esto YA es degradación CERO-FALLOS-compatible (sin datos falsos, claro, recuperable).
- Gateway con fallback a Gemini activo donde es **seguro y puro upside**: asistente de torneo (sin tools) e insights de import (sin tools, accesorio). Ahí no hay scores que inventar.

### Cuándo revisitar

Solo si las caídas de Anthropic pasan de evento raro/transitorio a **frecuente y sostenido**. Señal de disparo: la alerta de IA (Fase 2) reportando `error_kind=overloaded/rate_limit` de forma recurrente durante semanas, no un pico aislado. Si se revisita, el approach NO es el de abajo (cross-provider streaming): es el **más simple** que propuso la voz externa — envolver solo el primer request en detección de 529 y caer a una sola llamada Gemini **no-streaming** que corre el loop de tools desde cero en formato Gemini nativo (sin traducción de historial cross-formato), Y con un **gate de calidad medido** contra el banco de pruebas: si Gemini no llega al umbral en `save_plan`/consulta de rondas, la rama segura es degradar a texto-sin-tools o directamente a "descansando" — nunca escribir planes posiblemente corruptos.

### Decisiones técnicas registradas (CTO)
- `admin/taiger/playground`: si alguna vez se quiere su fallback, va por `callLLM` **no-streaming** en PR aparte (no usa SSE) — fuera del scope de cualquier trabajo de streaming.
- Si en el futuro se loguea streaming a `ai_usage`, el row debe emitirse en `finally` para preservar el invariante "1 llamada = 1 row" aun si el stream se corta.

---

> El diseño original se preserva abajo como **registro histórico de los problemas duros** — útil si algún día se revisita. NO es un plan activo.

---

## 1. Problema

El AI Gateway (`src/lib/ai/`) hoy expone `callLLM()` que devuelve `Promise<LLMResult>` con el texto **completo**, con fallback automático Anthropic→Gemini y logging a `ai_usage`. Eso blindó el call-site simple (asistente de torneo, e insights de import — ver Fase 1 + esta PR).

Pero **el coach tAIger+ (`src/app/api/taiger/chat/route.ts`) sigue llamando a Anthropic a pelo** porque usa dos capacidades que `callLLM` NO soporta:

1. **Streaming SSE** — el coach escribe la respuesta token-a-token (`anthropic.messages.stream()` + forward de `text_delta`). First-token ~1-2s vs 10-30s si esperáramos la respuesta completa. Quitarlo sería una regresión UX inaceptable para un producto premium.
2. **Tool-calling en loop** — el coach consulta datos reales del jugador y reglas oficiales vía tools (`TAIGER_TOOLS` + `SEARCH_KNOWLEDGE_TOOL`), con un loop de hasta `MAX_TOOL_ITERS=5` iteraciones. Sin esto el coach inventa scores (alucina).

El mismo bloqueo aplica a `src/app/api/admin/taiger/playground/route.ts` (sandbox admin del coach, usa tools; no necesita streaming al cliente pero comparte el patrón).

**Consecuencia CERO FALLOS:** si Anthropic se satura (529 Overloaded / 429 — el incidente del 30-may que originó el gateway), el coach **no tiene red de seguridad**. Hoy degrada con gracia (mensaje "tAIger+ está descansando, reintentá" — endurecido en esta PR para cubrir explícitamente el 529), pero NO responde. El asistente, que casi no se usa, sí cae a Gemini. Inversión de prioridad: la superficie de IA más importante es la menos protegida.

---

## 2. Objetivo

Extender el gateway para que `callLLM` (o una nueva variante `streamLLM`) soporte **streaming + tool-calling con fallback de proveedor**, y migrar `taiger/chat` + `admin/taiger/playground` a él. Resultado: si Anthropic cae, el coach responde vía Gemini sin perder streaming ni tools.

---

## 3. Los tres problemas duros (a resolver en plan-eng-review)

### 3.1 Abstracción de streaming cross-provider
Anthropic (`messages.stream`) y Gemini (`generateContentStream`) tienen shapes de evento distintos. Hay que definir un tipo de evento unificado del gateway, p.ej.:

```ts
type LLMStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'done'; stopReason: 'end_turn' | 'tool_use' | 'max_tokens'; usage: TokenUsage }
```

Cada adapter traduce su stream nativo a este shape. El call-site consume el shape unificado y se olvida del proveedor.

### 3.2 Fallback mid-stream — ¿hasta dónde?
**Pregunta clave:** si Anthropic falla **después** de haber emitido deltas al cliente, ¿podemos reintentar con Gemini?

- **No transparente:** una vez que mandaste texto parcial por SSE, no podés "deshacerlo". Reintentar con Gemini duplicaría/contradiría lo ya mostrado.
- **Propuesta:** fallback **solo antes del primer byte**. El gateway intenta abrir el stream con el proveedor 1; si falla en la **apertura** (429/529/timeout de conexión antes del primer evento), cae a Gemini y reabre. Una vez que fluyó el primer `text_delta`, un error posterior es error-de-stream → se reporta al cliente (mensaje degradado actual), no se reintenta.
- Esto cubre el caso del incidente real (Anthropic 529 al **iniciar** la llamada), que es el 90% del valor.

### 3.3 Paridad de tool-calling Anthropic ↔ Gemini
- Schemas de tools difieren: Anthropic `{name, description, input_schema}` vs Gemini `functionDeclarations`. Hay que traducir `TAIGER_TOOLS` a ambos formatos (o un formato neutral del gateway que cada adapter convierta).
- El **loop de tool-use** (ejecutar tool → reinyectar resultado → continuar) debe vivir en el gateway o seguir en el call-site. **Propuesta:** el loop se queda en el call-site (ya está bien resuelto en `taiger/chat`), y el gateway expone `streamLLM` por **una** vuelta (un request → un stream). El call-site orquesta las iteraciones. Así el gateway no necesita conocer `executeTool` ni la semántica de las tools de golf.
- Riesgo: la calidad de tool-calling de Gemini Flash es menor que Sonnet. Aceptable como **fallback degradado** (mejor responder con tools imperfectas que no responder), pero hay que medirlo contra el banco de pruebas del coach.

---

## 4. API propuesta (borrador — sujeta a plan-eng-review)

```ts
// Nueva función para call-sites que necesitan streaming/tools.
// callLLM() (no-streaming) se mantiene para el resto.
export async function streamLLM(params: StreamLLMParams): Promise<{
  stream: AsyncIterable<LLMStreamEvent>
  meta: { provider: string; model: string; fallbackUsed: boolean }
}>

interface StreamLLMParams {
  role: LLMRole
  system?: string | SystemBlock[]   // soporta cache_control ephemeral
  messages: LLMMessage[]
  tools?: NeutralToolDef[]           // formato neutral → cada adapter traduce
  maxTokens?: number
  timeoutMs?: number
  aiEnv?: AiEnv
}
```

- Logging a `ai_usage`: el gateway loguea al **cerrar** el stream (cuando tiene `usage` final), igual que `callLLM`.
- `fallbackUsed` se resuelve en la apertura (§3.2).

---

## 5. Plan de migración (orden sugerido)

1. **`streamLLM` + adapter Anthropic** (paridad con lo que hoy hace `taiger/chat` directo). Migrar `taiger/chat` a `streamLLM` con **solo Anthropic** en la cadena primero → verificar cero regresión de UX/tools contra banco de pruebas.
2. **Adapter Gemini streaming + tools** + traducción de schema. Agregar Gemini a la cadena de `streamLLM`.
3. **Forzar fallback en staging** (simular 529 Anthropic) → verificar que el coach responde vía Gemini con tools.
4. **Migrar `admin/taiger/playground`** (mismo patrón, sin SSE al cliente).
5. Medir calidad coach-vía-Gemini contra los 30+ casos canario + 5 perfiles sintéticos (regla 10 cerebro v3).

---

## 6. Coordinación con Cerebro V3 (CRÍTICO)

`taiger/chat` es la **superficie activa de Cerebro V3** (importa `src/golf/coach/v3/`). Regla 2 del protocolo cerebro v3: un solo worktree activo por vez en esa área. **Esta migración debe:**
- Coordinarse con la ola de cerebro v3 en curso (no editar `taiger/chat` en paralelo a una ola activa).
- Pasar por demo en vivo a Juanjo (regla 4) y banco de pruebas (regla 10) antes de merge.
- Ser ortogonal a la lógica cognitiva: solo cambia **cómo se llama al LLM**, no qué piensa el coach.

---

## 7. Fuera de alcance (NO entra en Fase 3)

- Multimodal/vision en el gateway (import/screenshot sigue usando Gemini Vision directo; Voice/Vision descartados por PM 2026-05-26).
- Prompt caching a nivel gateway (el `cache_control` ephemeral del coach se preserva pasando `system` como bloques; optimización de caché es Fase 4).
- `AbortSignal` real que cancele la llamada HTTP en timeout (Fase 4).
- Resolución de cadena por DB (`llm_models`) en hot-path (sigue siendo estática en `registry.ts`).

---

## 8. Criterio de éxito

- Anthropic 529 simulado al iniciar → coach responde vía Gemini, con tools, en streaming, sin que el usuario note más que un modelo distinto.
- Cero regresión en `taiger/chat` con Anthropic sano (UX, tools, anti-alucinación, persistencia de sesión).
- `ai_usage` registra las llamadas del coach (rol `primary_chat`), alimentando la alerta de Fase 2.
- Suite verde + banco de pruebas del coach ≥ baseline.
