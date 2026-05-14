# tAIger+ Coach Home · Rediseño UI/UX/CX mobile-first

**Fecha:** 2026-05-10
**Autor:** Claude (CTO) · brainstormed con Juanjo (PM)
**Status:** Spec listo para review
**Implementación target:** `src/app/coach/page.tsx` (170 líneas hoy → ~600 estimadas)
**Lane:** mía. Out of lane: chat (`/coach/sesion/[id]` y `/coach/sesion/nueva/chat`), `CitedMarkdown`, `PlanAssignedCard`, `RoundMiniChart`, error banner / Reintentar / streaming / rating del chat. Eso lo lleva otro agente en paralelo.

---

## 1. Problema

La pantalla `/coach` (home del coach IA) hoy es funcional pero plana: TaigerHero ornamental, 3 KPI cells (RONDAS / PATRONES / CPI), CTA único a sesión continua, lista de sesiones anteriores. Le falta lo que justifica que tAIger+ exista como producto premium:

1. **El moat psicológico está enterrado.** El motor cerebro v2 ya detecta 9 patrones (3 explícitamente psicológicos: `post_bogey_spiral`, `pressure_deterioration`, `first_hole_anxiety`). Hoy aparecen solo como un contador "PATRONES: 2" y dentro de párrafos markdown del chat. La dimensión mental del juego — el único territorio donde tAIger+ puede ser categoría nueva frente a Arccos/Garmin/The Grint — no se ve.

2. **Los datos ricos se ven planos.** `plan_outcomes`, `coach_events`, `player_patterns` tienen serie temporal por patrón, adherencia diaria, compliance full/partial. Nada de eso se renderea visualmente. El usuario ve "tenés 2 patrones" en vez de la serie de impacto, el costo en strokes evitables, o la curva mental por hoyo de su última ronda.

3. **El home no atrae al usuario a volver.** El opener proactivo (`/api/taiger/intro`, 7 hooks deterministicos) está enterrado dentro del chat. Si no entrás al chat, no lo ves. El home debería ser el resumen ejecutivo que justifica entrar.

4. **No es mobile-first.** El 90%+ del consumo es en mobile (golfistas en cancha, parking, post-ronda). La página actual es responsive simple pero no diseñada para 393px de viewport prioritario.

---

## 2. Objetivo

Convertir `/coach` en el **panel de inteligencia psicológica del jugador**, mobile-first, donde:

- La dimensión mental se visualiza con el mismo rigor técnico que las stats clásicas.
- Los datos ricos del cerebro v2 se renderean como componentes-objeto (no markdown).
- El opener proactivo asciende del chat al header del home.
- El usuario abre `/coach`, en <3 segundos sabe en qué estado mental está, qué le costó esa semana, qué hacer al respecto.

**Non-goals (explícitos):**
- No tocar el chat (`/coach/sesion/[id]`, `nueva/chat`). Lane del otro agente.
- No crear migraciones nuevas de DB. Solo usar tablas existentes (`coach_plans`, `plan_outcomes`, `coach_events`, `player_patterns`, `historical_rounds`, `profiles`, `taiger_sessions`).
- No reescribir el motor del cerebro v2. Solo derivar el Mental Index del estado actual.
- No tocar `decision-engine.ts`, `plan-engine.ts`, `patterns.ts`. Read-only.
- No diseñar onboarding desde cero (ya existe `/coach/onboarding`, fuera de scope).

---

## 3. Stack y referencias

**Mantener lo que ya existe:**
- Brand color: `#c4992a` y derivados de `var(--brand-on-bg)`, `var(--brand-dark)`.
- Tokens CSS: `--bg`, `--bg-surface`, `--text`, `--text-2`, `--text-3`, `--line`.
- Fonts: **Cormorant Garamond** (serif headlines), **DM Mono** (monospace nums), **DM Sans** (body). NO introducir Playfair Display / IBM Plex Mono (eso fue error de los mockups iniciales).
- `TaigerHero` y `TaigerIcon` se conservan, se redibuja el contexto de uso.
- `CoachAuthGuard` y `layout.tsx` no se tocan.

