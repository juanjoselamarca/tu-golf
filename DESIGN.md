# Golfers+ · Design System

Fuente de verdad del diseño visual e interaccional. Cualquier decisión de UI que contradiga este documento necesita propuesta explícita al CTO antes de implementarse.

**Última revisión:** 22-abr-2026 — creado tras audit UI/UX general (`docs/audits/2026-04-22-ui-general.md`).

---

## 1. Target de usuario

Golfista amateur exigente de clubes chilenos. Usa la app en cancha bajo sol, con guante, entre hoyos, con apuro. Juega torneos reales donde cada error es costoso.

Implicancias de diseño:
- **Contraste WCAG AA mínimo** en todo texto operativo (scoring, leaderboard, inputs). Preferir AAA en datos críticos.
- **Touch targets ≥ 44×44 px**.
- **Tipografía numérica mono** para códigos, scores, yardajes, ratings (evitar ambigüedad `I/1`, `O/0`, `B/8`).
- **Cero ornament infantil.** Nada de emojis cartoon (🏆🤝🔄) en UI chrome. Usar `@/components/icons` (line icons lucide).

---

## 2. Contrato de modo claro / oscuro

Dos modos, regla explícita de cuándo entra cada uno. NO mezclar en misma viewport.

### Light (fondo claro)

Surfaces **operativas** — el usuario está haciendo algo que afecta su data.

- Dashboard, perfil, editar perfil
- Crear ronda (wizard completo)
- Scorear (ronda-libre, torneo)
- Leaderboard **de torneos que juegas**
- Historial propio, scorecards
- Admin

### Dark (fondo #070d18 navy)

Surfaces **de exhibición o marketing** — el usuario lee/explora, no edita.

- Landing pública (`/`)
- Educación (`/indices`, WHS, LABS)
- Leaderboard espectador de **torneos ajenos**
- Hero cards de marca (PGA embed, etc.)

### Error states

Heredan el modo del contexto que los dispara. Un 500 en flujo light es light; un 500 en landing es dark. El error `Algo salió mal` nunca es default dark.

### Transiciones

Cuando el usuario navega entre light y dark surfaces (ej: landing → dashboard post-login), el cambio es aceptable pero **nunca dos modos en mismo scroll**. Si una pantalla tiene secciones claras y oscuras, se rediseña.

---

## 3. Paleta

Definida en `src/app/globals.css` como CSS custom properties. NO inventar colores por componente.

| Token | Valor | Uso |
|-------|-------|-----|
| `--brand` | `#C4992A` | Gold. Acciones primarias, marca, métrica héroe, indicador activo único. Uso rationed — ver § 5. |
| `--bg` | `#070d18` | Deep navy. Fondo dark surfaces. |
| `--bg-surface` | `#0e1c2f` | Card / panel dark. |
| `--eagle` | `#0B6BA6` | Eagle (-2+). Azul profundo. |
| `--birdie` | `#14B3D9` | Birdie (-1). **Celeste** — Garmin real. (El viejo `#EF4444` rojo era un error de dominio: en Garmin el birdie es celeste y el rojo es doble bogey. Corregido 19-jul, ver T1 resuelta.) |
| `--par` | `#6B7280` | Par. Neutro, sin borde. |
| `--bogey` | `#C4992A` | Bogey (+1). Mismo gold que brand. |
| `--double` | `#DC2626` | Doble bogey+ (+2+). Rojo. |

**Fuente única de color+forma por resultado:** `getScoreIndicator(gross, par)` y `GARMIN_COLORS` en `src/components/ScoreSymbol.tsx`. Lo consumen Scorecard, HoleBar y MiniScorecardGrid. Los CSS vars de arriba son un espejo (no una segunda fuente): si divergen, gana ScoreSymbol.

**Verde sólo para `en vivo / éxito`.** NO usar verde como "ON" de toggles (el audit P6 encontró verde + dorado para mismo estado). Ver § 5.

**Colores Garmin en scorecard:** fuente de verdad `src/lib/garmin-colors.ts`. NO modificar sin verificar contra captura real de Garmin Golf (CLAUDE.md).

