# AUDITORÍA CEO — Golfers+ (15 agosto 2026)

**Metodología:** 6 agentes de investigación en paralelo cubriendo todos los dominios del producto.
**Alcance:** 72K+ LOC, 143 componentes, 334 archivos de test, 9 docs estratégicos, 214 branches, infra completa.

---

## RESUMEN EJECUTIVO

Golfers+ es técnicamente sólido: motor WHS correcto, 3769 tests verdes, CI/CD robusto, catálogo de 186 canchas verificado. Pero tiene un problema existencial: **cero usuarios externos, cero revenue, cero tracción**. La excelencia técnica está enmascarando la ausencia de product-market fit.

La auditoría encontró **67 problemas** clasificados así:

| Severidad | Cantidad | Descripción |
|-----------|----------|-------------|
| **P0** | 12 | Bloquean uso real o son riesgo de seguridad activo |
| **P1** | 28 | Degradan experiencia o acumulan deuda significativa |
| **P2** | 20 | Deuda técnica, polish, mejoras de mantenimiento |
| **P3** | 7 | Nice-to-have, mejoras menores |

---

## HALLAZGOS POR DOMINIO

---

### 1. SEGURIDAD E INFRAESTRUCTURA (12 problemas)

#### P0: Críticos

| # | Problema | Archivo | Impacto | Solución |
|---|---------|---------|---------|----------|
| SEC-1 | **Secrets de producción en .env.local** | `.env.local` | Todas las credenciales expuestas a cualquiera con acceso al repo | Rotar TODOS los secrets inmediatamente (Supabase, Anthropic, Gemini, Telegram, FedaGolf) + purgar de git history |
| SEC-2 | **Rate limiter en memoria** — cold start resetea límites | `src/lib/rate-limit.ts:14` | DOS vulnerability: atacante puede drenar $1000+ en créditos API | Migrar a Upstash Redis (~$5/mo, 3-4h trabajo) |
| SEC-3 | **CRON_SECRET posiblemente ausente en Vercel** | `api/cron/*/route.ts` | Los 3 cron endpoints fallan silenciosamente cada día | Verificar en Vercel dashboard, generar si falta |

#### P1: Alto impacto

| # | Problema | Archivo | Solución |
|---|---------|---------|----------|
| SEC-4 | console.error en 15+ API routes expone estado interno | Múltiples routes | Reemplazar con `captureError()` (CI ya bloquea nuevos) |
| SEC-5 | Cron endpoints sin `maxDuration` — timeout en 30s | `cleanup-drafts/route.ts` | Agregar `export const maxDuration = 60` |
| SEC-6 | SQL injection risk en exec_sql — blocklist regex bypasseable | `admin/actions/sql/route.ts:36` | Deprecar endpoint o cambiar a whitelist |
| SEC-7 | Admin client (service role) en 20 routes sin auditoría uniforme | `lib/supabaseAdmin.ts` | Auditar las 20 rutas, documentar guards |
| SEC-8 | CSP headers permiten unsafe-inline | `next.config.js:10-35` | Limitación Next.js — documentar, aceptable por ahora |

#### P2-P3: Deuda

| # | Problema | Solución |
|---|---------|----------|
| SEC-9 | Dependencias deprecadas (glob, rimraf, async-limiter) | `npm audit fix` + actualizar |
| SEC-10 | Sin error boundaries globales (`app/error.tsx`) | Crear componente de error global |
| SEC-11 | Sin backup formalizado fuera de Supabase | pg_dump diario a Cloudflare R2 |
| SEC-12 | PII en `/api/profiles/search` (email expuesto) | Retornar solo id + name |

---

### 2. SCORER Y RONDAS (11 problemas)

#### P0: Bloquean torneos

| # | Problema | Archivo | Impacto | Solución |
|---|---------|---------|---------|----------|
| SCO-1 | **Insert de historical_rounds sin verificar error** — scorecard puede perderse silenciosamente | `score-grupo/page.tsx:661-677` | Jugador ve "finalizada" pero datos perdidos | Extraer a `lib/data/rounds/finalize.ts` con error handling + retry |
| SCO-2 | **`alert()` nativo** en flujo de descarte en vez de toast | `score-grupo/page.tsx:114-116` | UI bloqueante, no matchea diseño | Reemplazar con `addToast()` existente |
| SCO-3 | **console.error en producción** (2 ubicaciones) | `TournamentDraftEditor.tsx:399`, `plan-engine.ts:167` | Errores invisibles a tracking | Reemplazar con `captureError()` |

#### P1: Degradan experiencia

