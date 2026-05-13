# PLAN_DISENO_THEGRINT.md

**Estado:** Borrador v1 — pausado para retomar en nueva sesión
**Última actualización:** 2026-05-12
**Owner:** Juanjo (PM) + Claude (CTO)
**Origen:** Análisis competitivo TheGrint + plan de sistema de diseño + self-review

---

## Cómo retomar esta sesión

Próxima sesión, antes de seguir afinando el plan, ejecutar el **sweep de verificación M1+M2+M3** descrito en la sección 4 (Self-review). Esto resuelve los riesgos P0 antes de tocar el plan en sí.

**Orden recomendado para próxima sesión:**

1. Sweep de verificación (1 hora):
   - Leer `src/app/page.tsx` completo
   - Leer `tailwind.config.ts` + `src/styles/` para conocer paleta y tipografía actuales
   - Leer `package.json` para auditar deps (¿framer-motion? ¿radix?)
   - Confirmar contra Supabase: cantidad real de canchas/hoyos/usuarios beta/clubes activos
   - Resolver bloqueo de `browse.exe` en Windows App Control para captura visual real
2. Reescribir secciones del plan que dependían de info no verificada (sección 2 abajo).
3. Recién entonces afinar las decisiones de taste D1-D8 con Juanjo.

**NO empezar a implementar nada hasta:**
- Sweep de verificación completo
- Decisiones D1-D8 resueltas con Juanjo
- Gate de directiva CERO FALLOS resuelto (ver tensión D1 en self-review)

---

## Índice

