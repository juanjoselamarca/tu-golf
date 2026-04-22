# Auditoría UI/UX Golfers+ — 22 abr 2026

**Auditor:** Head of UI/UX + Head of Design (Claude, CTO)
**Material:** 38 capturas WhatsApp, device Samsung (Android, Samsung Internet), 21-abr 23:27–23:33
**Target:** golfista amateur exigente de clubes chilenos (directiva `CERO FALLOS` + `usuario_premium`)
**Método:** revisión individual foto a foto → consolidación en patrones sistémicos → backlog priorizado
**Fuente primaria:** `Ejemplos fotos errores/Errores Generales GOLFERS+ 21042026/` (38 JPEG)

> Este documento es la **fuente de verdad compartida** del sprint de fixes. Cada item tiene checkbox `[ ]` / `[x]` que se marca conforme se cierra. Agentes deben actualizar este archivo al terminar su partición.

---

## 0. Lectura ejecutiva

La app tiene una identidad visual con ambición premium (serif display tipo Playfair, paleta dorado/azul petróleo/verde Garmin, microcopy humano en español). Esa identidad **no está resuelta como sistema**.

Tres problemas estructurales explican ~60% de los hallazgos:

1. **Pill flotante `● EN VIVO` roto a nivel layout.** Aparece en casi todas las pantallas y pisa títulos, subtítulos, valores ("9 hoyos" queda "9 hoy"), stepper. No es un bug de una pantalla — es una regla de capa (`position: fixed`) mal gobernada. Además aparece incluso cuando no hay nada en vivo → desnaturaliza el indicador.

2. **Dos modos (claro / oscuro) sin contrato claro.** Home pública y error están en dark; app logueada está en light. Sin regla documentada. Error "Algo salió mal" en dark rompe continuidad del flujo light que lo dispara.

3. **Inconsistencias de sistema:** dos colores de toggle "ON" (verde y dorado), mezcla de emojis cartoon con iconos line, fecha `MM/DD/YYYY` (US) violando regla es-CL, yardajes vacíos en selector de tees, y código de ronda `1E3I58` con caracteres ambiguos (`I` vs `1`).

---

## 1. Inventario de pantallas (38 fotos → 35 pantallas únicas)

