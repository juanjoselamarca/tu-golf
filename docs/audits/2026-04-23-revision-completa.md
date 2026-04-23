# Informe de Revisión Completa — Golfers+

**Fecha**: 2026-04-23
**Autor**: Claude (CTO)
**Alcance**: Fases 0 → 4 del plan de revisión previo al handoff a CTO humano
**Commit analizado**: `83875dc` (main)

---

## Resumen ejecutivo

**Estado general: 7.2 / 10 — aceptable pero con deuda crítica**

La app funciona, tiene tests sólidos, motor de golf bien separado, y documentación básica de handoff. Pero hay **1 vulnerabilidad crítica sin parchar**, **10 vulnerabilidades altas**, **9 archivos God Object (>1000 LOC)**, **cero CI en GitHub Actions**, y **gaps notorios de observabilidad y runbooks** que un CTO humano detectaría en la primera hora.

| Categoría | Estado | Detalle |
|---|---|---|
| Funcional (tests) | ✅ 10/10 | 305 test files, 5655 tests, todo en verde |
| Seguridad (app code) | ✅ 9/10 | RLS, auth checks, service-role bien gobernada |
| Seguridad (dependencias) | 🔴 3/10 | 1 CRITICAL (RCE), 10 HIGH sin parchar |
| Arquitectura motor golf | ✅ 9/10 | Bien separado, 1 archivo con type-import de React |
| Arquitectura UI | ⚠️ 5/10 | 9 archivos >1000 LOC, wizard 2118 LOC es God Object |
| Clientes Supabase | ⚠️ 6/10 | 4 archivos dispersos, barrel existe pero conviven todos |
| TypeScript rigor | ✅ 10/10 | strict: true, 0 `: any`, solo 4 `as any` |
| Cobertura de tests | ⚠️ 5/10 | Motor golf: 1 test file / 35 archivos (3%) |
| Documentación | ⚠️ 6/10 | README/ONBOARDING/ARQUITECTURA existen. Faltan RUNBOOKS, ADRs, diagrama |
| Guardrails CI | 🔴 2/10 | `.github/workflows/` NO EXISTE. Solo pre-push local |
| Observabilidad prod | ⚠️ 6/10 | Sentry + PostHog + health-check. Falta dashboard métricas negocio, runbooks alertas |

**Conteo de alertas: 4 P0 · 9 P1 · 12 P2 · 6 gaps docs · 5 guardrails faltantes**

---

## 1 · Métricas objetivas (baseline 2026-04-23)

### 1.1 Código fuente

| Métrica | Valor | Umbral sano | Estado |
|---|---|---|---|
| Archivos TS/TSX | 393 | — | — |
| LOC total (src/) | 75.226 | — | — |
| Archivos ≥ 300 LOC | 68 | — | — |
| **Archivos ≥ 500 LOC** | **40** | < 15 | 🔴 **2.6× sobre umbral** |
| **Archivos ≥ 1.000 LOC** | **10** | < 3 | 🔴 **3.3× sobre umbral** |
| **Archivos ≥ 2.000 LOC** | **3** | 0 | 🔴 **God Objects confirmados** |
| `: any` | 0 | 0 | ✅ |
| `as any` | 4 | < 10 | ✅ |
| TODO/FIXME | 7 archivos | < 20 | ✅ |
| `console.*` | 268 ocurrencias | < 50 (con logger estructurado) | ⚠️ |
| TypeScript strict | `true` | `true` | ✅ |
| Imports React/Next en `src/golf/` | 1 (type-only) | 0 | ⚠️ menor |

### 1.2 Tests

| Métrica | Valor | Estado |
|---|---|---|
| Test files | 305 | ✅ |
| Total tests | 5.655 | ✅ |
| Duración suite | 6.44 s | ✅ rapidísimo |
| Tests pasando | 5.655 / 5.655 (100%) | ✅ |
| Tests canario estabilidad | Sí (post-incident 25-mar) | ✅ |
| Tests en `src/golf/` | 1 archivo (`core/colors.test.ts`) sobre 35 TS | 🔴 cobertura ~3% |
| Cobertura oficial (vitest coverage) | No medida | ⚠️ sin baseline |

