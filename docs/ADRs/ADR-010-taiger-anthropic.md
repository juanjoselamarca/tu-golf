# ADR-010 — tAIger+ coach con Anthropic (no Gemini/OpenAI)

**Estado**: Aceptado
**Fecha**: 2026-04-09 (estimado — implementación del coach IA)

## Contexto

tAIger+ es el coach de IA integrado que analiza rondas y da feedback al jugador. Requiere un LLM. Alternativas:

- **OpenAI GPT-4**: más conocido, API madura, precio competitivo
- **Google Gemini**: costo menor, ventana de contexto grande
- **Anthropic Claude**: razonamiento fuerte, mejor en seguir prompts complejos, tool use maduro

Requisitos específicos:
1. **Seguir el system prompt rigurosamente** — tAIger+ debe mantener personalidad de coach de golf específica, usar vocabulario técnico correcto, evitar consejos genéricos de autoayuda
2. **Tool use** — tAIger+ debe poder consultar stats del jugador, buscar patrones, leer contexto de la ronda
3. **Output JSON estructurado** — para guardar en BD y mostrar en UI
4. **Respuestas en Markdown** — para `react-markdown` + `remark-gfm` en frontend

## Decisión

**Anthropic Claude** es el LLM de tAIger+.

API key: `ANTHROPIC_API_KEY` (server-side, nunca expuesto).
SDK: `@anthropic-ai/sdk`.
Modelo default: ver `src/lib/taiger-prompt.ts` y `src/app/api/taiger/chat/route.ts`.

### Por qué Claude

- **Coherencia del coach**: en testing side-by-side, Claude mantuvo mejor la voz de coach de golf técnico. GPT-4 tendía a consejos genéricos ("busca un profesional"), Gemini a respuestas muy cortas.
- **Tool use robusto**: APIs consistentes, llamadas encadenadas sin problemas.
- **Prompt caching**: reduce costos en conversaciones largas del coach (el contexto del jugador es estable).
- **Ecosistema de soporte**: Claude Code y skills de claude-mem están integrados al workflow de desarrollo.

## Consecuencias

### Positivas
- **Calidad del coach consistente** — no requiere constant prompt tuning
- **Costos predecibles** con prompt caching
- **Skills de desarrollo integradas** (este mismo repo usa claude-mem, claude-code-guide)

### Negativas
- **Dependencia de Anthropic**: si la API cae, tAIger+ no responde. Mitigación: degradación graceful (fallback a "el coach está temporalmente no disponible").
- **Vendor lock-in parcial**: cambiar a OpenAI o Gemini requiere adaptar prompts (no trivial para mantener calidad).
- **Precio**: más caro por token que Gemini. Aceptable por la calidad.

## Budget y monitoreo

- **Budget mensual**: definido en cuenta Anthropic — ver Juanjo
- **Uso por usuario**: trackeado en PostHog via eventos `taiger_chat_sent`
- **Rate limiting**: por usuario — pendiente (deuda técnica — un usuario malicioso podría consumir budget)

## Cuándo reconsiderar

- Si Anthropic sube precios >3× sin equivalente mejora de calidad
- Si Gemini o GPT-5 demuestran paridad en coaching de golf con pricing significativamente menor
- Si tenemos señal clara de que los usuarios encuentran al coach inadecuado

Por ahora: **Claude es la apuesta**. Plan B (Gemini) documentado pero no implementado.

## Migración potencial

Si algún día cambiamos, la arquitectura ayuda:
- `src/golf/coach/prompts.ts` centraliza los prompts → migrable
- `src/app/api/taiger/chat/route.ts` es la única ruta que llama a la API → migrable
- El formato de respuesta (JSON + Markdown) es provider-agnostic

Migración estimada: ~2 sprints. No trivial pero factible.
