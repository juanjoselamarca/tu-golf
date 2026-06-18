# Plan de refactor — `ronda-libre/[codigo]/page.tsx` (2038 → <500 LOC)

**Fecha:** 2026-06-17
**Job:** "Resultados ronda-libre v2 (equipos)" — refactor obligatorio (regla "el que toca, ordena") ANTES de los 4 fixes del cluster (128, 120, 124, 126).
**Archivo:** `src/app/ronda-libre/[codigo]/page.tsx` — monstruo #2 (2038 LOC), un solo componente `RondaLibrePageContent`.
**Estándar de referencia:** `score/page.tsx` (1951→1025) → `score/hooks/`, `score/components/`, `score/types.ts`, data en `src/lib/data/`.

> **Esta es la vista pública del leaderboard en vivo que se proyecta en torneos reales.** CERO FALLOS manda: el refactor es **extracción pura, behavior-preserving**. Ningún cambio de lógica/visual en el commit de refactor. Los fixes vienen DESPUÉS, sobre la base ya limpia.

---

## 1. Objetivo y no-objetivos

**Objetivo:** llevar `page.tsx` al estándar (hooks + components + capa de datos), reduciéndolo a un orquestador delgado (<500 LOC, idealmente <300), sin cambiar comportamiento observable.

**No-objetivos (explícitos):**
- NO arreglar los 4 reportes en este commit (van después, sobre la base limpia).
- NO rediseñar nada visualmente.
- NO tocar archivos protegidos (Navbar/layout raíz/middleware/supabase client). `layout.tsx` de la ruta NO se toca.
- NO cambiar el contrato de los componentes ya existentes (`TeamLeaderboard`, `Scorecard`, `GWILeaderboard`, `RoundHighlights`, `AuthModal`).

---

## 2. Estado actual (mapa)

Componente único `RondaLibrePageContent` (líneas 57-2031). Mezcla:
- **26 hooks de estado** (data, UI/modales, role/auth, refs de notificación).
- **Data-fetch** inline: `fetchRonda` (~150 LOC, tablas `rondas_libres`, `course_holes`, `profiles`, `ronda_equipos`), `fetchGWI` (endpoint), `handleAdminScoreSave` (RPC `upsert_ronda_libre_scores`).
- **Realtime/polling** vía `useRondaRealtime` + `useCountdown` (ya extraídos).
- **Cálculos** inline: leaderboard ordenado (~18 LOC), match-play render cells, team rankings (best_ball/scramble/foursome).
- **~22 bloques de render** JSX (B1-B22): celebraciones de ganador, match play card, leaderboards, timeline, banners, modales.
- **2 `console.error`** (líneas 102, 206) → deben ir a `captureError`.

---

## 3. Arquitectura objetivo

### 3.1 Capa de datos — `src/lib/data/ronda-libre.ts` (NUEVO)

Funciones puras de acceso (reciben `supabase` client, devuelven data tipada). Sacan todo `supabase.from(...)` del componente:

- `fetchRondaLibre(supabase, codigo)` → `{ ronda, parMap, siMap, courseHcpMap, equipos }`. Encapsula la cadena completa de `fetchRonda` (rondas_libres + nested jugadores → course_holes multi-loop → profiles para índices faltantes → cargarCourseData/resolverCourseHandicap → ronda_equipos si team format). Devuelve un objeto resultado; el manejo de `notFound`/`fetchError` queda como flags derivados en el hook.
- `saveAdminScore(supabase, { rondaId, jugadorId, hole, score })` → RPC `upsert_ronda_libre_scores`. Devuelve el resultado para que el hook actualice estado local.

> GWI ya va por endpoint REST (`/api/gwi/ronda-libre/{codigo}`), no toca Supabase directo → se queda en su hook (abajo), no en lib/data.

### 3.2 Hooks — `src/app/ronda-libre/[codigo]/hooks/`