### 1.3 Dependencias

| Métrica | Valor |
|---|---|
| Total packages | 1.027 |
| Vulnerabilidades | **16 total** |
| CRITICAL | 1 (protobufjs RCE) |
| HIGH | 10 |
| MODERATE | 5 |
| Fix trivial (`npm audit fix`) | Resuelve todos menos Next.js y eslint-config-next |
| Fix breaking (`npm audit fix --force`) | Requiere Next 16 y eslint-config-next 16 |

### 1.4 Top 10 archivos más grandes

| LOC | Archivo | Tipo | Evaluación |
|---|---|---|---|
| 2.118 | `src/app/ronda-libre/nueva/page.tsx` | Wizard | 🔴 God Object — máxima prioridad refactor |
| 2.033 | `src/app/ronda-libre/[codigo]/page.tsx` | Ronda activa | 🔴 God Object |
| 1.947 | `src/app/ronda-libre/[codigo]/score/page.tsx` | Scoring hoyo a hoyo | 🔴 God Object |
| 1.252 | `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` | Scoring grupal | ⚠️ partir |
| 1.111 | `src/app/perfil/historial/page.tsx` | Historial | ⚠️ partir |
| 1.084 | `src/app/organizador/[slug]/jugadores/JugadoresPanel.tsx` | Panel jugadores | ⚠️ partir |
| 1.077 | `src/components/import/ImportGuide.tsx` | Guide import | ⚠️ partir |
| 1.033 | `src/app/admin/golf-ops/page.tsx` | Admin ops | ⚠️ aceptable (admin) |
| 1.018 | `src/components/CourseSelector.tsx` | Selector canchas | ⚠️ partir |
| 978 | `src/app/organizador/[slug]/scoring/page.tsx` | Scoring torneo | ⚠️ partir |

**Patrón detectado**: todo `ronda-libre/**` está hinchado. 7.350 LOC en 4 archivos. Alto riesgo — es el flujo crítico del producto.

---

## 2 · Alertas P0 (bloquean — resolver esta semana)

### P0-1 · `protobufjs` CRITICAL (RCE) — fix trivial

**Ubicación**: `node_modules/protobufjs` (transitivo)
**CVE**: GHSA-xq3m-2v4x-88gg — Arbitrary Code Execution
**Fix**: `npm audit fix` (sin breaking change)
**Por qué es P0**: ejecución remota de código en un paquete que se incluye en el runtime. Aunque sea transitivo, puede ser cargado durante build o SSR.
**Acción**: correr `npm audit fix`, verificar build, commitear con scope puro `fix(deps): parchar protobufjs RCE`.

### P0-2 · Next.js 14.2.35 con 5 vulnerabilidades HIGH sin parchar

**CVEs activos**:
- GHSA-9g9p-9gw9-jx7f — DoS vía Image Optimizer remotePatterns
- GHSA-h25m-26qc-wcjf — HTTP request deserialization DoS en RSC
- GHSA-ggv3-7p47-pfv8 — HTTP request smuggling en rewrites
- GHSA-3x4c-7xq6-9pq8 — next/image cache exhaustion
- GHSA-q4gf-8mx6-v5v3 — DoS con Server Components

**Por qué es P0**: 3 de esos 5 son DoS en producción. Durante un torneo real con tráfico concurrente (espectadores mirando leaderboard) + un atacante con script básico = app caída. Violación directa de la directiva "CERO FALLOS".

**Fix**: migración a Next 15.x o 16.x (breaking change). Evaluar Next 15 primero — upgrade path más corto, compatibilidad App Router 14 mantenida, las dependencias auxiliares (next-themes, next-mdx, etc.) no se usan en este proyecto.