**Referencias visuales (de la investigación):**
- WHOOP Recovery: score 0-100 + bandas verde/amarillo/rojo.
- Apple Health Highlights: narrativa primero, número como evidencia, sparkline mini.
- Apple Fitness HR zones: stacked horizontal bar para curva mental.
- Polymarket: mono numérico + sparkline horizontal + delta píldora.
- Fintual: padding generoso, microcopy cálido español, ilustraciones FUERA (no aplica acá).
- Calm 2026 anti-streak: dots semanales en vez de racha numerada.
- The Grint: coloreado semántico por relación al par (eagle/birdie/par/bogey/double).

---

## 4. Diseño visual general

**Lenguaje:** *Caddie de cuero* — light cream + verde forest + brass champagne. Premium chileno cálido, no editorial frío, no criptobro dark.

**Paleta semántica nueva** (a agregar a tokens, NO inline):

```css
--coach-recovery-low: #B23A3A      /* rojo apagado, no neón */
--coach-recovery-mid: #B8862E      /* ámbar warm */
--coach-recovery-high: #1F7A4D     /* verde forest */
--coach-pattern-mental: #B8862E    /* patrones psicológicos */
--coach-pattern-cancha: #4A5048    /* patrones técnicos */
--coach-pattern-latente: #8A8F86   /* patrones en monitoreo */
```

Decisión: estos tokens viven en `src/app/globals.css` `:root` y respetan tri-state Auto/Light/Dark (memoria `feedback_modo_color_estandar.md`). Dark variant se define junto con light en una sola PR del tema.

**Tipografía:**
- Headlines de sección: Cormorant Garamond 600, sizes 16-22px mobile, 18-28px desktop.
- Números heroicos: DM Mono 500, sizes 48-72px mobile (no 88pt como mockup v2).
- Labels uppercase: DM Mono 600, 10-11px, letter-spacing 0.16em.
- Body: DM Sans 400-500, 13-15px.

**Layout mobile-first:**
- Target viewport: **393×852px (iPhone 14 Pro)**.
- Padding sides: 20px.
- Cards: bg `var(--bg-surface)`, border `1px solid var(--line)`, border-radius 6px.
- Acento por categoría: border-left 3px con color semántico (rojo/ámbar/verde/brass).
- Espacio vertical entre secciones: 24-32px.
- Tap targets: ≥44×44px (Apple HIG).
- Scroll vertical total estimado: 5-6 viewports.

**Layout desktop (≥768px):** wrappear el mobile en `max-width: 600px` centrado (igual que hoy) + ajustes específicos para cards lado a lado donde aplique. NO se rediseña como dashboard ancho — desktop es mobile estirado.

---

## 5. Composición del home (mobile-first)

Ocho secciones en orden de scroll:

### 5.1 Header
- `TaigerHero` actual (mantener) pero con subtitle dinámico según Mental Index:
  - high: "Tu coach de rendimiento con inteligencia artificial" (default actual)
  - mid: "Tu coach está leyendo tu juego"
  - low: "Tu coach detectó algo importante esta semana"
- Botón "Conversar" como CTA secundario en este punto (el principal va en sticky bottom).

### 5.2 Mental Recovery Hero (NUEVO)
Card protagonista con border-left rojo/ámbar/verde según banda.

**Contenido:**
- Label uppercase "Mental Index · esta semana"
- Número heroico DM Mono 56pt color de banda + "/100" en gris
- Delta vs semana anterior en píldora mono ("↓ 7 sem" / "↑ 12 sem" / "= sem")
- Headline Cormorant Garamond 18pt: estado verbalizado ("Tu cabeza está bajo presión")
- Descripción 13pt: 1-2 líneas explicando los inputs ("Volatilidad alta + 3 espirales + 60% adherencia")
- Banda visual 4px con marcador en posición del score

**Cuando NO se renderea:** si `status === 'insufficient_data'` (<3 rondas), se reemplaza por la card de "registra tu primera ronda" que ya existe hoy.