| # | Problema | Archivo | Solución |
|---|---------|---------|----------|
| SCO-4 | 14 llamadas directas `supabase.from()` fuera de lib/data | 5 archivos de scorer | Crear módulo `lib/data/rounds/` centralizado |
| SCO-5 | Fire-and-forget DB ops sin `.catch()` | `score-grupo/page.tsx:677-686` | Agregar `.catch()` con `captureError()` |
| SCO-6 | 15+ checks de formato hardcodeados en vez de usar `isTeamFormat()` | Layout, IndividualLeaderboard, CourseInfoCard, TeamLeaderboards | Importar de `golf/formats/` — regla "un concepto, una fuente" |
| SCO-7 | Privacy hardcodeado a 'private' — no hay opción pública | `score-grupo:670`, `useFinalizeRonda:193` | Agregar campo privacy a rondas_libres |

#### P2: Deuda técnica

| # | Problema | Solución |
|---|---------|----------|
| SCO-8 | score-grupo/page.tsx = **1398 LOC** (objetivo <500) | Refactor: hooks + components |
| SCO-9 | score/page.tsx = **1040 LOC** | Refactor pendiente |
| SCO-10 | TODO: `handicapIndex` → `courseHandicap` en best-ball.ts | Renombrar + actualizar 20 call sites |
| SCO-11 | Mensajes de error inconsistentes entre scorers | Estandarizar en `addToast()` |

---

### 3. COACH tAIger+ / CEREBRO V3 (15 problemas)

#### P0: Críticos

| # | Problema | Archivo | Impacto | Solución |
|---|---------|---------|---------|----------|
| COA-1 | **Demo-gate bloqueando sub-olas 1c/1d** — 40+ días atrasado | `cerebro-v3-estado.md` | V3 rollout parcialmente bloqueado | Agendar demo con Juanjo HOY, mergear PR |
| COA-2 | **Cost tracking incompleto** — RAG queries y fallback sin seguimiento | `chat-engine.ts:228-232`, `embed-query.ts:98` | Ceguera de costos: no se puede atribuir gasto por usuario | Wrappear RAG queries, agregar fallback audit log + alerta credit-out |
| COA-3 | **Error handling opaco** — API routes retornan 500 genérico | `plan-outcome/route.ts:58`, `progress/route.ts:21` | Debugging producción requiere logs manuales | Clasificar errores con `CoachError` tipado |

#### P1: Alto impacto

| # | Problema | Archivo | Solución |
|---|---------|---------|----------|
| COA-4 | Examen live no validado — credits Anthropic agotados | `exam.test.ts:120` | Recargar API key + re-baseline |
| COA-5 | V2/V3 dual systems sin plan de sunsetting | `prompts/index.ts`, `build-system.ts` | Documentar fases de rollout + fecha de muerte V2 |
| COA-6 | Prior distribution gate (par-3 percentiles provisionales) | `priors/index.ts` | Decidir: datos propios vs licenciar vs deferir |
| COA-7 | GEMINI_API_KEY sin fallback — RAG muere silenciosamente | `embed-query.ts:63` | Agregar fallback chain + health check |
| COA-8 | Test flaky `historial.integration.test.tsx` | CI intermitente | Aislar + fix con fake timers/timeout |
| COA-9 | Modelo LLM hardcodeado — no configurable per-user | `chat-engine.ts` | Parametrizar via `llm_models` table |

#### P2: Deuda

| # | Problema | Solución |
|---|---------|----------|
| COA-10 | RAG pipeline sin monitoreo de latencia (SLA) | Agregar threshold check + alerta Sentry |
| COA-11 | Knowledge corpus sin scoping por source_id | Documentar + agregar canario antes de 2ª fuente |
| COA-12 | coach/tools.ts = **886 LOC** | Split en tools/focus-tools, tools/round-tools |
| COA-13 | chat-engine.ts = **649 LOC** | Split en chat/loop, chat/streaming, chat/fallback |
| COA-14 | Onboarding fallback silencioso (error → onboarded:true) | Agregar logging con captureError |
| COA-15 | Sin mecanismo GDPR de borrado de sesiones coach | Documentar + implementar |

---

### 4. MOTOR GOLF Y CAPA DE DATOS (8 problemas)

#### P0: Arquitectura

| # | Problema | Archivo | Impacto | Solución |
|---|---------|---------|---------|----------|
| GOL-1 | **Supabase directo en páginas** — 41 archivos en `src/app/` hacen `.from()` fuera de api/ | `app/admin/`, `app/coach/`, `app/organizador/` | Sin auditoría, testing o caching centralizado | Crear funciones en `lib/data/` por dominio |

#### P1: Alto impacto

| # | Problema | Archivo | Solución |
|---|---------|---------|----------|
| GOL-2 | share-card.ts = **670 LOC** en lib/ (debería estar en golf/) | `src/lib/share-card.ts` | Mover a `golf/share/card.ts` + split canvas/formatting |
| GOL-3 | course-handicap.ts = **617 LOC** | `golf/core/course-handicap.ts` | Mantener (responsabilidad única, pero denso) |
| GOL-4 | WHS gate sin documentación de migración | `compute-player-course-hcp.ts:141-162` | Crear `docs/architecture/whs-migration.md` |
| GOL-5 | 6 archivos shim en lib/ redireccionan a golf/ | `lib/cpi.ts`, `lib/gwi.ts`, etc. | Migrar imports directos a `@/golf/` |

