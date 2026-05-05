# SPRINT LOG — TU GOLF

> Agregar nueva entrada AL INICIO después de cada sprint

---

## Sesión 05 May 2026 — Reset tAIger: sesión continua, streaming, motor de élite

### Contexto
tAIger (el coach IA) tenía 3 cards y onboarding fragmentado, sin streaming real,
sin cache, con un bug `.limit(50)` en detección de patrones que capeaba la
confidence artificialmente para usuarios con >50 rondas. Auditoría pre-merge
completa en `docs/AUDIT_PRE_MERGE_RESET.md` — veredicto: MERGEABLE.

### Commits del sprint (rama `feat/taiger-reset` → `main`)

1. `c9f9975` refactor(taiger): eliminar 3 cards y onboarding, consolidar a sesión única
   - Borradas páginas `/coach/onboarding`, `/coach/sesion/nueva`, `/coach/sesion/nueva/chat`
   - Borrado endpoint `/api/taiger/analyze-round` (consolidado en `/api/taiger/chat`)
   - `/coach` → entry point único hacia sesión continua

2. `badb5b5` feat(taiger): sesión continua por usuario con markdown consistente
   - `golf/coach/session.ts` + `session.test.ts`: persistencia de sesión por user_id
   - Migración `017_taiger_primary_session.sql` (renombrada a 031 en este sprint)
   - Markdown server-rendered consistente en `/coach/sesion/[id]`

3. `4719cf0` feat(taiger): motor de élite — 100% de rondas, streaming real, cache
   - **Bug fix crítico:** removido `.limit(50)` en `detect-and-save-patterns.ts` →
     ahora procesa el 100% de las rondas históricas (era confidence capeada)
   - Streaming SSE real en `/api/taiger/chat`
   - Cache de contexto en `golf/coach/context.ts`
   - Tools system: `golf/coach/tools.ts`
   - `recalculate-all-patterns.ts` para reprocesar usuarios existentes

4. `18dfdc1` chore(migrations): renombrar 017_taiger → 031 para evitar colisión
   - Colisión de numeración con `017_game_formats_and_course_data.sql` (ya en BD)
   - Solo rename de archivo local; la migración ya estaba aplicada en prod

### Merge
- Merge commit: `2d80907` (`merge: reset tAIger - sesión continua, streaming, motor de élite`)
- Pre-push hook: TS 0 errores, 80 test files / 1413 tests passed, build OK
- Sin conflictos en merge

### Side-effects out-of-plan (auditoría pre-merge sección 2)
Cinco cambios fuera del plan original, todos validados como seguros:

1. **`src/components/Navbar.tsx`** — 1 línea modificada (cambio mínimo).
   - 🚩 BANDERA: el cambio fue seguro (sin async, sin onAuthStateChange) pero se
     commiteó junto con otros archivos en lugar de aislado, contraviniendo el
     protocolo de archivos protegidos. NO bloqueante. Flageado para futuras tareas.
2. **`src/components/mi-golf/IdentidadTab.tsx`** — 1 línea (consistencia visual).
3. **`src/lib/taiger-prompt.ts`** — shim de compatibilidad para imports legacy.
4. **`src/app/ronda-libre/[codigo]/score/page.tsx`** — banner `taiger+` borrado
   (consolidación tras eliminación de onboarding).
5. **`vitest.config.ts`** — excluye worktrees zombis en `.claude/worktrees/`
   (causaban falsos negativos por paths con espacios + OneDrive).

### Post-merge: recalcular patrones
Ejecutado `npx tsx --env-file=.env.local scripts/recalculate-all-patterns.ts`:
- 31 usuarios encontrados, 16 con rondas históricas
- 6 patrones detectados (total) — sin el cap de 50 rondas
- 0 errores
- Confidences pueden haber cambiado vs. valores previos: eso es CORRECCIÓN del
  bug, no regresión.

### Resultado
- ✅ tAIger consolidado en sesión continua única por usuario
- ✅ Streaming SSE real en `/api/taiger/chat`
- ✅ Motor de patrones procesa 100% de rondas (bug `.limit(50)` resuelto)
- ✅ Migración renombrada para evitar colisión
- ✅ Merge clean a main, sin regresiones (1413 tests passed)

---

## Sesión 04 May 2026 — Theme binario light-default (cierre del bug estructural)

### Problema
El sprint del toggle Light/Dark/Auto (28-30 abr) tenía un bug estructural: la
"identidad fija" via `<div data-theme>` en layouts (`/dashboard` dark, auth light)
no afectaba al body, footer ni status bar — solo al subtree del div. Resultado
visible: cards dark navy flotando sobre body cream con footer cream en `/dashboard`
cuando el sistema/storage estaba en light. Roto el mobile overscroll. Roto el
toggle de iOS theme-color hardcodeado.

### Decisión de producto (Juanjo, 04 May 2026)
- Eliminar el modo `auto`. Sistema binario: light por default, dark si el usuario
  lo elige.
- Eliminar la "identidad fija" — TODA la app respeta el toggle.
- Garantizar legibilidad WCAG AA en ambos modos.

### Solución
8 commits sobre feat/theme-binario-light-default, ejecutados via subagent-driven
development con review de spec + code quality:

1. `9c47bd6` refactor(theme): API binaria light/dark + toggle sol/luna
   - ThemeContext: { theme, setTheme }, default light, migración silenciosa 'auto'→'light'
   - Race condition fix via flag `hydrated` (segundo effect early-returns en first render)
   - Navbar: 3 pastillas → toggle binario sol/luna (44px min-height para guante)
2. `4a89237` test(theme): nits del code review (fallback test + comentarios catch)
3. `57aa3ac` refactor(theme): script anti-FOUC simplificado + suppressHydrationWarning
4. `f3b825a` refactor(theme): eliminar identidad fija de dashboard y auth
5. `8e3e840` feat(theme): meta theme-color reactivo (status bar iOS/Android)
6. `a57e997` refactor(theme): eliminar hardcode body[data-page=scorecard]
7. `c893131` refactor(theme): hardcodes hex residuales → tokens (49 archivos, ~260 reemplazos)
8. (este commit) docs: SPRINT_LOG + ARQUITECTURA del sprint

### Archivos tocados
- `src/contexts/ThemeContext.tsx` + tests (binario, hydrated flag)
- `src/components/Navbar.tsx` (toggle binario + tokens en dropdown)
- `src/components/ThemeMetaColor.tsx` (NUEVO — sincroniza meta theme-color)
- `src/app/layout.tsx` (anti-FOUC simplificado, suppressHydrationWarning, meta inicial light)
- `src/app/dashboard/layout.tsx` (eliminado, metadata movida a page.tsx)
- `src/app/{login,register,recuperar}/layout.tsx` (passthrough — page.tsx son client components)
- `src/app/globals.css` (regla body[data-page=scorecard] eliminada)
- `src/app/ronda-libre/[codigo]/score/page.tsx` (useEffect data-page eliminado)
- 49 archivos con hardcodes hex → tokens

### Verificación
- TypeScript: 0 errores
- Tests: 5902/5902 passing (321 archivos)
- Build local: OK
- Cobertura ThemeContext: 8 tests cubren default, stored values, migración, race
  condition, falla de storage tipo 'sepia' (defensivo)
- Code review pasó (APPROVED_WITH_FIXES — 3 nits aplicados, 1 borderline saltado, 1
  follow-up explícito: unicode → SVG icons en sprint posterior)

### Migración de usuarios
Cualquier usuario con `localStorage['golfers-theme'] = 'auto'` (o cualquier valor
no canónico) se migra silenciosamente a `'light'` en el primer mount del
ThemeProvider. Persistido para que la próxima visita ya tenga el valor canónico.

### Pendiente
- QA visual en browser (light + dark) sobre las 15 pantallas críticas — Juanjo
  lo hace tras el push para verificar que no quedó ninguna inconsistencia visual
  que el grep estático no detectó.

### Out of scope (sprints futuros)
- Sincronizar theme preference con BD del usuario (multi-device)
- Animar transiciones entre modos
- Modo "tournament" alto contraste para uso bajo sol fuerte
- Migración de íconos sol/luna unicode → SVG Foundation (consistencia con resto del set)

---

## Sesión 28-30 Abr 2026 — Toggle Light/Dark/Auto sistémico

### Problema
El toggle del Navbar funcionaba pero solo afectaba al Navbar. Las pantallas tenían hardcodes ad-hoc (`/perfil` light, resto dark). No había forma sistémica de cambiar el tema globalmente. P2 pendiente del Audit UI/UX Abr 2026.

### Solución
Sistema híbrido tri-state:
- `<html data-theme="light|dark">` controlado por ThemeContext + script anti-FOUC inline en `<head>`.
- Tokens duales en `globals.css` (`[data-theme="light"]` y `[data-theme="dark"]` con paletas completas).
- Override por layout: `/dashboard` dark fijo, `/login`+`/register`+`/recuperar` light fijo. Resto respeta toggle.
- Toggle UI tri-state en Navbar dropdown (Auto · Claro · Oscuro).
- Tailwind `darkMode: ['selector', '[data-theme="dark"]']` para alinear `dark:` clases con tokens.
- Default mode = `Auto` (sigue `prefers-color-scheme` del OS).

Paleta light premium estilo Linear/Arc/Vercel/Apple — off-white #fafaf7 cálido, carbón #1a1d24, sombras editoriales — NO blanco utilitario.

### Archivos tocados
- `tailwind.config.ts` — darkMode selector.
- `src/app/globals.css` — tokens duales, body conditional gradient, helpers.
- `src/contexts/ThemeContext.tsx` — API tri-state {mode, resolved, setMode} con aliases legacy.
- `src/contexts/__tests__/ThemeContext.test.tsx` — 10 tests nuevos.
- `src/components/Navbar.tsx` — segmented control 3 pastillas (commit aislado por protocolo).
- `src/components/ui/{Input,ErrorScreen,ShareSheet,Stepper,Toggle}.tsx` — eliminado Tailwind `dark:`.
- `src/app/layout.tsx` — script anti-FOUC + footer migration.
- `src/app/dashboard/layout.tsx` — nuevo (identidad dark fija).
- `src/app/{login,register,recuperar}/layout.tsx` — identidad light fija.
- `src/app/perfil/**`, `src/app/coach/**`, `src/app/{leaderboard,ranking,en-vivo,indices}/page.tsx`, `src/app/organizador/**`, `src/app/ronda-libre/**`, `src/app/{demo,importar}/**`, `src/app/admin/golf-ops/page.tsx` — hardcodes hex a tokens.
- `docs/ARQUITECTURA.md` — sección Theming.

