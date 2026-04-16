# Prompt: Auditoría completa Golfers+ — Tests de funcionamiento + estrategias de corrección

> **Para usar:** Copiar todo el contenido de este archivo como prompt en una nueva sesión de Claude Code.

---

## Contexto

Eres el CTO de Golfers+, una app de golf operativa en producción (golfersplus.vercel.app).
Stack: Next.js 14 + TypeScript + Supabase + Vercel.

Tu trabajo es ejecutar una auditoría completa del % de funcionamiento de TODOS los features.
No arregles nada todavía — solo diagnostica, mide y propón.

## Objetivo

1. Escribir y ejecutar una suite de tests automatizados (Vitest) que mida el % de funcionamiento real de cada feature
2. Generar un reporte con score por feature, errores encontrados, y severidad
3. Proponer las mejores estrategias y correcciones para cada error

## Metodología

Cada test tiene peso según impacto:
- **CRITICAL** (scoring incorrecto, datos perdidos, flujo roto): peso 3
- **IMPORTANT** (UX rota, info faltante, edge case): peso 2
- **MINOR** (cosmético, label incorrecto): peso 1

```
% feature = Σ(tests pasados × peso) / Σ(todos los tests × peso) × 100
% global = promedio ponderado de todos los features
```

## Reglas

- Lee el código fuente ANTES de escribir cada test — no asumas
- Cada test debe documentar en un comentario qué regla de golf o requisito valida
- Si un test requiere datos de BD, usa mocks basados en datos reales del schema
- Los tests van en `src/__tests__/audit/` organizados por feature
- Al final genera el reporte en `docs/audit-report-YYYY-MM-DD.md`

---

## FEATURE 1: Motor de scoring (matemática golf pura)

Archivo: `src/__tests__/audit/scoring-engine.test.ts`

### Tests de distribución de handicap (WHS)

```
strokesRecibidosEnHoyo(18, SI=1, 18h) → 1          // HCP 18: 1 golpe por hoyo
strokesRecibidosEnHoyo(18, SI=18, 18h) → 1         // Último SI también recibe
strokesRecibidosEnHoyo(10, SI=10, 18h) → 1         // Borde: SI = HCP
strokesRecibidosEnHoyo(10, SI=11, 18h) → 0         // SI > HCP: no recibe
strokesRecibidosEnHoyo(30, SI=1, 18h) → 2          // Wrap-around: 2da vuelta
strokesRecibidosEnHoyo(30, SI=12, 18h) → 2         // Último de 2da vuelta
strokesRecibidosEnHoyo(30, SI=13, 18h) → 1         // Solo 1ra vuelta
strokesRecibidosEnHoyo(36, SI=1, 18h) → 2          // HCP 36 = exacto 2 por hoyo
strokesRecibidosEnHoyo(54, SI=1, 18h) → 3          // HCP max WHS = 3 por hoyo
strokesRecibidosEnHoyo(0, SI=1, 18h) → 0           // Scratch: nada
strokesRecibidosEnHoyo(-2, SI=1, 18h) → -1         // Plus player: da golpes
strokesRecibidosEnHoyo(-2, SI=3, 18h) → 0          // Plus: solo en SI 1-2
strokesRecibidosEnHoyo(5, SI=1, 9h) → 1            // 9 hoyos: distribución correcta
strokesRecibidosEnHoyo(10, SI=1, 9h) → 2           // 9 hoyos: wrap-around
```

### Tests de Stableford (R&A Rule 32.1b / Rule 21)

```
puntosStableford(neto=2, par=5) → 5    // Albatross = 5 pts
puntosStableford(neto=3, par=5) → 4    // Eagle = 4 pts
puntosStableford(neto=4, par=5) → 3    // Birdie = 3 pts
puntosStableford(neto=5, par=5) → 2    // Par = 2 pts
puntosStableford(neto=6, par=5) → 1    // Bogey = 1 pt
puntosStableford(neto=7, par=5) → 0    // Double bogey = 0 pts
puntosStableford(neto=8, par=5) → 0    // Triple+ = 0 pts (no negativo)
```

### Tests de score neto

```
scoreNetoHoyo(gross=5, HCP=18, SI=1, 18h) → 4     // 5 - 1 = 4
scoreNetoHoyo(gross=5, HCP=36, SI=1, 18h) → 3     // 5 - 2 = 3
scoreNetoHoyo(gross=3, HCP=-2, SI=1, 18h) → 4     // 3 - (-1) = 4 (plus player)
scoreNetoHoyo(gross=4, HCP=0, SI=1, 18h) → 4      // Scratch: sin cambio
```