| # | Archivo | Pantalla | Modo |
|---|---------|----------|------|
| 01 | 23.43.10 | Error genérico `Algo salió mal` | Dark |
| 02 | 23.43.10 (1) | Ronda creada con código `1E3I58` | Light |
| 03 | 23.43.10 (2) | Confirmar ronda (scroll arriba) | Light |
| 04 | 23.43.10 (3) | Nueva Ronda — Confirmar ronda (top) | Light |
| 05 | 23.43.11 | Nueva Ronda — Jugadores (Azul, HCP 15) | Light |
| 06 | 23.43.16 | Nueva Ronda — Jugadores (Blanco, HCP 13) | Light |
| 07 | 23.43.16 (1) | Cancha — scroll tees + Partida simultánea | Light |
| 08 | 23.43.17 | Cancha — buscar cancha (lista) | Light |
| 09 | 23.43.17 (1) | Cancha — selector de tees (5 opciones) | Light |
| 10 | 23.43.17 (2) | Formato — Stableford/Match/Best Ball + Neto/Gross | Light |
| 11 | 23.43.17 (3) | Formato — top (Cuántos hoyos + Formato) | Light |
| 12 | 23.43.17 (4) | Cancha — top (Los Leones seleccionado) | Light |
| 13 | 23.43.18 | Modo scoring — Cada uno / Yo llevo el score | Light |
| 14 | 23.43.18 (1) | Nueva Ronda — step 1 "Como quieres jugar" | Light |
| 15 | 23.43.18 (2) | Landing pública — CTA `Empieza a jugar diferente` | Dark |
| 16 | 23.43.18 (3) | Landing — card LABS "La ciencia detrás de tu juego" | Dark |
| 17 | 23.43.19 | Landing — 01 02 03 steps (Crea/Marca/Ranking) | Dark |
| 18 | 23.43.19 (1) | Landing — "Mucho más fácil que jugar golf" | Dark |
| 19 | 23.43.19 (2) | Landing — Tu índice completo / Tu coach personal | Dark |
| 20 | 23.43.19 (3) | Landing — Todo para mejorar tu juego | Dark |
| 21 | 23.43.20 | Landing — métricas 244/47/864/100% | Dark |
| 22 | 23.43.20 (1) | Landing — embed PGA TOUR leaderboard | Dark |
| 23 | 23.43.20 (2) | Landing — hero "Tu mejor golf, empieza con los datos" | Dark |
| 24 | 23.43.20 (3) | Educación — Ejemplo de índice paso a paso | Dark |
| 25 | 23.43.21 | Educación — WHS fórmula + tabla | Dark |
| 26 | 23.43.21 (1) | Educación — Índice Golfers+ vs Federación | Dark |
| 27 | 23.43.21 (2) | GWI — Probabilidades de Ganar por jugador | Dark |
| 28 | 23.43.21 (3) | Torneo espectador — Marcador en vivo (top) | Light |
| 29 | 23.43.22 | Torneo espectador — Marcador + Momentos recientes | Light |
| 30 | 23.43.22 (1) | Torneo espectador — Leaderboard completo | Dark |
| 31 | 23.43.22 (2) | En Vivo — listado 4 activas | Dark |
| 32 | 23.43.22 (3) | Perfil — Tu experiencia (toggles) | Light |
| 33 | 23.43.23 | Perfil — Eliminar mi cuenta | Dark |
| 34 | 23.43.23 (1) | Perfil — Competidor consistente + índices | Dark |
| 35 | 23.43.23 (2) | Scorecard — Lomas de La Dehesa (97 +25, 18h) | Light |
| 36 | 23.43.23 (3) | Scorecard — Club de Polo (43 +7, 9h) | Light |
| 37 | 23.43.24 | Mi Historial — lista (Los Leones/Club Polo) | Light |
| 38 | 23.43.24 (1) | Mi Historial — top (104 rondas, 0 birdies) | Light |

---

## 2. Patrones sistémicos (arreglos de alto leverage)

### P1 · Pill `● EN VIVO` flotante pisa contenido — `[ ]`
**Evidencia:** 14 fotos (02, 03, 04, 05, 06, 07, 08, 11, 12, 13, 15, 16, 17, 22, 23).
**Fix:**
1. El pill NO renderiza cuando no hay ronda/torneo activo del usuario.
2. Cuando exista, reservar espacio en el layout (no `position: fixed` superpuesto). Moverlo a topbar o `<section live-bar>` con altura propia.
3. Tap en el pill → deep-link a la ronda/torneo live.

**Objetivo:** 0 pantallas con contenido pisado. CTR del pill > 0%.
**Escalabilidad:** una regla en app shell → aplica a todo.
**Prioridad:** **P0**.
**Owner:** Foundation (Claude).

---

### P2 · Modo claro/oscuro sin contrato — `[ ]`
**Evidencia:** toda el área logueada light; pre-login + error + Perfil→Eliminar + header → dark. Foto 34 mezcla ambos modos en misma screen.
**Fix:** contrato en DESIGN.md
- **Light** = surfaces operativas (crear ronda, scorear, perfil, leaderboard del torneo que juegas)
- **Dark** = surfaces de exhibición (landing, educación, leaderboards espectador de torneos ajenos, hero cards)
- **Error** hereda el modo del contexto que lo dispara
**Objetivo:** 0 screens mixtas en misma viewport.
**Prioridad:** **P1**. **Owner:** Foundation.

---

### P3 · Código de ronda `1E3I58` — ambigüedad tipográfica — `[ ]`
**Evidencia:** foto 02.
**Fix:**
1. Alfabeto restringido: excluir `I, O, L, 0, 1, B, 8` (Crockford base32).
2. Render con mono clara (JetBrains Mono), no serif display.
3. Separador cada 3 chars: `ABC · D4F`.
4. Tap-to-copy visible.
**Objetivo:** 0 reportes "no pudimos unirnos con el código".
**Prioridad:** **P0**. **Owner:** Foundation (generador) + Agente A (UI).