### Verificación
- 17 commits, cada uno revertible. STOP explícito tras Navbar (commit 7) por protocolo PROTECCION ANTI-CAIDA.
- Tests: ThemeContext suite 10/10 nueva. Suite completa 5904/5904 verde end-to-end.
- TS 0 errores en cada paso.
- Build exitoso en cada paso.
- `grep "dark:" src` → 0 matches al cierre.
- Pre-push hook verde en cada push.

### Commits
1. `ab6db56` docs(theme): spec del toggle
2. `1c681ed` docs(theme): plan de implementación
3. `248b08c` refactor(theme): tokens duales + Tailwind darkMode
4. `e4418bd` refactor(ui): tokens en componentes shared, eliminar dark:
5. `12dfa36` test(theme): tests del ThemeContext (TDD red)
6. `f88fdfa` feat(theme): ThemeContext tri-state + aliases legacy
7. `9136fa2` feat(theme): tri-state toggle en Navbar dropdown
8. `ff5c40c` feat(theme): script anti-FOUC + identidad fija dashboard/auth
9. `d5e2f4f` refactor(perfil): tokens en /perfil
10. `54868da` refactor(perfil): tokens en historial
11. `ee719bf` refactor(perfil): tokens en stats
12. `1bdc2ff` refactor(coach): tokens en /coach
13. `0b2a0df` refactor(theme): tokens en pantallas de competencia
14. `aa0b619` refactor(organizador): tokens en organizador
15. `2529873` refactor(ronda-libre): tokens en scoring (4 archivos)
16. `ecaceec` refactor(theme): tokens en demo, importar, admin
17. `dce7157` refactor(theme): :root fallback light en vez de dark

### Decisiones cerradas
Ver `docs/superpowers/specs/2026-04-28-toggle-light-dark-auto-design.md` §9 y plan en `docs/superpowers/plans/2026-04-28-toggle-light-dark-auto.md`.

### Out of scope (sprints futuros)
- Sincronizar theme preference con BD del usuario (multi-device).
- Animar transiciones entre modos.
- Modo "tournament" alto contraste para uso bajo sol.
- Auditoría WCAG AA en ambos modos.

---

## Sesión 28 Abr 2026 — Cross-validation canchas + fix slope FedeGolf

**Problema**: tras la migración 026 que renombró `course_holes.yardaje_campeonato → yardaje_negras` y normalizó tees por género, quedó pendiente `course_tees.nombre`. El sync `sync-courses-unified.ts` seguía guardando los tees como singular masculino (`'negro'`), mientras la UI envía plural Chilean Spanish (`'negras'`) post-026. Resultado: la función `cargarCourseData()` hacía `ILIKE 'negras%'` que NO matcheaba con `'negro'` en BD, caía al fallback `courses.slope_rating` (que para FedeGolf es placeholder universal `113`), produciendo course handicaps subestimados (~−4 strokes) para jugadores con tee Negras en cancha FedeGolf. Impacto histórico medido: 3 jugadores con tee `negras` en rondas libres FedeGolf calcularon HCP con slope falso. 0 torneos afectados (no había torneos sobre canchas FedeGolf todavía).

**Causa raíz adicional**: `course_tees.nombre` tenía 4 capas de inconsistencias:
1. FedeGolf con `'negro'` singular vs UI `'negras'` plural
2. Manual con aliases en inglés (`'Blue'`, `'White'`, `'Red'`, `'Black'`) duplicando filas en español del mismo color (4 canchas, 11 filas duplicadas: Lomas de La Dehesa, Los Leones, Prince of Wales, Sport Francés)
3. Manual con sinónimos inconsistentes (`'campeonato'`, `'blancas'`, `'azules'`)
4. FedeGolf con capitalize inicial (`'Rojo'`, `'Blanco'`, `'Azul'`, `'Dorado'`) vs manual lowercase

**Solución**:

### Migración 030 (`supabase/migrations/030_normalize_course_tees_nombres.sql`)
- DEDUP: borra filas que tras normalizar colisionarían en `(course_id, nombre)` UNIQUE — 11 filas borradas
- RENAME simples: 5 mapeos canónicos en una pasada (case-insensitive)
  - `negro|negra|black|championship|campeonato → negras`
  - `blue|azules → azul`
  - `blanca|blancas|white → blanco`
  - `roja|rojas|red|ladies → rojo`
  - `dorada|gold|yellow|amarillo → dorado`
- RENAME compuestos (con underscore): preserva el sufijo loop con REGEXP_REPLACE en prefijo
  - `negro_sur_este → negras_sur_este` etc.
- LOWERCASE final: forzar minúscula en los 5 simples para eliminar capitalize residual
- Idempotente: re-ejecutar no produce cambios

### Fix sync (`src/scripts/sync-courses-unified.ts:154-167`)
Reemplazado `normTeeName()` que hacía `replace(/s$/, '')` (singular hack) por mapping canónico explícito alineado con migración 030. El sync no inserta tees nuevos (solo UPDATE), así que el riesgo de regresión era bajo, pero el fix previene desincronización futura si la lógica de matching cambia.

### Doc canónico (`docs/ARQUITECTURA.md`)
Sección nueva "Modelo de canchas — FUENTE DE VERDAD" con jerarquía Club → Recorrido → Hoyo → Tee, asignación de tees por categoría WHS (Negras/Azul/Blanco/Dorado/Rojo por HCP/edad/género), mapeo conceptual ↔ BD actual con la deuda de duplicación DAMAS/VARONES, 7 reglas de validación y target del refactor futuro (tabla `clubs` + `recorridos` + `tees` con CR/slope por género en una fila).

**Archivos tocados**:
- `supabase/migrations/030_normalize_course_tees_nombres.sql` (nuevo)
- `src/scripts/sync-courses-unified.ts` (normTeeName)
- `docs/ARQUITECTURA.md` (sección Modelo de canchas)
- `docs/SPRINT_LOG.md` (esta entrada)
- `.claude/projects/.../memory/reference_modelo_canchas.md` (nuevo)
- `.claude/projects/.../memory/feedback_canchas_damas_varones.md` (nuevo)

**Verificación end-to-end**:
- `npx tsc --noEmit`: 0 errores
- `npm run test`: 5904/5904 pass (321 archivos)
- `npm run build`: OK
- Auditoría funcional `cargarCourseData` lookup contra BD producción:
  - tee=negras: antes 0/137 canchas FedeGolf matcheaban, ahora **25/137** ✅
  - tee=rojo: 135/137 (sin cambio)
  - tee=azul: 77/137 (sin cambio)
  - tee=blanco: 80/137 (sin cambio)
  - tee=dorado: 40/137 (sin cambio)
- Tees totales post-migración: fedegolf 357 (sin pérdidas) + manual 113 (124 − 11 dedup) = 470
- Distribución canónica: rojo 153 + azul 98 + blanco 98 + dorado 45 + negras 32 = 426 simples + 44 compuestos manual

**Pendientes / Brechas detectadas (NO bloqueantes para este sprint)**:
- 7 canchas FedeGolf con `par_total ≠ SUM(course_holes.par)` — incluyendo C.G. 7 Rios (par=0, fila legacy a borrar) y 2 canchas con 36 hoyos cargados (Bahia Coique DAMAS, Santa Martina Verde DAMAS — duplicados a deduplicar)
- 19 canchas manual con SI duplicado (regla R3 falla — calidad de carga manual)
- 51 canchas FedeGolf sin course_rating
- 0 fotos / 0 coordenadas en las 137 FedeGolf
- `courses.slope_rating = 113` placeholder para todas las FedeGolf — funciona como fallback intencional cuando lookup de tee falla; documentado en `docs/ARQUITECTURA.md`
- Modelado redundante DAMAS/VARONES — 137 filas FedeGolf representan ~68 canchas físicas reales

---

## Sesión 23 Abr 2026 — Saneamiento pre-handoff + fixes CI

**Problema**: tras el audit UI/UX cerrado el día anterior, el proyecto no tenía CI, baseline de cobertura, runbooks ni ADRs — falta handoff pack para CTO humano. En paralelo, primer run del CI creado falló por dos issues ortogonales (side effects a module-load y pool de vitest).

**Solución**: sesión de corrido en modo CTO, 18 commits puros a origin/main, en 3 fases.

### Fase 1 — Handoff pack (commits bdf0f7b → b596ed7, 2026-04-23 noche)
- `bdf0f7b` npm audit fix → CRITICAL protobufjs parchado + 6 transitivas
- `ea3695e` CI GitHub Actions: tsc + tests + build + audit
- `1033a16` 6 runbooks operativos (`docs/RUNBOOKS/`)
- `a96efaa` 10 ADRs clave (`docs/ADRs/`)
- `386d4a4` DIAGRAMA_SISTEMA.md + TECH_DEBT.md + scripts/README.md
- `a3db720` refactor(golf): motor 100% puro (sin imports React/Next)
- `1b4ee4a` logger consolidado en src/utils/logger.ts con Sentry
- `521bb19` ESLint expandido (no-console, no-restricted-imports golf)
- `d7ea2a5` archivar 3 docs one-off a docs/archive/
- `f78dc1a` coverage baseline + thresholds iniciales
- `b596ed7` planes Next 15 upgrade + refactor God Objects

### Fase 2 — Fixes CI (commits 0204a2f → 49c8f80, 2026-04-23 mañana)
Primer run falló en job `Verificación`. Diagnóstico + fix:
- `0204a2f` VAPID keys sintácticamente válidas en workflow + audit no-bloqueante
- `ca1f6f3` refactor(push): setVapidDetails lazy init — causa raíz 1er fail
- `49c8f80` fix(ci): pool vitest condicional — forks en CI, vmThreads en dev local

### Fase 3 — Cobertura lógica core + recalibración (commits b5123fc → 86786fb, 2026-04-23 tarde)
- `b5123fc` 12 tests para cargarCourseData → course-handicap.ts 9.52% → 100%
- `86786fb` recalibrar baseline coverage: real 27.62% (no 76.88% inicial — error de medición)