#### P2: Organización

| # | Problema | Solución |
|---|---------|----------|
| GOL-6 | `lib/ronda/` (871 LOC) duplica lógica de `golf/leaderboard/` | Mover a `golf/leaderboard/individual-leaderboard.ts` |
| GOL-7 | `lib/mi-golf/` (10 archivos) duplica `golf/stats/` | Migrar a `golf/stats/profile/` |
| GOL-8 | `calcularIndiceGolfersLocal()` no filtra `excluded_from_handicap` | Cambiar firma para aceptar metadata con flag |

---

### 5. UI/UX Y DESIGN SYSTEM (18 problemas)

#### P0: Accesibilidad y consistencia

| # | Problema | Evidencia | Impacto | Solución |
|---|---------|-----------|---------|----------|
| UI-1 | **613 colores hex hardcodeados** — bypass del sistema de tokens | 20+ componentes con `#8A6A16`, `#86efac`, `#4ade80` | Dark mode roto, mantenimiento O(n) | Crear 6 nuevos CSS tokens + migrar 20 archivos |
| UI-2 | **Dark mode roto en 12+ componentes** | LeaderboardTable, TournamentTabs, CourseSelector, etc. | Texto invisible en superficies dark | Reemplazar paletas single-mode con `var()` theme-aware |
| UI-3 | **164 elementos interactivos sin aria-label** | 164 `onClick` sin label accesible | WCAG 2.1 Level A failure | Agregar `aria-label` a todos los elementos sin texto visible |

#### P1: Consistencia visual

| # | Problema | Solución |
|---|---------|----------|
| UI-4 | 6 componentes crean botones custom en vez de usar `<Button>` | Refactorizar a `<Button variant="...">` |
| UI-5 | 6 archivos de componentes >600 LOC (ImportGuide 1077, CourseSelector 1021, LeaderboardTable 831) | Split por responsabilidad |
| UI-6 | Sin patrón de error en formularios (Input tiene prop `error` no usada) | Documentar en DESIGN.md + implementar |
| UI-7 | Skeleton loaders inconsistentes (3 implementaciones distintas) | Consolidar en `<Skeleton>` genérico |
| UI-8 | Gaps de responsividad mobile (CourseSelector, LeaderboardTable) | Auditar en 360px, documentar breakpoints |
| UI-9 | UndoToast usa `position: fixed` (violación DESIGN.md §7) | Mover a Toast container context |
| UI-10 | 30 archivos con `console.log/error/warn` en componentes | Reemplazar con `captureError()` |
| UI-11 | Patrones de componentes duplicados (3 skeletons, múltiples leaderboards) | Consolidar |

#### P2: Polish

| # | Problema | Solución |
|---|---------|----------|
| UI-12 | Violaciones de contraste en light mode (TournamentTabs, CourseSelector) | Fix colores a 4.5:1 mínimo |
| UI-13 | Estados vacíos sin documentar ni estandarizar | Documentar patrón en DESIGN.md |
| UI-14 | Sin loading states en operaciones async (CourseSelector, TournamentTabs) | Agregar `isLoading` prop |
| UI-15 | TODOs en componentes (CourseSelector:885, Navbar:481) | Mover a GitHub Issues |
| UI-16 | Sin soporte de navegación por teclado | Agregar `onKeyDown` a interactivos |
| UI-17 | Focus ring ausente en botones inline | Usar `<Button>` component |
| UI-18 | Truncación sin aria-label en nombres de cancha largos | Agregar `title` + `aria-label` |

---

### 6. ESTADO DEL PROYECTO Y ESTRATEGIA (8 problemas)

#### P0: Problema existencial

| # | Problema | Evidencia | Impacto |
|---|---------|-----------|---------|
| PRJ-1 | **CERO usuarios externos** | ESTRATEGIA_CEO: "Usuarios reales activos ≈ 0" | Todo el producto opera en vacío — sin validación PMF |

#### P1: Drift estratégico

| # | Problema | Evidencia | Solución |
|---|---------|-----------|----------|
| PRJ-2 | **214 branches acumuladas** sin cleanup | `git branch -a` | Podar 150+ branches stale (>90 días sin actividad) |
| PRJ-3 | **ESTRATEGIA_CEO_AGO2026.md sin commitear** — doc más importante no tracked | `git status: ??` | `git add` inmediatamente |
| PRJ-4 | **ROADMAP_COMPLETO.md** 5 meses desactualizado (mar 2026) | No refleja pivot a "primer club" | Marcar obsoleto o actualizar |
| PRJ-5 | **cerebro-v3-estado.md** con 636 líneas de cruft histórico | Mezcla de ✅/🚦/⏩ sin señal clara | Archivar historial, crear one-pager actual |