---

### P4 · Formato de fecha `04/21/2026` US-biased — `[ ]`
**Evidencia:** foto 07. Violación regla español LatAm (CLAUDE.md § 6).
**Fix:**
1. Formato único `21 abr 2026` (corto), `21 de abril de 2026` (largo).
2. Utility `formatDate(d, 'short'|'long')`.
3. Locale `es-CL` default.
**Objetivo:** 0 matches de `MM/DD` en el repo.
**Prioridad:** **P1**. **Owner:** Foundation.

---

### P5 · Yardajes vacíos en selector de tees — `[ ]`
**Evidencia:** fotos 07, 09. `"yds · CR 73.3 · Slope 136"` sin número antes de `yds`.
**Fix:**
1. Investigar por qué FedeGolf devuelve yardaje null.
2. Nunca renderizar `"yds"` sin número. Si null, ocultar token.
3. UX premium: orden `yardaje (grande) · CR · Slope`, no al revés.
**Objetivo:** todas las canchas del roadmap con yardaje completo en 5 tees.
**Prioridad:** **P0**. **Owner:** Agente A.

---

### P6 · Toggles con dos colores "ON" — `[ ]`
**Evidencia:** foto 32 (verde + dorado).
**Fix:** un solo color activo = dorado de marca. Verde solo para "en vivo/éxito".
**Prioridad:** **P2**. **Owner:** Foundation (componente Toggle).

---

### P7 · Iconografía mixta (emojis + line icons) — `[ ]`
**Evidencia:** foto 10 (🏆🤝🔄 vs line icons) + foto 32.
**Fix:**
1. Cero emojis en UI chrome. Regla lintable.
2. Todos los iconos desde `src/components/icons/index.tsx` (extender, no reinventar).
3. Iconos golf-specific: trofeo, handshake, bandera, flechas alternadas en line style minimal.
**Prioridad:** **P1**. **Owner:** Foundation (icon system) + cada agente en su partición.

---

### P8 · Numeración `01 02 03` fantasma en landing — `[x]`
**Evidencia:** fotos 17, 18.
**Fix:** eliminar los números. El orden vertical de los cards ya comunica la secuencia.
**Prioridad:** **P2**. **Owner:** Agente C.

---

### P9 · Embed PGA TOUR con placeholders `E / E / E / E / E` — `[x]`
**Evidencia:** foto 22.
**Decisión de producto (Juanjo 22-abr):** MANTENER el embed, pero arreglar estado "no empezó aún".
**Fix:**
1. Si torneo no empezó: mostrar "Empieza el 23 abr · 12:00 AM EDT · TPC Louisiana" en vez de leaderboard vacío.
2. Si empezó: cargar nombres reales.
**Prioridad:** **P1**. **Owner:** Agente C.

---

### P10 · `Mi Golf` con dot verde siempre ON — `[ ]`
**Evidencia:** ~12 fotos.
**Fix:**
1. Dot ON = hay insight nuevo no leído.
2. Estado inicial OFF.
3. Apagarse al abrir Mi Golf.
**Prioridad:** **P2**. **Owner:** Foundation (Navbar es protegido).

---

### P11 · Dropdown arrow `▼` ambiguo en leaderboard — `[ ]`
**Evidencia:** foto 30.
**Fix:** reemplazar `▼` por `chevron-right` y el tap de la fila completa abre detalle.
**Prioridad:** **P2**. **Owner:** Agente D.

---

### P12 · `104 rondas, 0 birdies` — dato agregado sospechoso — `[ ]`
**Evidencia:** foto 38.
**Fix:**
1. Auditar query agregadora de birdies.
2. Si dato ambiguo por data completeness → `—` o tooltip, nunca `0`.
3. Verificar manualmente contra las 104 rondas de Juan José.
**Prioridad:** **P0 si hay birdies reales no contados; P1 en cualquier caso por tratamiento visual.** **Owner:** Agente B.

