# Auditoría de Backend — Golfers+ (2026-06-02)

> Auditoría completa del backend conducida como CTO con 6 líneas de revisión en paralelo
> (auth/authz, integridad de datos, motor de golf, backend IA, observabilidad/SRE, secretos/config).
> Todos los hallazgos verificados leyendo código real. Read-only: no se modificó nada.
> Stack: Next.js 14 (App Router) · Supabase · Vercel. 588 archivos productivos, ~92 rutas API.

## Reconciliación con trabajo en curso (actualizado 2026-06-03)

Cruce de los hallazgos contra los 3 worktrees activos + ramas de auditoría FTUE. Verificado leyendo diffs.

| Hallazgo | Estado | Dónde |
|---|---|---|
| **P1-3** coach sin fallback Gemini | ✅ **RESUELTO** (sin mergear) | `feat/cerebro-v3-ola2-conocer` commit `80b982b`: `coach-fallback.ts` (83 LOC + 115 test) cableado en `chat/route.ts:443`. Ante fallo de streaming de Anthropic, degrada a respuesta no-streaming vía gateway→Gemini. El coach ya no cae del todo. |
| **P1-4** `cerebro_weights` decoración | ✅ **RESUELTO** (sin mergear) | Misma rama: motor de foco v3 (`v3/focus/get-focus.ts`, `select-focus.ts`) lee `cerebro_weights` en runtime vía `getCachedWeights()`; canario anti-huérfanos flipeado a *enforced* (`5aeea4b`). Los pesos mueven el rankeo. El `decision-engine.ts` v2 queda como legacy reemplazado por `selectFocus`. |
| **P1-5** garantía dura aritmética coach | 🔶 **EN COLA, NO EMPEZADO** | Worktree `feat/coach-aritmetica-hard` existe pero **vacío** (HEAD=main, 0 commits). |
| **P0-1** plus handicap invertido | ✅ **RESUELTO + EN PROD** | PR #99 (`f0922a8`, 2026-06-03). Fix en `stableford-score.ts` + 4 archivos de test que codificaban la regla invertida. Verificado vs USGA Appendix E. 2192 tests verdes, CI+E2E success. |
| **P0-1b** `strokesOnHole` inline en torneo (NUEVO, destapado al cerrar P0-1) | ✅ **RESUELTO + EN PROD** | PR #100 (`f69b0ad`, 2026-06-03). Eliminadas las 2 copias inline en `organizador/[slug]/scoring` y `torneo/[slug]/score`; ahora usan `strokesRecibidosEnHoyo` del motor con `holeCount`. Arregla plus (restaba 18 golpes) + 9 hoyos + duplicación. CI verde (build + Playwright scorer smoke + E2E). |
| **P0-2** allowances de equipo | ❌ **NADIE LO TOCA** | `best-ball.ts:104,106` en main sigue con `handicapIndex` crudo. `team-scoring-v1` agregó standings/leaderboard, no el cálculo de strokes. PR #93 tocó el handicap de equipo *agregado* en el create route, no el reparto por jugador con allowance 85%. |
| **P0-3 / P0-4** idempotencia finalización | ❌ **NADIE LO TOCA** | Commits en `score-grupo`/`useFinalizeRonda` son todos de mayo. Sin trabajo activo. |
| **P0-5** ledger de migraciones | ❌ **NADIE LO TOCA** | — |
| **P0-6** RLS `profiles` world-readable | ❌ **NADIE LO TOCA** | — |
| Auditoría FTUE equipos (`worktree-agent-*`, `chore/audit-ftue-equipos`) | ➖ **ORTOGONAL** | Auditoría de producto/UX del onboarding de equipos (screenshots, benchmark Grint/V-Par, funnel). No toca backend/cálculo/seguridad. |

**Lectura crítica:** el trabajo en curso resuelve 2 de los 3 P1 de IA, pero **ninguno de los 6 P0** (los bloqueantes CERO FALLOS de cálculo e integridad) está siendo trabajado por nadie. El esfuerzo está en features de cerebro v3 y leaderboard de equipos, no en los bugs de corrección matemática que se ven en cancha.

---

## Veredicto global

El backend tiene un **motor sólido y una postura de seguridad muy por encima del promedio**, pero arrastra
**deuda estructural de integridad transaccional y observabilidad** que viola la directiva CERO FALLOS en
escenarios de torneo real concurrente. No hay agujero de seguridad crítico explotable hoy; los riesgos P0
son de **corrección de cálculo** y **pérdida/corrupción silenciosa de datos**.