---

## 4. Tipografía

Cuatro familias cargadas vía `next/font`:

| Variable CSS | Familia | Uso |
|--------------|---------|-----|
| `--font-dm-sans` | DM Sans | Body default, UI chrome, labels. |
| `--font-playfair` | Playfair Display (serif) | Headings display, nombres de canchas, títulos hero, números grandes narrativos (score final). |
| `--font-cormorant` | Cormorant Garamond | Serif alternativo. Uso restringido — editorial. |
| `--font-dm-mono` | DM Mono | **Códigos de ronda, yardajes, ratings, slopes, scores tabulares. Cualquier dato que se lea/dicte en cancha.** |

**Regla:** serif display para narrativa, mono para data, sans para chrome. Nunca serif display para un código de ronda o un input de yardaje.

**Size scale** (mobile-first, base 16px):
- hero display: 48–64 px serif
- h1 page: 32 px serif
- h2 section: 20 px serif
- body: 16 px sans
- caption: 12 px sans uppercase tracking-wider
- code/data: 14–18 px mono

---

## 5. Jerarquía de acciones — Button variants

Componente `@/components/ui/Button`. Cuatro variantes:

| Variant | Aspecto | Uso |
|---------|---------|-----|
| `commit` | Dorado sólido, texto negro | Acción irreversible / principal (crear ronda, guardar, empezar a jugar). Máximo UNA por vista. |
| `nav` | Dorado outline, texto dorado | Avanzar wizard, "Revisar", "Siguiente". Reversible. |
| `ghost` | Transparente, texto dorado | Acción terciaria, link-style. "Cómo funciona →", "Ver demo →". |
| `destructive` | Rojo sólido | Eliminar cuenta / cancelar con consecuencia. |

**Motivo:** el audit P14 encontró que todos los CTAs eran dorado sólido idéntico → el usuario no distingue peso de "Siguiente" vs "Crear ronda". Ahora sí.

**Diet del dorado:** dorado sólido es costoso visualmente. Solo para un CTA commit por vista + la marca. El resto es nav/ghost.

---

## 6. Componentes shared obligatorios

Vivienda única en `src/components/ui/`. NO reimplementar:

- `Button` (variantes arriba)
- `Toggle` (un solo color activo: dorado, ver § 3)
- `Stepper` (N steps numerados consistentes, `@/components/ui/Stepper`)
- `Input` (contraste WCAG AA + min 44px touch, ver `@/components/ui/Input`)
- `RoundCode` (display de código con DM Mono + separador visual + tap-to-copy)
- `LiveBadge` (indicador de ronda en vivo, inline en shell — NO floating)
- `ShareSheet` (compartir unificado — WhatsApp subordinado al sheet)
- Icons → `@/components/icons` (re-export curado de lucide-react)

---

## 7. Reglas de layout

### El shell de la app

- Topbar fija (altura 64px) con logo + menú + avatar.
- Bottom nav fijo (altura 64px + safe-area-inset-bottom).
- Contenido entre topbar y bottom nav.
- **NADA posicionado `fixed` que flote sobre el contenido**, salvo dialogs/sheets que son modales explícitos.
- El pill `LiveBadge` vive EN la topbar inline — reserva su propio espacio, no flota.

### Mobile-first

- Base: 360–430px (iPhone/Android standard).
- Tablet/desktop: max-width contenedor 640px salvo dashboards admin.
- `100dvh` para full-height (respetar teclados móviles).

---

## 8. Locale y copy

Español LatAm neutro. Ver CLAUDE.md § 6.

- `tú`, nunca `vos`.
- Spanglish golf ok: `birdie`, `bogey`, `handicap`, `stroke play`.
- Fechas: `21 abr 2026` (short) o `21 de abril de 2026` (long). Nunca `04/21/2026`.
- Utility: `@/lib/format` → `formatDate(d, 'short'|'long'|'input')`.

---

## 9. Códigos de ronda

Utility: `@/lib/round-code`.