---

### P13 · Stepper Nueva Ronda — 4 checks y 3 números — `[ ]`
**Evidencia:** fotos 03, 04, 05, 06, 11, 14.
**Fix:**
1. Stepper = 4 steps numerados (1 Formato, 2 Cancha, 3 Jugadores, 4 Confirmar).
2. Step activo destacado, previos como check, siguientes inactivos.
3. Visible sticky en todas las pantallas del wizard.
**Prioridad:** **P1**. **Owner:** Foundation (componente Stepper) + Agente A (consumo).

---

### P14 · CTAs primarios todos iguales (fatiga del dorado) — `[ ]`
**Evidencia:** fotos 04, 05, 06, 13.
**Fix:** 3 variantes en `<Button>`:
1. `primary-nav` (Siguiente, Revisar) — dorado outline.
2. `commit` (Crear ronda, Guardar, Empezar a jugar) — dorado sólido.
3. `destructive` (Eliminar cuenta) — rojo sólido.
**Prioridad:** **P2**. **Owner:** Foundation.

---

### P15 · WhatsApp verde desfasado de la paleta — `[ ]`
**Evidencia:** foto 02.
**Fix:** unificar "Invitar a jugar" + "Invitar a seguir" en un `<ShareSheet />` con acción "Compartir". WhatsApp como opción dentro del sheet, no botón dominante.
**Prioridad:** **P2**. **Owner:** Foundation (ShareSheet) + Agente A (consumo).

---

### P16 · Jerarquía tipográfica rota en landing de métricas — `[x]`
**Evidencia:** foto 21.
**Decisión de producto (Juanjo 22-abr):** métrica héroe = **"47+ canchas chilenas con rating oficial"** con diseño cuidado.
**Fix:**
1. "47+ canchas" como héroe, tipografía serif grande, número dorado 2x el resto.
2. Las otras 3 métricas reducidas y soportando al héroe.
**Prioridad:** **P2**. **Owner:** Agente C.

---

### P17 · "Partida simultánea" sin explicación — `[ ]`
**Evidencia:** foto 07.
**Fix:**
- Título: "Partida shotgun"
- Body: "Cada grupo empieza en un hoyo distinto. Útil cuando son muchos jugadores o tienes tiempo limitado."
- Al activar → expand con selector de hoyo.
**Prioridad:** **P2**. **Owner:** Agente A.

---

### P18 · Perfil — Federación vs Golfers+ sin storytelling — `[ ]`
**Evidencia:** foto 34.
**Fix:**
- Card Federación: "Oficial USGA · lo usas en torneos de Federación"
- Card Golfers+: "Rendimiento real · lo usamos para coaching y torneos amistosos"
- Tooltip/link "¿Cuándo uso cuál?"
**Prioridad:** **P1** (toca propuesta de valor core). **Owner:** Agente D.

---

### P19 · Input "Buscar cancha…" contraste muy bajo — `[ ]`
**Evidencia:** foto 08. WCAG AA probablemente fallado.
**Fix:** placeholder contrast ratio ≥ 4.5:1, borde más definido, icon de lupa visible.
**Prioridad:** **P1** (a11y + uso en sol). **Owner:** Foundation (componente Input base) + Agente A.

---

### P20 · Momentos recientes — "12" gigante duplicado — `[ ]`
**Evidencia:** fotos 28, 29.
**Fix:**
1. Círculo grande con número hoyo → reemplazar por avatar del jugador (iniciales).
2. Mantener "Hoyo 12 · 3 golpes" solo en subtítulo.
3. Badge "Birdie" como único destacado.
**Prioridad:** **P2**. **Owner:** Agente D.

---

## 3. Hallazgos puntuales