- `useRondaLibreData(codigo)` — orquesta carga inicial + visibility refetch + realtime/polling (envuelve `useRondaRealtime`+`useCountdown`) + `checkScoreEvents`. Expone `{ ronda, parMap, siMap, courseHcpMap, equipos, loading, notFound, fetchError, secSinceUpdate, refresh }`. Es el corazón; reemplaza `fetchRonda`, sus useEffects y los refs de notificación.
- `useGWI(codigo, role)` — `fetchGWI` + estado `gwiInputs`. Expone `{ gwiInputs, refetchGWI }`.
- `useViewerIdentity(codigo)` — sesión Supabase auth → `{ isAnonymous, currentUserId }` + lógica de `requireAuth`/AuthModal state (showAuthModal, authModalAction, requireAuth()).
- `useRegistrationBanner(...)` — banner anónimo a los 8s/scroll (`showBanner`, `bannerDismissed`, `dismissBanner`).
- `useAdminScoreEditor(ronda, refresh)` — estado del modal de edición admin + `handleAdminScoreSave` (vía `saveAdminScore` de lib/data).

> `expanded` (scorecard individual) y `copied` (botón copiar) son UI-state trivial; quedan en page o en el componente hijo correspondiente.

### 3.3 Cálculos derivados — `src/lib/ronda/` (donde ya viven los helpers de dominio)

- `buildLeaderboard(...)` → mover el cálculo inline del leaderboard ordenado (líneas ~468-486) a `src/lib/ronda/leaderboard.ts` como función pura testeable. Reutiliza `getVsPar/getVsParNeto/getHolesPlayed/puntosStablefordHoyo` ya en `lib/ronda`/`golf/core`.
- Team rankings ya tienen `rankTeams` (`lib/ronda/team-ranking.ts`) + calculadoras en `golf/formats`. El refactor consolida los 3 bloques inline (best_ball/scramble/foursome, B7-B9) en un único componente que consume estas funciones (ver 3.4).

### 3.4 Componentes — `src/app/ronda-libre/[codigo]/components/`

Cada uno recibe props puras (data ya calculada), sin tocar Supabase:

| Componente | Cubre (bloques) | Notas |
|---|---|---|
| `RondaStates.tsx` | B1 (loading/error/notFound) | Estados de carga/404/error. |
| `RondaHeader.tsx` | B1 header + last-update + live badge | Header oscuro + timestamp + EN VIVO/FINALIZADA. |
| `MatchPlayWinner.tsx` | B3 | Celebración match play finalizado (2 jugadores). |
| `WinnerCelebration.tsx` | B5 | Cuadro ganador stroke/stableford/team + podium. **Aquí caen luego 128 y 120.** |
| `MatchPlayCard.tsx` | B12 | Estado match play en vivo: strip, tabla detallada, GWI. **Aquí cae luego 124.** |
| `CourseInfoCard.tsx` | B6 | Grid Club/Fecha/Jugadores/Formato. |
| `TeamLeaderboards.tsx` | B7-B9 | Wrapper que elige best_ball/scramble/foursome y renderiza `<TeamLeaderboard>`. **Aquí cae luego 126 (expand equipo).** |
| `IndividualLeaderboard.tsx` | B10 | Tabla individual + expand `<Scorecard>`. |
| `GWIPanel.tsx` | B11 | GWI leaderboard en vivo. |
| `RecentTimeline.tsx` | B13 | Timeline de eventos. |
| `RefreshStatus.tsx` | B14 | Estado realtime/countdown. |
| `ShareBar.tsx` | B15-B16 | Botones compartir/copiar + share leaderboard. |
| `PostRondaLinks.tsx` | B17 | Links post-ronda (stats / requireAuth). |
| `AdminScoringBar.tsx` | B18 | Barra fija volver a score-grupo. |
| `RegistrationBanner.tsx` | B19 | Banner registro anónimo. |
| `AdminScoreModal.tsx` | B21 | Modal edición score admin. |
| `animations.ts` o CSS module | B22 | Keyframes slideUpBanner/livePulse. |

> B20 (AuthModal) y B4 (RoundHighlights) ya son componentes externos: se siguen montando desde page.