### 5.3 Highlights · esta semana (NUEVO)
Carousel horizontal swipeable, scroll-snap, 1.0 visible + peek de la 2da.

**3 cards estándar (el orden lo decide un ranker por relevancia, no orden fijo):**

1. **Patrón más caro** — narrativa: "Las espirales post-bogey aparecieron en 3 de tus últimas 4 rondas. Es tu patrón más caro este mes." + sparkline 4-7 puntos + delta píldora.
2. **Adherencia bajo presión** — narrativa: "Aplicaste el plan en 60% de momentos críticos esta semana — +22 puntos vs el mes pasado." + sparkline pos + delta píldora pos.
3. **Mejor ronda mental** — narrativa: "Tu mejor ronda mental fue el 18 de abril. Sin tilt, sin espiral — score 88." + sparkline ghost + píldora neutral "hace 19D".

**Si `coach_events` no tiene data suficiente:** se renderea sólo el card que sí tiene data. Si ninguno: la sección entera se omite (no placeholder vacío).

### 5.4 Costo psicológico + Tu yo contenido (NUEVO)
**Una sola card combinada en mobile**, 2 cards lado-a-lado en desktop.

Bloque superior:
- Label "Costo psicológico · 30D" en rojo
- Número heroico Cormorant Garamond 72pt rojo: strokes evitables (cálculo: ver §6.2)
- Unit "strokes evitables"
- Descripción con cálculo: "Si hubieras contenido las espirales post-bogey, tu promedio del mes hubiera bajado de 95.4 a 93.6."

Bloque inferior (divisor 1px hairline):
- Label "Tu yo contenido · última ronda" en brass
- Row: score real (tachado, gris) → arrow → score ghost (brass) + delta píldora brass
- Descripción: holes específicos donde se perdió ("H1→H2, H11→H12, H14→H15")

**Cuando NO se renderea:** ver estado `no-spiral-active` en §8 — se reemplaza por card "Tu juego más estable" mostrando CPI score + nivel (`nivelCPI`) + trend del breakdown, manteniendo el mismo styling con borde verde forest en vez de rojo.

### 5.5 Curva mental · última ronda (NUEVO)
Card con visualización tipo Apple Fitness HR-zones, partida en Front 9 / Back 9.

**Contenido:**
- Headline "Curva mental" + píldora con conteo de espirales
- Sub: "Ronda 03 may · Los Leones · 100 (+28)"
- 2 bloques (F9, B9), cada uno:
  - Label "Front 9 +11" / "Back 9 +17"
  - Línea de score (18 mini-bars de altura proporcional a strokes-over-par)
  - Stacked bar de 9 segmentos coloreados (calma/tensión/tilt) — reglas en §6.3
  - Axis 1-9 / 10-18 en mono
- Legend con conteos por categoría + CTA "hoyo a hoyo →"

**Mobile-first crítico:** 9 segmentos × ~36px = 324px usables (sobra). 18 segmentos lineales NO funcionan en 393px width (era el problema del mockup v2).

### 5.6 Patrones detectados (NUEVO en este formato)
Lista vertical 1-column en mobile, 2x2 grid en desktop.

**Cada tile:**
- Categoría uppercase + estado: "Mental · activo" / "Cancha · activo" / "Mental · latente" / "Técnico · latente"
- Nombre del patrón en Cormorant Garamond 16pt
- Score derivado: `Math.round((SEVERITY_WEIGHT[p.severity] * p.confidence) / 2.85 * 100)`. Normaliza a 0-100 sobre el score máximo del decision engine (critical 3 × confidence 0.95 = 2.85). Color rojo si activo, gris si latente.
- Sparkline 7 puntos (de `coach_events` filtrados por `pattern_detected` últimas 4 semanas)
- Footer: data points ("3 / 4 rondas · 7D") + arrow CTA

**Patrones latentes (opacity 0.55):** los que detectó el motor con confidence < 0.5 — el usuario sabe que están en monitoreo. Hoy esa data se ignora.