### Salud por dominio (1-10)

| Dominio | Score | Lectura |
|---|---|---|
| Seguridad (secretos/config/headers) | **8** | No hay secretos en git, no hay leak de service-role, headers CSP/HSTS ejemplares. Falla estructural en middleware. |
| Auth / Authz de API | **8** | 38 rutas admin auto-protegidas, webhooks timing-safe, ownership validado. Depende de RLS en 2 puntos sin verificar. |
| Integridad de datos / transaccionalidad | **5** | Score por hoyo es atómico (bien), pero finalización y arranque de torneo NO. Drift de migraciones sin ledger. |
| Motor de golf (corrección) | **6** | Core WHS correcto, pero plus-handicap invertido + allowances de equipo mal + cero tests en funciones calientes. |
| Backend IA / coach | **6** | `save_plan` blindado (bien), pero coach sin fallback real + piezas decorativas (cerebro_weights) + validador débil. |
| Observabilidad / manejo de errores | **4** | `captureError` server-side es casi no-op. Bridge a Sentry muerto. Webhook traga inserts. Backend casi ciego. |
| Arquitectura / estructura | **5** | 19 archivos >600 LOC, 56 con `supabase.from()` directo en UI, capa de datos ~15% hecha. |

**Global ponderado: ~6/10.** Apto para uso actual de bajo volumen; **no apto para escalar ni para garantía
CERO FALLOS** en torneo por equipos o con jugadores scratch/plus hasta cerrar los P0.

---

## P0 — Bloqueantes CERO FALLOS (corrección de cálculo / pérdida de datos)

### P0-1 · Plus handicap asigna golpes en los hoyos equivocados `[CONFIRMADO]`
`src/golf/core/stableford-score.ts:110-113`
```ts
if (courseHandicap < 0) {
  const hcpAbs = Math.abs(Math.round(courseHandicap))
  return strokeIndex <= hcpAbs ? -1 : 0   // ← invertido
}
```
Para un jugador plus (CH = −2) devuelve el golpe en SI 1 y 2 (los más **difíciles**). La regla WHS
(Appendix E) dice que el plus **devuelve** golpes empezando por el SI **18 hacia abajo** (los más fáciles).
Condición correcta: `strokeIndex >= (roundHoles - hcpAbs + 1)`. Afecta neto, stableford y match play de
todo jugador scratch/plus — exactamente el segmento premium de clubes chilenos. Sin tests que lo cubran.

### P0-2 · Formatos de equipo: sin allowance WHS y sobre índice crudo `[CONFIRMADO]`
`src/golf/formats/best-ball.ts:106`
```ts
const stableford = puntosStablefordHoyo(gross, hole.par, player.handicapIndex, hole.stroke_index)
```
Four-ball (best-ball) usa `handicapIndex` al 100%. WHS Appendix C exige **85% del course handicap**. Doble
error: (a) no aplica el 85%, (b) usa índice en vez de course handicap (sin slope/CR/(CR−par)). Sistémico:
**ningún formato de equipo cablea la conversión WHS** que sí existe en el motor (`computePlayerCourseHcp`).
Contradice la regla transversal "tee por jugador → slope/CR correcto", que en equipos se ignora. Los
porcentajes de scramble (35/15…) y foursome (50% combinado) están bien, pero operan sobre índices, no sobre
course handicaps. Resultado: netos de equipo inflados en cualquier torneo por equipos.

### P0-3 · `historical_rounds` se inserta sin idempotencia en las 3 finalizaciones
`score-grupo/page.tsx:633` · `useFinalizeRonda.ts:181` · `api/game/actions.ts:218`
Si finalizar corre dos veces (doble-tap, dos dispositivos del grupo, reintento) cada jugador recibe rondas
históricas **duplicadas** → corrompe el Índice Golfers+/WHS (`calcular_indice_golfers` recalcula sobre filas
repetidas). Ningún path usa `onConflict` ni chequeo previo. Fix: clave única `(user_id, ronda_origen_id)` +
`ON CONFLICT DO NOTHING`.

