# stepper-volver-a-etapa — Decisión de diseño

**Fecha:** 2026-11-12
**Reporte origen:** `inbox_reports.id` = `8a0b2270-32b9-45f5-9de2-afa0cf61c3f8`
**PR:** ver la rama `feat/inbox-stepper-volver-claude`

---

## Problema (1 línea)

En "Nueva Ronda" no se podía volver a una etapa tocándola en el stepper: «Debería poder volver a cada etapa de
configuración apretando acá la etapa. Dale una vuelta ve si aporta.» Desde Confirmar, cambiar la cancha costaba
tres "Atrás" seguidos, cada uno con su scroll.

## ¿Aporta?

Sí. Es la heurística 3 de Nielsen (control y libertad del usuario) y el patrón de los steppers editables de
Material y de los checkouts: el paso marcado como hecho es justamente el que se puede revisar. El costo de no
hacerlo lo paga el organizador en la cancha, con apuro, que detecta en Confirmar que se equivocó de tee o de cancha.

## Variantes consideradas

No se corrió `design-shotgun`: el cambio no mueve ni un píxel del stepper, solo agrega la interacción. Las
decisiones reales fueron de comportamiento:

### Variante A — Solo pasos completados, hacia atrás (elegida)
Los discos con ✓ (y su etiqueta) son botones. El paso actual y los pendientes no se pueden tocar.

### Variante B — Todos los pasos navegables
Permitiría saltar de Cancha a Confirmar. Descartada: avanzar tiene que pasar por el "Siguiente" de cada paso, que
es el que valida (cancha con ratings, tee, jugadores). Saltarlo deja crear una ronda a medio armar.

### Variante C — Agregar affordance visual (subrayado o chevron)
Descartada: en 390 px las cuatro etiquetas ya ocupan el ancho completo (ver la nota de tracking en `Stepper.tsx`),
y la ✓ ya comunica "hecho, se puede revisar". Ruido sin ganancia.

## Evaluación objetiva

| Criterio | A | B | C |
|---|---|---|---|
| Cumple `DESIGN.md` (touch ≥44px) | ✅ 66×64 / 73×64 medido | ✅ | ✅ |
| WCAG 2.2 AA (foco visible, nombre accesible) | ✅ anillo oro + `aria-label` "Volver a cancha" | ✅ | ✅ |
| No rompe la validación por paso | ✅ | ❌ | ✅ |
| Mobile-first, sin desbordar a 390 px | ✅ layout idéntico | ✅ | ❌ |

## Elegida

**Variante A.**

## Razón objetiva (no estética)

Es la única que agrega el atajo sin abrir un camino que se salte la validación ni gastar ancho que no hay.

## Lecciones / patrón reutilizable

Un `role="progressbar"` no puede tener hijos interactivos: ARIA los vuelve presentacionales y el lector de
pantalla no anuncia los botones. Si un indicador de progreso se vuelve navegable, el contenedor pasa a ser un
`group` con nombre, y el paso actual mantiene `aria-current="step"`.
