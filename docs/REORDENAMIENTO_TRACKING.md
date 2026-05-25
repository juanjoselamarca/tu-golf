# Tracking del reordenamiento — Regla "El que toca, ordena"

**Vigente desde:** 24-may-2026
**Referencia:** `CLAUDE.md` sección "REGLA OPERATIVA"
**Informe:** `docs/INFORME_CTO_2026-05-22.md`

---

## Cómo se usa este archivo

Cada vez que un agente refactorice un archivo "sucio", actualiza este tracking:
- Marca el archivo con ✅ + fecha + PR
- Anota LOC antes / LOC después
- Si el archivo no estaba en la lista pero ahora aplica (creció >600), agregar fila

Al iniciar cada sesión, agente principal revisa este archivo. Si hay items >60 días sin tocar, propone refactor proactivo aunque no haya pedido pendiente.

---

## Archivos productivos >1000 LOC (snapshot 22-may-2026)

| # | Archivo | LOC antes | LOC después | Estado | PR | Fecha |
|---|---|---|---|---|---|---|
| 1 | `src/app/ronda-libre/nueva/page.tsx` | 2118 | — | ⏳ Pendiente | — | — |
| 2 | `src/app/ronda-libre/[codigo]/page.tsx` | 2038 | — | ⏳ Pendiente | — | — |
| 3 | `src/app/perfil/historial/page.tsx` | 1408 | — | ⏳ Pendiente | — | — |
| 4 | `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` | 1305 | — | ⏳ Pendiente | — | — |
| 5 | `src/app/organizador/[slug]/jugadores/JugadoresPanel.tsx` | 1112 | — | ⏳ Pendiente | — | — |
| 6 | `src/components/import/ImportGuide.tsx` | 1077 | — | ⏳ Pendiente | — | — |
| 7 | `src/app/admin/golf-ops/page.tsx` | 1033 | — | ⏳ Pendiente | — | — |
| 8 | `src/app/ronda-libre/[codigo]/score/page.tsx` | 1951 | 1025 | ✅ Hecho | `e98e3e3` | 14-15 may |
| 9 | `src/components/CourseSelector.tsx` | 1018 | — | ⏳ Pendiente | — | — |

---

## API routes monstruo (>500 LOC)

| # | Archivo | LOC antes | LOC después | Estado | PR | Fecha |
|---|---|---|---|---|---|---|
| 1 | `src/app/api/import/screenshot/route.ts` | 767 | — | ⏳ Pendiente | — | — |
| 2 | `src/app/api/admin/health-check/route.ts` | 600 | — | ⏳ Pendiente | — | — |
| 3 | `src/app/api/import/garmin-zip/route.ts` | 540 | — | ⏳ Pendiente | — | — |
| 4 | `src/app/api/inbox/webhook/route.ts` | 505 | — | ⏳ Pendiente | — | — |

---

## Dominio en `src/lib/` por mover a `src/golf/`

| # | Item | Destino | Estado | PR | Fecha |
|---|---|---|---|---|---|
| 1 | `src/lib/coach/` (directorio vacío) | Borrar | ⏳ Pendiente (ola 1) | — | — |
| 2 | `src/lib/scoring.ts` (shim) | Borrar + migrar imports | ⏳ Pendiente (ola 1) | — | — |
| 3 | `src/lib/ronda/` | `src/golf/ronda/` | ⏳ Pendiente | — | — |
| 4 | `src/lib/mi-golf/` | `src/golf/mi-golf/` o `src/golf/stats/` | ⏳ Pendiente | — | — |
| 5 | `src/lib/cpi.ts` | `src/golf/stats/cpi.ts` | ⏳ Pendiente | — | — |
| 6 | `src/lib/share-card.ts` | `src/golf/share/share-card.ts` | ⏳ Pendiente | — | — |
| 7 | `src/lib/gwi.ts` | `src/golf/stats/gwi.ts` | ⏳ Pendiente | — | — |
| 8 | `src/lib/course-matching.ts` | `src/golf/courses/matching.ts` | ⏳ Pendiente | — | — |
| 9 | `src/lib/courses.ts` | `src/golf/courses/api.ts` | ⏳ Pendiente | — | — |
| 10 | `src/lib/course-types.ts` | `src/golf/courses/types.ts` | ⏳ Pendiente | — | — |
| 11 | `src/lib/garmin-colors.ts` | `src/golf/core/colors.ts` o `src/golf/stats/` | ⏳ Pendiente | — | — |
| 12 | `src/lib/score-colors.ts` | `src/golf/core/colors.ts` | ⏳ Pendiente | — | — |
| 13 | `src/lib/indice-golfers.ts` | `src/golf/stats/indice.ts` | ⏳ Pendiente | — | — |

---

## Capa de datos (`src/lib/data/`)

Hoy: 41 archivos en `src/app/` (fuera de `api/`) hacen `supabase.from(...)` directo.

Meta: <10 archivos. Resto vía funciones tipadas en `src/lib/data/<dominio>.ts`.

| Archivo de UI con acceso directo | Migrado a `lib/data/` | Fecha |
|---|---|---|
| (lista completa se llena cuando arranque la ola 4) | | |

---

## Observabilidad — migración `console.*` → `captureError`/`logger`

Hoy: 465 `console.*` en 66 archivos productivos.
Meta: <50 ocurrencias.

Cada vez que se toque un archivo con `console.*`, se migra a `captureError(err, 'contexto.operacion', {meta})` o al logger correspondiente.

---

## Métricas globales — escala 1-10

Actualizar al cierre de cada PR de refactor:

| Fecha | Archivos >1000 LOC | Archivos >600 LOC | Endpoints >500 LOC | UI con supabase directo | console.* | Escala global |
|---|---|---|---|---|---|---|
| 22-may-2026 (baseline) | 9 | ~20 | 4 | 41 | 465 | 5-6/10 |

Meta post-reordenamiento: **8/10** (nivel The Grint / V-Par).