**Archivos nuevos**:
- `.github/workflows/ci.yml`
- `docs/RUNBOOKS/` (7 archivos) · `docs/ADRs/` (11 archivos)
- `docs/audits/2026-04-23-revision-completa.md` · `2026-04-23-coverage-baseline.md`
- `docs/DIAGRAMA_SISTEMA.md` · `docs/TECH_DEBT.md` · `scripts/README.md`
- `docs/superpowers/plans/2026-04-23-upgrade-next-15.md` · `-refactor-god-objects.md`
- `src/utils/logger.test.ts` · `src/__tests__/cargar-course-data.test.ts`

**Archivos modificados**:
- `vitest.config.ts` · `.eslintrc.json`
- `src/golf/core/colors.ts` (pureza) · `src/utils/logger.ts` (Sentry)
- `src/app/api/push/send/route.ts` (lazy init)

**Verificación**:
- tsc --noEmit: 0 errores
- vitest: 5674/5674 passing (5662 + 12 nuevos)
- build local: OK sin VAPID envs (test lazy init)
- CI=true vitest: OK (pool forks)
- Coverage real baseline: 27.62%

**Commits pusheados**: 18 en main
**Estado CI**: tras los 3 fixes (commit más reciente 86786fb) pendiente confirmación del próximo run.

