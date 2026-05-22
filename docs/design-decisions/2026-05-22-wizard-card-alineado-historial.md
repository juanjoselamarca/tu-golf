# wizard-card-alineado-historial — Decisión de diseño

**Fecha:** 2026-05-22
**Reporte origen:** `inbox_reports.id` = `f131d89f-479e-4073-b5bd-50db03b9ee18`
**PR:** pendiente

---

## Problema (1 línea)

Cita textual: "Mal diseño al importar tarjeta desde screenshot. Copiar diseño de Rondas Historicas. Debe haber una coherencia entre los diseños de la app."

Estado pre-fix: la card del wizard import (StepReview) tenía un layout vertical con bloques apilados (status pill → club name → fecha → score grande → expand button) que no se parecía visualmente a las cards de `/perfil/historial`, que usan un row layout horizontal compacto.

## Variantes consideradas

### Variante A — Replicar 1:1 el row layout de /perfil/historial
Score grande izq · club + fecha centro · chevron derecha. Status pill **integrado al lado de la fecha** como tag compacto. HoleBar siempre visible (no requiere expand).

### Variante B — Replicar layout pero conservar status pill arriba prominente
Status pill arriba en su propia row + row layout debajo. Mantiene más visibilidad del estado del scan (verificada/revisar/garmin) pero rompe la simetría con historial.

### Variante C — Card horizontal nueva con score gigante al medio
Diseño desde cero: score 48px centrado, club abajo, status pill arriba derecha. Llamativo pero NO cumple "copiar diseño de Rondas Historicas".

## Evaluación objetiva

| Criterio | A | B | C |
|---|---|---|---|
| Cumple directiva del reporte ("copiar diseño de Rondas Historicas") | ✅ | ⚠ parcial | ❌ |
| WCAG AA contraste (var(--text) sobre var(--bg-surface) ≥ 4.5:1) | ✅ | ✅ | ✅ |
| Consistency con `/perfil/historial` cards | ✅ | ⚠ | ❌ |
| Mobile-first (touch targets ≥44px, no overflow horizontal) | ✅ | ✅ | ⚠ |
| Premium / no AI-slop | ✅ | ✅ | ❌ score gigante visible como showcase |
| Mantiene funcionalidad única wizard (Aceptar/Descartar inline, scorecard editable) | ✅ | ✅ | ⚠ requiere refactor mayor |

## Elegida

**Variante A — replicar 1:1.**

## Razón objetiva (no estética)

1. **Único que cumple la directiva textual** del reporte ("copiar diseño de Rondas Historicas").
2. **Consistency total** entre `/perfil/historial` y `/importar`: el usuario ve la misma forma de tarjeta en ambos contextos → menor carga cognitiva.
3. **HoleBar siempre visible** da feedback inmediato del scan (el usuario sabe si el OCR detectó los hoyos correctamente sin tener que expandir).
4. **Status pill como tag compacto** en la row de fecha (junto a "12 may 2026 · 18h · VERIFICADA") mantiene la info crítica sin chrome adicional.
5. **Acciones (Aceptar/Descartar) en row separada abajo** con border-top sutil — preserva la funcionalidad única del wizard sin romper el patrón visual.

## Lecciones / patrón reutilizable

- Cuando el usuario pide "consistency" entre dos vistas que tienen funcionalidades distintas, la respuesta correcta es **adoptar el patrón visual primario** (en este caso, la card de historial que es la referencia canónica) **y agregar las affordances únicas** como sub-componentes (acciones, status pill) **sin reorganizar la estructura**.
- HoleBar acepta `Record<string,number>` para scores y pars, lo cual lo hace reusable desde el wizard (donde los scores vienen como Record del OCR) sin transformación.