### Tests de ordenamiento (leaderboard)

```
ordenarJugadores([+5, +2, E], stroke_play, gross) → [E, +2, +5]       // Menor gana
ordenarJugadores([34pts, 38pts, 30pts], stableford, neto) → [38, 34, 30]  // Mayor gana
```

### Tests de countback

```
// Stableford: desempate por PUNTOS de últimos 9, no gross
countback_stableford(jugadorA_pts=[2,3,2,1,2,3,2,2,2], jugadorB_pts=[3,2,2,2,2,2,2,1,3])
→ jugadorB gana (últimos 9: B=19 vs A=19 → últimos 6: B=12 vs A=13... seguir regla)

// Stroke: desempate por GOLPES de últimos 9
countback_stroke(jugadorA=[4,5,4,3,4,5,4,4,4], jugadorB=[5,4,4,4,4,4,4,3,5])
→ menor total últimos 9 gana
```

---

## FEATURE 2: Creación de ronda (todas las modalidades)

Archivo: `src/__tests__/audit/round-creation.test.ts`

### Validaciones de formato × modo

```
crear(stableford, gross) → RECHAZAR           // R&A: Stableford siempre neto
crear(stableford, neto, sin_hcp) → RECHAZAR   // HCP obligatorio para puntos
crear(match_play, gross) → RECHAZAR           // Chile: siempre neto
crear(match_play, neto, 1_jugador) → RECHAZAR // Requiere exactamente 2
crear(match_play, neto, 3_jugadores) → RECHAZAR
crear(stroke_play, gross) → OK
crear(stroke_play, neto) → OK
crear(stroke_play, neto, sin_hcp) → ¿? (verificar comportamiento)
```

### Default de modo

```
default_modo → 'gross'    // No 'neto' — la mayoría de rondas casuales son gross
stableford_seleccionado → modo auto-switch a 'neto'
match_play_seleccionado → modo auto-switch a 'neto'
```

### Datos que se guardan

```
ronda.formato_juego → presente en BD
ronda.modo_juego → presente en BD
ronda.holes → 9 o 18, correcto
jugadores[].handicap → presente cuando formato lo requiere
```

---

## FEATURE 3: Torneos a escala (organizador)

Archivo: `src/__tests__/audit/tournament-organizer.test.ts`

### Creación y configuración

```
crear_torneo(stableford, gross) → rechazar modo gross
crear_torneo(match_play, gross) → rechazar modo gross
crear_torneo(stroke_play, neto) → OK
cambiar_formato_después_de_scores → BLOQUEADO
cambiar_hoyos_después_de_scores → BLOQUEADO
```

### Leaderboard por formato

```
leaderboard_stableford → ordena por PUNTOS desc
leaderboard_stroke_neto → ordena por NETO asc
leaderboard_stroke_gross → ordena por GROSS asc
header_stableford → dice "PUNTOS" no "SCORE"
header_stroke → dice "SCORE"
```

### Escala (40-100 jugadores)

```
torneo_40_jugadores → leaderboard carga < 3s
torneo_100_jugadores → leaderboard carga < 5s
scoring_simultáneo_20_jugadores → no data race
empates → posiciones con (T): T1, T2
WD/DQ → marcado visualmente en leaderboard
```

### Multi-ronda (día 1, día 2, día 3)

```
scores_acumulan_entre_rondas → total correcto
leaderboard_muestra_ronda_actual_y_acumulado
resultados_parciales_compartibles_por_día
```

---

## FEATURE 4: Espectador y vista en vivo

Archivo: `src/__tests__/audit/spectator-live.test.ts`

### Colores Garmin (fuente de verdad: CLAUDE.md)

```
score_eagle_o_mejor → azul oscuro #0B6BA6 (doble círculo)
score_birdie → celeste #14B3D9 (círculo)
score_par → sin borde, número limpio
score_bogey → dorado #D4A442 (cuadrado)
score_double_plus → rojo #DC3B2E (doble cuadrado)
```

### Consistencia entre vistas