| # | Pantalla | Hallazgo | Prioridad | Owner | Estado |
|---|----------|----------|-----------|-------|--------|
| H01 | Error genérico | Sin código de error ni acción "reportar" — imposible diagnosticar | P1 | Foundation | `[ ]` |
| H02 | Confirmar ronda | No hay resumen de tee por jugador cuando hay múltiples | P1 | Agente A | `[ ]` |
| H03 | Jugadores | "Tu" → "Tú" (acento) o icono claro | P2 | Agente A | `[ ]` |
| H04 | Selector Cancha | Chevron `>` inconsistente entre cards | P2 | Agente A | `[ ]` |
| H05 | Selector Cancha | Nombres truncados "C.G. Las Brisas De Santo D…" — 2 líneas | P2 | Agente A | `[ ]` |
| H06 | Formato juego | Match Play no disabled si ≠ 2 jugadores | P1 | Agente A | `[ ]` |
| H07 | Scorecard Lomas | `↓ Subió 1` — direccionalidad de flecha invertida | P0 si bug de golf/, P1 si solo flecha | Agente B | `[ ]` |
| H08 | Scorecard | Recuadros hoyos se ven clickables sin serlo | P2 | Agente B | `[ ]` |
| H09 | Scorecard | Desglose inferior solo muestra "malos": faltan Birdies/Eagles | P2 | Agente B | `[ ]` |
| H10 | Mi Historial | Barras colores comprimidas, 9 vs 18 hoyos del mismo largo | P2 | Agente B | `[ ]` |
| H11 | Mi Historial | Match Play mostrado como `+5` cuando debería ser en hoyos ganados | P1 | Agente B | `[ ]` |
| H12 | Mi Historial | NETO pill azul/cian fuera de paleta | P2 | Agente B | `[ ]` |
| H13 | Ronda creada | Código sin botón copy visible (asumo tap-to-copy no evidente) | P1 | Agente A | `[ ]` |
| H14 | GWI | "DOMINANDO" label dramatic, revisar si cuadra con target | P2 | Agente D | `[ ]` |
| H15 | En Vivo listado | "Los Leones" duplicado, considerar group header con rondas nested | P2 | Agente D | `[ ]` |
| H16 | Perfil header | Email PII visible en screenshot, revisar intencionalidad | P1 | Agente D | `[ ]` |
| H17 | Landing footer | Tag "Diseñado para el golf amateur en LatAm" ilegible por opacidad baja | P2 | Agente C | `[ ]` BLOQUEADO: el string vive en `src/app/layout.tsx` (archivo protegido). Delegado a Foundation. |
| H18 | Wizard paso 1 | "Repetir" compite con tap del card de ronda previa | P2 | Agente A | `[ ]` |

---

## 4. Particiones de los 4 agentes

Paths reales verificados contra repo (22-abr-2026).

### Agente A · Wizard Crear Ronda

**Alcance:**
- `src/app/ronda-libre/nueva/page.tsx`
- `src/app/ronda-libre/[codigo]/page.tsx` (pantalla post-creación con código)
- `src/components/CourseSelector.tsx`
- `src/components/ronda/**` (ShareMenu, NotifBanner, AuthModal)
- SQL investigación: yardajes FedeGolf (`cancha_tees.yardaje IS NULL`)

**Hallazgos:** P5, P17, P19 (consumo), H02, H03, H04, H05, H06, H13, H18, P3 (consumo UI).

**Prohibido tocar:** `src/components/ui/**`, `src/components/Navbar.tsx`, `src/app/layout.tsx`, cualquier archivo fuera del alcance.

---

### Agente B · Scorecard + Historial

**Alcance:**
- `src/app/perfil/historial/page.tsx`
- `src/app/perfil/historial/[id]/page.tsx`
- `src/app/perfil/stats/page.tsx`
- `src/app/tarjeta/[id]/page.tsx`
- `src/components/Scorecard.tsx`
- `src/components/HoleColorBar.tsx`, `HoleBar.tsx`, `ScoreSymbol.tsx`
- Query birdies agregados: investigar API
- Direccionalidad índice: `src/golf/**`

**Hallazgos:** P12, H07, H08, H09, H10, H11, H12.

**Prohibido tocar:** `src/components/ui/**`, `src/components/Navbar.tsx`, `src/app/layout.tsx`.

---

### Agente C · Landing pública + Educación