### 5.7 Plan activo (REDISEÑADO)
Card con border-left verde forest.

**Contenido:**
- Plan title (Cormorant Garamond) + descripción 1 línea + píldora "en curso/superseded/resolved"
- 7 dots horizontales (L M M J V S D) — días con compliance > none en `plan_outcomes`. Dot lleno = plan aplicado, dot dashed = no aplicado.
  - **NO contador de racha**. La regla anti-streak es deliberada (Calm 2026 lección, regla `[Target usuario premium]` — cero ornament infantil).
- Caja de correlación abajo: insight cuantificado derivado de `plan_outcomes` y `coach_events`. Ej: "Aplicas el plan post-doble-bogey en el 60%. El otro 40% son las espirales que te cuestan los 8 strokes."

**Cuando NO hay plan activo:** sección entera se omite y la sticky CTA cambia a "Iniciar plan con tAIger+".

### 5.8 Sesiones anteriores (CONSERVADO)
Mantener la sección actual de listado de sesiones (excluyendo `is_primary`). Renderear igual que hoy con styling actualizado para consistencia visual con el nuevo lenguaje.

### 5.9 CTA Conversar · sticky bottom (NUEVO)
- `position: sticky; bottom: 0`
- Full-width pill button, fondo `var(--text)`, color `var(--bg)`
- Texto: "Conversar con tAIger+" (o "Iniciar conversación" si no hay sesión primaria)
- Gradient fade arriba del botón (10-20px) para evitar corte abrupto
- Tap → mismo destino que el CTA actual: `/coach/sesion/${primarySessionId ?? 'nueva'}`
- Linkea a la lane del chat (otro agente) — verificar contract de URL antes de shippear.

---

## 6. Cálculos y algoritmos

### 6.1 Mental Index 0-100 (NUEVO)

**Vive en:** `src/golf/coach/mental-index.ts` (módulo nuevo, ~150 líneas).

**Inputs (signature):**

```typescript
interface MentalIndexInput {
  activePatterns: Array<{ pattern_type: string; confidence: number }>  // de player_patterns status=active
  activePlan: { id: string } | null                                    // de coach_plans status=active
  outcomes: Array<{ target_reached: boolean; compliance: string }>     // últimas 4 semanas
  cpi: ResultadoCPI | null                                              // de calcularCPI(rondas) o profiles.cpi_score
  totalRounds: number                                                   // count total de historical_rounds
  previousScore: number | null                                          // para calcular delta vs semana anterior
}
```

**Fórmula:**

```typescript
function calcularMentalIndex(input: MentalIndexInput): MentalIndexResult {
  // Base
  let score = 100

  // Penalización por patrones psicológicos activos
  // Solo cuentan los 3 patrones que son inherentemente mentales:
  const MENTAL_PATTERNS = {
    post_bogey_spiral:       25,  // critical
    pressure_deterioration:  15,  // warning
    first_hole_anxiety:      10,  // warning
  }
  for (const p of input.activePatterns) {
    const penalty = MENTAL_PATTERNS[p.pattern_type]
    if (penalty) score -= penalty * p.confidence
  }

  // Bonus por adherencia del plan activo
  if (input.activePlan && input.outcomes.length > 0) {
    const targetReachedRatio = input.outcomes.filter(o => o.target_reached).length / input.outcomes.length
    const complianceFullRatio = input.outcomes.filter(o => o.compliance === 'full').length / input.outcomes.length
    score += 10 * targetReachedRatio
    score += 5 * complianceFullRatio
  }

  // Bonus por consistencia (de CPI breakdown)
  if (input.cpi && input.cpi.status !== 'insufficient_data') {
    const consistenciaNorm = input.cpi.breakdown.consistencia / 25 // 0..1
    score += 5 * consistenciaNorm
  }

  // Cap
  score = Math.max(0, Math.min(100, score))

  return {
    score: Math.round(score),
    band: score >= 67 ? 'high' : score >= 34 ? 'mid' : 'low',
    status: input.totalRounds < 3 ? 'insufficient_data'
          : input.totalRounds < 10 ? 'provisional'
          : 'established',
    breakdown: { /* explicabilidad para tooltip */ },
  }
}
```

