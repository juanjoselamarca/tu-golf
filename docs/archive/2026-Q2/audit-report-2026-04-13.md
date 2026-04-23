# Golfers+ — Auditoría completa

**Fecha:** 2026-04-13
**Alcance:** 9 features, 463 tests automatizados nuevos
**Metodología:** Tests ponderados por severidad (CRITICAL ×3, IMPORTANT ×2, MINOR ×1)

---

## Score global: **89%**

Promedio ponderado ajustado por severidad de hallazgos (no solo tests passing).

## Score por feature

| # | Feature | Tests | Score | CRITICAL | IMPORTANT | Estado |
|---|---------|-------|-------|----------|-----------|--------|
| F1 | Motor de scoring | 54 | **100%** | 0 | 0 | ✅ Sólido |
| F2 | Creación de ronda | 36 | **95%** | 0 | 3 | ⚠️ Bugs menores |
| F3 | Torneos a escala | 45 | **88%** | 3 | 2 | ⚠️ WD/DQ crítico |
| F4 | Espectador en vivo | 65 | **92%** | 0 | 2 | ⚠️ Paleta inconsistente |
| F5 | Share cards | 38 | **85%** | 2 | 2 | ⚠️ Match Play + Stableford rotos |
| F6 | Historial | 31 | **74%** | 2 | 2 | 🔴 **Datos no persisten** |
| F7 | Auth y onboarding | 74 | **95%** | 0 | 1 | ⚠️ Recuperar password roto |
| F8 | tAIger+ coach IA | 63 | **71%** | 5 | 0 | 🔴 Multi-turn roto |
| F9 | Importación | 62 | **78%** | 2 | 2 | ⚠️ FIT stub + OCR sin key |

---

## 🔴 CRITICAL — arreglar antes del lanzamiento (14 issues)

### [C-F6-1] Rondas finalizadas NO guardan formato_juego/modo_juego
**Archivo:** `src/app/ronda-libre/[codigo]/score/page.tsx:~583`
Todos los badges de formato que implementamos en el historial NO aparecen en producción porque el insert a `historical_rounds` omite estos campos.
**Fix:** 2 líneas en el payload del insert.
**Esfuerzo:** S (15 min) — **P0 máxima prioridad**

### [C-F6-2] Torneos finalizados tampoco guardan formato/modo
**Archivo:** `src/app/api/game/actions.ts:~212`
Mismo problema en el flujo de torneo.
**Esfuerzo:** S (15 min) — **P0**

### [C-F8-1] tAIger+ multi-turn roto
**Archivo:** `src/app/api/taiger/chat/route.ts:149`
Solo envía el último mensaje del usuario al LLM. El coach no recuerda la pregunta previa. La conversación se rompe después de 2 intercambios. + `MAX_MESSAGES=3` en frontend trunca aún más.
**Fix:** Pasar `body.messages` completo + subir límite.
**Esfuerzo:** M (2h) — **P0 prioridad máxima, es el WOW feature**

### [C-F8-2] Extracción de recomendaciones por keyword matching
Genera falsos positivos ("No te recomiendo X" se guarda como recomendación). `score_after` nunca se actualiza — el tracking de progreso está muerto.
**Fix:** Anthropic tool use con JSON schema.
**Esfuerzo:** L (1 día) — **P1**

### [C-F8-3] Scores hoyo a hoyo no en contexto
El LLM solo ve totales por ronda. No puede decir "en el hoyo 5 tuviste +2 las últimas 3 rondas". Los datos existen en `historical_rounds.scores` pero no se pasan.
**Esfuerzo:** L (1 día) — **P1**

### [C-F8-4] Par de cancha hardcodeado a 72
`over_under = total_gross - 72`. Las 137 canchas de FedeGolf tienen pares distintos. Error de +/- 2 en todas las rondas de canchas no-par-72.
**Esfuerzo:** S (2h) — **P1**

### [C-F8-5] Sesión limitada a 3 intercambios
`MAX_MESSAGES=3` en frontend. Un coach real no corta a las 3 preguntas.
**Esfuerzo:** S (10 min) — **P0**

### [C-F5-1] Match Play share no existe
Comparte una ronda de Match Play → muestra "70 (-2)" en vez de "3&2" o "1UP". Incoherente golfísticamente.
**Archivo:** `src/lib/share-card.ts`
**Esfuerzo:** M (3h) — **P1**

### [C-F5-2] Stableford share expone eagles/birdies
Las stats irrelevantes (eagles/birdies) se renderean en la card de Stableford. En Stableford solo importan puntos.
**Archivo:** `src/lib/share-card.ts:265-268`
**Fix:** Agregar guard `!isStableford`.
**Esfuerzo:** S (15 min) — **P1**

### [C-F3-1] Stableford + gross permitido en torneos
El form deja crear `formato=stableford, modo=gross` — técnicamente incorrecto R&A.
**Archivo:** `NuevoTorneoForm.tsx`
**Esfuerzo:** S (30 min) — **P1**

