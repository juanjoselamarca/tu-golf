# tabla-coach-mobile — Decisión de diseño

**Fecha:** 2026-06-02
**Reporte origen:** `inbox_reports.id` = `95241a52-fc23-4a1d-9f05-e8ee073d6bf5`
**PR:** #88 — https://github.com/juanjoselamarca/tu-golf/pull/88

---

## Problema (1 línea)

> "El coach entrega una tabla muy importante en un formato ilegible... mejorar el UX cuando lee el chat con el coach en la versión mobile." — Las tablas markdown del coach ("plan hoyo a hoyo") colapsaban en mobile partiendo cada header letra por letra ("H o y o", "P a r").

## Causa raíz

`CitedMarkdown` renderiza con `ReactMarkdown` + `remarkGfm` (parsea tablas) pero **no define renderers de `table/th/td`**. La `<table>` cae a estilos default del browser; dentro del bubble angosto del chat (`maxWidth:80%` + `wordBreak:break-word`) las 5 columnas se aplastan y el texto quiebra carácter por carácter. No existe ningún CSS `.taiger-md` que las estilice.

## Variantes consideradas

Este fue un fix **estructural con respuesta objetiva** (no exploración estética), por lo que NO se gatilló `design-shotgun` (excepción "tweak/fix de render", no rediseño). Las opciones reales eran patrones de tabla mobile, no estéticas:

### Variante A — Scroll horizontal + `nowrap` (elegida)
Contenedor `overflow-x: auto` alrededor de la `<table>`, celdas `white-space: nowrap`. La tabla conserva su estructura; columnas anchas se revelan scrolleando. Patrón canónico de tabla mobile.

### Variante B — Colapso a "cards" (una fila = una card apilada)
Reestructurar cada fila como tarjeta key→value. Descartada: requiere conocer el significado semántico de columnas (imposible con markdown genérico del LLM), rompe la metáfora de "tabla" que el coach eligió, y es frágil ante tablas de forma arbitraria.

### Variante C — `font-size` reducido + `word-break` permitido
Achicar la fuente para que entren las 5 columnas. Descartada: ilegible bajo el sol/con apuro (viola CERO FALLOS de uso en cancha), y no escala a tablas con más columnas.

## Evaluación objetiva

| Criterio | A | B | C |
|---|---|---|---|
| Cumple `DESIGN.md` (DM Mono data, tokens, mobile-first, touch) | ✅ | ⚠️ | ❌ |
| WCAG AA contraste (`--text` sobre `--bg-surface`) | ✅ | ✅ | ❌ (texto diminuto) |
| Consistency con componentes shared | ✅ | ❌ (patrón nuevo ad-hoc) | ✅ |
| Mobile-first | ✅ | ✅ | ❌ |
| Premium / no AI-slop | ✅ | ⚠️ | ❌ |

## Elegida

**Variante A.**

## Razón objetiva (no estética)

- Es el único patrón que **preserva la tabla tal cual el LLM la generó** sin asumir semántica de columnas (robusto ante cualquier forma de tabla).
- `white-space: nowrap` ataca exactamente la causa raíz del reporte (el quiebre letra-por-letra).
- `overflow-x: auto` mantiene legibilidad sin achicar tipografía → cumple "legible en cancha, con guante, con apuro".
- Headers en DM Mono uppercase + tokens del design system → consistente con el resto de data tabular de la app (DESIGN.md §4).
- Aplica a **ambas ramas** del componente (con y sin citas de fuente), sin duplicar lógica.

## Verificación

- Before/after a 390px (mobile): antes ilegible, después limpio y scrolleable.
- +2 tests canario en `CitedMarkdown.test.tsx` que prueban `overflow-x:auto` y `white-space:nowrap` en el HTML renderizado.