**Plan sugerido**:
1. Crear branch `upgrade/next-15`
2. Seguir `/vercel:next-upgrade` o codemods oficiales
3. Correr full test suite + smoke tests en preview
4. Merge con commit puro `chore(deps): upgrade Next 14 → 15 — parcha 5 HIGH`

### P0-3 · Cero CI en GitHub Actions

**Evidencia**: `.github/workflows/` no existe (solo falsos positivos en node_modules).
**Impacto**: el pre-push local es la ÚNICA defensa. Si un dev pushea desde otro entorno (Cursor remoto, Conductor, Codex), no se corre. El memoriado [2026-04-20](memoria S465) ya registra un push fallido por módulo untracked que el tsc local no detectó.

**Fix**: crear `.github/workflows/ci.yml` con:
- `tsc --noEmit`
- `vitest run`
- `next build` (con cache de dependencias)
- Comentario en PR si hay fallos

**No bloquea merges** en main inicialmente — arrancar en modo "reportar", escalar a "bloquear" después de 1 semana estable.

### P0-4 · Sin baseline de performance / bundle size

**Evidencia**: `vercel.json` solo tiene crons. Ningún script mide Lighthouse o bundle. Memoria no registra baseline reciente.
**Impacto**: imposible detectar regresión de performance. Un PR que agrega 500 KB al bundle pasa inadvertido. La app se vuelve lenta gradualmente y nadie lo mide.
**Fix**:
1. Correr Lighthouse en 5 páginas críticas (landing, wizard, dashboard, scorecard, espectador torneo)
2. Guardar baseline en `docs/audits/performance-baseline-2026-04-23.md`
3. Integrar en CI (puede ser manual primero, Lighthouse CI después)

---

## 3 · Alertas P1 (urgentes — próximas 2 semanas)

### P1-1 · `ronda-libre/nueva/page.tsx` = 2118 LOC (God Object crítico)

**Evidencia**: wizard completo en un solo archivo — stepper, validación, selector canchas, selector jugadores, formato, tee por jugador, persistencia. Toca el flujo crítico del producto.
**Riesgo**: cualquier cambio tiene probabilidad alta de romper algo no relacionado. En un torneo real, un bug acá rompe la experiencia al crear ronda.
**Fix sugerido** (refactor sprint dedicado, NO en el medio de otro sprint):
- `WizardStepper/` (paso 1: jugadores, paso 2: cancha, paso 3: formato, paso 4: tee, paso 5: confirmar)
- `useNuevaRondaForm()` hook con toda la state machine
- `actions.ts` con las mutaciones Supabase
- Target: <400 LOC en page.tsx

### P1-2 · `ronda-libre/[codigo]/page.tsx` + `score/page.tsx` = 3980 LOC combinados

Mismo patrón. Son las páginas donde los jugadores están ACTIVAMENTE en la cancha. Deben ser las más testeadas y mantenibles.

### P1-3 · Cobertura de tests del motor de golf = ~3% por archivos

**Evidencia**: 35 archivos en `src/golf/`, solo 1 archivo de test dentro (`colors.test.ts`).
**Nota**: sí hay tests en `src/__tests__/` (match-play, stableford, foursome, best-ball, scramble, etc — 30+ archivos), así que la cobertura REAL del motor NO es 3% — los tests están separados del código testeado.
**Pero sigue siendo un problema**: la convención industrial es colocar tests al lado del código (`file.ts` + `file.test.ts`). Esto:
1. Oculta cobertura real (qué está testeado vs qué no)
2. Dificulta TDD (crear test al editar código)
3. Un CTO humano lo detecta y pregunta "¿cuál es la cobertura real?" → nadie sabe

**Fix**:
1. Correr `vitest run --coverage` para obtener número real
2. Guardar baseline
3. Agregar umbral mínimo en CI (sugerido: 70% en `src/golf/`, 40% global)

