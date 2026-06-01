# AI Gateway — Fase 3: streaming + tool-calling con fallback (diseño)

**Fecha:** 2026-06-01
**Estado:** DISEÑO — pendiente de `plan-eng-review` antes de implementar.
**Autor:** Claude (CTO)
**Spec padre:** `docs/superpowers/specs/2026-05-30-ai-gateway-arquitectura-design.md`

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