#### P2: Documentación

| # | Problema | Solución |
|---|---------|----------|
| PRJ-6 | Sin DECISIONS.md (rationale de stack no documentado) | Crear con decisiones principales |
| PRJ-7 | REORDENAMIENTO_TRACKING congelado desde mayo 2026 | Actualizar estado real de los 9 archivos |
| PRJ-8 | SPRINT_LOG no en orden reverso (hay que scrollear 150 líneas) | Invertir orden |

---

## MATRIZ DE PRIORIDADES — QUÉ HACER PRIMERO

### HOY (bloqueantes, <4 horas)

1. **SEC-1: Rotar TODOS los secrets** — Supabase, Anthropic, Gemini, Telegram, FedaGolf
2. **SEC-3: Verificar CRON_SECRET** en Vercel dashboard
3. **PRJ-3: Commitear ESTRATEGIA_CEO_AGO2026.md**
4. **SCO-3 + COA-3: Reemplazar console.error** con captureError (4 ubicaciones, 30 min)

### ESTA SEMANA (alto impacto, esfuerzo moderado)

5. **SEC-2: Migrar rate limiting** a Upstash Redis (~$5/mo, 3-4h)
6. **COA-1: Demo sub-olas 1c/1d** a Juanjo → merge PR
7. **SCO-1: Fix insert sin error handling** en score-grupo finalization (2h)
8. **PRJ-2: Podar 150+ branches** stale
9. **SEC-11: Setup backup** pg_dump → Cloudflare R2

### ESTE MES (deuda estratégica)

10. **PRJ-1: Contactar primer club** — Juanjo identifica club piloto en Santiago
11. **UI-1 + UI-2: Migrar colores hardcodeados** a CSS tokens (2-3 días)
12. **GOL-1: Crear capa lib/data/** para los 41 archivos con supabase directo
13. **SCO-8 + SCO-9: Refactorizar score-grupo** (1398 LOC → <500)
14. **COA-5: Plan de sunsetting V2** con fechas concretas

### PRÓXIMO TRIMESTRE (si hay tracción)

15. UI-3: Accesibilidad WCAG (164 aria-labels)
16. UI-5: Split de componentes >600 LOC (6 archivos)
17. GOL-6 + GOL-7: Migrar lib/ronda/ y lib/mi-golf/ a golf/
18. COA-12 + COA-13: Split de archivos >600 LOC del coach

---

## DIAGNÓSTICO ESTRATÉGICO

### El problema real

> **"Ferrari estacionado en el garage"** — 72K LOC, 3769 tests, CI perfecto, motor WHS correcto... y nadie lo usa.

La app está lista para producción. El cuello de botella NO es código — es distribución. Cada sprint que optimiza arquitectura sin sumar usuarios profundiza la brecha.

### La métrica que importa

**Rondas scoreadas por semana por no-fundadores.** Hoy: 0. Target mínimo: 5.

### El plan que ya existe pero no se ejecuta

ESTRATEGIA_CEO_AGO2026.md define 3 movimientos:
1. **Movimiento 1 (semanas 1-2 ago):** Higiene técnica — branches, rate limiting, backups, onboarding 30s
2. **Movimiento 2 (semanas 3-4 ago):** Primer club piloto en Santiago
3. **Movimiento 3 (sep):** Ajustar según feedback real

Estamos en semana 3 de agosto. Movimiento 1 está parcialmente hecho. Movimiento 2 no ha arrancado.

### Recomendación CEO

1. **Freeze total de features nuevas** hasta que haya 5+ rondas/semana de no-fundadores
2. **Fix los P0 de seguridad** (hoy, 4 horas)
3. **Fix los P0 del scorer** (esta semana, 1 día) — esto es lo que usan los jugadores
4. **Todo lo demás es ruido** hasta que alguien que no sea Juanjo use la app

---

## FORTALEZAS A PRESERVAR

- Motor WHS correcto con guardrails de rating coherentes
- 3769 tests con canarios contra prod
- Format registry como single source of truth (TEAM_FORMAT_KEYS, isTeamFormat)
- Sistema de error tracking centralizado (captureError → PostHog + Supabase)
- CI/CD robusto con 8 checks por PR
- Design system maduro con 40+ CSS tokens
- Catálogo de 186 canchas verificado
- Coach tAIger+ con RAG + priors + examen de calidad

---

**Auditoría completada:** 15 agosto 2026
**Auditor:** Claude (CTO) — 6 agentes paralelos, cobertura exhaustiva
**Próxima revisión:** 1 septiembre 2026 (post-piloto club)