1. [Informe competitivo TheGrint vs Golfers+](#1-informe-competitivo)
2. [Plan de sistema de diseño](#2-plan-de-sistema-de-dise%C3%B1o)
3. [Self-review del trabajo de la sesión](#3-self-review)
4. [Action items para próxima sesión](#4-action-items)

---

## 1. Informe competitivo

### 1.1 Resumen ejecutivo

TheGrint es producto maduro y funcional con marketing competente pero estética genérica de SaaS. Le ganan a Golfers+ en palancas de conversión (mockups, números, tabla pricing, comunidad), pero su techo visual está fijado por Webflow y stack legacy (Bootstrap 4 + jQuery). Golfers+ tiene ventaja real en stack moderno (Next.js + Tailwind), foco LatAm, IA (tAIger+) y concepto de Índice Dual, pero no está cosechando esa ventaja en marketing ni construyendo moat de comunidad/SEO.

**Top 3 apuestas con mayor ROI (post deuda técnica):**
1. **Honeypot SEO de canchas FedeGolf** — convertir nuestros 137 cursos + 2034 hoyos en URLs públicas indexables. Esfuerzo 3 días.
2. **Liga Golfers+ Chile (clon de TheGrint Tour)** — competencias mensuales/trimestrales entre clubes. Es el moat de retención más alto. Esfuerzo 2 semanas + 1 club piloto.
3. **Rediseño hero con screenshots reales + framer-motion** — reemplazar carousel Unsplash por mockups reales. Esfuerzo 1-2 días.

### 1.2 Páginas analizadas

| Página | TheGrint | Golfers+ | Gap |
|---|---|---|---|
| Home / Landing | Webflow, video hero, pricing table, 5 features alternados, FAQ, Instagram embed, Tour CTA, About | Carousel Unsplash, 3 herramientas, Labs card, "0+" placeholders | Alto |
| Blog / Editorial | 9 categorías, 30+ posts, data-driven articles | No existe | Crítico |
| Handicap Lookup | Página pública con búsqueda y calc Course Hdcp | No existe | Alto |
| Tour / Liga | Sub-marca con dominio propio, 18+ ciudades, 200+ eventos/año | No existe | Crítico (moat) |
| FAQ / Support | 15-17 topics dropdown, autoresuelve | No verificable | Medio |
| About / Origen | Light, nostálgico, sin fundadores específicos | No existe | Bajo |

### 1.3 Hallazgos clave por área

**HOME / Landing — qué copiar:**
- Background video MP4/WebM con poster fallback
- Patrón eyebrow → title → body (eyebrow uppercase pequeño + H2 grande + body)
- Alternancia izq/der entre features con slide-in al scroll
- Mobile collapsa a Swiper auto-rotate cada 4-5s
- Pricing table con tooltips contextuales en cada fila técnica
- Color semántico: verde check / amarillo "Unlimited" Pro / rojo "None"
- Outro "AND MORE!" con 22 features en 2 columnas
- QR code prominente en desktop hero
- Section "About TheGrint" con foto del fundador y storytelling

**HOME / Landing — qué NO copiar:**
- "Screenshots" son collages photoshopeados con UI flotante recortada, no capturas reales
- 4 familias tipográficas (excesivo): Varela Round, Open Sans, Inter, Rubik
- Stack pesado: ~600KB JS solo en libs

**BLOG / Range — TheGrint tiene:**
- 9 categorías: Courses, Data, Equipment, Features, Games, Handicap, Our Story, Scoring, Stories, Swingman
- Análisis de datos genuino: *"Is there home field advantage in golf?"*, *"Does a blowup hole derail a round?"*
- Series educativas: *"TheGrint Stats Explained"* (Putting, Driving Accuracy, GIR)
- Cards con autor + foto + fecha + thumbnail

**HANDICAP LOOKUP TOOL — qué hace TheGrint:**
- Búsqueda pública por nombre/email/GHIN
- Muestra: handicap actual + low handicap, Course Handicap por cancha y tee, Attest % (rojo/amarillo/verde), link al scoring record
- **Por qué importa:** honeypot SEO + utilidad real para organizadores de torneos + demuestra credibilidad

**TOUR / LIGA — datos:**
- Sub-dominio propio thegrinttour.com
- 18+ ciudades USA con tours locales
- 200+ eventos/año
- 10,000 rondas/año
- 4 nacionales
- The Race (ranking anual con premios), Welcome kit, Live leaderboards
- Testimonios con nombre + fecha
- ⚠️ Estos números vinieron de WebFetch summarization — VERIFICAR antes de usar para decisiones

**Comparativa directa por feature:**

| Feature | TheGrint | Golfers+ | Acción |
|---|---|---|---|
| Hero con video/movimiento | ✅ Video MP4 + Lottie | ❌ Carousel Unsplash | Reemplazar |
| Mockups del producto | ⚠️ Collages photoshop | ❌ No hay | Construir capturas reales |
| Tabla pricing Free/Pro | ✅ Con tooltips | ❌ No hay | Pendiente Pro |
| Origin story | ⚠️ Light | ❌ No hay | Construir |
| FAQ | ✅ 15+ topics | ❌ No hay | Construir |
| Blog editorial | ✅ 9 categorías | ❌ No hay | Apuesta a 6 meses |
| Handicap lookup público | ✅ Funcional | ❌ No hay | Construir con FedeGolf data |
| Liga / Tour | ✅ 18 ciudades | ❌ No hay | Apuesta estratégica |
| AI/Coach | ❌ No tienen | ✅ tAIger+ | **Ventaja Golfers+** |
| Índice dual | ❌ No tienen | ✅ Dual oficial+real | **Ventaja Golfers+** |
| Spanish/LatAm focus | ❌ Inglés US | ✅ Español Chile | **Ventaja Golfers+** |
| Stack moderno | ❌ Bootstrap 4 + jQuery | ✅ Next.js + Tailwind | **Ventaja Golfers+** |

---

## 2. Plan de sistema de diseño

**Alcance:** Solo sistema de diseño (tokens + componentes + motion). NO incluye page-by-page.

### 2.1 Catálogo priorizado de patrones extraídos

| ID | Patrón | Evidencia TheGrint | Categoría | Prioridad |
|---|---|---|---|---|
| P01 | Eyebrow → Title → Body | "SCORE TRACKING AND STATS" → "Learn from your data..." → párrafo | Tipografía | ALTA |
| P02 | Color semántico tri-state en tablas | Verde check / Amarillo "Unlimited" / Rojo "None" | Color | ALTA |
| P03 | Tooltip contextual con info icon | `tooltip-content---brix` en cada fila técnica | Componente | ALTA |
| P04 | Background video con poster fallback | hero MP4 + WebM + JPG | Motion | ALTA |
| P05 | Slide-in animations al scroll | escalonadas izq/der | Motion | ALTA |
| P06 | Alternancia izq/der en feature rows | grid-2 alternados | Layout | ALTA |
| P07 | Auto-rotate carousel mobile (4s) | Swiper autoplay | Componente | MEDIA |
| P08 | "AND MORE!" feature grid | 2 columnas | Componente | ALTA |
| P09 | 3D shield/badge icons | shield_3d.png para Pro | Iconografía | MEDIA |
| P10 | Lottie animation sobre wordmark | write-on effect en hero | Motion | BAJA |
| P11 | QR code en hero desktop | descarga directa | Componente | BAJA |
| P12 | Pricing tabs Free vs Pro | toggle + tabla | Componente | MEDIA |
| P13 | FAQ accordion 2-columnas desktop | grid md+ | Componente | ALTA |
| P14 | Origin story con foto del fundador | sección dedicada | CX | ALTA |
| P15 | Testimonios con nombre + fecha | "Gustavo Gamboa, 20 jul 2021" | CX | MEDIA |
| P16 | Stats triada en hero | "18+/200+/10,000" | CX | ALTA |
| P17 | Section eyebrow uppercase pequeño | letter-spacing wide | Tipografía | ALTA |
| P18 | Cards con autor + foto + fecha (blog) | Range posts | Componente | BAJA |
| P19 | Outro CTA "Where golf happens" | sección final | Layout | MEDIA |
| P20 | Tooltip arrow positioning | tooltip-arrow.svg | Detalle UI | MEDIA |

Decisión: entrar al detalle de los 12 marcados ALTA. MEDIA queda en backlog. BAJA solo si Fase 3 lo requiere.

### 2.2 Sistema de diseño derivado

#### 2.2.1 Tokens (PENDIENTE de verificar contra repo actual)

**Color semántico (capa nueva, no renombrar lo existente):**

```
--status-included:  green-500     // ✓ feature incluido
--status-pro:       yellow-400    // ★ feature Pro (verificar AA contrast)
--status-excluded:  red-500       // ✗ no disponible
--status-trial:     blue-400      // ⏱ acceso limitado

--accent-eyebrow:   primary brand color con 80% saturation
--accent-cta:       primary brand color
--accent-hover:     primary darker 10%
```

**Tipografía propuesta (2 familias máx):**

```
--font-display:  candidatos: Söhne, General Sans, Outfit, Plus Jakarta Sans
--font-body:     candidatos: Inter, Geist

Pesos:
  display: 500, 700, 800
  body:    400, 500, 600
```

**Jerarquía:**

| Token | Tamaño | Peso | Uso |
|---|---|---|---|
| text-eyebrow | 12-14px | 600 uppercase letter-spacing | "MIEMBRO PRO" |
| text-h1-hero | 56-72px | 700 display | Hero |
| text-h2-section | 36-48px | 700 display | Títulos sección |
| text-h3-card | 24-28px | 600 | Cards |
| text-body-big | 18-20px | 400 | Párrafo destacado |
| text-body | 16px | 400 | Body |
| text-caption | 14px | 500 | Metadata |

**Spacing escala 8pt:**

```
--space-1: 4px  / --space-2: 8px  / --space-3: 12px
--space-4: 16px / --space-6: 24px / --space-8: 32px
--space-12: 48px / --space-16: 64px
--space-24: 96px / --space-32: 128px
```

**Container widths:**

```
--container-narrow:  640px  (texto largo, blog post)
--container-base:    1024px (default)
--container-wide:    1280px (hero, marketing)
```

**Motion:**

```
--motion-slide-in:  300ms cubic-bezier(0.22, 1, 0.36, 1)
                    transform: translateX(40px) → 0, opacity 0 → 1
                    trigger: IntersectionObserver

--motion-fade-up:   400ms ease-out
                    transform: translateY(20px) → 0, opacity 0 → 1

--motion-tooltip:   150ms ease-out
                    opacity + scale 0.95 → 1
```

Stack: framer-motion (verificar si está instalado) + Radix Tooltip (verificar).
NO Lottie (200KB+), NO GSAP.

#### 2.2.2 Componentes a construir (mockups ASCII)

**C01 — `<Eyebrow>`**

```
[ CANCHAS FEDEGOLF ]    ← uppercase, 13px, letter-spacing 0.08em
                          color: --accent-eyebrow
```

**C02 — `<FeatureRow>` (alternancia izq/der)**

```
Variant left-image:
┌─────────────────────────────────────────────────┐
│  ┌──────────────┐    INTELIGENCIA               │
│  │  [imagen]    │    tAIger+ aprende            │
│  │              │    de cada round.             │
│  └──────────────┘    [ Ver demo → ]             │
└─────────────────────────────────────────────────┘

Variant right-image (siguiente fila intercala):
┌─────────────────────────────────────────────────┐
│  ÍNDICE DUAL              ┌──────────────┐     │
│  Tu índice oficial        │  [imagen]    │     │
│  + tu índice real.        └──────────────┘     │
│  [ Cómo se calcula → ]                         │
└─────────────────────────────────────────────────┘
```

Props: `eyebrow`, `title`, `body`, `cta?`, `image`, `imageSide: 'left' | 'right'`.

**C03 — `<StatTriad>`**

```
┌─────────────────────────────────────────────────┐
│    137          2,034          5                │
│    canchas      hoyos         clubes activos    │
│    FedeGolf     mapeados      en beta           │
└─────────────────────────────────────────────────┘
```

Números honestos siempre. Nunca "0+". ⚠️ Verificar conteos reales contra Supabase.

**C04 — `<PricingTable>`**

```
┌─────────────────────────────────────────────────────────────┐
│                       Free          Pro                     │
│ Scoring en vivo       ✓             ✓                       │
│ Coach IA tAIger+ ⓘ    Sin acceso   Ilimitado    ← yellow   │
│ Liga Golfers+ ⓘ        —           Acceso       ← yellow   │
└─────────────────────────────────────────────────────────────┘
```

⚠️ Pro tier pausado per `project_paywall_brainstorm`. Componente NO construir hasta Pro definido.

**C05 — `<TooltipInfo>`**

Usa Radix UI Tooltip. Props: `children`, `content`, `side`.

**C06 — `<FAQAccordion>`**

Desktop 2 columnas, mobile stack. Props: `faqs: [{q,a}]`, `columns: 1|2`.

**C07 — `<AndMoreGrid>`**

```
┌─────────────────────────────────────────────────────────┐
│   Y MUCHO MÁS                                           │
│   ▪ Índice oficial         ▪ Score Picture              │
│   ▪ Índice Dual            ▪ Importar scores            │
│   ▪ tAIger+ Coach IA       ▪ Insights por categoría     │
│   ...                                                    │
│                                            ¡Y MÁS!      │
└─────────────────────────────────────────────────────────┘
```

⚠️ Solo listar features reales hoy. NO promesas futuras.

**C08 — `<OriginStory>`**

```
┌─────────────────────────────────────────────────────────┐
│  ┌──────────────┐     SOBRE GOLFERS+                    │
│  │   [foto      │     Empezó cuando...                  │
│  │    Juanjo?]  │                                       │
│  └──────────────┘     Hoy somos N golfistas chilenos    │
└─────────────────────────────────────────────────────────┘
```

⚠️ Foto pendiente decisión D4 con Juanjo.

**C09 — `<TestimonialCard>` · C10 — `<HeroBackground>` · C11 — `<FeatureCarouselMobile>`**

Detalle en sección 2 del plan original (ver chat de sesión 2026-05-08).

### 2.3 Anti-patrones (NO copiar)

| Anti-patrón TheGrint | Por qué NO | Qué hacemos |
|---|---|---|
| 4 familias tipográficas | Carga pesada + inconsistencia | 2 familias máx |
| Bootstrap + jQuery + Alpine + Webflow JS | ~600KB libs | Tailwind + framer-motion + Radix |
| Collages photoshop como screenshots | Se nota fake | Capturas reales en device mockups |
| Lottie en hero | 200KB+ por animación | CSS gradient + framer-motion |
| Auto-rotate tabs cada 5s | Intrusivo | Solo mobile carousel con pausa al touch |
| Inline styles regados | Deuda visible | Tokens + Tailwind |
| 3 modales de login encadenados | Frágil UX | 1 página `/login` |
| Tooltip con SVG arrows manual | Frágil | Radix Tooltip |

### 2.4 Plan ejecutable en fases

**Reglas:**
- Cada fase tiene salida testeable
- No empezar N+1 hasta que N tenga design review aprobado
- Implementación CHOCA con directiva CERO FALLOS — solo es el ORDEN cuando se libere

**Fase 0 — Fundamentos del sistema:** tokens + tipografía + Storybook o `/_design` showcase
**Fase 1 — Átomos:** C01 Eyebrow, C05 TooltipInfo, sistema tipográfico, C09 TestimonialCard, C03 StatTriad
**Fase 2 — Moléculas:** C02 FeatureRow, C11 CarouselMobile, C07 AndMoreGrid, C08 OriginStory
**Fase 3 — Conversión/CX:** C04 PricingTable (bloqueado por Pro), C06 FAQAccordion, C10 HeroBackground
**Fase 4 — Refinamiento al aplicar:** densidad mobile, dark mode tokens, reduced motion, print styles

### 2.5 Decisiones de taste pendientes (input Juanjo)

| # | Decisión | Mi voto |
|---|---|---|
| D1 | Familia tipográfica display | Plus Jakarta Sans — ⚠️ sin verificar fuente actual del repo |
| D2 | Accent color principal | Pivotar a verde golf + sand cream — ⚠️ sin auditoría visual real |
| D3 | Hero: video / gradient / foto | Gradient animado + mockup iPhone real |
| D4 | Foto de Juanjo en OriginStory | Sí, humaniza con clubes — pendiente confirmación |
| D5 | Pricing visible o "Pro Q3" | Placeholder "Pro disponible en Q3 2026" |
| D6 | Liga visible en home antes piloto | No — esperar piloto cerrado |
| D7 | Tono general | Editorial premium con respaldo data-driven |
| D8 | "Construido en Chile" | Sutil pero presente en OriginStory |

---

## 3. Self-review

### 3.1 Resumen crudo

Trabajo de la sesión es **60% sólido, 40% aire.** El aire es predecible: planeé sobre memoria sin verificar, recomendé pivots sin auditoría, propuse componentes para features que no existen.

### 3.2 Riesgos P0 (críticos)

| ID | Riesgo |
|---|---|
| A1 | Nunca vi las páginas reales con mis ojos — `browse.exe` bloqueado por Windows App Control, todo vino de WebFetch summarization |
| A2 | No verifiqué información contra el repo — cité conteos, colores, features sin abrir archivos |
| A3 | No invoqué skill `brainstorming` al inicio del trabajo creativo |
| B1 | Números del Tour (18+ ciudades, 10k rondas) no verificados — pueden ser inflados o alucinados |
| C1 | Recomendé pivotar accent color sin haber visto la marca actual |
| C2 | Recomendé Plus Jakarta Sans sin ver tipografía actual del repo |
| C3 | Diseñé `<PricingTable>` completo cuando Pro está pausado per memoria |
| C4 | `<AndMoreGrid>` con 22 features expone que somos chicos — algunas son promesas no construidas |
| C5 | Dark mode tokens dejados como "Fase 4" cuando son regla activa del proyecto |
| D1 | Conflicto plan vs directiva CERO FALLOS no resuelto — falta gate explícito |

### 3.3 Riesgos P1 (importantes)

- A4: prompt injection en WebFetch flaggeado tardío
- A5: no registré decisiones en memoria durante el trabajo
- B2: "honeypot SEO" asume tráfico que no auditamos (búsquedas reales chilenas)
- C6: WCAG no mencionado — paleta nueva puede romper AA contrast
- C7: dependencias nuevas (framer-motion, radix) no verificadas en package.json
- C8: `<OriginStory>` asume Juanjo público sin preguntar
- C9: Storybook propuesto sin tomar posición (overhead vs valor)
- D2: plan no tiene rollback / gate de design review entre fases

### 3.4 Lo que SÍ está bien

- Catálogo de patrones P01-P20 — lista buena, prioridades razonables
- Anti-patrones (sección 2.3) — basada en código real que sí vi
- Patrón eyebrow → title → body — recomendación robusta
- Distinción clara plan vs implementación
- Estructura del plan en 6 secciones — arquitectura correcta

---

## 4. Action items

### Para próxima sesión (en orden estricto)

**Bloque 1 — Sweep de verificación (~1 hora):**

- [ ] M1: leer `src/app/page.tsx`, `tailwind.config.ts`, `src/styles/`, `package.json` completos
- [ ] M2: resolver bloqueo de `browse.exe` en Windows App Control (o alternativa Playwright Node)
- [ ] M3: capturar screenshots reales TheGrint + Golfers+ con headless
- [ ] Verificar conteos reales contra Supabase: canchas, hoyos, usuarios beta, clubes
- [ ] Verificar números del Tour de TheGrint contra thegrinttour.com real
- [ ] Auditar deps actuales: `framer-motion`, `@radix-ui/*`

**Bloque 2 — Reescritura de plan con base verificada (~30 min):**

- [ ] M4: mover dark mode tokens a Fase 0
- [ ] M5: sumar gate WCAG AA explícito a definición de tokens
- [ ] M6: si Pro sigue pausado → mover `<PricingTable>` a backlog
- [ ] M7: recortar `<AndMoreGrid>` a features reales hoy
- [ ] M8: ajustar plan según deps reales encontradas
- [ ] M11: agregar mockups mobile a los 8 componentes restantes
- [ ] M13: evaluar recortar 11 → 6 componentes core + utilities sueltas

**Bloque 3 — Decisiones con Juanjo:**

- [ ] M9: definir gate de implementación vs directiva CERO FALLOS
- [ ] M10: validar foto pública, color pivot, font pivot ANTES de afirmar
- [ ] Resolver D1-D8 una por una con AskUserQuestion

**Bloque 4 — Solo después de los 3 anteriores:**

- [ ] Refinar componente por componente (variantes, estados, mobile)
- [ ] Definir formato Storybook vs `/_design` page
- [ ] Establecer criterio "design system review aprobado" entre fases

### NO hacer en próxima sesión

- ❌ Implementar nada en código
- ❌ Pushear cambios visuales a producción
- ❌ Definir Pro pricing (es decisión de producto pausada, no de diseño)
- ❌ Empezar Liga Golfers+ (requiere conversación con clubes primero, no es diseño)

---

## 5. Referencias

- **Sesión origen:** 2026-05-08 a 2026-05-12
- **Páginas analizadas TheGrint:** thegrint.com (home), /range, /hdcp_lookup, /about_us, thegrinttour.com, /about_us/member_support
- **Páginas analizadas Golfers+:** golfersplus.vercel.app (home), /demo, /ranking, /coach, /login
- **Memoria relacionada:**
  - `project_fedegolf_integration` — 137 canchas + 2034 hoyos (verificar)
  - `project_paywall_brainstorm` — Pro pausado desde 21-abr
  - `feedback_modo_color_estandar` — tri-state Auto/Light/Dark obligatorio
  - `feedback_diseno_ui` — minimalista, moderno, premium, no AI slop
  - `feedback_usuario_premium` — golfistas exigentes chilenos
  - `feedback_verificar_antes_de_fixear` — verificar antes de planear/fixear