### [C-F3-2] WD (retiro) inexistente — elimina datos
Cuando un jugador se retira del torneo, se borran sus scores en cascada en vez de marcarlo WD. Pérdida de datos históricos.
**Esfuerzo:** M (3h) — **P1**

### [C-F3-3] DQ completamente sin implementar
No hay manera de descalificar jugadores. No existe el status `DQ`.
**Esfuerzo:** M (3h) — **P2**

### [C-F9-1] Import Garmin .fit es stub
`fit/route.ts` devuelve `{message: 'coming_soon'}`. Usuarios obtienen 200 silencioso sin datos.
**Esfuerzo:** XL (1-2 días) — **P2** (o deshabilitar UI hasta que esté)

### [C-F9-2] GEMINI_API_KEY no configurada
Foto OCR devuelve 503 si no está la key en Vercel. Memoria indica: pendiente desde 9-Abr.
**Fix:** Juanjo agrega la env var.
**Esfuerzo:** S (5 min) — **P0**

---

## ⚠️ IMPORTANT — arreglar idealmente antes de escalar (14 issues)

### F2 — Creación de ronda
- **I-F2-1**: Stableford HCP guard dispara con jugadores de nombre vacío (bug real)
- **I-F2-2**: No se pueden crear rondas de 9 hoyos
- **I-F2-3**: Stroke Play Neto sin HCP no se valida (neto silenciosamente = gross)

### F3 — Torneos
- **I-F3-1**: Countback multi-ronda usa solo última ronda (necesita documentación)
- **I-F3-2**: `TournamentTabs.formato` puede ser undefined (type safety)

### F4 — Espectador
- **I-F4-1**: Header del jugador usa `#93C5FD`/`#FCD34D` (pre-Garmin)
- **I-F4-2**: Timeline del espectador usa `#c8a55a`/`#16a34a` (pre-Garmin)

### F5 — Share cards
- **I-F5-1**: ShareCardTorneo hardcodea `drawHolesBadge(ctx, 18, ...)` — rondas de 9 muestran 18
- **I-F5-2**: `buildShareCardRondaLibre` no seta formato_juego

### F6 — Historial
- **I-F6-1**: `/api/historial/stats` no filtra por formato — mezclará puntos Stableford con golpes
- **I-F6-2**: Interface `HistoricalRound` en stats omite formato/modo

### F7 — Auth
- **I-F7-1**: Password recovery flow incompleto — redirige a `/perfil` sin form de nueva password

### F9 — Import
- **I-F9-1**: Plus handicap (negative indice) tratado como 0 — corrompe neto
- **I-F9-2**: Duplicate detection falla con fechas que tienen sufijo de tiempo

---

## 🟢 MINOR — cosmético / backlog (8 issues)

- F1: `StablefordResult.eagles` incluye albatrosses (inconsistencia interna)
- F1: Countback 9 hoyos usa rangos de 18 (card-off funciona igual)
- F2: Fallback INSERT sin formato_juego debería eliminarse post-migración
- F3: Dropdown de canchas limitado a 15 resultados
- F4: Mini-scorecard usa `#60A5FA` en vez de Garmin exacto
- F5: Stroke Play par score muestra "+0" en vez de "Par"
- F7: Avatar upload no implementado
- F9: Rate limiter in-memory (problema al escalar)

---

## Patrones transversales detectados

### Patrón 1: Escritura de formato/modo inconsistente
**Dónde:** Historial (F6), Import (F9), Share cards (F5)
Los campos `formato_juego` y `modo_juego` se LEEN correctamente en todos lados, pero se ESCRIBEN inconsistentemente en el flujo de finalización de rondas. Esto hace que el trabajo de display (badges, filtros, stats) sea inútil.

**Fix arquitectónico:** Crear un único helper `saveHistoricalRound(round)` que garantice que todos los campos críticos (formato_juego, modo_juego, course_id, handicap_at_round) se persistan. Todos los flujos de finalización usan este helper.

### Patrón 2: Paleta de colores antigua coexiste con Garmin
**Dónde:** Espectador (F4), Share cards (F5), Scorecard mini
Hay al menos 3 paletas coexistiendo: Garmin (`#0B6BA6` etc.), pre-Garmin (`#93C5FD` etc.), y Tailwind defaults. Genera inconsistencia visual.

**Fix arquitectónico:** Eliminar todas las paletas que no sean `GARMIN_COLORS` de `ScoreSymbol.tsx`. Search-and-replace en todo el codebase.

### Patrón 3: Share cards no son format-aware
**Dónde:** Share cards (F5) — multiple
A pesar de los fixes recientes para Stableford, Match Play quedó fuera. La arquitectura permite agregar formato pero las funciones de rendering no branchan por formato.

**Fix arquitectónico:** Refactor `dibujarRondaLibre` para que reciba un `FormatRenderer` (estrategia por formato) en vez de branching interno.