**Pendientes documentados (requieren QA humano o sprint dedicado)**:
- P0-2 Next.js 14 → 15 upgrade (plan en docs/superpowers/plans/)
- P1-1/2 Refactor God Objects ronda-libre/** (plan separado)
- P0-4 Baseline Lighthouse
- QA visual 38 fotos audit vs producción (solo Juanjo)

---

## Sesión 23 Abr 2026 — Players pending_user_id + torneo demo completo (Opción G)

**Fecha:** 23 Abr 2026
**Estado:** ✅ DESPLEGADO — torneo demo muestra 8 jugadores reales en leaderboard
**Alcance:** Migration 029 + seed + queries. 2 commits puros.

### Problema
Roadmap #23 (torneo demo vacío): el `/torneo/demo-copa-chile-2026` quedaba como shell sin jugadores porque `players.user_id` era NOT NULL con FK a profiles. Crear 8 fake auth users (Opción B) ensuciaba auth.users permanentemente. Schema custom (Opción C) duplicaba lógica.

### Solución (Opción G — recomendación CTO)
Extender el patrón `pending_user_id` de `ronda_libre_jugadores` a `players`. Unifica arquitectura, cero polución de auth, desbloquea feature "invitado en torneo de club" (caso real chileno pendiente).

### Cambios
**Migration 029 (aplicada en prod vía Management API, HTTP 201):**
- `players.user_id` nullable
- `+pending_user_id UUID`, `+player_name TEXT`
- CHECK constraint `players_identity_check`: XOR user_id / pending_user_id
- Index parcial + UNIQUE parcial (tournament_id, pending_user_id)

**Seed demo torneo (8 jugadores):**
- `scripts/seed-demo-torneo-players.sql`
- Mismos nombres/HCPs/tees que DEMO01 ronda libre (coherencia visual)
- 8 rounds in_progress + 96 hole_scores (12 hoyos por jugador)
- Scores realistas 44-63 totales, ranking por skill
- Idempotente con ON CONFLICT DO NOTHING

**Queries torneo (spectator + TV):**
- DBPlayer / DBPlayerRaw interfaces `+player_name: string | null`
- SELECTs agregan player_name al query
- Render cascade: `profiles?.name ?? player_name ?? 'Jugador'`
- WD/DQ section también resuelve via cascade

### Commits
- `4cd1edc` feat(players): schema pending_user_id — unifica patrón invitado con ronda libre
- `5ef5931` fix(torneos): render player_name cuando user_id es NULL (invitados)

### Verificación
- tsc 0 · 5655 tests pass · build OK
- Smoke test /torneo/demo-copa-chile-2026 → HTTP 200 tras deploy
- DB: 8 players + 8 rounds + 96 hole_scores en torneo demo

### Observaciones
- La decisión entre Opciones A/B/C/G tomó un round de discusión con PM. Opción G ganó porque evita deuda técnica y desbloquea feature futura del roadmap (invitados en torneo de club).
- Re-usar el patrón existente (pending_user_id) en lugar de inventar uno nuevo es la jugada arquitectónica elite por consistency + DRY.

---

## Sesión 22 Abr 2026 (AM) — Sprint 4 F · Última Ronda Express

**Fecha:** 22 Abr 2026, mañana
**Estado:** ✅ DESPLEGADO en producción
**Alcance:** Brainstorm completo + spec + mockup V6 + implementación + push. 2 commits puros.

### Problema
Feedback real de golfistas sobre el flujo post-ronda: "quiero ver la ronda de hoy ULTRA rápido cuando estoy en el restaurant del club con amigos, el teléfono va de mano en mano". La vista `/perfil/historial` existía pero exigía navegación; no había entry point 0-click desde el dashboard.

### Solución
**UltimaRondaHero** (4º estado del hero contextual en Mi Golf) + **RoundHighlights** (bloque de resumen en el espectador finalizado). Cero rutas nuevas — se insertan en superficies que ya existen.

### Proceso
1. Brainstorming con el PM: 4 jobs priorizados (revisar rápido · ver desempeño · tarjeta Fedegolf · compartir). Descarte explícito de timeline/filtros/búsqueda/export PDF.
2. Spec V6 con decisiones de diseño: Playfair Display + DM Mono + gold. Patrón HeroProximo replicado. Paleta Garmin Formato 2 en activity bar.
3. Mockup V6 interactivo (`docs/demos/ultima-ronda-express-mockup.html`) — iteración visual antes de código, auditoría matemática stamp visible, responsive mobile + phone frame real.
4. Plan TDD 12-task (`docs/superpowers/plans/2026-04-21-ultima-ronda-express-plan.md`) con código exacto.
5. Ejecución inline con `executing-plans`.

### Commits en producción
```
3d7c2df feat(ronda): RoundHighlights en espectador finalizado
9d48233 feat(mi-golf): UltimaRondaHero — 4º estado del hero contextual
```

**UltimaRondaHero (commit `9d48233`, 6 archivos, +302/−7 LOC):**
- `src/lib/mi-golf/types.ts` — `HistoricalRound` gana `scores?` y `parPerHole?` (opcionales, no rompe fixtures).
- `src/app/dashboard/page.tsx` — SELECT amplía a `par_per_hole, scores`. Normalize snake→camel. Enrichment de `finishedRondas`.
- `src/components/mi-golf/CompetenciaTab.tsx` — Props actualizado + 4º estado en hero ternary.
- `src/lib/mi-golf/ultima-ronda.ts` + test — `getUltimaRondaReciente(rondas, fechaHoy)` helper puro. 5 tests: vacío, ninguna hoy, una hoy, múltiples, comparación ISO estricta.
- `src/components/mi-golf/UltimaRondaHero.tsx` — React component. Activity bar degrada silenciosamente si no hay scores.

**RoundHighlights (commit `3d7c2df`, 4 archivos, +591 LOC):**
- `src/lib/ronda/round-highlights.ts` + test — `computeHighlights(scores, parMap, totalHoles)` helper puro. 7 tests incluyendo invariante matemática (fixture del mockup V6 con 2 birdies + 7 pars + 6 bogeys + 3 dobles = +10 exacto).
- `src/components/ronda/RoundHighlights.tsx` — Big bar Ida/Vuelta, Mejor/Peor con tag italic, breakdown 5 columnas.
- `src/app/ronda-libre/[codigo]/page.tsx` — render condicional arriba del winner card cuando `isFinished && currentUserId && myPlayer`.

### Granularidad V1 (documentada en el spec)
- UltimaRondaHero se activa con `fecha === fechaHoy` (Santiago TZ), no ventana horaria precisa. `rondas_libres` no tiene `finalized_at` timestamp. V2 puede refinar con migración si data de uso lo pide.

### Prohibiciones del design system (validadas en V6)
- ❌ Sin stars/pulse dots/icon badges con tints/dot-bullets decorativos/gradientes radiales.
- ✅ Playfair Display solo para números hero y tags italic.
- ✅ DM Mono para labels/metadata.
- ✅ Gold #c4992a como brand accent medido.
- ✅ Paleta Garmin Formato 2 exclusivamente para data vsPar.

### Verificación
- `tsc --noEmit` → 0 errores.
- `npx vitest run` → **1131 passed** (+12 vs baseline: 5 ultima-ronda + 7 round-highlights).
- `npm run build` → exitoso.
- Smoke test HTTP `/dashboard` → 307 Temporary Redirect (middleware activo, auth redirect correcto).
- Cero archivos protegidos tocados (Navbar, layout, middleware, supabase.ts).

### Documentos
- Spec: `docs/superpowers/specs/2026-04-21-ultima-ronda-express-design.md`
- Plan: `docs/superpowers/plans/2026-04-21-ultima-ronda-express-plan.md`
- Mockup: `docs/demos/ultima-ronda-express-mockup.html`

### Observaciones para sesiones futuras
- Trigger stale `trig_016xV5NqVEh83TJSEpx1pmbe` creado temprano (cron `0 7 22 4 *`) pero next_run quedó en 2027 porque ya era pasado. Disable manual en https://claude.ai/code/scheduled/trig_016xV5NqVEh83TJSEpx1pmbe.
- Feedback persistente guardado en memoria `feedback_usuario_premium.md`: "golfistas exigentes de clubes chilenos · cero ornament infantil · auditoría matemática de cada número · coherencia con sistema shippeado".

---

## Sesión 21-22 Abr 2026 — Cierre técnico del roadmap pre-lanzamiento

**Fecha:** 21-22 Abr 2026 (sesión nocturna paralela a Mi Golf v2 de Juanjo)
**Estado:** COMPLETO — roadmap técnico cerrado salvo 2 acciones manuales pendientes de Juanjo
**Commits:** 20 en main (+ seed aplicado en prod vía Management API)

### Problema
El roadmap `docs/roadmap-camino-100.md` tenía 22 items P0/P1/P2/P3. A la mañana del 21-abr quedaban ~13 sin resolver cubriendo coach gate, offline resilience, visual consistency, imports, multi-loop correctness, iOS push, ranking real, y demo rebuild.

### Shipped (por categoría)

**P0/P1 funcionalidad core:**
- **Coach IA gate (3 rondas mínimo)** — `api/taiger/chat` 403 si <3 rondas; UI redirige con mensaje "Subí tus tarjetas". Defense-in-depth en 4 capas.
- **Offline resilience** (4 gaps cerrados) — patrón ronda-libre portado a `/torneo/score` + `/score-grupo`: localStorage backup + 3 retries + auto-sync on reconnect. Anti-race en finalizar: bloquea si `scoreSync.tienePendientes()`. OfflineBanner global con contador "N hoyos en cola".
- **Signup white theme + pro typography** — palette blanca coherente con NuevoTorneoForm. Playfair 30px, DM Mono labels uppercase, inputs con focus ring dorado.
- **Navbar ranking fix** — quitar link a `/leaderboard` demo; después re-linkearlo a nueva `/ranking` real.
- **Garmin palette unificada** (P1 #10) — +`getScoreColor` / `getScoreColorLight` helpers canónicos. Fix en `constants/golf.ts` SCORE_COLORS (4 de 5 valores estaban mal). Reemplazos en TeamLeaderboard, MobileLeaderboard, ronda-libre spectator.
- **Imports formato/modo** (P2 #13) — `ImportRoundData` acepta `formato_juego` y `modo_juego` opcionales. UI en StepReview con 2 selectores aplicados al batch. Stableford/Match Play fuerzan neto (regla R&A).
- **Multi-loop × per-player tees** (P2 #16) — 5 bugs identificados, 3 must-fix + 1 visual cerrados:
  - BUG #5: `cargarCourseData` combina CR/Slope de children por `recorridos[]`
  - BUG #1: migration 027 (`rondas_libres.recorridos` schema drift)
  - BUG #2: `HoleData.yardajes` map + `getYardajeForTee` helper
- **Push iOS Safari** (P2 #14) — `getPushSupportStatus()` distingue `ios_too_old` vs `ios_not_pwa`. UI muestra instrucciones Safari → Compartir → Añadir a pantalla de inicio.
- **WD/DQ transparencia USGA** (P1 #8) — query paralela WD/DQ + sección "No compiten por posición" al pie de `/torneo/[slug]` spectator y `/tv` con badges.

**P3 rebuilds visuales:**
- **Ranking real** (P3 #20) — nueva `/ranking` con top 50 por `indice_golfers` / `indice` federación, nivel badges (Rookie → Golfer+ con colores progresivos), podio top 3 con borde dorado.
- **Demo rebuild completo** (P3 #21) — arquitectura elite: reciclar la app real. Migration `028_es_demo_column.sql` + RLS anti-escritura + seed SQL con 1 torneo + 1 ronda + 8 jugadores fake. Guards redirigen `/score` a spectator para records demo. Nuevo `/demo/page.tsx` hub con 4 cards a URLs reales.

**Infra + testing:**
- **45 tests regresión** — cobertura para `getScoreColor/Light`, `getYardajeForTee`, `getPushSupportStatus` (mocking user-agent + matchMedia).
- **Seed aplicado en prod** vía Supabase Management API (HTTP 201). DEMO01 linkeado a Los Leones (VARONES) `course_id`. RLS verificada bloqueando PATCH anon.

### Commits principales
- `49fe728` test(core): cobertura para Garmin + yardaje + iOS push
- `96c2d96` fix(colors): unificar paleta Garmin en leaderboards y spectator
- `e028f3f` feat(imports): user elige formato+modo al importar rondas históricas
- `0027f75` fix(multi-loop): combinar CR/Slope per-recorrido + schema drift
- `41defec` fix(multi-loop): yardage per-player tee — BUG #2 #16 P2
- `fe3af49` feat(push): soporte iOS Safari — detección de versión + gate PWA
- `012f76d` feat(ranking): nueva página /ranking — top 50 Golfers+ real
- `1652f4f` feat(demo): schema es_demo + seed SQL — infraestructura
- `0e70a94` feat(demo): guards redirigen score pages a spectator
- `b912bbd` feat(demo): nueva /demo hub con 4 cards a pantallas reales
- `29e99a6` fix(demo): linkear DEMO01 a Los Leones course_id
- `bbaa67c` feat(torneos): mostrar jugadores WD/DQ en leaderboard público

### Validación
- `npx tsc --noEmit`: 0 errores
- `npm test`: 1119/1119 verdes
- `npm run build`: OK
- Pre-push hook passed en todos los pushes
- 20+ deploys Vercel Ready

### Pendientes al cierre
**Técnico menor**:
- Torneo demo sin jugadores (opción B fake auth users o A shell — decisión abierta)

**Acción manual Juanjo**:
- #3 `GEMINI_API_KEY` en Vercel (OCR silenciado desde 9 abr)
- #18 Secrets rotation (Security audit abril)

### Qué aprendimos
- Recolectar los gaps críticos en auditorías por archivo antes de tocar código evita re-trabajo — 5 bugs en multi-loop se cerraron en un solo commit gracias a audit previo.
- Demo que recicla componentes reales + seed data + guards es estrategia escalable; evita paralelismo entre demo UI y real que divergen con el tiempo.
- Management API (sbp_* PAT token) permite aplicar migrations y seeds contra prod sin CLI login, útil para operaciones de CTO remoto.

---

## Sesión 21 Abr 2026 — Mi Golf v2 (swap limpio)

**Fecha:** 21 Abr 2026
**Estado:** COMPLETO — swap limpio v1 → v2 en producción
**Commits:** 9 en main + spec/plan docs

### Problema
La v1 del rediseño (shippeada 2026-04-20) tenía problema de jerarquía según feedback de Juanjo: "mucha información sin orden". Los tabs Competencia/Identidad funcionan conceptualmente pero el contenido y formato eran densos y desordenados.

### Solución (spec `2026-04-21-mi-golf-v2-design.md`)
**Competencia:**
- Hero contextual con 3 estados explícitos (en juego · próximo compromiso · sin actividad)
- HCP siempre visible en el greeting (no hay que ir a Identidad para verlo)
- Acciones renombradas: `Nueva ronda · Organizar torneo · Unirme con código` (sin ambigüedad)
- Sin emojis chillones (🏆 fuera)
- Torneos separados por rol con sub-labels: `Jugando en` · `Organizando` · `Finalizados recientes`
- Rondas recientes con fechas contextuales (`Hoy · Ayer · Martes · Domingo pasado`)
- Sin rojo castigador: solo verde `↑ Tu mejor del mes` para resaltar mejoras, resto neutro

**Identidad:**
- Hero limpio: número gigante del índice + nivel + distancia al siguiente (sin arc gauge redundante)
- Barra de 5 niveles (Novato → Amateur → Intermedio → Avanzado → Scratch) como medidor visual único
- Solo 2 barras de progreso a metas REALES (calibración del índice, desbloqueo tAIger+)
- "Tu juego": 4 stats de identidad (mejor score, cancha favorita, rondas jugadas, promedio últimas 5) en lista sobria estilo membresía
- tAIger Coach: línea contextual derivada de fuentes priorizadas (tendencia > cerca de nivel > uso > fallback)

### Swap limpio
Sin feature flags, sin `-v2` en nombres. Reescritura en-sitio de los 4 archivos del rediseño + page. Los tests de `tendencia.ts` y `stats.ts` se mantienen sin cambios.

**Archivos nuevos (con tests TDD):**
- `src/lib/mi-golf/niveles.ts` — sistema de 5 niveles + `getNivel()` + `NIVELES_ORDEN`
- `src/lib/mi-golf/mejor-del-mes.ts` — `esMejorDelMes()` para resaltar en verde
- `src/lib/mi-golf/taiger-line.ts` — `getTaigerLine()` con fuentes priorizadas

**Archivos reescritos completamente:**
- `src/components/mi-golf/CompetenciaTab.tsx` — 480 líneas
- `src/components/mi-golf/IdentidadTab.tsx` — 203 líneas
- `src/app/dashboard/page.tsx`

**Archivos eliminados:**
- `src/lib/mi-golf/insights.ts` + test (reemplazado por `taiger-line.ts` más simple y real)
- `src/components/mi-golf/EmptyStateOnboarding.tsx` (absorbido por hero vacío)

### Decisiones CTO fijadas en el spec
1. **Rangos de niveles** (USGA adaptado chileno): Scratch 0-3, Avanzado 3-10, Intermedio 10-18, Amateur 18-28, Novato 28+.
2. **Radar chart FUERA** de v2 — no hay data real por dimensión (drive, putting, etc.). Se agrega cuando el scorer capture esa data.
3. **Sin métricas inventadas**: "62% mejor que golfistas de tu nivel" y similares están prohibidas.
4. **Solo verde** para destacar mejoras. El rojo castigador eliminado.
5. **Sin localStorage para persistencia de tab** — siempre abre Competencia.

### Verificación
- tsc: 0 errores
- Tests: 1105 passing (se borraron los 5 de insights, se agregaron 21 nuevos: 9 niveles + 4 mejor-del-mes + 8 taiger-line)
- Build: exitoso, `/dashboard` marcado como `ƒ (Dynamic)` (10.6 kB)
- Pre-push hook: OK

### Documentos
- Spec: `docs/superpowers/specs/2026-04-21-mi-golf-v2-design.md`
- Plan: `docs/superpowers/plans/2026-04-21-mi-golf-v2-swap.md`

---

## Sesión 21 Abr 2026 (madrugada) — Sprint 3 E completo (A1+A2+A3 en score-grupo)

**Fecha:** 21 Abr 2026 (00:00–01:00 CL)
**Estado:** ✅ DESPLEGADO en producción
**Alcance:** 3 mejoras UX del audit de score-grupo, cada una en commit separado.

### A1 — Anti-toque accidental (commit `f27ef03`, parte 1)
Captura inicial (hoyo vacío): 1 tap sin fricción. Cambio sobre un score ya existente: primer tap muestra "Tocá otra vez para cambiar el score" + haptic doble + botones +/− en estado dorado pulsante (reutiliza keyframe `livePulse`). Segundo tap dentro de 2s commitea; después de 2s se auto-resetea. Al cambiar de hoyo se limpia el pending. Evita que un toque con guante en pleno sol destruya silenciosamente un score ya guardado.

### A2 — Save inmediato por jugador con debounce (commit `f27ef03`, parte 2)
`saveSinglePlayer(jugadorId, scores)` con 3 retries + backoff 400/800/1200ms. Cada `handleScoreChange` agenda un save 500ms después del último tap (los spam de +/− colapsan en 1 sola llamada al final). `saveStatus` refleja saving → saved → idle con el indicador de 3px ya existente. `hasUnsaved` se limpia al completarse el save. `goToNextHole` conserva `saveAllScores` como safety net. Cleanup de timers al desmontar.

### A3 — Edit window de 3s (commit `67ce877`)
Tras un cambio confirmado, abre una ventana de 3s sobre ese mismo jugador/hoyo donde taps sucesivos commitean directamente sin re-pedir confirmación. Cada nuevo tap dentro del window renueva el timer. Pasados 3s sin taps, la siguiente modificación vuelve a exigir 2-tap. Resultado: correcciones iterativas (9 → 4) requieren 2 taps + 3 taps de ajuste (5 total), en lugar de 4 pares de confirmar+commit (8 total). Zero nuevas UI — solo refs internos.

### Foursome stableford — NO es un bug
El audit del 20-abr mencionó "foursome stableford con `handicap_equipo` null usa 0 strokes". Investigado: el bloque de render de equipos en score-grupo solo aplica a scramble/foursome (línea 857), y el check `formatoJuego === 'stableford'` dentro de ese bloque es dead code defensivo — stableford nunca coincide con un formato de equipo. En el CREATION flow, `scramble` calcula handicap vía fórmula USGA (35% lower + 15% higher) y `foursome` lo calcula como promedio; nunca quedan null. Best_ball es el único que deja null, pero no usa `handicap_equipo` (usa handicaps individuales). No hay bug que arreglar.

### Pendiente para futuras sesiones
- **A4** — concurrent realtime en score-grupo (2 anotadores simultáneos en mismo grupo). Requiere merge de state remoto con local + manejo de localStorage + tests de conflicto. Scope ~1-2h. Low urgency (edge case raro).
- **Sprint 4 F** — Mis rondas (timeline, filtros por formato/cancha, búsqueda, export PDF/imagen). Feature nueva — merece brainstorming dedicado antes de implementar.

### Verificación
- `tsc --noEmit` → 0 errores en cada commit.
- `npm run test -- --run` → 1045/1045 tests.
- `npm run build` → producción compila en cada commit.
- Cero archivos protegidos tocados.

### Commits en producción
```
67ce877 feat(score-grupo): edit window de 3s para correcciones iterativas (S3E A3)
f27ef03 feat(score-grupo): anti-toque accidental + save inmediato por jugador (S3E A1+A2)
```

---

## Sesión 20 Abr 2026 (PM) — Históricas cleanup + Realtime espectador + Anotador visible

**Fecha:** 20 Abr 2026 (tarde/noche)
**Estado:** ✅ DESPLEGADO en producción
**Alcance:** 3 entregas secuenciales tras cerrar Sprint 1

### 1) Rondas Históricas — simplificación (commit `6a52e88`)
Solicitud del PM: eliminar el Sparkline de tendencia y dejar solo los cuadros de Personal Record 18h y 9h.

- Frontend `src/app/perfil/historial/page.tsx`: elimina función `Sparkline` (37 LOC de SVG), SECTION 2 completa, tipos `RecentScore` y `BestNine`. Reduce la grilla de Records de 4 a 2 tarjetas con labels "Personal Record 18 hoyos" y "Personal Record 9 hoyos".
- API `src/app/api/historial/stats/route.ts`: deja de computar `recentScores18`, `bestFront9` y `bestBack9` (menos trabajo por request, payload más chico).
- Neto: −120 LOC, +4 LOC.

### 2) Sprint 2 C — Supabase Realtime en espectador (commit `8aedf67`)
Reemplaza el polling de 15s del leaderboard en vivo por una suscripción Realtime a `ronda_libre_jugadores`. El polling queda como **fallback** solo cuando Realtime está desconectado.

- Nuevo hook `src/hooks/ronda/useRondaRealtime.ts` + 7 tests con mock del cliente Supabase. Ref interna evita reiniciar suscripción en cada render.
- Integrado en `[codigo]/page.tsx`: `useCountdown.enabled` ahora depende de `!isRealtimeConnected` — deja de tickear cuando hay tiempo real.
- UI: "● En vivo" (verde, pulso con keyframe `livePulse` existente) cuando `isConnected=true`; barra de countdown solo visible en modo fallback. Copy "Tiempo real" vs "Auto-refresh" explicita el modo al usuario.
- Patrón ya probado en `MiniLeaderboard.tsx` desde sprint en-vivo; este commit extiende la suscripción al espectador principal.
- **Decisión CTO:** Sprint 2 B (offline queue IndexedDB) fue **omitido** — el commit `2dcc4b0` ya resolvió el problema con localStorage + 3 retries + auto-sync al reconectar + toast. Reescribir a IndexedDB sería over-engineering sobre un patrón validado en producción.

### 3) Sprint 3 E parcial — Identidad del anotador en score-grupo (commit `8c0436b`)
Audit UX detectó que en modo admin (anotador único scoreando a todo un grupo), la UI no indica **quién** es el anotador. Si el teléfono rota entre jugadores sin cerrar sesión, los demás no saben que están operando con la cuenta del otro.

- `src/app/ronda-libre/[codigo]/score-grupo/page.tsx`: nuevo state `anotadorNombre` derivado en el load sin query extra — busca al usuario autenticado en `r.ronda_libre_jugadores` por `user_id`, fallback al prefix del email, fallback final "Anotador".
- Header ahora muestra "Los Leones · ✏️ Juan" junto al nombre de cancha.
- Commit scopeado solo al archivo tocado.

### Resto del audit UX pendiente para futuros sprints
Del audit a `score-grupo`:
- **HIGH:** sin undo / sin "volver a hoyo anterior para corregir" (se puede swipear atrás pero no hay edición directa).
- **MED:** `handleScoreChange` sin confirmación (toque accidental con guante).
- **MED:** `saveStatus` no se actualiza inmediatamente tras `handleScoreChange` (lag visible hasta `goToNextHole`).
- **MED:** no hay sync realtime entre anotadores concurrentes en el mismo grupo.
- **LOW:** foursome stableford con `handicap_equipo` null usa 0 strokes (bug en CREATION flow, no en display).

### Sprint 4 F (Mis rondas timeline + filtros + export) — diferido
Feature nueva (no refactor). Requiere brainstorming dedicado para scope de timeline, filtros, búsqueda y formato de export. Se abordará en una sesión siguiente.

### Verificación
- `tsc --noEmit` → 0 errores en cada commit.
- `npm run test -- --run` → 1045/1045 tests (+14 nuevos: 7 `useRondaRealtime`, 7 `useCountdown`).
- `npm run build` → producción compila en cada commit.
- Cero archivos protegidos tocados (Navbar, layout, middleware, supabase.ts).

### Commits en producción
```
8c0436b feat(score-grupo): mostrar identidad del anotador en header
8aedf67 feat(ronda): Supabase Realtime en espectador (Sprint 2 C)
6a52e88 feat(historial): simplificar a solo Personal Record 18h y 9h
```

---

## Sesión 20 Abr 2026 — Rondas Refactor Sprint 1 (extracción pura)

**Fecha:** 20 Abr 2026
**Estado:** EN CURSO — Sprint 1 avanzado, múltiples commits en `main`
**Plan:** [docs/superpowers/plans/2026-04-20-rondas-refactor-sprint-1.md](superpowers/plans/2026-04-20-rondas-refactor-sprint-1.md)

### Problema
Los 4 client components de `src/app/ronda-libre/` (nueva, `[codigo]`, score, score-grupo) sumaban 7384 LOC con lógica pura, hooks, UI y storage mezclados. Bloqueaba Sprints 2-4 (offline queue con IndexedDB, realtime, UX scorer grupo, históricas).

### Solución
Extracción pura sin cambio de comportamiento. Cada task = un commit independiente que pasa `tsc` + `test` + `build`. Si algo falla, se revierte ese commit y punto. Zero behavior drift = zero field risk.

### Commits cerrados (8)
| Commit | Qué extrae | Destino |
|--------|-----------|---------|
| `852a305` | Helpers puros (`generarOrdenHoyos`, `getVsPar`, `haptic`, `getChipStyle`, `buildTimelineEvents`, etc.) | `src/lib/ronda/helpers.ts` + tests |
| `3e08876` | `lsKey/lsSave/lsLoad/lsClear` — prepara queue IndexedDB para Sprint 2 | `src/lib/ronda/score-storage.ts` + tests |
| `41ac2df` | `ShareMenu` (bottom sheet con Web Share API + fallback WhatsApp) | `src/components/ronda/ShareMenu.tsx` |
| `37673fb` | `NotifBanner` | `src/components/ronda/NotifBanner.tsx` |
| `ad76188` | `AuthModal` | `src/components/ronda/AuthModal.tsx` |
| `8de5609` | `rankTeams()` — deduplicado del bloque duplicado en `[codigo]/page.tsx` | `src/lib/ronda/team-ranking.ts` + tests (3 formatos × 2 modos) |
| `7b797bf` | Hook `useOnlineStatus` | `src/hooks/ronda/useOnlineStatus.ts` |
| `c381d0a` | Hook `useCountdown` (prep Sprint 2 realtime swap) | `src/hooks/ronda/useCountdown.ts` |

### Regla de commits puros (violada y revertida)
`6d50b9a` — revert de un bloque anti-race que se coló en el commit T2. Violaba el scope de "refactor puro". Se revirtió en el mismo día. Regla: **un scope por commit, refactor NO se mezcla con fix/feature**.

### Archivos protegidos respetados
Ningún commit toca `src/components/Navbar.tsx`, `src/app/layout.tsx`, `src/middleware.ts`, `src/lib/supabase.ts`.

### Pendiente del sprint
Extracciones restantes (useRondaData, scoring hooks, data fetching) para cerrar Sprint 1 antes de arrancar Sprint 2 (offline queue con IndexedDB).

---

## Sesión 20 Abr 2026 — Resiliencia offline en flujos de scoring

**Fecha:** 20 Abr 2026
**Estado:** COMPLETO — commit `2dcc4b0` en `main`
**Impacto:** P0 — scoring de torneo sobrevive conectividad intermitente en cancha

### Problema
Los flujos de scoring (torneo individual, score-grupo/equipo, finalizar ronda) no manejaban pérdida de conexión de forma resiliente. Un jugador en cancha con 3G débil podía perder el score ingresado si la request fallaba.

### Solución
- Banner offline visible cuando `navigator.onLine === false`
- Persistencia local inmediata (localStorage) antes del POST a Supabase
- Reintento al recuperar conectividad
- Visual claro del estado (guardado local vs sincronizado)

### Archivos tocados
- `src/app/ronda-libre/[codigo]/score/page.tsx`
- `src/app/ronda-libre/[codigo]/score-grupo/page.tsx`
- `src/app/ronda-libre/[codigo]/finalizar/page.tsx`
- `src/components/OfflineBanner.tsx`

### Verificación
- tsc: 0 errores
- Tests: 1019/1019 (49 archivos)
- Build: exitoso tras `rm -rf .next` (workaround OneDrive/Windows EINVAL)

### Nota de deploy
Commit `2dcc4b0` bundled offline resilience **y** la extracción T3 (`score-storage.ts`). Violación suave de "commits puros" que causó fricción posterior: el deploy de Vercel falló por el módulo `@/lib/ronda/score-storage` faltante hasta que `3e08876` resolvió el import. Lección: aunque sean del mismo día, separar feature de refactor incluso cuando "es conveniente".

---

## Sesión 20 Abr 2026 — Rediseño "Mi Golf" con 2 sub-pestañas (Competencia + Identidad)

**Fecha:** 20 Abr 2026
**Estado:** COMPLETO — 10 tareas TDD, 11 commits en main
**Tests:** 965 → 1019 (+54 tests nuevos)

### Problema
La pestaña "Mi Golf" (`/dashboard`) era una única vista con fondo oscuro de 527 líneas que mezclaba lo transaccional (crear ronda, torneos) con lo reflexivo (índice, stats). Inconsistente visualmente con el resto de la app (Rondas tiene fondo blanco) y sin separación clara de intenciones.

### Solución
Separación en dos sub-pestañas con **fondo blanco** y tabs minimalistas estilo Apple (underline + badge dot):

- **Competencia** — "el golf que estoy jugando"
  - Hero contextual priorizado: `ronda_activa > torneo_hoy > torneo_7d > empty_state`
  - Acciones rápidas (3 píldoras): Nueva ronda · Organizar torneo · Unirme
  - Mis torneos separados por rol (Jugando / Organizando / Finalizados)
  - Últimas 3 rondas con link a pestaña Rondas (NO duplica `/perfil/historial`)
  - En Vivo de la comunidad
  - Empty state curado para usuarios nuevos (3 pasos onboarding)

- **Identidad** — "el golfista que soy"
  - Hero XL con Índice Golfers+ + flecha de tendencia 30d (`▲ 0.3`)
  - tAIger Coach card protagonista
  - Insight rotativo determinístico por día (hash `userId + fecha`, refresca a las 00:00 Chile)
  - Grid 2x2 stats: promedio últimas 5, mejor score, rondas jugadas, cancha más jugada
  - Progreso hacia próximos hitos con barra

### Archivos nuevos (10)
- `src/lib/mi-golf/types.ts` — tipos compartidos
- `src/lib/mi-golf/tendencia.ts` + test — tendencia 30d con umbral flat 0.2
- `src/lib/mi-golf/stats.ts` + test — promedio/mejor/cancha
- `src/lib/mi-golf/insights.ts` + test — selector determinístico con 5 generadores
- `src/components/mi-golf/MiGolfTabs.tsx` + test — Client Component switcher
- `src/components/mi-golf/EmptyStateOnboarding.tsx` — onboarding 3 pasos
- `src/components/mi-golf/CompetenciaTab.tsx` — Server Component
- `src/components/mi-golf/IdentidadTab.tsx` — Server Component

### Archivo modificado
- `src/app/dashboard/page.tsx` — 527 → 110 líneas (−417). Orchestrator con un único `Promise.all` que alimenta ambos tabs simultáneamente (data eager para instant-switch en campo con mala conexión).

### Fix colateral
`fix(mi-golf): stats.ts Map iteration` — Task 3 commiteó con `for...of` sobre Map que falla tsc (TS2802). Reparado con `forEach` sin activar `downlevelIteration`.

### Decisiones CTO (spec)
1. **Sin persistencia del tab activo** — consistencia en campo > smart default.
2. **Link torneos** a `/perfil/historial` existente, no crear ruta nueva (YAGNI).
3. **Insight determinístico por día** — crea ritual, reduce costo tokens, permite caché.
4. **Data eager con `Promise.all`** — desviación explícita del spec original (lazy-load) en favor de instant-switch en campo (3G/señal intermitente).

### Documentos
- Spec: `docs/superpowers/specs/2026-04-20-mi-golf-redesign-design.md`
- Plan: `docs/superpowers/plans/2026-04-20-mi-golf-redesign.md`

### Verificación
- tsc: 0 errores
- Tests: 1019/1019 (49 archivos)
- Build: exitoso, `/dashboard` marcado como `ƒ (Dynamic)` correctamente
- Sin warnings DYNAMIC_SERVER_USAGE

---

## Sesion 31 Mar – 1 Apr 2026 — Arquitectura de Torneos + Testing Exhaustivo

**Fecha:** 31 Mar – 1 Apr 2026
**Estado:** COMPLETO — 45 commits, 36 tests, 21+ páginas verificadas
**Bloques:** 8 bloques ejecutados (sesión de ~8h)

### Bloque 1-2: Diseño y Fase 1 de Torneos
- Arquitectura completa documentada en 4 fases (arch/diseño)
- Fase 1: scoring organizer mejorado, score max, net_score bug fix, terminología
- CHECK constraint violations al inscribir jugadores corregidas
- /ronda-libre/nueva protegida por middleware

### Bloque 3: Fase 2 — Inscripción y Grupos
- tournament_groups + afecta_estadisticas + código de inscripción
- Leaderboard de torneo con scores desde rondas libres vinculadas
- Inscripción por código visible en gestión de jugadores
- Fase 2 estabilización: dark mode, OUT/IN en grupo, confirmación finalizar

### Bloque 4: Fase 3 — Reglas de Golf BD + Countback
- golf_rules en BD (R&A oficial)
- Countback USGA implementado (últimos 9, 6, 3, 1)
- Hoja de salida generada desde grupos
- Admin scoring mejorado con edición directa

### Bloque 5: Fase 4 — Resultados y Multi-ronda
- Resultados de torneo con vinculación a historical_rounds
- Soporte torneos multi-día (multi-ronda)
- Formulario con selector de duración + API start_next_round
- Scoring con tabs por ronda + leaderboard acumulativo
- Gestión de grupos + iniciar/cerrar torneo en panel de jugadores

### Bloque 6: Mejoras UX y SEO
- tAIger+ activado: de "Próximamente" a coach funcional
- Golf Intelligence Labs con experiencia premium y PGA Tour examples
- Navbar reorganizado: avatar dropdown + menú sin scroll
- /indices como experiencia de contenido CPI, GWI e Índice Golfers+
- Neto y Stableford funcional en ronda libre + par validado 3-5
- Stableford: 5 puntos por albatross (USGA)
- SEO: metadata dinámica y OG tags para todas las páginas públicas
- Limpieza global: Handicap -> Índice, textos en español
- Seed course_holes estándar para 38 canchas + auditoría RLS
- Dashboard mejorado: torneos activos, última ronda con compartir, progreso de índice

### Bloque 7: Testing Exhaustivo (producción)
- 12/12 páginas públicas responden 200
- 9/9 páginas protegidas redirigen 307
- 4/4 APIs sin auth devuelven mensajes amigables en español
- Smoke test ronda libre: crear, 2 jugadores, scores JSONB, espectador 200, cleanup
- Smoke test tAIger+: 96 rondas históricas, 3 patrones, CPI 39.57
- 6/6 edge cases DB: HIO(1) OK, score 0 rechazado, score 19 OK, score 20 rechazado, duplicado rechazado, status inválido rechazado
- Health check: OK (supabase: true, 7ms)

### Bloque 8: Documentación
- Sprint log actualizado
- docs/ actualizados con script

### Métricas clave
- **45 commits** en la sesión
- **36 tests** pasando (5 suites)
- **21+ páginas** verificadas en producción
- **4 fases** de arquitectura de torneos completadas
- **0 errores** TypeScript

---

## Sesion 30 Mar 2026 (cont.) — Índice Dual + Sistema de Niveles + Estabilización

**Fecha:** 30 Mar 2026
**Estado:** COMPLETO — 11 commits

### Recuperación de sesión interrumpida
- Motor de notificaciones inteligente (shouldNotify)
- Celebraciones birdie/eagle integradas en score page
- Componentes con accesibilidad (ARIA, Escape key)

### Fixes de estabilización (del backlog 17 Mar)
- taiger/context filtra historical_rounds por user_id (P1)
- Middleware ya no logea datos sensibles en producción
- golf/coach/ completo: 7 pattern detectors + analyzeRound() real
- 45+ mensajes de error reescritos en español amigable (37 archivos)
- Eliminación de cuenta: de alert()/confirm() a UI branded con toasts

### Sprint Índice Dual + Niveles
- Migración SQL 010: indice_golfers, nivel, diferencial (con backfill)
- RPC calcular_indice_golfers() con fórmula USGA oficial
- src/lib/indice-golfers.ts: utilidades de cálculo
- 3 puntos de insert actualizados con slope/rating/diferencial:
  - Ronda libre (query a courses para obtener slope/rating)
  - Historial manual (lookup cancha por nombre)
  - Import Garmin (ya tenía slope/rating, se agrega diferencial)
- Post-save: recálculo automático de índice y nivel
- tAIger context: recibe indice_golfers + nivel + nota de gap
- UI /perfil: dos cards (Federación + Golfers+), badge nivel, gap note
- Label "Índice Federación" + hint de cálculo automático
- Profile types actualizados

### Testeo de producción
- 100% páginas OK, 100% APIs respondiendo correctamente
- Auth redirects 307, admin 403, scoring 401 — todos amigables

---

## Sesion 30 Mar 2026 — Sesion masiva: seguridad, Sentry, PostHog, UX, rebrand, golf module

**Fecha:** 30 Mar 2026
**Estado:** COMPLETO — 20+ commits

### Sprint 5 — Seguridad completado
- X-XSS-Protection header, CORS restrictivo en /api/en-vivo

### Sentry + PostHog activados en produccion
- Sentry: DSN configurado, instrumentation-client.ts, global-error.tsx
- PostHog: autocapture pageviews/clicks, respect DNT, sin IP tracking

### Bug critico corregido
- /api/en-vivo filtraba por 'in_progress' (no existe en BD) → corregido a 'en_curso'

### 10 mejoras UX para usuarios 60+
- Toast en errores (crear ronda, score, torneo) — antes: console.error invisible
- Pagina /recuperar contraseña nueva
- Tipografia Navbar mas legible (10→11px)
- Empty states mejorados (ronda no encontrada, en-vivo sin conexion, historial timeout)
- Registro expandido por defecto, copy sin marketing ni siglas
- Dashboard: onboarding explica GWI en lenguaje simple
- Toast responsive: bottom center, se adapta a mobile/desktop, con/sin cuenta

### Rebrand golfersplus.vercel.app
- 0 referencias a tu-golf.vercel.app en todo el proyecto
- Dominio golfersplus.vercel.app activo (tu-golf.vercel.app como backup)
- NEXT_PUBLIC_SITE_URL actualizado en Vercel, Supabase redirect URLs configurados

### Arquitectura src/golf/ — motor de reglas centralizado
- core/: rules, scoring, compare (NUEVO), colors
- formats/: stroke-play, stableford, GolfFormat interface extensible
- stats/: gwi, cpi, personal (NUEVO — stats con vsPar)
- courses/: types, data, matching
- coach/: prompts, patterns (stub), analysis (stub)
- 20 archivos migrados de src/lib/ shims a @/golf/ directo
- Bug fix: stats comparan por vsPar (no gross) — resuelve 9 vs 18 hoyos

### Sprint log sesion 29 Mar (retroactivo)
- 9 sprints del MAESTRO implementados (1,9,2,6,3,4,7,8)
- Sentry condicional (solo con DSN), cron Vercel ajustado a diario

---

## Sesion 25-26 Mar 2026 — Restauracion + Seguridad + Features

**Fecha:** 25-26 Mar 2026
**Estado:** COMPLETO

### Incidente y restauracion
- App caida por refactor del Navbar (async en onAuthStateChange)
- Causa raiz identificada, Navbar restaurado con fix minimo
- Funcionalidades perdidas re-aplicadas (admin al login, limite 500, ?add=true)
- Post-mortem documentado en docs/POSTMORTEM_2026-03-25.md

### Barreras anti-caida
- Pre-push hook: bloquea push si tsc/tests/build fallan
- 15 tests canario: detectan patrones peligrosos en archivos criticos
- Protocolo de archivos protegidos en CLAUDE.md
- Ya salvo un push con error de ESLint en esta misma sesion

### Monitoreo Fase 1
- /api/health: endpoint publico para monitoreo externo
- /api/cron/health-check: cron cada 5 min con historial en BD
- SystemStatusBanner: banner automatico cuando app degradada
- error-logger.ts: utilidad de logging a BD
- vercel.json con crons configurados

### Sprint seguridad (13 fixes del audit)
- 5 P0 criticos: push/send y debug-auth ya tenian auth, RLS fixes ejecutados, CSP documentado
- 8 P1 altos: GWI clamp, VAPID validation, GWILeaderboard guard, HSTS ya aplicado
- src/sql/rls-fixes.sql ejecutado en BD

### Historial v2
- Diseno premium con stats reales via /api/historial/stats
- Sparkline SVG con ultimos 20 scores
- Records grid 2x2 (mejor 18h, 9h, front/back 9)
- Rondas agrupadas por mes, scores coloreados por vsPar

### Canchas chilenas
- 10 canchas cargadas con 180 hoyos (par + stroke index)
- Granadilla, Los Leones, La Dehesa, Prince of Wales, Sport Français
- Las Brisas, Rocas, Cachagua, Marbella, Campo del Pacifico
- SQL idempotente en src/sql/seed-canchas-chilenas.sql

### Admin de Ronda
- Toggle "Llevar el score de tu grupo" al crear ronda
- Hasta 4 jugadores (con cuenta o invitados)
- Nueva pagina /score-grupo con scoring simultaneo
- BD: admin_mode, admin_user_id, campos de invitados

### tAIger+ Learning System
- Capa 1: memoria de ultimas 5 sesiones + recomendaciones activas
- Capa 2: 5 nuevos detectores de patrones + insights colectivos por handicap
- Capa 3: rating 1-5 estrellas post-sesion + feedback API
- Extraccion automatica de recomendaciones del texto
- Cron diario de insights colectivos
- BD: 3 tablas nuevas + columna rating

---

## Sesion 24-25 Mar 2026 — Sprint masivo: Admin + Hardening + Import + Garmin

**Fecha:** 24-25 Mar 2026
**Estado:** EN PROGRESO (historial pendiente de rediseno)

### Admin Redesign
- Command Center con 5 secciones, sidebar, datos en vivo
- 11 componentes reutilizables, 6 API routes
- Control total: editar/eliminar usuarios, rondas, torneos, scores, tAIger
- SQL Console, force-close, auto-fix, escalacion a Claude

### Hardening
- Audit completo: 39 APIs, 33 paginas, middleware, RLS
- 13 fixes criticos: push/send auth, debug-auth, HSTS, GWI crash, etc
- Health Check Suite: 19 tests automaticos con auto-fix desde admin
- RLS fixes: ronda_libre_jugadores, hole_scores, players

### Import v3
- 3 opciones: Pantallazo scorecard, Archivo Garmin ZIP, Manual
- Encuesta inicial de 2 preguntas con recomendacion personalizada
- Vision AI (Gemini 2.5 Flash gratis): lee scorecards con 100% precision (261/261 hoyos verificados)
- Garmin ZIP parser: extrae Golf-SCORECARD.json client-side, 58 rondas en <1 segundo
- Reconstruccion por colores con algoritmo de reconciliacion (10/10 tests)
- Deteccion duplicados por garmin_scorecard_id
- Batch insert escalable (1 query para 100+ rondas)

### Canchas
- GolfAPI.io integrada (42,000 canchas worldwide)
- 3 canchas piloto cargadas: Brisas, Rocas, Cachagua
- Sistema de recorridos multiples para canchas 27 hoyos (Norte/Sur/Este)
- Matching por puntaje para resolver ambiguedades (Brisas vs Rocas)
- course-matching.ts: algoritmo reutilizable

### Garmin data completa
- Scores, putts por hoyo, fairways, penalties, course rating, slope
- metadata JSONB en historical_rounds
- tAIger+ instruido para usar datos Garmin como complemento
- Colores Garmin Golf verificados y blindados (garmin-colors.ts)

### Pendiente
- Rediseno historial: stats con pares reales, ScoreSymbol, datos Garmin
- Cargar 25 canchas chilenas restantes + 8 internacionales
- Admin de Ronda (feature guardada en memoria)
- tAIger+ Learning System (feature guardada en memoria)

---

## Sesión 24 Mar 2026 — Admin Redesign: Command Center

**Fecha:** 24 Mar 2026
**Estado:** COMPLETO

### Resumen
Rediseno TOTAL del panel admin. De 9 tabs con placeholders estaticos a un
Command Center de clase mundial (Vercel/Stripe/Linear) con 5 secciones,
sidebar navigation, datos en vivo y polling automatico.

### Cambios principales
- **Nueva arquitectura:** Sidebar lateral (desktop/tablet/mobile) reemplaza tabs horizontales
- **Command Center:** KPIs live con sparklines, activity chart (Recharts area), feed en tiempo real, health grid, alertas
- **Analytics:** Crecimiento por dia, funnel activacion (5 etapas), top usuarios, engagement metrics
- **Golf Ops:** Torneos, rondas libres, usuarios (tabla paginada con search), tAIger dashboard
- **Finanzas:** Costos operativos, simulador de proyecciones (sliders interactivos), DB stats
- **Sistema:** Health grid con latencia, DB stats, env vars, deploy info, debug tools (ping + auth debug)
- **11 componentes reutilizables:** AdminCard, AdminChart, AdminTable, AdminBadge, AdminSidebar, AdminTopBar, LiveFeed, HealthGrid, FunnelChart, ProjectionSlider, admin-tokens
- **6 API routes:** /live (real-time), /feed (activity), /analytics (growth+funnel), /golf-ops, /finance, overview mejorado con sparklines
- **Polling inteligente:** Command Center 10-30s, Analytics 60s, Health 30s, Finanzas manual
- **7 paginas antiguas eliminadas:** usuarios, crecimiento, golf, taiger, monetizacion, geografia, configuracion
- **0 errores TypeScript, build exitoso**

### Archivos nuevos
- `src/components/admin/` (11 archivos)
- `src/app/admin/analytics/page.tsx`
- `src/app/admin/golf-ops/page.tsx`
- `src/app/admin/finanzas/page.tsx`
- `src/app/api/admin/live/route.ts`
- `src/app/api/admin/feed/route.ts`
- `src/app/api/admin/analytics/route.ts`
- `src/app/api/admin/golf-ops/route.ts`
- `src/app/api/admin/finance/route.ts`
- `docs/superpowers/specs/2026-03-24-admin-redesign-design.md`
- `docs/superpowers/plans/2026-03-24-admin-redesign.md`

---

## Sesión 23-24 Mar 2026 — Sprint post-prueba 1 + formato PGA
**Fecha:** 23-24 Mar 2026
**Commits:** e9a86db → 73bff3c (~25 commits)
**Estado:** ✅ COMPLETO

### Resumen
Sprint masivo post-prueba real del 21 Mar. Fix de pantalla blanca espectadores,
formato PGA en scorecards (círculos/cuadrados), sistema de push notifications,
celebración de ronda, share card viral, partida simultánea, y auditoría completa.

### Cambios principales
- **Fix pantalla blanca:** /ronda-libre sacada de rutas protegidas, espectadores anónimos ven ronda
- **Formato PGA:** Círculos dorados (birdie/eagle), cuadrados rojos (bogey/doble+) en TODAS las vistas
- **Hole-in-one:** Celebración dorada fullscreen + push notification
- **Push notifications:** VAPID + Service Worker + APIs + NotificationHub con preferencias
- **Celebración 2 tiempos:** Personal al terminar + ganador cuando todos terminan
- **Share card Canvas:** Templates ronda_libre y torneo, leaderboard con ranking
- **MiniLeaderboard:** En vivo dentro del score page, polling 15s
- **Partida simultánea:** hoyo_inicio en BD, orden circular en score page
- **Historial premium:** Fondo blanco, scorecard PGA, OUT/IN/TOT, Personal Record, editar inline
- **Deep link WhatsApp:** localStorage fallback + param next preservado
- **PGA widget:** Banderas flagcdn.com + lógica tee time corregida
- **Admin:** Middleware con service_role para bypass RLS
- **exec_sql:** Función RPC para acceso SQL directo sin Dashboard

### Infraestructura
- Migraciones: 005 (partida simultánea), 006 (push subscriptions)
- exec_sql RPC function instalada
- 6 canchas verificadas con pares correctos
- VAPID keys configurados en Vercel

### Auditoría
- Error handling en 5 API routes
- Aria-labels en 15+ botones
- Open Graph + Twitter meta tags
- robots.txt + manifest.json mejorado
- Null safety fixes

---

## Sesión 17-18 Mar 2026 — Sprint masivo de producto
**Fecha:** 17-18 Mar 2026
**Commits:** ae07373 → 2899496
**Estado:** ✅ COMPLETO

### Entregado
**Sprint 9C — Fixes urgentes:**
- modo_juego graceful fallback, PGA widget mobile, historial siempre gross
- SQL idempotente, CSS mobile responsive

**Admin Dashboard (9 pestañas):**
- Overview, Usuarios, Crecimiento, Golf, tAIger, Monetización, Geografía, Sistema, Config
- APIs: overview, users, activity, health con service-role client
- Analytics tracking en 4 puntos clave
- Layout admin con sidebar responsive

**Sprint 10 — tAIger+ v1 y v2:**
- Claude API (claude-sonnet-4-6) con streaming SSE
- Onboarding científico 12 preguntas (ACSI-28/SMTQ/Rotella/VISION54)
- System prompt v2: 4 frameworks, protocolos por tipo sesión, drills, calibración por índice
- Dashboard coach con "Foco de Trabajo", patrones, freemium counter
- Chat streaming con follow-ups, session starters, error handling
- Integración automática post-ronda en scorecard
- Niveles de análisis según datos disponibles (0-5)

**PR1-PR3 — Rediseño UX completo:**
- PR1: Fondos por contexto (blanco nav pages, dark scorecard), navbar adaptiva, bottom nav mobile
- PR2: Tournament card menu, date picker nativo, perfil progress bar
- PR3: Scorecard reescrito — header 48px, score 96px, chip dinámico, botones 72px, dots, swipe, feedback guardado

**Garmin UX + Stats:**
- HoleColorBar componente reutilizable
- Dashboard stats con Chart.js (GWI gauge, scoring trend, handicap evolution)
- Fonts: Cormorant Garamond + DM Mono via next/font/google
- FAB dorado en bottom nav mobile

**QA Total:**
- historical_rounds se puebla al finalizar ronda
- /api/gwi/ronda-libre creada
- SQL_RLS_AUDIT.sql con todas las políticas + índices
- Error handling sanitizado en todas las APIs
- overflow-x: hidden global, badge índice en perfil

**Rebranding:**
- Tu Golf → Golfers+ (17 archivos, 0 instancias restantes)
- el tAIger → tAIger+ (37 instancias, nombre propio sin artículo)
- Copy premium en homepage, coach, footer

**Demo + GWI Bloomberg:**
- /demo — perfil público Carlos Méndez, 30 rondas, 4 tabs, GWI gauge SVG
- /api/demo/profile y /api/demo/players — datos hardcoded
- GWI™ columna en leaderboard con sparkline SVG + delta ▲/▼
- Simulación en vivo: 10 jugadores avanzan c/20s, auto-reset
- Mobile F1/Bloomberg: cards verticales, scorecard expandible, ticker bar
- Columnas PGA Tour: POS | PLAYER | TOT | THRU | R1 | GWI™
- GWIDisplay, GWISparkline, GWICell componentes premium
- Design polish: datos realistas índice 2, hero compacto, badges limpios

---

## Sprint 10 — el tAIger v1 🐯
**Fecha:** 17 Mar 2026
**Estado:** ✅ COMPLETO

### Entregado
- @anthropic-ai/sdk integrado con modelo claude-sonnet-4-6
- src/lib/taiger-prompt.ts — system prompt v1.0 + context builder
- /api/taiger/chat — streaming SSE con Claude API
- /api/taiger/analyze-round — análisis post-ronda automático
- /coach/onboarding — 12 preguntas psicológicas, 1 a la vez
- /coach — dashboard con patrones, sesiones, freemium counter
- /coach/sesion/nueva — selector de tipo de sesión
- /coach/sesion/nueva/chat — chat streaming con follow-ups
- /coach/sesion/[id] — vista de sesión con seguimiento
- Integración automática post-ronda en scorecard
- "🐯 Mi Coach" en navbar desktop + mobile
- Health check Claude API corregido
- Freemium: 3 sesiones/mes, prevención duplicados
- Analytics: onboarding_completado, taiger_sesion_iniciada

---

## Admin Dashboard — 9 pestañas operacionales
**Fecha:** 17 Mar 2026
**Estado:** ✅ COMPLETO

### Entregado
- src/lib/admin.ts — seguridad por email
- src/lib/analytics.ts — tracking de eventos
- src/lib/supabaseAdmin.ts — cliente service-role
- ADMIN_SUPABASE.sql — analytics_events + vista admin_daily_metrics
- APIs: /api/admin/overview, users, activity, health
- Layout admin con sidebar responsive + header
- /admin — Overview con KPIs, gráfico actividad, health panel
- /admin/usuarios — tabla paginada con búsqueda y drawer lateral
- /admin/crecimiento — funnel activación + KPIs growth
- /admin/golf — métricas torneos, rondas, tarjetas, distribución HCP
- /admin/taiger — sesiones, patrones, costo API, system prompt
- /admin/monetizacion — MRR/ARR, proyecciones con slider, costos
- /admin/geografia — distribución países, canchas
- /admin/sistema — health check, BD metrics, env vars, errores
- /admin/configuracion — general, tAIger, admins
- Link admin en navbar (solo para juanjoselamarca@gmail.com)
- trackEvent en 4 puntos: ronda_creada, torneo_creado, tarjeta_historica, ronda_completada

---

## Sprint 9C — Fixes urgentes
**Fecha:** 17 Mar 2026
**Commit:** ae07373
**Estado:** ✅ COMPLETO

### Entregado
- Fix PGA widget invisible en mobile
- Fix error modo_juego — graceful fallback
- Historial siempre gross
- SQL idempotente
- CSS mobile responsive

---

## Sprint 9B — GWI + Gross/Neto/Stableford
**Fecha:** 17 Mar 2026
**Commit:** f73964b
**Estado:** ✅ COMPLETO

### Entregado
- src/lib/scoring.ts — matemáticas golf completas
- src/lib/gwi.ts — Golf Win Index con sigma por HCP
- GWILeaderboard.tsx — probabilidades de ganar
- APIs gwi para ronda libre y torneo
- Selector Gross/Neto/Stableford en formularios
- Scorecard modo-aware con chips correctos
- Vista espectador con badge de modo

---

## Sprint 9 — Data Foundation tAIger/Garmin
**Fecha:** 17 Mar 2026
**Commit:** 689d95c
**Estado:** ✅ COMPLETO

### Entregado
- Tablas: player_patterns, taiger_sessions, player_psych_profile, garmin_connections, handicap_history
- APIs: /api/taiger/context y /api/taiger/patterns
- src/types/database.ts completo
- src/constants/golf.ts con colores y labels
- Tarjetas históricas rediseño premium estilo Garmin Golf
- Animaciones: fadeInUp, shimmer, scoreChange, pulse
- Botones premium: .btn-primary y .btn-secondary
- PGA Widget v2 con badge PGA TOUR y nombres completos

---

## Sprint 8B — Mobile UX completo
**Fecha:** 17 Mar 2026
**Commit:** e96c321
**Estado:** ✅ COMPLETO

### Entregado
- Navbar con drawer bottom sheet en mobile
- Scorecard hoyo a hoyo con swipe gestures
- Touch targets 44px mínimo en toda la app
- Haptic feedback al cambiar scores
- Safe area para iPhone notch
- Cards responsive con animaciones

---

## Sprint 8 — Features completos
**Fecha:** 16 Mar 2026
**Commit:** 51ed0a6
**Estado:** ✅ COMPLETO

### Entregado
- Ronda Libre: crear, scorecard hoyo a hoyo, vista espectador/jugador con selector de rol
- Widget PGA Tour en vivo con ESPN API
- Historial 50 tarjetas manuales
- QR Code del torneo
- Perfil del jugador /perfil
- Modo TV /torneo/[slug]/tv
- Dashboard con métricas reales de BD
- Campos opcionales: putts, GIR, fairway hit
- Stats post-torneo (6 cards)
- Banderas de países con flagcdn.com

---

## Sprint 7 — Core funcional
**Fecha:** 16 Mar 2026
**Commit:** e2879c1
**Estado:** ✅ COMPLETO

### Entregado
- Scoring desde celular /torneo/[slug]/score
- Deep link login con ?redirect=
- Categorías personalizadas con chips editables
- Editar torneo pre-cargado con datos reales
- Historial torneos jugados en dashboard
- Fix handicap negativo en dropdown jugadores
- Seguridad /api/game con validación organizer_id

---

## Sprint 1-6 — Base del proyecto
**Estado:** ✅ COMPLETO

### Entregado
- Auth Google OAuth + email/magic link + PKCE fix
- Crear torneos completo con todas las opciones
- Inscribir jugadores con handicap WHS
- Scoring en tiempo real con leaderboard
- Leaderboard premium con categorías y flights
- Deploy Vercel + Supabase configurado