**Bandas:**
- 67-100 high → verde forest → "Tu cabeza está equilibrada"
- 34-66 mid → ámbar → "Tu cabeza está bajo presión"
- 0-33 low → rojo apagado → "Tu cabeza necesita reset"

**Estados:** insufficient_data oculta la card. Provisional muestra con badge "provisional". Established muestra normal.

**Tests requeridos:** `mental-index.test.ts` con casos:
- 0 patrones activos + plan al 100% + CPI elite → score >= 95
- 3 espirales detectadas confidence 0.9 → score baja al menos 22 puntos
- Sin plan activo → no aplica bonus de adherencia
- < 3 rondas → status insufficient_data

### 6.2 Costo psicológico (strokes evitables)

**Cálculo:** suma de strokes-over-par en hoyos que son "siguiente hoyo post-bogey" en `post_bogey_spiral` detectado, sobre últimas 4 semanas.

Pseudocódigo:

```typescript
function strokesEvitables(rounds: Round[]): { total: number; instances: Array<{round_id, holes}> } {
  let total = 0
  const instances = []
  for (const r of rounds) {
    const holes = []
    for (let i = 0; i < r.scores.length - 1; i++) {
      const par_i = parForHole(r, i)
      const par_next = parForHole(r, i + 1)
      const isPostBogey = r.scores[i] >= par_i + 1
      const isFollowedByBogey = r.scores[i + 1] >= par_next + 1
      if (isPostBogey && isFollowedByBogey) {
        // Asumimos que "contenido" hubiera sido bogey simple
        const actualOver = r.scores[i + 1] - par_next
        const containedOver = 1  // bogey simple
        const evitable = Math.max(0, actualOver - containedOver)
        if (evitable > 0) {
          total += evitable
          holes.push(`H${i + 1}→H${i + 2}`)
        }
      }
    }
    if (holes.length) instances.push({ round_id: r.id, holes })
  }
  return { total, instances }
}
```

**Honestidad sobre la simplificación:** la fórmula asume "contenido = bogey simple". No es perfecta. Se comunica explícitamente al usuario en hover/tooltip: *"Cálculo asume que tu mejor outcome post-error es bogey simple. Es aproximación."* Esto cumple regla `[Crítica > complacencia]` — no vendemos "magia AI" que no es.

### 6.3 Etiquetado mental per-hoyo (curva)

Reglas determinísticas (sin LLM):

```typescript
type MentalState = 'calm' | 'tense' | 'tilt'

function clasificarHoyo(r: Round, i: number): MentalState {
  const par = parForHole(r, i)
  const score = r.scores[i]
  const prevScore = i > 0 ? r.scores[i - 1] : null
  const prevPar = i > 0 ? parForHole(r, i - 1) : null

  const overPar = score - par
  const prevOverPar = prevScore != null && prevPar != null ? prevScore - prevPar : 0

  // Tilt: doble bogey o peor, o cualquier resultado tras un bogey anterior
  if (overPar >= 2) return 'tilt'
  if (overPar >= 1 && prevOverPar >= 1) return 'tilt'

  // Tensión: bogey aislado, o par 3 con dificultad
  if (overPar === 1) return 'tense'
  if (par === 3 && overPar >= 0 && score - par >= 1) return 'tense'

  // Calma: par o mejor sin antecedente caótico
  return 'calm'
}
```

**Tests requeridos:** `clasificarHoyo.test.ts` con la ronda del 03-may de la screenshot real para validar contra interpretación humana.

---

## 7. Componentes a crear

Lista de componentes nuevos, con responsabilidad única y testeable independientemente:

```
src/components/coach/
├── MentalRecoveryCard.tsx       # §5.2  · NUEVO
├── HighlightsCarousel.tsx       # §5.3  · NUEVO (wrapper)
├── HighlightCard.tsx            # §5.3  · NUEVO (item)
├── CostoPsicologicoCard.tsx     # §5.4  · NUEVO
├── CurvaMentalCard.tsx          # §5.5  · NUEVO
├── PatternTile.tsx              # §5.6  · NUEVO
├── PlanActiveCard.tsx           # §5.7  · NUEVO (NO confundir con PlanAssignedCard del chat)
├── ConversarStickyCTA.tsx       # §5.9  · NUEVO
└── (existentes, no tocar)
    ├── TaigerHero.tsx
    ├── CitedMarkdown.tsx         # chat lane
    ├── PlanAssignedCard.tsx      # chat lane
    └── RoundMiniChart.tsx        # chat lane
```

Cada componente recibe props minimales (no hace fetching propio — todo viene del page-level `useEffect` o de React Server Components si se decide migrar a RSC). Diseño deliberado para isolation y test (regla del brainstorming skill).

---

## 8. Estados de la pantalla

| Estado | Trigger | Comportamiento |
|---|---|---|
| **loading** | useEffect inicial | TaigerIcon pulse (igual que hoy) |
| **new-user** | `totalRounds === 0` | Card "registra tu primera ronda" actual (conservar) + ocultar todas las secciones psicológicas |
| **provisional** | `totalRounds 1-2` | Mental Index oculto · Highlights solo si hay coach_events · resto degradado a "sin data suficiente" |
| **provisional+** | `totalRounds 3-9` | Mental Index con badge "provisional" · Highlights · Costo psicológico oculto si <8 rondas · resto activo |
| **established** | `totalRounds ≥ 10` | Todo activo |
| **no-plan-active** | `coach_plans` sin status='active' | Sección 5.7 omitida · sticky CTA = "Iniciar plan con tAIger+" |
| **no-spiral-active** | `player_patterns` no contiene `post_bogey_spiral` con status='active' | §5.4 reemplazado por card "Tu juego más estable" con CPI + trend del breakdown, mismo styling pero borde verde |
| **error** | fetch falla | Error card con retry, NO crashear toda la página |

---

## 9. Performance budget

- **Fonts ya cargadas** (Cormorant Garamond, DM Mono, DM Sans). No agregar nuevas. ~0KB incremental.
- **CSS:** ~8-12KB nuevos (tokens semánticos + estilos de cards). Variable.
- **JS:** ~15-20KB nuevos (componentes + cálculo Mental Index). Razonable.
- **Network:** la página ya hace 5 queries Supabase. Agregar 2-3 más:
  - `coach_events` filtrado por user_id, tipo `plan_outcome` y `pattern_detected`, últimas 4 semanas (max ~30 rows)
  - `plan_outcomes` últimas 8 rondas del plan activo
  - Cálculo Mental Index: local, no llamada nueva
- **FCP target:** <1.5s en 4G mobile.
- **CLS target:** <0.1 (cards con altura conocida, no jumping).

---

## 10. Riesgos identificados

(Heredados del informe de revisión interno de la sesión.)

1. **Mental Index es una métrica nueva sin validar contra usuarios reales.** Mitigación: shadow mode primera semana — calculamos y loggeamos pero NO mostramos. Comparamos contra intuición de Juanjo en su data. Si parece razonable, mostramos.
2. **Costo psicológico simplifica "yo contenido = bogey simple".** Mitigación: comunicación honesta en tooltip + flag "aproximación" en footer.
3. **Curva mental per-hoyo etiqueta con reglas heurísticas.** Mitigación: tests contra rondas reales conocidas + iteración con feedback.
4. **Coordinación con agente del chat para URL de sesión.** Mitigación: revisar contract de `/coach/sesion/[id]` y `nueva` antes de mergear.
5. **3 fonts ya existentes pero el sitio podría estar fragmentado.** Verificar al implementar que Cormorant Garamond y DM Mono no caen en fallback en mobile real.
6. **Sticky CTA puede tapar contenido en última sección.** Mitigación: `padding-bottom: 100px` en container.
7. **WCAG: brass sobre cream con text 10px.** Auditar contraste al implementar. Plan B: subir font-weight o agregar background tint.
8. **Dark mode no diseñado en este spec.** Decisión: dark mode = misma estructura, paleta inversa, pero spec aparte. NO bloquea esta PR.
9. **Carousel discoverability mediocre.** Mitigación: pagination dots visibles + peek de 2da card siempre + scroll-snap.
10. **Si `coach_events` no tiene la data esperada en producción**, Highlights pueden quedar vacíos. Mitigación: graceful degradation por card (cada una se decide independientemente).