### P0-4 · Finalización de grupo sin guarda de estado (race de re-finalización)
`score-grupo/page.tsx:666` — `update({ estado:'finalizada' }).eq('codigo', codigo)` **sin** `.eq('estado','en_curso')`.
Inconsistente con el path single-player (`useFinalizeRonda.ts:254`, que sí tiene la guarda). Permite
re-finalizar y re-disparar el bloque de inserts históricos → alimenta P0-3. Mismo patrón TOCTOU en
`api/game/actions.ts:156-163` (lee status, valida, update sin condicionar a `status='open'`).

### P0-5 · Drift de migraciones — el esquema de prod no es reproducible
La columna `orden` se agrega DOS veces: `026_equipo_jugadores_orden.sql` y
`20260602_ronda_equipo_jugadores_orden.sql` (fix #92, cuyo comentario afirma "la columna NUNCA existió" →
`026` nunca se aplicó). Las migraciones se corren a mano con `run-sql.mjs` **sin tabla de migraciones
aplicadas**, así que el esquema real de prod no se deduce del repo. Es la causa raíz del bug #92 (inserts
fallando con PGRST204 silencioso, ningún torneo de equipos mostraba sus equipos). **Garantiza recurrencia.**
Fix: adoptar `supabase migration` con ledger, o un script que diffee schema-prod vs migraciones.

### P0-6 · Tabla `profiles` es world-readable — emails de toda la base expuestos
`supabase/migrations/001_initial_schema.sql:243` → `CREATE POLICY ... ON profiles FOR SELECT USING (true)`.
Cualquiera con la anon key (pública por diseño) lee `id, email, name, role, indice` de **todos** los
usuarios. En "golf chileno, todos se conocen", es fuga de PII de la base completa. Fix: exponer campos
públicos vía vista (name/indice para leaderboard) y restringir `email` a `auth.uid() = id`.

> **Verificar en prod (puede escalar a P0):** las rutas públicas `gwi/torneo/[slug]` y `en-vivo` leen
> `historical_rounds` y `player_patterns` de todos los jugadores con cliente anónimo. Si esas tablas tienen
> `USING(true)` como `profiles`, un visitante anónimo obtiene el histórico y los patrones psicológicos de
> cualquier jugador inscrito. La policy SELECT no está en las migraciones del repo — confirmar en BD.

---

## P1 — Riesgo alto / deuda estructural

### P1-1 · Arranque de torneo no transaccional → estado parcial sin rollback
`organizador/[slug]/jugadores/hooks/useTournamentLifecycle.ts:144-211`. Secuencia multi-tabla corrida
**desde el cliente**: insert rounds → loop grupos (insert rondas_libres → update tournament_groups → loop
players insert jugadores → insert equipos → insert members). Cada paso falla con `captureError + continue`,
dejando el torneo **parcialmente arrancado** (unos grupos con ronda, otros no) sin forma limpia de re-arrancar.
Además `supabase.auth.getUser()` está dentro del loop (N+1). Es la mayor superficie de riesgo en vivo.
Fix: RPC transaccional `start_tournament(p_tournament_id)`.

