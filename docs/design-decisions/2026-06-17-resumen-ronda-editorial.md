# resumen-ronda-editorial — Decisión de diseño
**Fecha:** 2026-06-17
**Reporte origen:** `inbox_reports` `telegram_message_id` = `130`
**PR:** #<pendiente> — `<url>`
---
## Problema (1 línea)
Reporte de Juanjo sobre el bloque "Resumen de tu ronda" (`RoundHighlights`): *"Acá el formato es raro. No es elegante ni minimalista. Veamos una forma de mejorarlo y estandarizarlo."*

## Variantes consideradas
Generadas con `design-shotgun`, renderizadas con Playwright a 390px. Board en `~/.gstack/projects/juanjoselamarca-tu-golf/designs/resumen-ronda-20260617/board.png`.

### Variante A — Editorial minimal
Score total en Playfair grande como ancla (hero), barras Ida/Vuelta en 2 renglones con subtotal alineado a la derecha, Mejor/Peor como renglones tipográficos limpios, desglose en fila inline de 5 sin bordes de tabla.

### Variante B — Scorecard premium
Tira de 18 hoyos con números y scores individuales (colores Garmin), look de scorecard real, stats con divisores.

### Variante C — Refinado del actual
Mantiene la estructura actual puliendo spacing; desglose como chips con borde.

## Evaluación objetiva
| Criterio | A | B | C |
|---|---|---|---|
| Cumple `DESIGN.md` (paleta, tipo, spacing) | ✅ | ✅ | ✅ |
| WCAG AA contraste | ✅ | ✅ | ✅ |
| Consistency con componentes shared | ✅ | ❌ (duplica el `Scorecard` que ya existe en la página) | ✅ |
| Mobile-first | ✅ | ⚠️ muy data-dense | ✅ |
| Premium / no AI-slop | ✅ | ❌ look de tabla | ⚠️ chips aún "cajas" |

## Elegida
**Variante A.**

## Razón objetiva (no estética)
Gana en el criterio que pidió el reporte (elegante + minimalista): elimina los bordes de tabla del desglose (la causa visual del "se ve raro"), agrega jerarquía con el score héroe en Playfair, y no duplica el `Scorecard` que ya vive en la página (B sí lo hacía). No hubo empate → se avanzó sin consultar (default `design-shotgun`). Ajuste sobre el mock: se quitó curso/fecha porque ya están en el header de la página de resultados.

## Lecciones / patrón reutilizable
Para bloques de tipo *resumen/stat* en surfaces light: preferir fila inline con divisor de color de 2px sobre grilla con bordes derechos (que lee como tabla). Ancla editorial = un único número narrativo en Playfair arriba; el resto en DM Mono. Aplicación directa de DESIGN.md §4 (Playfair para números narrativos grandes, mono para data).
