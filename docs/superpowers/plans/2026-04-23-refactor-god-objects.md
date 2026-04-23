# Plan: Refactor de God Objects en `ronda-libre/**`

**Fecha**: 2026-04-23
**Prioridad**: P1
**Estado**: Planificado — ejecución en sprint dedicado

## Problema

3 archivos > 1900 LOC concentran el flujo crítico del producto (crear ronda, ronda activa, scoring):

| Archivo | LOC | Función |
|---|---|---|
| `src/app/ronda-libre/nueva/page.tsx` | 2118 | Wizard de creación |
| `src/app/ronda-libre/[codigo]/page.tsx` | 2033 | Página de ronda activa |
| `src/app/ronda-libre/[codigo]/score/page.tsx` | 1947 | Scoring hoyo a hoyo |

**Riesgos**:
- Cualquier cambio toca el 60%+ del archivo mentalmente
- Difícil de testear unitariamente
- Bugs en una zona del archivo afectan zonas no relacionadas
- Nuevos devs (humano o IA) tardan horas en entender el archivo
- Memory leaks potenciales — state compartido entre sub-features dentro del mismo componente

## Objetivo

Llevar cada uno de estos 3 archivos a **<400 LOC**, extrayendo a:
- Hooks custom (`src/hooks/ronda/`)
- Sub-componentes (`src/components/ronda/`)
- Actions/mutations (`src/app/ronda-libre/actions.ts`)
- Mantener page.tsx como orquestador delgado

## NO hacer

- ❌ Refactor gigantesco en 1 commit — riesgo de bug
- ❌ Cambiar la funcionalidad durante el refactor — "refactor puro, no mezcla con feature"
- ❌ Refactor sin tests extensos que capturen comportamiento actual
- ❌ Refactor sin QA humano pre/post — los 3 archivos son flujos críticos

## Plan por fases

### Fase 0 — Safety net (antes de tocar una línea)

1. Tests de integración que capturan el comportamiento actual:
   - Wizard: flujo completo de crear ronda con datos reales
   - Ronda activa: unirse, ver estado, salir
   - Scoring: scorear 3 hoyos, verificar sync
2. Visual regression snapshots de las 3 páginas (Playwright screenshots)
3. Commit de baseline: `chore(tests): safety net pre-refactor ronda-libre`

### Fase 1 — `ronda-libre/nueva/page.tsx` (sprint 1)

Extraer progresivamente en commits puros:

**1.1 — Extract hook `useNuevaRondaForm()`**
- Ubicación: `src/hooks/ronda/useNuevaRondaForm.ts`
- Maneja: toda la state del wizard (paso actual, jugadores, cancha, formato, tee)
- Commit: `refactor(ronda): extract useNuevaRondaForm hook`

**1.2 — Extract `steps/` components**
- `src/components/ronda/nueva/StepJugadores.tsx`
- `src/components/ronda/nueva/StepCancha.tsx`
- `src/components/ronda/nueva/StepFormato.tsx`
- `src/components/ronda/nueva/StepTee.tsx`
- `src/components/ronda/nueva/StepConfirmar.tsx`
- Un commit por step: `refactor(ronda): extract StepX component`

**1.3 — Extract actions**
- `src/app/ronda-libre/nueva/actions.ts`
- Mutaciones Supabase separadas de la UI
- Commit: `refactor(ronda): extract actions for nueva ronda`

**1.4 — page.tsx orquestador**
- Debe quedar <400 LOC
- Solo layout + wire-up de hook + steps
- Commit final: `refactor(ronda): page.tsx ahora orquestador delgado`

**QA obligatorio después de cada commit**: correr flujo wizard end-to-end, verificar comportamiento idéntico.

### Fase 2 — `ronda-libre/[codigo]/page.tsx` (sprint 2)

Similar a Fase 1. Extraer:
- `useRondaActiva()` hook
- Componentes: `RondaHeader`, `RondaJugadores`, `RondaEstado`, `RondaActions`
- Actions separadas

### Fase 3 — `ronda-libre/[codigo]/score/page.tsx` (sprint 3)

La más delicada porque es el flujo en cancha con guante. Extra cuidado:
- `useScoreFlow()` hook
- `ScoreHoleCard`, `ScoreKeypad`, `ScoreNavigation`
- Offline sync lógica en `useScoreSyncRonda()` (ya existe parcialmente en `useScoreSync`)

### Fase 4 — Cleanup

- Borrar código muerto que el refactor dejó atrás
- Actualizar imports relativos
- Revisar TECH_DEBT para deuda nueva descubierta

## Estimación

| Fase | Tiempo estimado |
|---|---|
| Fase 0 — Safety net | 1-2 días |
| Fase 1 — Nueva | 2-3 días |
| Fase 2 — Activa | 2-3 días |
| Fase 3 — Scoring | 3-4 días (más cuidado) |
| Fase 4 — Cleanup | 1 día |
| **Total** | **2 sprints de ~5 días** |

## Criterios de éxito

- ✅ Cada página `<400 LOC`
- ✅ Tests passing todo el tiempo (nunca merge con rojos)
- ✅ Cobertura total NO baja
- ✅ QA visual: flujos se ven idénticos pre/post
- ✅ Sentry post-deploy: 0 errores nuevos por 48h
- ✅ Pre-push hook sigue pasando

## Riesgos + mitigación

| Riesgo | Mitigación |
|---|---|
| Refactor introduce bug no cubierto por tests | Fase 0 crea safety net robusto |
| State compartido se pierde al separar | Hooks custom preservan state shape |
| Re-renders nuevos degradan performance | Benchmark con React Profiler antes/después |
| "Refactor nunca termina" — scope creep | Límite estricto por fase, no mezclar con features |

## Conexión con otras deudas

- Al terminar refactor, reducir LOC también significa:
  - P1-1, P1-2 del TECH_DEBT → resueltos
  - Mayor testeabilidad → subir thresholds de cobertura
  - ESLint `react-hooks/exhaustive-deps` más manejable

## NO ejecutar hasta:

1. ✅ Juanjo apruebe el sprint
2. ✅ Se separen las 2-3 semanas exclusivas (no mezclar con feature sprint)
3. ✅ Se haya hecho el QA visual de las 38 fotos del audit previo (confirmar que la UI actual es la que queremos preservar)
4. ✅ Fase 0 (safety net) esté completa

## Alternativa considerada (rechazada)

**Opción**: rewrite from scratch de las 3 páginas con arquitectura ideal.

**Rechazada porque**:
- Mayor riesgo de bugs
- No preserva comportamiento exacto (muchos edge cases acumulados)
- Los 2118+2033+1947 LOC contienen 6 meses de fixes específicos
- Refactor incremental es más seguro para app en producción con torneos activos

Rewrite sólo sería justificable si el modelo de datos cambiara fundamentalmente, lo cual no es el caso.