### P1-2 · Inserts de equipos sin chequeo de error ni rollback
`api/ronda-libre/create/route.ts:203-209`. `ronda_equipo_jugadores.insert(members)` sin verificar `error`
(mismo patrón que causó #92). Si falla `ronda_equipos`, los members se saltan → equipo huérfano. Loop serial
sin transacción: si el equipo 3 falla, los 1-2 ya quedaron commiteados.

### P1-3 · El coach chat NO tiene fallback a Gemini (resiliencia sobre-vendida)
`api/taiger/chat/route.ts:115-173` instancia `new Anthropic()` directo y **no usa el AI Gateway**. Los
únicos consumidores del gateway con fallback son `import/confirm` y `draft/assistant`. El comentario L403
lo admite. La doc de proyecto dice "AI Gateway · CERRADO" y "coach endurecido vs 529", pero ese endurecimiento
es solo un **mensaje de error honesto** ("tAIger+ está descansando"), no continuidad de servicio. Riesgo en
torneo: una saturación de Anthropic tira el coach para todos a la vez. Decisión: migrar al gateway o dejar de
afirmar que hay fallback (la degradación honesta es defendible, la documentación no).

### P1-4 · Piezas del "cerebro paramétrico vivo" construidas pero no consumidas (anti-decoración)
`src/lib/cerebro/weights.ts` + `weights-cache.ts`: los únicos lectores de `cerebro_weights` son rutas admin.
**Ningún módulo del flujo del coach** (`context.ts`, `decision-engine.ts`, `patterns.ts`, `chat/route.ts`)
lee los pesos. `decision-engine.ts:19-23` usa `SEVERITY_WEIGHT` **hardcodeado**. El cache con Realtime +
`pg_notify` (propagación <60s a serverless) no tiene consumidor en el hot-path. Además `decision-engine.ts`
no tiene **ningún** importador fuera de su test — el plan lo decide el LLM vía `save_plan`, no el motor
determinista. Es exactamente la decoración que la memoria del proyecto marcó el 2-jun. Fix: cablear pesos vía
`weights-cache` en `decision-engine`/`patterns`, o marcar explícitamente como infra no-productiva + canario
anti-huérfanos en CI.

### P1-5 · Validador anti-alucinación no bloqueante + heurística con falsos negativos
`api/taiger/chat/route.ts:350-395` + `hallucination-validator.ts`. El validador corre **después** de que el
texto ya se streameó al usuario (L180) y ya se persistió en `taiger_sessions.messages` (L339). Solo flaggea,
no degrada. Heurística débil: solo chequea números **≥30** (un score de 9 hoyos o un target/delta <30 nunca
se valida), valida presencia textual no aritmética, detección de canchas por regex frágil.
**Atenuante real:** el path de persistencia de scores reales (`save_plan` → `coach_plans`) SÍ tiene
validación determinista dura (`tools.ts:565-632`) — el número alucinado se guarda como *objetivo de plan*
auditado, no contamina el histórico de scores. El riesgo residual es el número mostrado en chat. Esto ya está
en backlog ("garantía dura aritmética", priorizado por Juanjo).

### P1-6 · `captureError` server-side es casi un no-op → backend ciego
`src/lib/error-tracking.ts:78`. La persistencia en `error_logs` y el envío a PostHog están gateados por
`if (isClient)`. En servidor solo hace `console.error` → Vercel logs (retención corta, no consultable, sin
alerta). Todo error en API routes, crons, webhook y motor del coach es invisible fuera de Vercel. Esto explica
los "error_logs con cero entradas" del 19-may: el server-side no escribe ahí por diseño. **Prerequisito de
toda la observabilidad** — sin esto, migrar consoles a captureError no cambia nada.
Fix: persistir en `error_logs` vía `createAdminClient()` cuando `!isClient` (o agregar `posthog-node`).

### P1-7 · Canal de feedback (Inbox) ciego y mentiroso
- `src/lib/inbox-logger.ts:60-75`: bridge a `globalThis.Sentry` **muerto** (Sentry se removió el 12-may). Todos
  los fallos del webhook terminan solo en consola.
- `api/inbox/webhook/route.ts:~330`: `insertOrUpdateReport` traga el error del `.insert()` y el caller manda
  "✓ recibido" igual. **Un reporte que no se guarda se pierde para siempre con el usuario creyendo que llegó.**
  Fix: retornar `{ ok }` y condicionar el "✓ recibido".

### P1-8 · Dedup de canchas solo en el path de import (recurrencia Los Leones)
El matcher (`golf/courses/matching.ts`) y la RPC `resolve_and_link_course` están bien hechos (trigram ≥0.8,
strip de sufijos, race-recovery), **pero**: (a) el UNIQUE solo cubre `fuente='user_added'` → una cancha
FedeGolf y una user_added pueden coexistir; (b) la dedup **solo corre en import** — `ronda-libre/create` y
`useTournamentLifecycle` aceptan `course_id`/`course_name` libre del CourseSelector **sin pasar por
`resolve_and_link_course`**. El fix del incidente Los Leones fue merge manual + agrupar por `course_id` en el
coach; la prevención en creación de ronda/torneo sigue abierta.

### P1-9 · N+1 de índices al cargar score de grupo
`score-grupo/page.tsx:239-249` — `for (j of jugadores) { from('profiles').select('indice') }`: una query
serial por jugador. Fix: `.in('id', userIds)`.

### P1-10 · Capa de datos `src/lib/data/` solo ~15% hecha
Existe y está bien (9 módulos chicos con tests) pero **solo cubre `tournaments/`**. No hay capa para
ronda-libre, historial, coach, courses, scores ni perfil. Los 202 `.from()` directos en UI (56 archivos)
siguen. Es la "ola 4" del propio plan; mientras tanto cada refactor crea funciones ad-hoc (se está cumpliendo).

---

## P2 / P3 — Hardening y deuda menor

| # | Sev | Hallazgo | Ubicación |
|---|---|---|---|
| P2-1 | MEDIO | Middleware no cubre `/api/admin/*` (todos los handlers se auto-protegen hoy, pero es frágil: un endpoint futuro sin guard queda abierto). | `src/middleware.ts:75-91` |
| P2-2 | MEDIO | `exec_sql` protegida por blacklist regex bypasseable (admin-gated + rate-limit 5/min mitiga). Endurecer a read-only real a nivel Postgres. | `api/admin/actions/sql/route.ts` |
| P2-3 | MEDIO | Rate limit del coach es in-memory por instancia → ~30×N msg/h repartiendo entre instancias. Migrar a KV/Upstash antes del lanzamiento. | `rate-limit.ts` · `chat/route.ts:46` |
| P2-4 | MEDIO | `import/confirm`, `import/csv`, `import/garmin-zip` llaman LLM sin rate-limit (auth-gated, abuso interno). | `api/import/*` |
| P2-5 | MEDIO | Webhook Telegram sin dedup por `update_id`; reentregas re-descargan/re-suben media y generan "insert failed" benignos indistinguibles de fallos reales. | `api/inbox/webhook/route.ts` |
| P2-6 | MEDIO | `health-check` cron documentado "cada 5 min" pero agendado `0 8 * * *` (1×/día); insert a `health_check_log` traga toda falla. | `api/cron/health-check` · `vercel.json` |
| P2-7 | MEDIO | `admin/health-check` (541 LOC) mezcla checks reales con tautológicos ("query tabla" siempre pasa; "API key configurada" = `!!env`). Infla "X passed". | `api/admin/health-check/route.ts` |
| P3-1 | BAJO | `draft/[id]/assistant` no valida owner/collaborator antes de gastar LLM (IDOR de costo, depende de RLS). Inconsistente con endpoints hermanos. | `api/torneos/draft/[id]/assistant/route.ts:54` |
| P3-2 | BAJO | `push/subscribe` DELETE sin auth/ownership: borra suscripción de otro conociendo el endpoint (DoS de notificaciones). | `api/push/subscribe/route.ts` |
| P3-3 | BAJO | `delete-account` borra `hole_scores` por `player_id = userId` (columna equivocada) → scores huérfanos, derecho al olvido incompleto. | `api/profile/delete-account/route.ts` |
| P3-4 | BAJO | Prompt injection vía `profile.name`/`course_name` en system prompt (impacto acotado: tools solo leen datos del propio user). Falta delimitar `{PLAYER_CONTEXT}`. | `golf/coach/context.ts` · `chat/route.ts:89` |
| P3-5 | BAJO | 43 `console.*` en 20 rutas API productivas (fedegolf vincular/sync loguean fallos de escritura de índice WHS sin captura). Estándar pide `captureError`. | `api/fedegolf/*` y otras |
| P3-6 | BAJO | `useScoreSave` no llama `captureError` al agotar reintentos; retry loop no distingue error transitorio de auth/RLS. | `ronda-libre/[codigo]/score/hooks/useScoreSave.ts:81` |
| P3-7 | BAJO | `playground/route.ts:~195` reintroduce el bug `updated_at` que el chat documenta como prohibido (PGRST204). | `api/admin/taiger/playground/route.ts` |
| P3-8 | BAJO | Dos `parPerHoleArray` (estricto en `holes.ts`, laxo en `compare.ts`); `context.ts:155,226` accede a `par_per_hole` JSONB crudo con fallback a par 4 → miscuenta eagles/birdies si el shape falta. | `golf/core/*` · `coach/context.ts` |
| P3-9 | BAJO | Dominio de golf aún en `src/lib/`: `share-card.ts` (581 LOC) e `indice-golfers.ts` (91, lógica WHS) deberían estar en `src/golf/`. (cpi/gwi/courses/colors ya son shims, bien). | `src/lib/` |
| P3-10 | BAJO | `cleanup-drafts` sin try/catch top-level + sin `captureError`; `.clone/` no listado en `.gitignore`; `debug-auth` responde 200 a no-autenticado. | varios |

---

## Lo que está SÓLIDO (verificado — no romper)

- **Score por hoyo atómico:** RPCs `upsert_ronda_libre_scores` / `upsert_ronda_equipos_scores` con
  `SELECT … FOR UPDATE` + merge JSONB + guarda de estado. Cierra el bug histórico de PR #29: con 4 jugadores
  escribiendo a la vez **no se pierden hoyos**. El path de torneo usa `hole_scores.upsert` por fila + audit log.
- **Auth admin:** las 38 rutas `/admin/*` validan `isAdmin`/`isCerebroAdmin` server-side en CADA método.
  `admin/users/[id]` protege "no quitarte tu propio admin" y "no borrar el último admin".
- **Webhooks/crons:** todos los secretos comparados timing-safe (`timingSafeEqual`): inbox (`X-Telegram-…`),
  e2e callback (`E2E_CALLBACK_SECRET`), inbox/setup, crons (`Bearer CRON_SECRET` con fail-safe a 500).
- **Ownership de usuario:** `torneos/create` fuerza `organizer_id`, `ronda-libre/create` fuerza `creador_id`,
  drafts validan `owner_id===user.id`, `game/route.ts` valida organizer-o-dueño en capas.
- **`save_plan` con validación determinista dura** (`tools.ts:565-632`): revalida enums/rangos/longitudes del
  output del LLM antes de tocar la BD. El vector "score alucinado persiste como verdad en el histórico" **está
  cerrado**.
- **Seguridad de despliegue:** sin secretos en git (incidente `.env.vercel` cerrado en PR #53), sin leak de
  service-role al cliente, headers CSP/HSTS/X-Frame ejemplares en `next.config.js`, patrón Navbar prohibido
  NO regresó (callback de auth síncrono).
- **`error.tsx` boundaries** (PR #19) intactos: 14 boundaries + raíz cubren toda ruta, sin huérfanas.
- **Motor core WHS:** `courseHandicap18h/9h` aplica la fórmula completa **incluyendo (CR−Par)** + redondeo a
  entero. Stableford (tabla R&A Rule 32), match play singles (100% diff), countback USGA, `resolvePlayerTee`
  por jugador, `vsPar` solo sobre hoyos jugados — todos correctos y testeados.
- **Cron `taiger-insights`:** idempotente, auth dura, sin LLM (costo 0), sin riesgo de loop.

---

## Roadmap de remediación (orden recomendado)

**Sprint 1 — CERO FALLOS (bloquea torneo por equipos / scratch):**
1. P0-1 plus handicap (fix de 2 líneas + test). 
2. P0-2/P0-3 cablear course handicap WHS + allowance 85% a formatos de equipo, con tests de
   `strokesRecibidosEnHoyo` y de cada format (hoy **cero** cobertura en estas funciones).
3. P0-3/P0-4 idempotencia + guarda de estado en las 3 finalizaciones (clave única `historical_rounds`).
4. P0-6 cerrar RLS de `profiles` + **verificar en prod** RLS de `historical_rounds`/`player_patterns`.

**Sprint 2 — Integridad transaccional + observabilidad:**
5. P0-5 ledger de migraciones (script diff schema-prod vs repo).
6. P1-1/P1-2 RPC transaccional `start_tournament` + chequeo de error en inserts de equipos.
7. P1-6 `captureError` server-side real (desbloquea todo lo demás) → luego P1-7 inbox.

**Sprint 3 — Deuda IA + hardening:**
8. P1-3 decidir fallback del coach (migrar al gateway o ajustar la doc).
9. P1-4 cablear o desmantelar `cerebro_weights`/`decision-engine` + canario anti-huérfanos.
10. P1-8 pasar creación de ronda/torneo por `resolve_and_link_course`.
11. P2-1 red de seguridad en middleware para `/api/admin/*` (protocolo de archivo protegido).
12. Resto de P2/P3 al pasar, regla "el que toca, ordena".

---

## Anexo — Métricas

- 588 archivos productivos `.ts/.tsx` · 19 archivos >600 LOC (top: `ronda-libre/nueva/page.tsx` 2031,
  `[codigo]/page.tsx` 1929, `score-grupo/page.tsx` 1279).
- 202 llamadas `.from()` directas a Supabase en `src/app` fuera de `api/`, en 56 archivos.
- 418 `console.*` en 58 archivos (mayoría en `src/scripts/` one-off; 43 en 20 rutas API productivas).
- `npx tsc --noEmit`: **0 errores**. Prod `/api/health`: **200**.
- ~130 statements `ENABLE ROW LEVEL SECURITY`/`CREATE POLICY` en 22 de 69 migraciones (RLS amplio, no solo
  "código que se porta bien").