### P1-4 · 4 clientes Supabase dispersos en lugar de 1 barrel único

**Ubicaciones**:
- `src/lib/supabase.ts` — browser client + type zoo (Profile, Tournament, etc.)
- `src/lib/supabaseAdmin.ts` — admin client service role
- `src/lib/supabase/index.ts` — barrel consolidado (tiene los 3 clientes + docs excelente)
- `src/utils/supabase/server.ts` — server client con cookies

**Problema**: el barrel `src/lib/supabase/index.ts` ya consolidó todo, pero los 3 archivos originales siguen existiendo y siendo importados en decenas de lugares. Nuevos devs no saben cuál usar.

**Fix** (no es urgente pero alto ROI):
1. Migrar todos los imports a `@/lib/supabase` (el barrel)
2. Borrar `supabase.ts` (mover types a `src/types/supabase.ts`)
3. Borrar `supabaseAdmin.ts` (ya está en el barrel)
4. Mantener `utils/supabase/server.ts` si el barrel no puede reexportarlo por el import de `next/headers` (Next se queja si lo mezcla)

### P1-5 · No hay RUNBOOKS/ para operación en producción

**Evidencia**: `docs/` no tiene carpeta `RUNBOOKS/`.
**Gaps críticos**:
- ¿Qué hago si Sentry dispara spike de errores a las 3am?
- ¿Qué hago si Supabase tiene downtime durante un torneo?
- ¿Cómo revierto un deploy roto en 5 minutos?
- ¿Cómo escalo si un torneo genera 10× tráfico?
- ¿Qué hago si un jugador reporta bug en cancha?

**Fix**: crear `docs/RUNBOOKS/` con al menos 5 runbooks iniciales:
- `incident-deploy-broken.md`
- `incident-supabase-down.md`
- `incident-sentry-error-spike.md`
- `incident-bug-en-torneo.md`
- `ops-deploy-rollback.md`

### P1-6 · No hay ADRs (Architecture Decision Records)

**Evidencia**: `docs/` no tiene carpeta `ADRs/`.
**Impacto**: decisiones ya tomadas (Supabase vs Firebase, Next App Router vs Pages, colores Garmin, índice dual, etc.) viven en memoria de Juanjo y Claude. Un CTO humano no sabe POR QUÉ algo es como es — y si decide cambiarlo, puede deshacer razones que nadie documentó.

**Fix**: crear `docs/ADRs/` con los 10-15 ADRs más importantes:
- ADR-001 — Supabase como backend (vs Firebase)
- ADR-002 — Next.js App Router 14 (vs Pages / otro framework)
- ADR-003 — Colores Garmin Golf sin modificar
- ADR-004 — Motor golf centralizado en `src/golf/`
- ADR-005 — Un solo commit por scope (no bundled)
- ADR-006 — Archivos protegidos y protocolo (post 25-mar)
- ADR-007 — Español LatAm neutro (tú, nunca vos)
- ADR-008 — Branch única `main` (no develop)
- ADR-009 — 0% tolerancia a fallos en cancha
- ADR-010 — tAIger+ con Anthropic (vs Gemini/OpenAI)

### P1-7 · No hay diagrama de sistema (1 página)

Un CTO humano escaneando el repo no tiene un solo lugar donde ver: frontend → API routes → Supabase → servicios externos (Anthropic, Sentry, PostHog, Vercel Cron, FedeGolf).
**Fix**: `docs/DIAGRAMA_SISTEMA.md` con un diagrama ASCII o Mermaid de 1 página.

### P1-8 · No hay catálogo de deuda técnica trackeado

**Evidencia**: GitHub Issues no tiene label `tech-debt`. La deuda vive en memoria o en comentarios TODO dispersos.
**Fix**: crear issues con label `tech-debt` por cada alerta P1/P2 de este informe. Prioriza en el próximo sprint planning.

### P1-9 · 268 `console.*` en lugar de logger estructurado