### 3.5 Tipos — `src/app/ronda-libre/[codigo]/types.ts` (NUEVO)

Tipos locales compartidos por hooks/components: el shape de `equipos`, `EditingScore`, props compartidas. Los tipos de dominio (`RondaLibre`, `Jugador`, etc.) siguen en `@/types/ronda`.

### 3.6 `page.tsx` resultante (orquestador <300 LOC)

```
RondaLibrePageContent():
  - useParams/useSearchParams → codigo, finishedParam
  - const data = useRondaLibreData(codigo)
  - const { gwiInputs } = useGWI(codigo, role)
  - const viewer = useViewerIdentity(codigo)
  - const banner = useRegistrationBanner(...)
  - const adminEditor = useAdminScoreEditor(data.ronda, data.refresh)
  - const leaderboard = useMemo(() => buildLeaderboard(...), [deps])
  - early returns: <RondaStates .../>
  - return ( <RondaHeader/> {winner blocks} {leaderboards} {timeline} {bars/modals} )
RondaLibrePage(): Suspense wrapper (sin cambios)
```

---

## 4. Estrategia de ejecución (orden + validación)

Extracción incremental, **un dominio por paso, validando entre cada uno** (la red de seguridad es `npx tsc --noEmit` + tests + diff visual contra prod):

1. **lib/data + tipos**: crear `lib/data/ronda-libre.ts`, `types.ts`, `lib/ronda/leaderboard.ts` con tests unit. (No cambia page todavía.)
2. **Hooks**: extraer `useRondaLibreData`, `useGWI`, `useViewerIdentity`, `useRegistrationBanner`, `useAdminScoreEditor`. Page los consume; borrar estado/effects migrados. `tsc` verde.
3. **Componentes de presentación**: extraer B1-B22 a `components/` en tandas (estados+header → ganadores → leaderboards → resto). Tras cada tanda: `tsc` + tests.
4. **Limpieza**: eliminar `console.error` → `captureError`; quitar `_gwiResults` muerto; verificar LOC final.
5. **Validación final del refactor**: `tsc` + `npm run test` + `npm run build` + smoke visual con Playwright (móvil 390px) contra una ronda real de cada modalidad (individual stroke, stableford, match play, best_ball) comparando contra prod actual (before/after idéntico).
6. **Commit aislado** del refactor. Recién entonces arrancan los fixes.

---

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Romper la vista en vivo durante torneo | Extracción behavior-preserving; smoke visual before/after por modalidad antes de commit; merge sin torneo activo. |
| Realtime/polling se rompe al mover effects al hook | `useRondaRealtime`/`useCountdown` ya están aislados; el hook solo los compone. Test del hook + smoke en vivo (editar score y ver refresh). |
| Cálculo de course handicap (WHS) se desvía al mover a lib/data | Función pura con test que fija inputs reales (índice+tee) y compara course hcp esperado. No tocar la lógica, solo moverla. |
| Regresión sutil en orden del leaderboard | `buildLeaderboard` con tests de los 3 modos de orden (holesPlayed, stableford pts desc, vsPar asc). |
| EOL CRLF infla el diff (gotcha conocido) | Verificar con `git diff -w`; usar el patrón de volcado de bytes si hace falta. |
| Contaminación de worktree OneDrive | `git diff` antes de pushear; worktree fresco. |

---

## 6. Checklist de salida del refactor (antes de fixes)

- [ ] page.tsx < 500 LOC, 0 `supabase.from` directo, 0 `console.*`.
- [ ] `npx tsc --noEmit` 0 errores.
- [ ] `npm run test` verde (incluye nuevos tests de lib/data + leaderboard + hooks).
- [ ] `npm run build` OK.
- [ ] Smoke visual before/after idéntico en 4 modalidades.
- [ ] Commit de refactor aislado (sin fixes mezclados).

---

## 7. Eng-review — decisiones lockeadas (2026-06-17)