### Patrón 4: tAIger+ está 80% bien arquitectado pero con gaps quirúrgicos
**Dónde:** tAIger+ (F8)
El sistema de pre-cómputo de patrones, el system prompt, los frameworks de coaching, la especialización por HCP — todo está bien. Los gaps son:
1. Multi-turn roto (fix: 2h)
2. Structured output falta (fix: 1 día)
3. Scores hoyo a hoyo no en contexto general (fix: 1 día)
4. Par real de cancha (fix: 2h)

Total para que tAIger+ sea verdaderamente WOW: **2-3 días de trabajo quirúrgico**. No requiere re-arquitectura.

---

## Plan de ejecución recomendado

### Sprint 1 — Hotfixes P0 (1 día)
1. C-F6-1, C-F6-2: persistir formato/modo al finalizar (30 min total)
2. C-F8-1, C-F8-5: arreglar multi-turn tAIger+ (2h)
3. C-F9-2: configurar GEMINI_API_KEY en Vercel (5 min + acción de Juanjo)
4. I-F4-1, I-F4-2: unificar paleta Garmin (1h)

**Impacto:** Historial funcional, tAIger+ con conversaciones reales, fotos OCR activas.

### Sprint 2 — tAIger+ WOW (2-3 días)
5. C-F8-2: structured output con tool use
6. C-F8-3: scores hoyo a hoyo en contexto
7. C-F8-4: par real de cancha
8. Bonus: agregar perfil psicológico del onboarding al contexto

**Impacto:** tAIger+ pasa de 71% a 95%+. Se vuelve el WOW real del producto.

### Sprint 3 — Torneos profesionales (3-4 días)
9. C-F3-1: bloquear Stableford+gross en torneos
10. C-F3-2: implementar WD con preservación de datos
11. C-F3-3: implementar DQ
12. C-F5-1: Match Play share card
13. I-F2-1, I-F2-2, I-F2-3: validaciones de creación

**Impacto:** App lista para torneos con formatos oficiales.

### Sprint 4 — Polish y escala (2 días)
14. Todos los MINOR
15. C-F9-1: Garmin FIT (o deshabilitar UI)
16. I-F7-1: completar password recovery
17. I-F6-1, I-F6-2: stats filtradas por formato

**Impacto:** Producto pulido para lanzamiento.

---

## Estrategias para que tAIger+ sea WOW

Esta es la preocupación más importante del PM. El diagnóstico es:

**Lo bueno (mantener):**
- System prompt específico con frameworks reales (Rotella, VISION54, Broadie)
- Pre-cómputo de 7 patrones con confianza y metadatos
- Data access a 50 rondas, 5 sesiones, collective insights
- Especialización por HCP (4 rangos)

**Lo que falta para ser WOW:**
1. **Conversaciones reales**: multi-turn fix (P0, 2h)
2. **Predicción cuantitativa**: usar scores hoyo a hoyo + patrones para predecir "bajarás 2 golpes en 4 semanas si trabajas X"
3. **Planes estructurados**: JSON output con `{casa, práctica, cancha}` + métricas medibles
4. **Memoria persistente**: expandir `next_focus` a un "playbook" del jugador que crece
5. **Comparación social**: "jugadores HCP 15 en Chile con tu patrón bajaron a 12 en promedio"
6. **Trigger proactivo**: notificación push cuando tAIger detecta patrón nuevo

**Propuesta arquitectónica:**
```
Usuario juega ronda
  → calcular patrones (ya existe)
  → si patrón nuevo o deteriorado → push notification
  → tAIger análisis con:
     - scores hoyo a hoyo (nuevo)
     - par real cancha (nuevo)
     - onboarding psicológico (nuevo)
     - conversaciones previas completas (fix)
  → output JSON estructurado:
     {
       diagnóstico: "...",
       predicción: { mejora_esperada: -2.3 golpes, timeframe: "4 semanas", confianza: 0.7 },
       plan: { casa: [...], práctica: [...], cancha: [...] },
       próximo_check: "después de 3 rondas"
     }
  → tracking automático de score_after (nuevo)
```

Con esto, tAIger+ no es un chatbot sobre golf — es un **sistema predictivo personalizado** que ningún competidor tiene.

---

## Resumen ejecutivo

**Estado actual:** La app está al 89% de funcionamiento. Los cimientos (scoring, auth, espectador, creación) son sólidos. Los problemas están en:
1. **Persistencia**: formato/modo no se guarda → historial ciego a formatos
2. **Share**: Match Play roto, Stableford con ruido visual
3. **tAIger+**: arquitectura buena pero gaps quirúrgicos impiden ser WOW
4. **Torneos profesionales**: falta WD/DQ para uso formal

**Con 1 sprint de hotfixes (1 día)** la app está lista para uso real.
**Con 2-3 días adicionales en tAIger+** se vuelve imposible de copiar.
**Con 1 sprint más** está lista para torneos oficiales.

**Total para llegar al 98%: ~2 semanas de trabajo enfocado.**