- Alfabeto Crockford sin `I, O, L, 0, 1, B, 8`.
- Longitud 6.
- Display con separador cada 3 (`ABC D4F`).
- DM Mono obligatorio.
- `RoundCode` component con tap-to-copy + feedback.

---

## 10. Iconografía

- Todos los iconos vienen de `@/components/icons`.
- Cero emojis en botones, toggles, cards, nav.
- Emojis ok en contenido de usuario (chat, nombres libres, achievements celebratorios con animación propia — `BirdieCelebration`, etc.).

---

## 11. Protegido — protocolo estricto

Archivos con protocolo de modificación en CLAUDE.md:

- `src/components/Navbar.tsx`
- `src/app/layout.tsx`
- `src/middleware.ts`
- `src/lib/supabase.ts`

Cambios ahí requieren:
1. Aviso explícito de qué se cambia.
2. Cambio mínimo posible (no refactor gratuito).
3. `npm run test` + `npm run build` pre-commit.
4. Commit individual con solo ese archivo.

---

## 12. Revisión y evolución

Cualquier PR que viola una regla acá tiene que:
1. Proponer cambio al DESIGN.md primero.
2. Tener approval del CTO.
3. Actualizar este archivo en el mismo PR.

---

## Jurisprudencia (precedentes 15-may → 28-jun 2026)

Las secciones 1–12 son la constitución y no se tocan. Esta sección recoge los precedentes de `docs/design-decisions/` que las aplicaron a casos concretos, destilados al criterio transferible: lo que un auditor puede aplicar a una pantalla **distinta** de la que originó la decisión. Un precedente no crea regla nueva. Donde dos precedentes tiran para lados opuestos, la tensión se anota como tensión — no se resuelve acá.

### P1 · Una superficie brand-locked se compromete entera; un token theme-aware adentro es un leak
Origen: `2026-05-15-pga-widget-light-mode.md`

Hay superficies exentas del toggle de tema (widgets que reproducen branding externo, hero cards oscuras embebidas en páginas claras). El contrato lo declara el comentario `SECTIONS LIGHT-CARD` en `globals.css`. En una superficie así, un solo `var(--text)` sobreviviente **es** el bug: la superficie queda inconsistente consigo misma en uno de los dos modos. El fix es completar el compromiso (constante hardcodeada + comentario de contrato), no convertir la superficie a theme-aware.

**Señal del rechazo:** volverla theme-aware era *peor* que el bug — la habría dejado clara dentro de un hero siempre oscuro, y sus colores de score fallan WCAG sobre fondo claro. Corolario: a igual corrección, gana el menor blast radius (CERO FALLOS).

### P2 · `rgba(255,255,255,α)` en una superficie con toggle es dark mode de contrabando
Origen: `2026-05-19-light-mode-labs-contraste.md`

En una superficie que respeta el tema, todo color de texto sale de tokens (`--text`, `--text-2`, `--text-3`). Un blanco semitransparente hardcodeado se acerca al fondo claro y desaparece.

**Señal del rechazo:** resolverlo con condicionales de tema en JS se descartó por over-engineering — si el token CSS ya lo resuelve, la decisión no sube a JS. Corolario: el ratio se verifica con número, no a ojo (text-2 = 5.67, text-3 = 4.62 sobre `#fafaf7`).

### P3 · Un tono ya cargado de significado está tomado; la intensidad escala con la magnitud del logro
Origen: `2026-05-21-holebar-par-verde.md`

Elegir un color no es elegir un tono lindo: es ocupar un hueco semántico libre.

**Señal del rechazo:** el verde celebración (`#16a34a`) cayó no por feo, sino porque ya significa birdie en `LeaderboardTable`/`BirdieCelebration`, y porque un resultado menor no puede gritar más fuerte que uno mayor — la jerarquía visual replica la jerarquía semántica (par < birdie < eagle). El pastel cayó por lo opuesto: sutil no es invisible; bajo el sol, un componente UI que no llega a 3:1 no existe.

**Alcance antes de sistematizar:** ante un pedido de "estandarizar en toda la app", se hace `grep` del valor literal para medir el alcance real antes de proponer token global. Con un solo call site: constante nombrada en el archivo. Se promueve a token global cuando aparece el segundo.

