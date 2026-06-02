# Auditoría de wiring — Cerebro V3 (2026-06-02)

> **Propósito:** verificar que cada pieza declarada "completa" de cerebro v3 esté
> realmente conectada al camino de ejecución del coach, no código muerto con tests
> verdes. Disparada por Juanjo: *"que no vuelva a pasar nunca más que las
> implementaciones quedan perdidas como decoración"*.
>
> Este doc es el **baseline (estado-cero)** contra el que mide el canario
> anti-huérfanos. Ver memoria `feedback_anti_decoracion_wiring`.

## Método

Se trazó el request path real del coach (`src/app/api/taiger/chat/route.ts` →
`src/golf/coach/*` → `src/golf/coach/v3/*`) y se buscó, por cada entregable de
Olas 0 y 1e, un consumidor en runtime (no test, no admin-only).

## Veredicto

| Pieza (figura completa) | Código | ¿Consumida en runtime del coach? | Evidencia | Veredicto |
|---|---|---|---|---|
| RAG reglas oficiales (1e) | ✅ | ✅ tool `search_knowledge_chunks` + secciones prompt, gated por flag | `route.ts:7-9,110,199-218`; `v3/tools/handle-tool-use.ts` | ✅ VIVO |
| Coach reenfocado / engagement (1e) | ✅ | ✅ `ENGAGEMENT_SECTION` appendeada al system prompt | `route.ts:110`; `v3/prompts/sections/engagement.ts` | ✅ VIVO |
| Motor patrones+planes (v2) | ✅ | ✅ contexto con patrones/plan/outcomes; plan activo real | `golf/coach/context.ts:41-127`; `plan-engine.ts` | ✅ VIVO |
| `cerebro_weights` + sliders `/admin/cerebro/pesos` | ✅ | 🔴 **NO** — sin `applyWeight`; solo lo escriben sliders/admin | consumidores solo en `app/api/admin/cerebro/*` y `app/admin/cerebro/pesos/*` | 🔴 DECORATIVO |
| 9 métricas extraídas (`golf/coach/metrics/`, Ola 0) | ✅ | 🔴 **NO** — solo las importa `metrics/__tests__/regression.test.ts` | grep `from '@/golf/coach/metrics'` | 🔴 HUÉRFANO |
| Tabla `cerebro_events` (Ola 0) | ✅ | 🔴 **NO** — cero lecturas/escrituras en `src` | grep `cerebro_events` → 0 matches | 🔴 HUÉRFANO |
| AI Gateway / fallback (Fases 1+2) | ✅ | 🟡 usado por `torneos/draft/assistant` + `import/confirm`; **el coach NO** | `route.ts:115` (`new Anthropic`), `:162` (`model: 'claude-sonnet-4-6'`), `:404` (comentario "migrar al gateway" pendiente) | 🟡 PARCIAL — coach sin fallback |
| `llm_models` + cadena fallback | ✅ | 🔴 el coach usa modelo hardcodeado | `route.ts:162` | 🔴 HUÉRFANO (coach) |

## Hallazgos graves

### 1. Paramétrico vivo decorativo
`cerebro_weights` no tiene consumidor en runtime. Mover un slider en
`/admin/cerebro/pesos` no altera la respuesta del coach. La memoria
`feedback_cerebro_parametrico_vivo` ya advertía: *"sin esto, los sliders son
decoración"*. Hoy lo son.

### 2. Coach sin red de fallback (riesgo CERO FALLOS activo)
El coach llama a Anthropic directo con `claude-sonnet-4-6` fijo, sin fallback. El
AI Gateway (que tiene cadenas Anthropic→Gemini) **no lo cubre** porque `callLLM`
es no-streaming/sin-tools y el coach es streaming+tools. La migración full
(streaming, "Fase 3") fue **rechazada** el 2026-06-02 (`98e6a3f`) por
over-engineering. Con el rate-limit de Anthropic del 30-may, un throttle en
torneo deja al coach caído.

## Remediación (orden)

1. **Canario anti-huérfanos** (`src/golf/coach/v3/__tests__/wiring-canary.test.ts`):
   falla en CI si una pieza listada como "debe estar viva" pierde su consumidor
   en runtime. Guardián permanente.
2. **P0 resiliencia coach:** fallback degradado no-streaming a Gemini vía
   `callLLM` existente cuando Anthropic falla. No rehacer streaming-gateway.
3. **Ola 2 conecta el paramétrico vivo:** el motor de foco será el primer lector
   runtime de `cerebro_weights` (rankeo de patrones ponderado).
4. **Limpieza "el que toca ordena":** conectar o borrar `metrics/` y
   `cerebro_events` huérfanos.

## Estado de datos (usuario v3 = Juanjo)
- Tiene plan activo real: `post_bogey_spiral` / `double_or_worse_pct` baseline 2.8
  → target ≤1, 21 días, creado 2026-05-07 (ventana ya vencida → falta lifecycle
  de cierre/refresh).
- Conclusión: el motor de planes **sí dispara** para él. Su queja de "plan
  genérico" no es falta de motor — es (a) plan no enmarcado en target handicap,
  (b) plan stale sin refresh, (c) sin vista de progreso, (d) prompt poco afilado.
  Esto valida el alcance de Ola 2.