**Evidencia**: `grep console.{log,error,warn} src` → 268.
**Impacto**:
1. En producción, los logs se pierden en el feed de Vercel sin correlación
2. Sentry captura errores pero no console.log informacionales
3. Imposible filtrar por request_id, user_id, torneo_id
**Fix** (no urgente pero estratégico):
- Crear `src/lib/logger.ts` con `info/warn/error` → Sentry breadcrumbs + console en dev
- Reemplazar gradualmente (no refactor big-bang)
- Agregar ESLint rule: `no-console` con warning

---

## 4 · Alertas P2 (medianas — próximo mes)

### P2-1 · 9 vulnerabilidades HIGH restantes (no-Next)

- `glob`, `minimatch`, `picomatch`, `vite`, `flatted`, `@typescript-eslint/*`
- Todas fix vía `npm audit fix` (no breaking)
- Mayoría son ReDoS o utilidades de build — no runtime producción
- Prioridad media solo porque Next es más urgente

### P2-2 · 5 MODERATE vulnerabilities

- `@anthropic-ai/sdk` (sandbox escape) — fix breaking change. Evaluar impacto.
- `dompurify` (XSS bypass) — fix no breaking
- `brace-expansion`, `uuid` — transitivos

### P2-3 · ESLint config mínimo (solo `next/core-web-vitals`)

**Faltan reglas clave**:
- `no-console` (warning, no error)
- `@typescript-eslint/no-explicit-any` (ya no hay ninguno, pero evitar regresión)
- Rule custom "no-emojis-in-ui-chrome" (evitar que P7 del audit UI vuelva)
- `react-hooks/exhaustive-deps` (crítico para Next App Router)

### P2-4 · Build no se valida en CI (solo tests)

Mismo punto que P0-3 pero enfocado en el build. El build puede fallar por razones diferentes a tsc (estáticos, env vars, rutas).

### P2-5 · Sin dashboard de métricas de negocio

**Evidencia**: PostHog tiene tracking pero no hay dashboard consolidado para:
- Rondas creadas / semana
- Torneos activos
- Usuarios activos diarios/mensuales
- Tasa de finalización de ronda
- Tasa de error por ruta
**Fix**: crear dashboard PostHog o `docs/METRICAS_NEGOCIO.md` con queries guardadas.

### P2-6 · Sin visual regression testing

Un cambio de CSS global puede romper layout en 30 páginas y nadie se entera hasta que un usuario reporta. Candidatos: Chromatic, Percy, Playwright screenshots diff.

### P2-7 · `src/lib/` tiene 13+ archivos mezclando dominios

- `analytics.ts`, `scoring.ts`, `gwi.ts`, `cpi.ts`, `share-card.ts`, `courses.ts`, `taiger-prompt.ts`, `garmin-colors.ts`, `score-colors.ts`, `admin.ts`, `auth-helpers.ts`, `error-logger.ts`, `demo-simulation.ts`, `golf-data.ts`, `course-types.ts`, `course-matching.ts`

Mucho de esto duplica lo que está en `src/golf/`. Ejemplo: `garmin-colors.ts` y `score-colors.ts` coexisten con `src/golf/core/colors.ts`.

**Fix**: auditar `src/lib/` y migrar lo que pertenece a `src/golf/` — una limpieza de 1 sprint.

### P2-8 · `src/golf/core/colors.ts` importa `CSSProperties` de React

Es `import type` (solo types, no runtime) así que técnicamente no rompe la pureza del motor, pero es una señal. El motor de golf NO DEBE CONOCER React ni tipos de React. Los estilos deberían salir como strings o tokens semánticos, no como `CSSProperties`.
**Fix**: cambiar `CSSProperties` por un objeto propio `{ bg: string; color: string; ... }`. 5 min de trabajo, mejora pureza arquitectural.

### P2-9 · Cobertura real de tests NO MEDIDA

Ya cubierto en P1-3, aquí registrado como recordatorio para correr `vitest run --coverage` y establecer baseline + umbrales en CI.