Revisión por secciones (Arquitectura / Calidad / Tests / Performance). Como es un refactor *behavior-preserving* sin decisiones de producto, las llamadas son de ingeniería y se toman con autonomía CTO. Outside voice: codex no disponible en la máquina → no se corrió subagente (el riesgo del refactor está cubierto por el net visual before/after, no por una segunda opinión de arquitectura).

### Step 0 — Scope
- **Complexity check dispara** (>8 archivos, >2 módulos nuevos): **esperado y aceptado**. Es una *descomposición* de un archivo de 2038 LOC, no una feature. El smell "8 archivos" aplica a features, no a partir un monstruo. Disciplina de scope: CERO cambio de lógica/visual; los 4 fixes van DESPUÉS en commits separados.
- **Reúso confirmado** (sección "Qué ya existe" abajo): no se reinventa nada.

### Decisiones de arquitectura (locked)

- **A1 — `MatchPlayCard` NO se extrae como un solo componente.** El bloque B12 es ~530 LOC (líneas 769-1297): extraerlo entero solo mueve el monstruo. Se descompone en `components/matchplay/`: `MatchStrip.tsx` (strip compacto hoyo-a-hoyo), `MatchDetailTable.tsx` (**aquí cae fix 124**: anchos de columna + quitar P4/P3), `MatchGwiPanel.tsx` (barra GWI match). Más `MatchPlayWinner.tsx` (B3, finalizado). `MatchPlayCard.tsx` queda como orquestador delgado de los tres.
- **A2 — Granularidad del resto.** Un archivo por bloque para los grandes/medianos y para los que tocan fixes. Los bloques chicos (RefreshStatus, ShareBar, PostRondaLinks, AdminScoringBar, RegistrationBanner, AdminScoreModal) van igual a su propio archivo (claridad > densidad; varios son candidatos a tocar a futuro). Sin abstracciones prematuras (nada de un `<GenericCard>` configurable).
- **A3 — Capa de datos hace lectura + ensamblado, el hook hace React.** `lib/data/ronda-libre.ts → loadRondaLibre(codigo)` ejecuta los reads crudos (`rondas_libres`+nested, `course_holes`, `profiles`, `ronda_equipos`) y ensambla `{ ronda, parMap, siMap, courseHcpMap, equipos }` llamando a las funciones puras ya existentes en `golf/core` (`cargarCourseData`, `resolverCourseHandicap`, `parTotalEstandar`). El hook `useRondaLibreData` solo orquesta estado/realtime/polling/visibility. Cumple la regla CLAUDE.md "acceso a datos vía src/lib/data/".
- **A4 — Realtime intacto.** `useRondaRealtime`/`useCountdown` ya están aislados; el hook solo los compone. No se toca su lógica.

### Decisiones de calidad (locked)
- **C1 — N+1 de profiles se elimina.** Hoy `fetchRonda` hace `from('profiles').select('indice').eq('id', j.user_id).single()` **dentro de un `for` por jugador** (línea ~162). En `loadRondaLibre` se batchea con `.in('id', userIds)` una sola vez. **Result-equivalent** (mismos índices resueltos), estrictamente menos round-trips → menos latencia en torneo. Se verifica que el mapeo id→índice sea idéntico.
- **C2 — `console.error` → `logError(err, ctx)`** (las 2 ocurrencias, líneas 102 y 206). `logError` es el helper sync fire-and-forget de `src/lib/error-tracking.ts` (confirmado export).
- **C3 — Dead code.** Se elimina `_gwiResults` (estado seteado y nunca leído).
- **C4 — DRY de team leaderboards.** Los 3 bloques best_ball/scramble/foursome (B7-B9, casi duplicados) se consolidan en `TeamLeaderboards.tsx` con un switch por formato que consume `calcular*`/`ordenarEquipos*` ya existentes. Esto además deja el terreno limpio para **fix 126** (expand de tarjeta de equipo).

