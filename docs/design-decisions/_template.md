# [SLUG-DEL-CAMBIO] — Decisión de diseño

**Fecha:** YYYY-MM-DD
**Reporte origen:** `inbox_reports.id` = `<uuid>`
**PR:** #<n> — `<url>`

---

## Problema (1 línea)

[Qué pasaba antes que generó el reporte. Cita textual del caption/texto si ayuda.]

## Variantes consideradas

### Variante A — [nombre corto descriptivo]
[Breve descripción + link/path al render o screenshot si existe.]

### Variante B — [nombre corto descriptivo]
[Idem.]

### Variante C — [nombre corto descriptivo]
[Idem.]

(Pueden ser 2-4 variantes según escala del cambio.)

## Evaluación objetiva

| Criterio | A | B | C |
|---|---|---|---|
| Cumple `DESIGN.md` (paleta, tipo, spacing, touch ≥44px) | ✅/❌ | ✅/❌ | ✅/❌ |
| WCAG AA contraste (`(L1+0.05)/(L2+0.05) ≥ 4.5`) | ✅/❌ | ✅/❌ | ✅/❌ |
| Consistency con componentes shared (`src/components/`) | ✅/❌ | ✅/❌ | ✅/❌ |
| Mobile-first | ✅/❌ | ✅/❌ | ✅/❌ |
| Premium / no AI-slop | ✅/❌ | ✅/❌ | ✅/❌ |

## Elegida

**Variante [X].**

## Razón objetiva (no estética)

[Por qué gana en los criterios. Si fue empate técnico y Juanjo decidió: qué eligió y por qué (1 línea).]

## Lecciones / patrón reutilizable

[Si emergió un patrón que conviene aplicar en futuros casos similares, documentarlo acá. Ej: "los widgets de tipo *scoreboard* deben usar siempre `text-foreground-strong` para nombres de jugadores, no `text-muted` (Apr 2026)".]

[Si no hay lección nueva → dejá vacío o "Aplicación directa del patrón existente de DESIGN.md §X".]
