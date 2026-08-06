# indice-explicado-extracto — Decisión de diseño

**Fecha:** 2026-08-06
**Reporte origen:** `inbox_reports.id` = `5de1268e-07c4-44e0-8ae5-2cb4b2d8bc3e` y `a47db33a-90b0-4edd-a2c2-a55aff43153e` (dos fotos del mismo pedido)
**PR:** #301 — https://github.com/juanjoselamarca/tu-golf/pull/301

---

## Problema (1 línea)

Juanjo, sobre el modal "Tu índice oficial, explicado": *"que se vea más elegante, menos IA y más minimalista"* / *"más pro en línea con la app y menos IA infantil, más minimalista y elite"*.

Al diagnosticar contra `DESIGN.md` apareció, además del problema estético, **un fallo de accesibilidad medible**: la pantalla usaba la constante local `GOLD = '#c4992a'` como color de **texto** sobre superficie clara. Medido en runtime sobre el DOM real a 390px: **25 nodos de texto reprobaban WCAG AA en tema claro** (2.30–2.65:1 contra un mínimo de 4.5, o de 3.0 para el hero de 52px). `globals.css` ya tenía el token correcto — `--brand-on-bg`, que resuelve #8A6A16 en claro y #C4992A en oscuro — y el modal no lo usaba.

Había además un segundo token, `--brand-text: #8A6A16`, **fijo en ambos modos y sin un solo consumidor**. Era una trampa: fijo significa #8A6A16 sobre navy en dark (~3.35:1, reprueba AA) justo donde `--brand-on-bg` sí pasa. El code review lo cazó; se borró en este PR para que el concepto "oro accesible como texto" tenga una sola fuente.

Los cuatro defectos estéticos, en el vocabulario del design system:

- **8 pastillas doradas** con el divisor `÷8 =` intercalado, envolviendo a dos líneas y dejando `11.4` huérfano. `P6` es literal: *"los chips con borde siguen leyendo como cajas"*.
- **Todo dorado** (~50 elementos en una pantalla). Viola la Diet del dorado (§5) y `P7` (*"el dorado enmarca, no rellena"*).
- **20 tarjetas con borde propio**, sin jerarquía entre ellas: una grilla de cajas.
- **"Cuenta" codificado cuatro veces**: borde + fondo teñido + color del número + etiqueta.

## Variantes consideradas

Renders a 390px en `scratchpad/v-*.png`. `design-shotgun` no corrió: requiere `OPENAI_API_KEY`, que no está en el entorno (ver memoria `reference_design_shotgun_sin_openai`). Fallback usado: mockups HTML con los tokens reales + Playwright a 390px.

### Variante A — Extracto (hairline ledger)
Sin bordes de tarjeta. Lista continua con separador hairline; las que cuentan llevan una regla dorada de 2px al canto izquierdo. Hero en Playfair sin caja. La fórmula, como secuencia inline `7.2 · 8.8 · … ÷ 8 = 9.36 → 9.3`.

### Variante B — Recibo
Bloque superior tipo estado de cuenta: `Suma 74.9` / `÷ 8 = 9.36` / `Truncado 9.3`. Lista sin bordes, con las que no cuentan atenuadas por `opacity: .55` y un punto dorado como única marca.

### Variante C — Split
Dos secciones: "Las 8 que definen tu índice" y "Las otras 12 de tu ventana". "Cuenta" queda codificado por **posición**, sin necesitar color.

### Variante D — Control
La estructura actual con sólo el contraste corregido. Sirve para aislar cuánto del problema era color y cuánto era estructura.

## Evaluación objetiva

| Criterio | A | B | C | D |
|---|---|---|---|---|
| Cumple `DESIGN.md` (paleta, tipo, spacing, touch ≥44px) | ✅ | ✅ | ✅ | ❌ (chips = `P6`; dorado de relleno = `P7`) |
| WCAG AA contraste | ✅ | ❌ | ✅ | ✅ |
| Consistency con componentes shared | ✅ | ✅ | ⚠️ | ✅ |
| Mobile-first | ✅ | ✅ | ✅ | ⚠️ (chips envuelven, dejan `11.4` huérfano) |
| Premium / no AI-slop | ✅ | ✅ | ⚠️ | ❌ |