### P4 · Cuando dos vistas muestran el mismo objeto, la vista canónica manda la forma
Origen: `2026-05-22-wizard-card-alineado-historial.md`

Misma entidad (una ronda) en dos contextos = misma silueta de tarjeta. Las affordances que solo tiene una vista se agregan como sub-componentes (tag compacto, row de acciones con border-top) **sin reorganizar la estructura**.

**Señal del rechazo:** una necesidad informativa legítima (destacar el estado del scan) no compra permiso para romper la simetría — se re-aloja, no se prioriza. Y el diseño nuevo y llamativo cayó porque un score gigante lee como showcase: novedad visual no es valor.

**Corolario:** cuando el dato es feedback de confianza (¿el OCR acertó?), se muestra siempre; no se esconde tras un expand.

### P5 · Contenido generado por LLM se renderiza sin asumir su semántica
Origen: `2026-06-02-tabla-coach-mobile.md`

El render debe ser robusto a forma arbitraria y preservar la forma que el generador eligió.

**Señal del rechazo:** colapsar la tabla a cards key→value exigiría conocer el significado de cada columna — imposible con markdown genérico, y rompe la metáfora que el coach eligió. El segundo rechazo es el más transferible: **achicar la tipografía nunca es una variable de ajuste de layout.** Legibilidad en cancha, con guante y con apuro, es piso duro. Lo ancho scrollea en su propio contenedor (`overflow-x:auto` + `nowrap`); la página nunca.

**Nota de proceso:** un fix estructural con respuesta objetiva no gatilla `design-shotgun` — no era exploración estética.

### P6 · Dos representaciones del mismo dato en una pantalla es redundancia, aunque la segunda sea la más linda
Origen: `2026-06-17-resumen-ronda-editorial.md`

**Señal del rechazo:** la variante scorecard-premium ganaba visualmente y cayó igual, porque duplicaba el `Scorecard` que ya vive en esa página. "Un concepto, una fuente" también aplica a lo visual. Segundo rechazo: los chips con borde siguen leyendo como cajas — en bloques resumen/stat, fila inline con divisor de 2px por sobre grilla con bordes.

**Ancla editorial:** un único número narrativo en Playfair arriba, el resto en DM Mono (§4). Y no se repite en el bloque lo que ya da el header de la página (curso/fecha): el contexto lo aporta el contenedor.

### P7 · El artefacto es el héroe; el dorado enmarca, no rellena
Origen: `2026-06-28-sharesheet-vitrina.md`

La jerarquía §5 se aplica literal: un único `commit` dorado sólido, el resto `nav` outline, el terciario `ghost`. El dorado sobrante va a marco hairline alrededor del artefacto (el PNG), no a más relleno.

**Señal del rechazo:** una variante entera cayó por targets bajo 44px — el touch no se negocia contra estética.

**Fallback:** sin imagen se oculta el marco; nunca marco vacío. **Arquitectura:** el sheet expone acciones granulares reusando los canónicos (`useShare`, `lib/clipboard`); el formato `wa.me` se extrae al dominio en vez de duplicarse.

---

### Tensiones abiertas (no resueltas — requieren decisión de PM)

**T1 · RESUELTA (19-jul-2026, decisión PM Juanjo — usuario Garmin).** El conflicto: el par se pintaba verde `#86EFAC` en `HoleBar` y gris en `Scorecard`; el birdie, celeste en unos lados y rojo `#EF4444` en el token `--birdie`. Al ver el scorer real apareció una tercera fuente: `MiniScorecardGrid` con birdie DORADO y sobre-par rojo (invertido). **Juanjo cortó el nudo con la convención Garmin real: birdie = celeste, par = neutro, doble+ = rojo.** El token `--birdie` rojo era un error de dominio (la nota "rojo Garmin-compliant" estaba mal). Fuente única: `getScoreIndicator`/`GARMIN_COLORS` en `ScoreSymbol.tsx`, que ahora consumen Scorecard, HoleBar y MiniScorecardGrid. HoleBar par verde→neutro; MiniScorecardGrid re-cableada a la canónica; §3 reconciliado.