```
ScoreSymbol en score_page === ScoreSymbol en espectador === ScoreSymbol en historial
// No scoreCell inline con colores distintos
HoleColorBar_paleta === GARMIN_COLORS
HoleColorBar_modo_neto → colorea sobre score neto
HoleColorBar_stableford → colorea sobre puntos
```

### Display por formato

```
espectador_stableford → muestra PUNTOS prominente, no golpes
espectador_match_play → muestra estado match (2UP, AS, 3&2)
espectador_stroke → muestra gross/neto + vs par
```

### Real-time

```
score_ingresado → aparece en espectador sin refresh (< 10s)
múltiples_jugadores → updates no se pisan
```

---

## FEATURE 5: Share cards (coherencia golfística)

Archivo: `src/__tests__/audit/share-cards.test.ts`

### Score correcto por formato

```
share_stroke_gross → muestra "78 (+6)"
share_stroke_neto → muestra "78" con indicador neto
share_stableford → muestra "34 pts" NO "78 golpes"
share_match_play → muestra "3&2" o "1UP" NO total golpes
```

### Badges y metadata

```
share_card_tiene_badge_formato → "STABLEFORD", "MATCH PLAY", etc.
share_card_tiene_badge_9_o_18 → no hardcodeado
share_card_tiene_cancha → nombre correcto
share_card_tiene_fecha → fecha correcta
```

### Eagles/birdies correctos

```
share_neto_birdies → calculados sobre score NETO, no gross
share_neto_eagles → calculados sobre score NETO, no gross
share_stableford → no mostrar eagles/birdies (irrelevante, son puntos)
```

### Leaderboard compartido

```
leaderboard_share_incluye_formato → receptor sabe qué se jugó
leaderboard_share_stableford → ranking por puntos
leaderboard_share_empate → indicado correctamente
```

---

## FEATURE 6: Historial y persistencia

Archivo: `src/__tests__/audit/history-persistence.test.ts`

### Datos que persisten

```
ronda_finalizada → aparece en historial del jugador
torneo_finalizado → resultado visible en perfil del jugador
formato_juego → guardado en historical_rounds
modo_juego → guardado en historical_rounds
scores_hoyo_por_hoyo → disponibles para ver después
```

### Display correcto

```
historial_badge_formato → visible (Stableford, Match Play)
historial_badge_neto → visible para Stroke Neto
historial_score_stableford → muestra puntos, no golpes
historial_par_real → usa par de la cancha, no 36/72 hardcoded
historial_cellBg → usa diff vs par, no score absoluto
historial_HoleColorBar → renderizado y visible
```

### Stats agregadas

```
promedio_score → se actualiza con nueva ronda
mejor_ronda → detecta correctamente
total_birdies → cuenta acumulativa correcta
diferencial → calculado: (Score - Rating) × 113 / Slope
```

---

## FEATURE 7: Auth y onboarding

Archivo: `src/__tests__/audit/auth-onboarding.test.ts`

### Registro

```
registro_email → funciona, verifica email
registro_google → OAuth funciona
registro_apple → OAuth funciona (si implementado)
registro_sin_nombre → ¿qué pasa?
registro_duplicado → error amigable
```

### Primer uso

```
primer_login → ¿qué pantalla ve?
sin_rondas → ¿CTA claro para crear primera ronda?
sin_handicap → ¿la app funciona sin HCP?
onboarding → ¿existe? ¿explica el valor?
```

### Perfil

```
editar_nombre → persiste
editar_handicap → persiste y se usa en scoring
foto_perfil → funciona
vincular_fedegolf → sincroniza índice WHS
```

---

## FEATURE 8: tAIger+ (Coach IA)

Archivo: `src/__tests__/audit/taiger-coach.test.ts`

### Capacidad de aprendizaje

```
0_rondas → mensaje de espera o onboarding
1-4_rondas → análisis parcial, pide más datos
5-9_rondas → detecta patrones básicos (ej: "par 3 es tu punto débil")
10-19_rondas → análisis profundo con tendencias
20+_rondas → perfil completo, predicciones
```

### Calidad del análisis

```
jugador_hcp_5 → consejos de nivel avanzado (no "practica tu grip")
jugador_hcp_30 → consejos de nivel principiante (fundamentos)
jugador_consistente_en_par3 → NO sugerir mejorar par 3
jugador_malo_en_par5 → SÍ sugerir estrategia de par 5
```

### Detección de patrones reales