**B reprueba contraste** por su propia idea rectora: `opacity: .55` sobre `--text-3` (#6B7280) lo baja a ~2.2:1. Atenuar no es una herramienta disponible cuando el texto atenuado sigue teniendo que leerse bajo el sol.

**C pierde información** que ninguna otra pierde: al ordenar por diferencial destruye la cronología, y con eso el socio deja de ver que el 8.9 del 26-jul le ganó al 23.8 del 25-jul. La ventana es una serie temporal; reordenarla la vuelve un ranking.

**D confirma el diagnóstico**: con el color ya arreglado sigue leyendo como grilla de cajas. El problema no era sólo el dorado.

## Elegida

**Fusión A + B** (render en `v-E-light.png` / `v-E-dark.png`): la estructura y la lista de A, con el bloque de cálculo de B, y **sin la secuencia de diferenciales**.

## Razón objetiva (no estética)

1. **La secuencia de chips se elimina, no se rediseña.** Esos 8 números ya están abajo en la lista, marcados. Mostrarlos arriba era la redundancia exacta que prohíbe `P6` — *"dos representaciones del mismo dato en una pantalla es redundancia, aunque la segunda sea la más linda"*. Sacarlos resuelve `P6`, `P7` y el envolvimiento móvil de una sola vez, en vez de tres parches.
2. **El recibo de B explica mejor y no duplica nada**: `74.9 → 9.36 → 9.3` son tres números que no aparecen en ningún otro lugar de la pantalla.
3. **El contraste no queda a criterio**: el dorado sale de `var(--brand-on-bg)` (#8A6A16 claro / #C4992A oscuro), no de un literal por componente. La misma migración se aplicó a `DualIndexCards.tsx` —la card de `/perfil` que abre estos dos modales, con 7 dorados de texto propios— porque si no, la card y el modal que abre muestran dos dorados distintos a un tap de distancia. Verificado en runtime: 25 fallas → 0, en ambos temas, sobre 77 nodos de texto medidos.
4. **"Cuenta" pasa de 4 codificaciones a 2**, y las 2 son deliberadas: la regla dorada para escanear, la palabra `cuenta` para no depender del color (WCAG 1.4.1). La etiqueta `diff` de las otras 12 se elimina por no aportar nada.

## Lecciones / patrón reutilizable

**1. El gemelo adopta la forma, no se queda mirando (`P4`).** `IndiceBreakdownModal` (índice Golfers+) y `FedegolfIndiceModal` (índice federado) se abren desde la misma pantalla `/perfil` y muestran la misma clase de objeto. Rediseñar uno solo dejaba dos estéticas para lo mismo. La fila se extrajo a `src/components/indice/BreakdownRow.tsx` y la consumen los dos. El gemelo arrastraba además el mismo `#c4992a` como texto en tres lugares.

**2. Un pedido estético puede tapar un fallo medible.** El reporte decía "menos IA"; abajo había 25 nodos reprobando AA. Vale la pena medir el contraste en runtime sobre el DOM real antes de tocar nada: convierte "me gusta más" en un número de antes y después.

**3. El medidor de contraste tiene que compositar alpha.** La primera pasada leyó `rgba(196,153,42,0.045)` como si fuera opaco y reportó ratios de `1:1` que no existen en pantalla, inflando el "antes". Un fondo translúcido se compone contra la cadena de ancestros o el número miente.

**4. `svg { display: block }` del preflight de Tailwind rompe un icono inline** aunque el contenedor sea `white-space: nowrap`: el trofeo `×2` se fue a su propia línea. Sólo apareció en el render real, nunca en el mockup. La marca va como hermana en un flex con `flex-shrink: 0`, no inline dentro del título con ellipsis.