---

## 11. Open questions

1. **¿Mental Index queda como métrica visible o solo backend al inicio?** Recomendación CTO: shadow primera semana, visible después de validación.
2. **¿Mostrar CPI junto a Mental Index?** Hoy CPI está en el KPI grid. Decisión: SÍ mantener CPI en KPI compacto + Mental Index como hero separado. Son métricas complementarias (técnica vs psicológica).
3. **¿Avatares de mood (`taiger-domingo`, `taiger-zen`, `tager-swing`, etc.) entran en algún lado?** Recomendación: en el badge del avatar T+ del header. Estado low → tiger-otros (cabizbajo), mid → tiger-standar, high → taiger-zen. Implementación opcional para v1.1.
4. **¿La sticky CTA es "Conversar" o "Lo que sigue" (más accionable)?** Recomendación: "Conversar" v1, A/B testing después.
5. **¿"Highlights" se llama así o se traduce?** Recomendación: "Destacados de la semana" — más natural en chileno.

---

## 12. Plan de implementación (resumen para writing-plans)

Fases en orden:

1. **Tokens y palette extension** (~30 min) — agregar tokens semánticos a `globals.css` con dark variant.
2. **Algoritmo Mental Index** (~2h) — `mental-index.ts` + tests con casos canónicos.
3. **Cálculo de strokes evitables y clasificación per-hoyo** (~1.5h) — funciones helper en `mental-index.ts` o módulo aparte + tests.
4. **Componentes UI** (~6-8h) — 8 componentes nuevos según §7, mobile-first, con stories de prueba.
5. **Re-write de `page.tsx`** (~2h) — orquestación, queries Supabase, estados (§8), gates.
6. **Integration tests** (~2h) — page con mocks de Supabase, snapshots de estados.
7. **A11y audit** (~1h) — contrastes, ARIA, tap targets.
8. **Verificación E2E manual** mobile real (~30 min) — iPhone físico si posible, Chrome devtools mobile mode si no.

Estimación total: ~16-18 horas de implementación + revisión.

---

## 13. Criterios de aceptación

- [ ] Mockup v3 mobile-first se traduce 1:1 a componentes React renderizando contra data real.
- [ ] Mental Index calcula correctamente en los 4 casos canónicos del test.
- [ ] Costo psicológico muestra cálculo correcto contra rondas reales de Juanjo (validar con su data en preview deploy antes de merge).
- [ ] Curva mental etiqueta correctamente la ronda del 03-may Los Leones (data conocida).
- [ ] Estados loading/empty/new-user/no-plan no crashean ni muestran "undefined".
- [ ] Sticky CTA funciona en iPhone 14 Pro real y Chrome devtools mobile.
- [ ] Contraste WCAG AA en todos los textos.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run test` clean.
- [ ] `npm run build` clean.
- [ ] Pre-push hook passing.

---

## 14. Out-of-scope explícito para esta PR

- Cualquier cambio en `/coach/sesion/[id]` o `/coach/sesion/nueva/chat` (lane del otro agente).
- Notificaciones push del coach.
- Onboarding del coach (`/coach/onboarding` — separado).
- Refactor del chat o del prompt del LLM.
- Cambios en `decision-engine.ts`, `plan-engine.ts`, `patterns.ts`.
- Migraciones SQL nuevas.
- Avatares de mood en avatar T+ (queda para v1.1).
- Dark mode (queda para spec aparte).

---

## 15. Next step

→ Invocar `superpowers:writing-plans` para convertir este spec en plan ejecutable por fases.