```
patrón_approach → "tu score sube 1.2 golpes cuando el approach es > 150 yds"
patrón_cancha → "en [cancha X] tu promedio es 3 golpes peor que tu media"
patrón_hoyos_agua → "en hoyos con agua tu score promedio sube 0.8"
patrón_front_vs_back → "juegas 2 golpes mejor los primeros 9"
patrón_par3_largo → "par 3 de 180+ yds: promedio bogey"
```

### Planes de trabajo estructurados

```
plan_tiene_3_contextos → casa, práctica, cancha
plan_casa → ejercicios específicos (putting mat, swing drills)
plan_práctica → rutina de driving range con objetivos medibles
plan_cancha → estrategia de manejo de cancha, no solo swing
plan_es_progresivo → semana 1, 2, 3, 4 con dificultad creciente
plan_tiene_métricas → "meta: bajar promedio de putts de 34 a 31"
```

### Memoria y continuidad

```
sesión_2_recuerda_sesión_1 → no repite lo mismo
progreso_trackeado → "la semana pasada tu promedio bajó 1.2"
feedback_incorporado → si el jugador dice "no tengo putting mat", adapta
```

### Factor WOW (diferenciador)

```
predicción → "si mejoras tu approach a < 10 yds del pin, bajas ~3 golpes"
visualización → datos presentados de forma clara y accionable
tono → coach profesional, no chatbot genérico
personalización → referencias a SUS rondas, SUS canchas, SUS patrones
comparación → "jugadores similares a ti en Chile promedian X"
```

---

## FEATURE 9: Importación de rondas

Archivo: `src/__tests__/audit/import-rounds.test.ts`

```
import_garmin_fit → scores correctos, cancha detectada
import_csv → columnas mapeadas, validación de datos
import_foto_scorecard → OCR funciona, scores legibles
import_preserva_formato → formato_juego y modo_juego no se pierden
import_cancha_match → nombre matchea con BD de canchas
import_duplicado → detecta y advierte
```

---

## OUTPUT ESPERADO

### 1. Ejecutar todos los tests

```bash
npx vitest run src/__tests__/audit/
```

### 2. Generar reporte en `docs/audit-report-2026-04-13.md`

Formato del reporte:

```markdown
# Golfers+ Audit Report — [fecha]

## Score global: XX%

## Score por feature

| Feature | Tests | Passed | Failed | Score |
|---------|-------|--------|--------|-------|
| Motor de scoring | 20 | 18 | 2 | 90% |
| Creación de ronda | 15 | 12 | 3 | 78% |
| Torneos | 18 | 14 | 4 | 72% |
| Espectador | 12 | 11 | 1 | 92% |
| Share cards | 14 | 10 | 4 | 68% |
| Historial | 10 | 9 | 1 | 90% |
| Auth/onboarding | 8 | 7 | 1 | 88% |
| tAIger+ | 15 | ? | ? | ?% |
| Importación | 6 | ? | ? | ?% |

## Errores encontrados (por severidad)

### CRITICAL
- [C1] Descripción — archivo:línea — qué regla viola — fix propuesto

### IMPORTANT
- [I1] Descripción — archivo:línea — impacto — fix propuesto

### MINOR
- [M1] Descripción — archivo:línea — fix propuesto
```

### 3. Estrategias y correcciones propuestas

Para cada error encontrado, proponer:

1. **Qué está mal** — descripción técnica precisa
2. **Por qué importa** — impacto en usuario real (citando regla R&A/WHS si aplica)
3. **Fix propuesto** — código o cambio arquitectónico específico
4. **Esfuerzo estimado** — S (< 30 min), M (1-2h), L (3-5h), XL (1+ día)
5. **Prioridad** — P0 (arreglar ya), P1 (antes de lanzar), P2 (backlog)

Además, proponer **estrategias macro**:
- ¿Hay patrones de error que se repiten? (ej: "todas las vistas asumen stroke play")
- ¿Hay refactors que eliminarían múltiples bugs de una vez?
- ¿Hay features que deberían deshabilitarse hasta que estén listos?
- ¿Qué orden de ejecución maximiza impacto con mínimo riesgo?

Para tAIger+ específicamente:
- ¿Qué datos tiene acceso hoy y cuáles le faltan?
- ¿El prompt system está diseñado para coaching o para chat genérico?
- ¿Qué cambios lo convertirían en un WOW real vs un wrapper de ChatGPT?
- ¿Cuál es la arquitectura ideal para un coach predictivo de golf?