### Decisiones de tests (locked)
- **T1 [CRÍTICO]** — `lib/ronda/leaderboard.ts::buildLeaderboard()` con unit tests de los **3 modos de orden** (holesPlayed, stableford pts desc, vsPar asc) + empates. Es el cálculo con mayor riesgo de regresión sutil al extraerlo.
- **T2 [CRÍTICO]** — `loadRondaLibre` con test del **ensamblado** (mock del client supabase): verifica parMap/siMap multi-loop, batch de profiles (id→índice), courseHcpMap por tee. El course handicap WHS subyacente ya está testeado en `golf/core`.
- **T3 — Net de caracterización**: como el componente gigante no se testea unitariamente, **el diff visual before/after con Playwright (móvil 390px) en las 4 modalidades ES el test de regresión** del refactor. Login real con creds E2E, service-role para setup/cleanup en `finally`. Sin esto el refactor no se commitea.
- **Hooks**: tests livianos donde aporten (composición de realtime); no se fuerza cobertura de UI-state trivial.

### Performance
- Único hallazgo: el N+1 de profiles → resuelto en C1. El resto del fetch es secuencial por dependencia real (necesitás `course_id`/`recorridos` de la ronda antes de pedir `course_holes`). No se paraleliza para no cambiar comportamiento.

### Qué ya existe (reúso, no se reconstruye)
- Patrón hooks+components+types: `score/` (precedente validado).
- `lib/ronda/`: `helpers`, `team-ranking` (`rankTeams`), `round-highlights`.
- `golf/formats/`: best-ball/scramble/foursome (calcular+ordenar). `golf/core/`: course-handicap, scoring, round-score, colors.
- `hooks/ronda/`: `useRondaRealtime`, `useCountdown`, `useOnlineStatus`.
- `lib/data/`: capa establecida (`perfil.ts`, `dashboard.ts`) — `ronda-libre.ts` sigue ese molde.
- Componentes externos ya hechos: `TeamLeaderboard`, `Scorecard`, `GWILeaderboard`, `RoundHighlights`, `AuthModal`, `NotifBanner`.

### NOT in scope (diferido explícito)
- Los 4 fixes (128/120/124/126) — van después del commit de refactor, en commits propios.
- Fix 114 "abrir inscripciones" — job independiente (`JugadoresPanel.tsx`).
- Migrar `share-card`/`gwi`/`indice-golfers` de `lib/` a `golf/` (regla #4 lista sucios) — fuera del archivo tocado; barrido final del trimestre.
- Reescribir `TeamLeaderboard`/`Scorecard` internos — solo se consumen, no se tocan.
- Limpieza de ~19 worktrees huérfanos (lock OneDrive) — fuera de banda.

### Failure modes (cada codepath nuevo)
| Codepath | Falla realista | ¿Test? | ¿Error handling? | ¿Visible? |
|---|---|---|---|---|
| `loadRondaLibre` reads | red caída / ronda inexistente | T2 + flags notFound/fetchError | sí (try/catch → flags) | sí (RondaStates) |
| batch profiles `.in()` | algún user_id sin profile | T2 (índice default) | sí (fallback 0/18) | no aplica (default silencioso, OK) |
| `buildLeaderboard` orden | empate mal desempatado | T1 | n/a (cálculo puro) | sí (orden visible) |
| realtime refresh | suscripción no reconecta | smoke en vivo | useRondaRealtime ya maneja | countdown/RefreshStatus |
- Sin gaps críticos: ninguna falla queda sin test **y** sin manejo **y** silenciosa.

### Parallelization
Refactor secuencial dentro de un único módulo (`ronda-libre/[codigo]/`). Sin oportunidad de paralelizar — un solo worktree. (Los fixes posteriores también son secuenciales: tocan los mismos componentes recién creados.)

### Veredicto
Arquitectura **CLEARED**. Plan listo para implementar. Riesgo principal (regresión visual del refactor) cubierto por T3. Procedo a worktree + implementación.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | n/a | codex no instalado |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 6 issues (A1-A4, C1-C4, perf N+1), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | refactor behavior-preserving, sin cambio visual |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**UNRESOLVED:** 0
**VERDICT:** ENG CLEARED — listo para implementar. Refactor behavior-preserving; los 4 fixes van después en commits separados. Design review se hará sobre los fixes (120/124/126), no sobre el refactor.