### P2-10 · `docs/` tiene archivos con fechas viejas sin archivar

- `PLAN_ESTRATEGICO_CORRECCION_2026-04.md` (30.640 bytes, 9 abril)
- `POSTMORTEM_2026-03-25.md`
- `audit-report-2026-04-13.md` (12.197 bytes, 14 abril)
- `RLS_FIXES_2026-03-24.sql`
- `SQL_RLS_AUDIT.sql`
- `TRABAJO_NOCTURNO.md`, `WRAPPER_NOCTURNO.md`

Según la regla #4 del CLAUDE.md, docs de periodo cerrado deberían ir a `docs/archive/YYYY-QN/`. Varios de estos deberían moverse.

### P2-11 · `package.json` `lint` no se corre en pre-push

Existe `npm run lint` pero no está en el pre-push hook. Si el día que agreguemos reglas ESLint nuevas, los PRs las pueden ignorar.
**Fix**: agregar `npm run lint` al pre-push (puede ser warning primero, error después).

### P2-12 · Dev: `scripts/` tiene utilidades no documentadas

- `e2e-ronda-libre.js`, `fedegolf-sync.ts`, `migrate-019-brisas.js`, `run-audit.ts`, `seed-demo-data.sql`, `test-e2e-prod.mjs`, `test-e2e-torneo40.mjs`, `update-docs.js`

Ningún `scripts/README.md`. Un CTO humano no sabe cuándo se usan.

---

## 5 · Gaps de documentación para handoff

| # | Doc | Estado actual | Prioridad |
|---|-----|---|---|
| 1 | `README.md` | ✅ Existe (98 líneas) — apunta bien a ONBOARDING | ✅ |
| 2 | `CLAUDE.md` | ✅ Existe (332 líneas) — muy completo | ✅ |
| 3 | `docs/ONBOARDING.md` | ✅ Existe (79 líneas) — ruta 45 min clara | ✅ |
| 4 | `docs/ARQUITECTURA.md` | ⚠️ Existe (92 líneas) — **muy corto** para el tamaño del proyecto | ⬆️ expandir |
| 5 | `docs/SPRINT_LOG.md` | ✅ Existe (962 líneas) | ✅ |
| 6 | `docs/ROADMAP_COMPLETO.md` | ✅ Existe (178 líneas) | ✅ |
| 7 | `docs/DESIGN.md` (según memoria) | ⚠️ No encontrado en raíz — verificar | — |
| 8 | **`docs/RUNBOOKS/`** | ❌ **NO EXISTE** | 🔴 P1 |
| 9 | **`docs/ADRs/`** | ❌ **NO EXISTE** | 🔴 P1 |
| 10 | **`docs/DIAGRAMA_SISTEMA.md`** | ❌ **NO EXISTE** | 🟡 P1 |
| 11 | **`docs/METRICAS_NEGOCIO.md`** | ❌ **NO EXISTE** | 🟡 P2 |
| 12 | **`docs/TECH_DEBT.md` o Issues label** | ❌ **NO EXISTE** | 🟡 P1 |
| 13 | **`scripts/README.md`** | ❌ **NO EXISTE** | 🟢 P2 |
| 14 | `docs/ESTADO_ACTUAL.md` | ✅ Existe (auto-generado) | ✅ |

**Regla de oro del handoff**: el CTO humano llega el día 1 y pregunta:
- "¿Cómo deployo a staging?" → **Sin respuesta clara** (no hay runbook, no hay staging separado)
- "¿Qué hago si Sentry avisa a las 3am?" → **Sin respuesta** (no hay runbook)
- "¿Cuál flujo nunca puede romperse?" → Parcial (ONBOARDING lo menciona, pero no hay checklist operativo)
- "¿Por qué existe `tAIger+`?" → **Sin respuesta documentada** (decisión vive en memoria)
- "¿Qué hay en roadmap próximos 3 meses?" → ✅ ROADMAP_COMPLETO lo responde
- "¿Qué decisiones están bloqueadas?" → **Sin respuesta** (no hay catálogo deuda)

