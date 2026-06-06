# Plan — Port del HOME de marketing a la app real

**Fecha:** 2026-06-03
**Branch:** `feat/home-marketing-claude`
**Prototipo aprobado:** `~/.gstack/projects/juanjoselamarca-tu-golf/designs/home-mensaje-20260602/hero-wow2.html`
**Spec/dirección:** memoria `project_home_mensaje_marketing` + spec paywall `2026-05-29-paywall-premium-design.md`

## Objetivo
Bajar el prototipo HTML aprobado (hero cinematográfico + mini-juego + coach 3 pasos +
leaderboard en vivo + features 2×2 con visuales + planes teaser sin precios + CTA) a la
app Next.js/React real, cumpliendo CERO FALLOS. Mensaje madre: **"Se gana con la mente,
no con los fierros."**

## Decisiones de arquitectura (CTO)
1. **Fonts scoped al landing.** Clash Display (display) + Satoshi (body) vía Fontshare,
   cargadas en un route group `(marketing)` o en la propia página — NO se toca el
   `src/app/layout.tsx` global (archivo PROTEGIDO, fuentes globales del resto de la app).
   DM Mono ya existe. Reversible y aislado.
2. **Landing = navy fijo** (`#070d18`). No theme-aware (coherente con regla modo-color:
   cada ruta puede fijar su modo). El resto de la app sigue con su toggle.
3. **Mini-juego "Pega tu tiro" → fase final.** Es client component con SVG + JS; es lo más
   riesgoso. Primero el redesign estático completo y verificado, después el juego.
4. **ISR + stats reales** se mantienen: la proofbar ("137 canchas") se alimenta de
   `getLandingStats()` ya existente, no de números hardcodeados.
5. **Copy en `src/content/home.ts`** con test anti-voseo en CI (regla dura: español
   neutro, voseo PROHIBIDO). Honestidad de marca: sin Strokes Gained ni dispersión de
   tiros (el motor no los calcula), import = guiada, 137 canchas = real.

## Estado (6-jun-2026)
Fases 1-4 cerradas y en la rama `feat/home-marketing-claude` (`0ba8d1c`). El landing
`/home-v2` (preview, noindex) renderiza completo y verificado: tsc 0, anti-voseo, build,
2201 tests, smoke visual desktop+mobile con `browse`. **Hallazgo + fix:** el CSP global
bloqueaba Fontshare → se agregó `api.fontshare.com` (style-src) + `cdn.fontshare.com`
(font-src) en `next.config.js` (commit `0ba8d1c`). Próximo: **Fase 5 (mini-juego)**.

## Fases
- [x] **Fase 1 — Contenido + infra** (`fb77d51`)
  - `src/content/home.ts`: todo el copy estructurado y tipado.
  - `src/content/home.test.ts`: test anti-voseo (bloquea formas vos).
  - Verificar test verde.
- [x] **Fase 2 — Fonts + tokens del landing**
  - Cargar Clash Display + Satoshi scoped. Tokens CSS (navy + doble dorado) en módulo/scope.
- [x] **Fase 3 — Componentes estáticos** (consumen `home.ts`)
  - `HeroMarketing`, `CoachSteps`, `CompeteLeaderboard`, `FeaturesGrid`, `PlansTeaser`,
    `FinalCta`. Cada uno con su mini-visual (índice dual, scorecard leída, course rows,
    sparkline). Reveal con IntersectionObserver.
- [x] **Fase 4 — Wiring en `page.tsx`**
  - Reemplazar secciones viejas, mantener ISR + stats reales en proofbar.
- [ ] **Fase 5 — Mini-juego interactivo** (client component)
  - "Pega tu tiro": barra de potencia, 3 tiros, tracer SVG, gancho al coach.
- [ ] **Fase 6 — QA + ship**
  - `design-review` (before/after), `/pre-push` (tsc+tests+build+health), code-reviewer
    pre-merge (diff >100 LOC), deploy + smoke post-deploy.

## Reglas duras (no romper)
- Español latino neutro, **voseo PROHIBIDO** (test lo bloquea).
- NO Strokes Gained numérico ni dispersión de tiros. Import = guiada. 137 canchas = real.
- No tocar `src/app/layout.tsx`, `Navbar.tsx`, `middleware.ts`, `supabase.ts` (protegidos).
- Números ilustrativos del prototipo quedan como ilustrativos (no inventar stats falsos).