**T2 · ¿La asignación de modo de §2 es default o candado?** §2 lista Educación (`/indices`, WHS, LABS) como dark surface. `2026-05-19` declinó explícitamente forzar dark ahí "porque rompería el toggle Auto/Light/Dark que tienen las páginas educativas". Las dos lecturas siguen vivas: o §2 asigna el modo por defecto y el toggle del usuario gana, o §2 es un candado y el toggle es el error.

**T3 · ¿Hardcodear un color es el bug o el fix?** `2026-05-19` trata el hardcode como causa raíz; `2026-05-15` lo declara la solución correcta. El criterio que las separa existe (branding externo + contrato declarado in-source + superficie ya always-dark), pero **no hay test para una superficie nueva**: nada dice cómo se decide que algo nace brand-locked, ni quién lo aprueba.

**T4 · ¿El par es éxito o es neutro?** `2026-05-21` justifica el verde porque §3 lo reserva para "éxito" y un par "es un éxito mínimo" — y en el mismo documento rechaza el verde celebración porque "el par es resultado neutral". El precedente se apoya en las dos lecturas a la vez.

---

### Silencios (nadie ha legislado — no inventar criterio)

Ni §1–12 ni los 7 precedentes dicen nada sobre:

1. **Modo de modales, sheets y toasts lanzados desde la superficie del modo contrario.** `ShareSheet` es dark navy y se abre desde historial/resultados, que son light. §2 prohíbe "dos modos en mismo scroll" pero no dice si un overlay cuenta.
2. **El toggle tri-state Auto/Light/Dark.** §2 asigna modos por superficie y nunca menciona que exista un toggle de usuario. Solo lo sabemos porque `2026-05-19` lo cita de pasada. Ver T2.
3. **Escala de espaciado, radios, sombras y grosores de borde.** §4 tiene escala tipográfica; no hay equivalente para el resto. Los precedentes fijan valores caso a caso ("radius 16", "hairline 1px", "divisor 2px", "border-top sutil") y ninguno se canonizó.
4. **Estados vacíos.** Ni forma, ni copy, ni si llevan CTA — y si lo llevan, si ese CTA consume el único `commit` por vista que permite §5.
5. **Carga.** Skeleton vs spinner vs nada. El widget PGA tiene "loading skeleton"; el patrón no está escrito.
6. **Errores de campo y validación.** §2 solo resuelve de qué modo es un error. Nada sobre error inline, validación de formulario ni copy del mensaje.
7. **Toasts y feedback de éxito.** Posición, duración, si conviven con el bottom nav de 64px. `ShareToast` figura como pendiente en `2026-06-28`.
8. **Movimiento.** Cero: duración, easing, qué se anima, `prefers-reduced-motion`. `BirdieCelebration` se cita como excepción de emoji, no como contrato de motion.
9. **Tokens de texto.** §3 lista brand/bg/scorecard pero no `--text`, `--text-2`, `--text-3` ni `--bg-surface` — justamente los que la jurisprudencia usa como autoridad para decidir contraste.
10. **Colores de resultado fuera del Scorecard.** §3 los scopea a "Solo en Scorecard" y ahí termina. `HoleBar` construyó su propia paleta sin token ni doc. Ver T1.
11. **Tablas fuera del chat del coach.** `2026-06-02` resolvió las del coach. Leaderboard, historial y admin no tienen regla.
12. **Resto del markdown del coach.** Listas, headings, links, citas de fuente, longitud, streaming. Solo se legislaron las tablas.
13. **La tarjeta PNG que se comparte.** `2026-06-28` la declara "el héroe" pero no especifica tipografía, marca, aspect ratio ni safe areas de la imagen misma.
14. **Gráficos y dataviz** (`/perfil/stats` usa recharts): color de series, ejes, leyendas, estado sin data.
15. **Accesibilidad más allá de contraste y touch.** Foco visible, orden de tab, teclado, screen readers, ARIA.
16. **Tamaño y grosor de los iconos.** §10 fija el origen (`@/components/icons`), no la métrica.