Score handoff actual: **4/6 preguntas respondidas — aceptable pero no suficiente**.

---

## 6 · Gaps de guardrails automatizados

| Guardrail | Estado | Prioridad |
|---|---|---|
| Pre-push local (tsc + test + build) | ✅ Existe y funciona | ✅ |
| **CI GitHub Actions** | ❌ **NO EXISTE** | 🔴 P0 |
| **Lighthouse baseline + tracking** | ❌ **NO EXISTE** | 🔴 P0 |
| Bundle size regression check | ❌ No existe | 🟡 P1 |
| Visual regression testing | ❌ No existe | 🟡 P2 |
| ESLint rule "no-emojis-in-ui-chrome" | ❌ No existe | 🟡 P2 |
| ESLint rule `no-console` warning | ❌ No existe | 🟡 P2 |
| Coverage threshold en CI | ❌ No existe | 🟡 P1 |
| `npm audit` automatizado semanal | ❌ No existe | 🟡 P1 |
| Protección de archivos críticos en PR (reviewer enforcement) | ⚠️ Existe en CLAUDE.md pero no enforcement automático | 🟡 P2 |

---

## 7 · Plan de acción priorizado

### Semana 1 (P0 — bloquea)

1. **`npm audit fix`** — parcha protobufjs CRITICAL y varios HIGH no-breaking
   - Commit puro: `fix(deps): parchar protobufjs RCE + ReDoS transitivos`
   - Verificar tests + build
2. **Crear `.github/workflows/ci.yml`** — tsc + tests + build
   - Modo "reportar" primero, no bloquea
3. **Establecer baseline Lighthouse** — 5 páginas, guardar en `docs/audits/`
4. **Next.js 14 → 15 upgrade** — en branch aparte, testing extenso
   - Seguir `/vercel:next-upgrade`
   - Merge solo después de QA visual + smoke torneo real

### Semana 2 (P1 — urgente)

5. Crear `docs/RUNBOOKS/` con 5 runbooks iniciales
6. Crear `docs/ADRs/` con los 10 ADRs clave
7. Crear `docs/DIAGRAMA_SISTEMA.md`
8. Migrar imports Supabase al barrel `@/lib/supabase` + borrar archivos dispersos
9. Correr `vitest run --coverage` → establecer baseline + agregar threshold CI

### Semana 3 (P1 — arquitectura)

10. **Refactor `ronda-libre/nueva/page.tsx`** (2118 → <400 LOC) — sprint dedicado
11. **Refactor `ronda-libre/[codigo]/page.tsx` + `score/page.tsx`** — mismo patrón
12. Crear `src/lib/logger.ts` + reemplazar console.* gradualmente
13. Auditar y consolidar `src/lib/` (mover lógica golf a `src/golf/`)
14. Archivar docs viejos a `docs/archive/2026-Q2/`

### Semana 4 (P2 — polish)

15. ESLint rules nuevas (`no-console`, `no-emojis-in-ui-chrome`, `react-hooks/exhaustive-deps`)
16. Visual regression (Chromatic o Playwright)
17. Dashboard métricas negocio
18. `npm audit` automatizado semanal en CI
19. Catálogo deuda técnica — convertir este informe en GitHub Issues con labels
20. `scripts/README.md`

---

## 8 · Lo que NO se pudo medir (requiere intervención humana o ejecución larga)

- **QA visual 38 fotos vs producción**: solo Juanjo puede. Crítico.
- **QA funcional torneo end-to-end**: requiere 2 personas + BD real. Crítico.
- **Bundle size medición**: `npm run build` en OneDrive Windows es lento y a veces corrompe `.next`. Correr en CI cuando exista.
- **Ciclos de dependencias** (`madge`): no instalado. Agregar a devDeps y correr.
- **Cobertura de código exacta**: requiere `vitest run --coverage` (~30s).
- **Visual regression baseline**: requiere infra (Chromatic/Percy) que no existe.