**Alcance:**
- `src/app/page.tsx` (landing)
- `src/app/indices/page.tsx` (educación WHS)
- `src/components/HeroSection.tsx`, `StatsSection.tsx`, `PGALiveWidget.tsx`

**Hallazgos:** P8, P9 (mantener embed, arreglar estado not-started), P16 (héroe 47+ canchas), H17.

**Prohibido tocar:** `src/components/ui/**`, `src/components/Navbar.tsx`, `src/app/layout.tsx`.

---

### Agente D · Perfil + Torneo espectador + En Vivo

**Alcance:**
- `src/app/perfil/page.tsx`
- `src/app/torneo/[slug]/page.tsx` (cuidado: recién modificado en sprint WD/DQ)
- `src/app/torneo/[slug]/tv/page.tsx`
- `src/app/en-vivo/page.tsx`
- `src/components/GWILeaderboard.tsx`, `GWIDisplay.tsx`, `GWICell.tsx`, `GWISparkline.tsx`
- `src/components/EnVivoWidget.tsx`
- `src/components/TournamentTabs.tsx`, `TournamentCardMenu.tsx`, `TournamentBottomSheet.tsx`
- `src/components/MiniLeaderboard.tsx`, `MobileLeaderboard.tsx`, `TeamLeaderboard.tsx`, `LeaderboardTable.tsx`

**Hallazgos:** P11, P18, P20, H14, H15, H16.

**Prohibido tocar:** `src/components/ui/**`, `src/components/Navbar.tsx`, `src/app/layout.tsx`.

---

### Foundation (Claude CTO, paralelo a los agentes)

**Alcance:**
- `DESIGN.md` (nuevo)
- `src/components/ui/Button.tsx` (nuevo, 3 variantes)
- `src/components/ui/Toggle.tsx` (nuevo, un solo color activo)
- `src/components/ui/Stepper.tsx` (nuevo)
- `src/components/ui/LiveBadge.tsx` (nuevo, reemplaza LiveRoundIndicator)
- `src/components/ui/RoundCode.tsx` (nuevo, mono + separador)
- `src/components/ui/Input.tsx` (nuevo, contraste correcto)
- `src/components/ui/ShareSheet.tsx` (nuevo)
- `src/lib/format.ts` (nuevo: formatDate es-CL)
- `src/lib/round-code.ts` (nuevo: generador Crockford sin ambiguos)
- `src/components/icons/index.tsx` (extender con: trophy, handshake, flag, shotgun, chevron-right)
- `src/components/Navbar.tsx` (PROTEGIDO — protocolo completo: dot Mi Golf con semántica real)
- `src/app/layout.tsx` (PROTEGIDO — mover pill EN VIVO al shell con contrato claro)

**Hallazgos:** P1 (shell), P2 (contrato modo), P3 (generador), P4 (fecha), P6 (toggle), P7 (icons), P10 (dot nav), P13 (stepper), P14 (Button), P15 (ShareSheet), P19 (Input), H01 (Error component).

---

## 5. Orden de ataque

1. **Fase 0 — Foundation** (Claude, serial): bloquea todo. Debe terminar antes que los agentes integren con shared.
2. **Fase 1 — 4 agentes en paralelo** (isolation worktree, trabajando sobre Foundation ya mergeada a una branch base `audit-2026-04-22-base`).
3. **Fase 2 — Integración**: merge de las 4 branches a `audit-2026-04-22` + resolver conflicts mínimos.
4. **Fase 3 — Preview Vercel + E2E + visual review** sobre preview URL.
5. **Fase 4 — Fast-forward a main** como push atómico solo si pasa todo.

---

## 6. Criterios de "done" por item

Un hallazgo se marca `[x]` solo si:
- Fix implementado y committeado
- Test manual visual en dev server (o preview)
- 0 regresiones en otras pantallas
- Commit puro (scope único)
- CTO-owner revisó el diff

---

**Última actualización:** 22-abr-2026 — Agente C cerró P8, P9, P16 (H17 bloqueado por archivo protegido)
**Estado global:** 3 / 38 items cerrados