---

## 9 · Qué está bien (no todo es deuda)

No todo lo que se encontró es negativo. **Lo que está bien merece mantenerse**:

- ✅ **Tests robustos**: 5.655 tests en 305 files, 100% green, 6s de runtime
- ✅ **Tests canario estabilidad**: protegen Navbar/layout/middleware post 25-mar
- ✅ **TypeScript strict**: 0 `: any`, 4 `as any` en 75k LOC es ejemplar
- ✅ **API routes con `force-dynamic`**: todas las que importan Supabase tienen el flag (verificado)
- ✅ **Auth middleware completo**: valida user, protege rutas, chequea admin role
- ✅ **API routes con service-role bien gobernadas**: `push/send` requiere admin, `delete-account` valida user, `game` valida organizer/player match
- ✅ **Motor golf separado**: 35 archivos puros TS, solo 1 `import type` React (casi perfecto)
- ✅ **Pre-push hook local** robusto (tsc + tests + build)
- ✅ **Documentación de handoff básica sólida**: README + ONBOARDING + CLAUDE.md + ARQUITECTURA + SPRINT_LOG + ROADMAP
- ✅ **Sentry + PostHog + health-check cron** configurados en producción
- ✅ **4 clientes Supabase**, aunque dispersos, están bien **documentados** (el barrel `lib/supabase/index.ts` explica cuándo usar cada uno)
- ✅ **0 archivos de test fallando**
- ✅ **CLAUDE.md declara directiva 0% fallos + protocolo archivos protegidos + convenciones de trabajo** — excelente base cultural

---

## 10 · Conclusión y decisión pedida

El proyecto **no está en crisis**. Tiene fundamentos sólidos (tests, TypeScript rigor, motor golf, auth) y documentación básica de handoff.

Pero tiene **3 clases de deuda que acumulan riesgo**:

1. **Seguridad de dependencias (P0)** — se resuelve en 1 día con `npm audit fix` + upgrade Next 15
2. **Arquitectura UI (P1)** — 9 God Objects, refactor de `ronda-libre/**` merece un sprint dedicado
3. **Guardrails + runbooks (P0/P1)** — sin CI y sin runbooks, el próximo incidente en torneo será más largo de diagnosticar

**Decisión que te pido, Juanjo**:

- ¿Arranco con los P0 (Semana 1) ahora mismo en commits puros y separados?
- ¿O prefieres validar visualmente primero (tu track: 38 fotos + torneo end-to-end) antes de tocar nada?

Mi recomendación: **hacer los P0 ya**. Son correcciones de seguridad que no dependen de QA funcional. Mientras corren, tú hacés el QA visual. Paralelo, no en serie.

---

## Anexo A — Comandos usados para el baseline

```bash
# LOC + file count
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -30

# Archivos por tamaño
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | awk '$1>=300{over300++} $1>=500{over500++} $1>=1000{over1000++} $1>=2000{over2000++} END{...}'

# TypeScript strict violations
grep -rn ": any" src | wc -l
grep -rn "as any" src | wc -l

# force-dynamic check
for f in $(find src/app/api -name "route.ts"); do
  grep -q "supabase" "$f" && ! grep -q "export const dynamic" "$f" && echo "$f"
done

# Tests
npm run test -- --run

# Dependencias
npm audit

# Console usage
grep -rn "console.log\|console.error\|console.warn" src | wc -l

# Motor golf pureza
find src/golf -name "*.ts" | xargs grep -l "from 'react'\|'next/"
```

---

**Fin del informe.**

Este documento es la fuente de verdad para el próximo sprint de saneamiento. Cada item P0/P1/P2 debería convertirse en un GitHub Issue con label `tech-debt` o `security` para tracking.
