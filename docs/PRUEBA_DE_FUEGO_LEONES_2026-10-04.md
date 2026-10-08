# PRUEBA DE FUEGO — Stableford Gross, Los Leones, domingo 4-oct-2026

> Branch `hotfix/torneo-leones-2026-10-04` · PR "Hotfix Torneo Los Leones 4-oct" (sin mergear).
> Trabajo: 04-oct 00:22 → 01:50 (hora Chile). Autor: Claude (Opus) · revisión: revisor-fable = CAMBIOS
> (P1 GWI y P2 modo null corregidos) → 2ª vuelta APROBADO (expediente `.claude/expedientes/2026-10-04-10-50.md`).
> Expediente: `.claude/expedientes/2026-10-04-04-17.md`.

VEREDICTO: 🟡 GO CON RIESGOS — **GO si se mergea el PR #504 antes del tee del 1.** PR CLEAN: todos los checks verdes, revisión Fable APROBADA (2ª vuelta), main (#501) integrado.
calcula el Stableford "Gross" EN NETO (🔴): un jugador con índice 18 que hace par en los 18 suma 57 en vez de 36.

Riesgos que quedan (no bloquean, todos con mitigación abajo):
- Push a seguidores: el código funciona y se dispara por cada guardado, pero **nunca se probó con un teléfono real**
  (Playwright headless no puede suscribirse a APNs/FCM) y **nunca nadie ha seguido una ronda de Juanjo**
  (0 seguidores en la historia). → Prueba de 2 minutos con un 2º teléfono antes de salir (sección 4).
- Supabase plan free: durante la prueba hubo un pico de 10-30 s de latencia que se recuperó solo. La app lo aguanta
  (respaldo local + reintentos), pero los seguidores verían el leaderboard atrasado mientras dure.
- No hay "levantar la bola" ni desempate por countback en ronda libre (ver hallazgos 🟠).

---

## 1. Tabla de componentes

| Componente | Esperado | Real | Estado | Evidencia |
|---|---|---|---|---|
| Prod = main | mismo commit | `39e1717a` = `origin/main` | ✅ | API Vercel deployments |
| Notificaciones en prod | en main y desplegado | #449 / #451 en main; `sw.js` prod idéntico al repo | ✅ | `git log`, diff `sw.js` |
| Tablas push (`round_watchers`, `push_subscriptions`) | aplicadas | existen con columnas y RLS de las migraciones 20260924 / 20260929 | ✅ | `information_schema`, `pg_policies` |
| Realtime | tablas de ronda libre publicadas | `rondas_libres`, `ronda_libre_jugadores` en `supabase_realtime` | ✅ | `pg_publication_tables` |
| VAPID | Prod + Preview | ambas keys en dev/preview/prod | ✅ | API Vercel env (solo nombres) |
| Migraciones pendientes | 0 | **ninguna migración nueva requerida**; `schema_migrations` no sirve para comparar (7 filas, se aplica por Management API) | ✅ | objeto por objeto |
| Pares Los Leones | 4 4 3 5 4 3 4 4 5 / 4 3 4 4 3 4 4 5 5 | idénticos (72) | ✅ | `course_holes` `8f64cd3a…` |
| CR/Slope negras/azul/blanco | 75.1/142 · 73.3/136 · 71.6/129 | idénticos | ✅ | `course_tees` |
| Stroke index Los Leones | 11 7 15 1 13 17 3 9 5 / 14 18 6 2 16 4 8 10 12 | 17 5 14 1 11 15 4 7 10 / 12 18 13 2 16 3 6 8 9 (14 de 18 distintos) | 🟠 (gross no lo usa) | `course_holes` |
| Stableford **gross** (puntos sin hándicap) | 36/18/28/40 | **prod: neto** (57 para índice 18) · **branch: 36/18/28/40** | 🔴→✅ con PR | test `leaderboard-stableford-gross.test.ts` |
| Puntos visibles para el marcador en gross | sí | **prod: ocultos** en `score-grupo` · branch: visibles | 🔴→✅ con PR | `PlayerScoreCard.tsx` |
| Guardado de 4 jugadores seguidos | cada uno a la BD | **prod: se pierde el anterior si < 500 ms** · branch: timer por jugador | 🔴→✅ con PR | test `useGrupoScoreSave.test.ts` |
| Banner "instala la app" en iPhone | no tapa el scorer | **prod: tapa "Siguiente →"** · branch: no se auto-muestra en scorer | 🟠→✅ con PR | test `PWAInstallBanner.test.tsx` |
| Seguidor ve el leaderboard | < 10 s | 0,7–3,3 s por hoyo (realtime) | ✅ | simulación 44/44 |
| Push al seguidor | llega con app cerrada | código OK, **sin verificación con teléfono real** | ⚠️ | ver §4 paso 4 |
| Cierre | `finalizada`, 18 hoyos en BD | ✅ | ✅ | simulación |

Nota de esquema: la ronda libre usa `rondas_libres.estado ∈ {en_curso, finalizada}` (no `rounds.status`, que es
de torneos). En prod la columna del torneo es `tournaments.name`, no `nombre` como dice el brief.

## 2. Hallazgos

### 🔴 Bloqueantes (los 3 corregidos en el PR)

1. **Stableford Gross calculaba puntos netos** en toda ronda libre. Ningún call-site miraba `modo_juego`:
   `src/lib/ronda/leaderboard.ts:75` (vista del seguidor), `score-grupo/components/PlayerScoreCard.tsx:51,63`
   (marcador), `score/hooks/useScoreboardCalc.ts:186,199`, `src/components/MiniLeaderboard.tsx:60`,
   `src/components/Scorecard.tsx:488`, `src/lib/ronda/share.ts:102`, `src/app/api/en-vivo/route.ts:118`.
   Reproducido: CH 21 con par en los 18 → **57 pts** en vez de 36.
2. **El marcador no veía los puntos en gross:** `showNetStableford = modoJuego !== 'gross'`
   (`useGrupoScoreboard.ts:79`) escondía los "pts" de cada jugador.
3. **Debounce compartido entre jugadores** (`useGrupoScoreSave.ts`, un solo `saveDebounceRef`): anotar a B y luego
   a D en menos de 500 ms cancelaba el guardado de B. A mitad de ronda lo tapa "Siguiente" (guarda a todos), pero
   en el hoyo 18, o si el teléfono se bloquea antes de avanzar, ese score sólo vivía en el teléfono y los
   seguidores no lo veían. Reproducido en Playwright: B bogey en pantalla, ausente en BD.

### 🟠 Degradan la experiencia

4. **Banner "Golfers+ funciona mejor como app"** aparece a los 3 s en iPhone (Safari, sin instalar) encima de la
   barra "Anterior / Siguiente / Finalizar" del scorer y bloquea el toque; su "×" mide 20 px. (Corregido en el PR.)
5. **El marcador nunca ve el panel de notificaciones** — es por diseño: el Navbar (único acceso al panel) se oculta
   en toda ruta `/score` (`src/components/Navbar.tsx:42`) y `score-grupo` no monta ningún componente de push.
   No impide nada: el marcador no necesita notificaciones. **Explica lo que Juanjo observó**, pero NO es la causa de
   que los seguidores no reciban: la causa es que **nadie apretó "Seguir"** (0 seguidores en todas sus rondas).
6. **Push del seguidor es "silencioso":** una notificación fija que se actualiza con la tabla (`sw.js:58`,
   `silent: true`), no suena ni vibra por birdie. Los avisos de birdie/cambio de líder son locales y sólo con la
   página abierta (`useRondaLibreLive.ts:113-126`). Decisión de producto de #449; no se cambia hoy.
7. **iPhone: push sólo con la app instalada** en la pantalla de inicio (iOS ≥ 16.4). En Safari, "Seguir" abre las
   instrucciones de instalación (`FollowRoundButton.tsx:122`). Android/Chrome funciona directo.
8. **Seguir exige la ronda `en_curso`** (`api/push/follow/route.ts:89`): los seguidores pueden seguir recién cuando
   Juanjo crea la ronda (no antes).
9. **No existe "levantar la bola" (pickup)**: golpes 1..15 (`golpes-por-hoyo.ts:9`); un hoyo vacío se rellena con
   **par** (2 pts) al avanzar o al finalizar. **Mitigación hoy: anotar doble bogey (par+2) = 0 pts**, idéntico en
   Stableford gross. Probado: C con pickup en el 1 → 26 ✅.
10. **Sin desempate en ronda libre:** `buildLeaderboard` deja a los empatados en orden de carga; el countback
    (últimos 9/6/3/1) existe sólo en torneos (`src/golf/core/countback.ts`). El desempate oficial lo define el
    comité del club.
11. **Stroke index de Los Leones en la BD no coincide con la tarjeta** (14/18 hoyos). Hoy no afecta (gross).
    Afecta el neto de cualquier ronda en Los Leones → SQL propuesto en §4 (requiere OK de Juanjo + tarjeta física).
12. **🟠→ CORREGIDO (`f7f4f2fc`, aprobado por Juanjo) — GWI ("probabilidad de ganar") en Stableford gross iba en NETO**
    (`src/app/api/gwi/ronda-libre/[codigo]/route.ts:112` pasa `courseHcpMap[j.id]`). Se ve en la página del
    seguidor tras el hoyo 3 (Pro; anónimos ven el upsell). Hoy: la tabla diría "D lidera" y el panel "A lidera
    90 %". **No se tocó por la regla 2** (el PR #501 reescribe ese archivo); fix de 1 línea en §7.
    Mitigación si no se aplica: ignorar el panel de probabilidad; la tabla de puntos es la correcta.
13. **CORREGIDO (rama `fix/torneo-gross-neto-claude`) — Torneos (tabla `tournaments`) tenían el mismo bug gross→neto.**
    Los puntos pasan por `handicapQueJuega` en los dos builders del board (total, puntos por hoyo del countback
    y GWI), en `puntajeDeHoyo` (lo que persisten los dos scorers y `/api/game`; `modo` ahora es obligatorio) y
    en `gwi-torneo.ts`. `resolveScoringCourseHcp` no cambia (el course handicap es del jugador) y el neto (tab
    "Neto") sigue repartiendo golpes. En prod: 0 torneos stableford gross (nada que recalcular).
    Pendiente aparte: `/api/torneos/[slug]/start` crea la ronda libre de cada grupo sin copiar `modo_juego`
    (ni `formato_juego` en individuales) → el scorer del grupo de un torneo neto/stableford muestra gross
    stroke play (Copa cabros, abril, 3 grupos) → issue #510.
14. **Supabase free:** pico transitorio de 1,5–4 s por query (10–30 s por hoyo en la simulación) a las 01:05, se
    recuperó solo. Riesgo para el evento; recomendación pendiente: plan Pro.

### 🟢 Cosméticos

15. El total del marcador va un hoyo atrás mientras el hoyo en curso queda en par sin tocar (se suma al avanzar).
16. **CORREGIDO (misma rama)** — `/api/en-vivo` repartía golpes con el índice crudo en neto; ahora usa la cadena
    del scorer (`cargarHoyosDelScorer` + `courseHandicapsDeRonda` + `buildLeaderboard`), un solo par por ronda,
    lecturas memoizadas por cancha y aislamiento por ronda.
17. `NEXT_PUBLIC_SITE_URL` no está en Preview.
18. `next` 16.3.8 no compila localmente en Windows (`next/font/google ... exactly one entry`); en Vercel sí. El
    checkout principal tiene 16.3.5 instalado (desactualizado respecto de `package.json`).
19. Realtime de espectador sin filtro por ronda (`useRondaRealtime.ts:41`): cada guardado de cualquier ronda gatilla
    un refetch en todos los espectadores. Con el tráfico actual no importa.

## 3. Fixes aplicados (PR, branch `hotfix/torneo-leones-2026-10-04`)

| Commit | Fix | Test (falla antes / pasa después) | Archivos |
|---|---|---|---|
| `875afe14` | Stableford Gross sin golpes de hándicap; puntos visibles para el marcador | `src/lib/ronda/leaderboard-stableford-gross.test.ts` (57≠36 antes), `src/golf/core/handicap-que-juega.test.ts` | `src/golf/core/rules.ts` (fuente única `handicapQueJuega`), `leaderboard.ts`, `PlayerScoreCard.tsx`, `useScoreboardCalc.ts`, `MiniLeaderboard.tsx`, `Scorecard.tsx`, `share.ts`, `api/en-vivo/route.ts`, fixtures `src/golf/core/__fixtures__/los-leones.ts` |
| `ad37baf2` | Banner de instalación no tapa el scorer | `src/components/PWAInstallBanner.test.tsx` | `PWAInstallBanner.tsx`, `src/lib/rutas.ts` (fuente única `esRutaDeScoring`), `LiveRoundIndicator.tsx`, `LiveBadge.tsx` |
| `de01bb2b` + `472c7c99` | Debounce de guardado por jugador | `useGrupoScoreSave.test.ts` › "marcador único…" | `useGrupoScoreSave.ts` |
| `272a377f` | Simulación E2E + limpieza | 44/44 | `scripts/qa-leones/*` |
| `f7f4f2fc` | Revisión Fable P1: GWI sin golpes en gross (Juanjo autorizó tocar el archivo de #501) | `src/__tests__/gwi-ronda-libre-gross.test.ts` (llama a la ruta real; 23≠0 antes) | `api/gwi/ronda-libre/[codigo]/route.ts` |
| `cf9e5297` | Revisión Fable P2: `modo_juego` null = gross (como el resto de la UI) | `handicap-que-juega.test.ts` | `rules.ts` |

Verificación (branch completo): `tsc --noEmit` **0 errores** · `vitest run` **417 archivos / 4.825 tests OK, 0 fallas** ·
`eslint src` **0 errores** (739 warnings previos; los archivos tocados no suman ninguno) · `next build` **OK**
(local con next 16.3.5, ver 🟢18; Vercel compila 16.3.8) · simulación Playwright **44/44**.

## 4. Lo que Juanjo debe hacer ESTA NOCHE / ANTES DE SALIR (en orden)

1. **Mergear el PR "Hotfix Torneo Los Leones 4-oct"** cuando los checks estén verdes (botón *Squash and merge*;
   nunca `--admin`). ~5 min. **Sin este paso los puntos salen en neto.**
2. **Esperar el deploy de Vercel** (~4 min) y confirmar que `golfersplus.vercel.app` abre. Claude lo verifica si
   se lo pides.
3. **No hay migraciones ni variables de entorno que tocar.**
4. **Prueba real de push, 2 minutos (antes de salir de la casa):** con tu teléfono crea una ronda de prueba; desde un
   2º teléfono (Android o iPhone con la app instalada) abre el link, toca **Seguir** y acepta permisos; anota un
   golpe en tu teléfono, toca *Siguiente* y bloquea el 2º teléfono: debe aparecer la notificación "en vivo"
   en < 20 s. Luego descarta la ronda de prueba.
5. ~~Borrar los datos de prueba QA_LEONES_~~ — **hecho** (0 registros, ver §8).
6. **Opcional, NO para hoy:** corregir el stroke index de Los Leones (sólo con la tarjeta física a mano):
   ```sql
   UPDATE course_holes SET stroke_index = CASE numero
     WHEN 1 THEN 11 WHEN 2 THEN 7 WHEN 3 THEN 15 WHEN 4 THEN 1 WHEN 5 THEN 13 WHEN 6 THEN 17
     WHEN 7 THEN 3 WHEN 8 THEN 9 WHEN 9 THEN 5 WHEN 10 THEN 14 WHEN 11 THEN 18 WHEN 12 THEN 6
     WHEN 13 THEN 2 WHEN 14 THEN 16 WHEN 15 THEN 4 WHEN 16 THEN 8 WHEN 17 THEN 10 WHEN 18 THEN 12 END
   WHERE course_id = '8f64cd3a-daed-4d97-98e9-7f8ef9552f2d';
   ```

**En el tee del 1 (Juanjo):** Ronda libre → *Club de Golf Los Leones* → formato **Stableford** → modo **Gross** →
**"Yo llevo el score del grupo"** → agrega a los 3 jugadores con su tee. Copia el link
`https://golfersplus.vercel.app/ronda-libre/<CÓDIGO>` y mándalo por WhatsApp. Si alguien levanta la bola: anota
**doble bogey** (0 pts). Al terminar el 18: **Finalizar ronda** (confirma con el 2º toque).

## 5. Instrucciones para los seguidores (mensaje para WhatsApp)

> Sigue el torneo en vivo: https://golfersplus.vercel.app/ronda-libre/CÓDIGO
> **Android:** abre el link en Chrome → toca **Seguir** → *Permitir notificaciones*. Listo.
> **iPhone:** abre el link en Safari → toca Compartir (↑) → *Agregar a pantalla de inicio* → abre Golfers+ desde
> el ícono → toca **Seguir** → *Permitir*. (Sin instalarla, igual puedes ver la tabla en vivo con el link abierto.)
> La notificación se actualiza sola con la tabla; no suena en cada hoyo.

## 6. PLAN B en cancha

- **Señal mala:** seguir anotando normal. Cada toque se respalda en el teléfono y se reintenta al volver la señal
  (probado: offline en el hoyo 7 → nada se perdió ni se duplicó). No cerrar la pestaña hasta ver los ✓ del hoyo.
- **La app se cierra / el teléfono se reinicia:** volver a abrir el link del scorer; retoma en el hoyo donde iba
  (probado: reload en el 11 → vuelve al 12 con todo).
- **Se cae Golfers+ entero:** anotar en la tarjeta de papel (que de todas formas es la oficial) y cargar los hoyos
  después desde el mismo scorer: se puede volver atrás con *← Anterior*.
- **Sin notificaciones:** los seguidores dejan el link abierto; la tabla se actualiza sola en 1–3 s (realtime) o
  cada 15 s si el realtime se corta. También en `https://golfersplus.vercel.app/en-vivo`.
- **Dos teléfonos:** se puede abrir el scorer en un 2º teléfono del mismo usuario (probado), pero **que anote uno
  solo** para no pisarse.

## 7. Conflictos con otros branches activos

| Archivo | Branch / PR | Qué hice |
|---|---|---|
| `src/lib/data/ronda-libre.ts` (`courseHandicapsDeRonda`) | `fix/concede-historial-juanjo-claude` (#502) | **No se tocó**: el fix va donde se calculan puntos, no en la fuente del CH (que #502 cambia y necesita para el tope WHS). |
| `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` | #502 | **No se tocó**: el fix vive dentro de `PlayerScoreCard`. |
| `src/app/api/gwi/ronda-libre/[codigo]/route.ts` → `src/lib/data/gwi-ronda-libre.ts` | #501 (**mergeado a main durante la noche**) | Con OK de Juanjo se aplicó la línea gross (`f7f4f2fc`); al mergearse #501 hubo conflicto → merge de main `491a7bf8` (sin rebase ni force-push): se tomó el handler de #501 y la línea pasó a `gwi-ronda-libre.ts`. Test verificado sobre la estructura nueva (falla sin la línea). |

## 8. Datos QA creados y limpieza

Base: **producción** (el Preview usa la misma base de Supabase que prod: una sola `NEXT_PUBLIC_SUPABASE_URL` para los
3 entornos). Todo con prefijo: `rondas_libres.course_name = 'QA_LEONES_TORNEO'`, jugadores invitados
`QA_LEONES_A..D` (sin cuenta), marcador = usuario E2E existente. Sin seguidores, sin historial, sin usuarios nuevos.

| Código | id | estado |
|---|---|---|
| QXNJ7W | 9634aec7-3680-42b8-a92a-780eb0071265 | en_curso (corrida abortada) |
| QDQGPW | fd28c2d7-0cd2-4739-9f42-9929fb5046be | en_curso (corrida abortada) |
| QDVR2H | b2574c9d-d1ff-40ca-be69-0774f1048105 | en_curso (corrida abortada) |
| QDX3NX | 1d99ca90-c0c4-4110-9581-e3601b03238e | en_curso (corrida abortada) |
| QPJEPA | 4af1d2eb-b441-4237-a176-53e675f908e1 | en_curso (corrida 33/40) |
| Q2DQCX | d3c008ab-70b0-4665-87ce-4843f3ea2b27 | en_curso (pico de latencia) |
| QG3HJ6 | 4838a184-e932-49bf-b0b2-62d25bc9a7c8 | finalizada (corrida 44/44) |

28 jugadores (4 por ronda). **Limpieza EJECUTADA con autorización explícita de Juanjo (04-oct ~02:00):**
`scripts/qa-leones/limpieza.mjs --apply` → `VERIFICACIÓN: rondas=0 jugadores=0 watchers=0 historial=0`, y query
independiente: `rondas_libres LIKE 'QA_LEONES_%' = 0 · ronda_libre_jugadores LIKE 'QA_LEONES_%' = 0 · round_watchers = 0`.

---

# Anexo — detalle por fase

## FASE 0 — ¿Lo que creemos que está en prod está en prod?

**Hallazgo de contexto (cambia el foco de todo el resto):** Juanjo **no** juega sus "torneos" con la tabla
`tournaments`. Sus 6 rondas recientes son **rondas libres en modo administrador** (`rondas_libres.admin_mode=true`,
él anota a todos), la última `I3P381` el 02-oct en Los Leones (3 jugadores). En prod **no existe** ningún torneo
creado para el 04-oct en Los Leones. Toda la prueba se hace sobre el camino de **ronda libre admin**, que es el
que se va a usar hoy; `tournaments` queda como nota.

| Componente | Esperado | Real (prod) | Estado | Evidencia |
|---|---|---|---|---|
| Commit en prod | = `origin/main` | `39e1717a` (#503) = `origin/main` HEAD | ✅ | API Vercel v6/deployments, target=production, READY 01:50 UTC |
| Código de notificaciones | en main | en main: #449 (`7d4f0570`, marcador en vivo + seguir sin cuenta), #451 (`511c4e4a`) | ✅ | `git log origin/main` |
| Service worker `/sw.js` | = repo | idéntico a `public/sw.js` (solo difiere EOL); listeners `push`, `notificationclick`, `pushsubscriptionchange` | ✅ | `diff` contra `curl /sw.js` |
| Tabla `round_watchers` (+ `push_subscription_id`, anon) | migraciones 20260924 + 20260929 aplicadas | columnas `id,user_id,ronda_codigo,created_at,push_subscription_id`; 4 policies solo `authenticated` | ✅ | `information_schema.columns`, `pg_policies` |
| Tabla `push_subscriptions` | 006 + 20260929 | existe; 9 suscripciones (2 anónimas, 4 de Juanjo) | ✅ | query |
| Publication `supabase_realtime` | tablas de ronda libre | `rondas_libres`, `ronda_libre_jugadores` (nada de `tournaments`/`hole_scores`) | ✅ para ronda libre | `pg_publication_tables` |
| `schema_migrations` | refleja el repo | solo 7 filas (el proyecto aplica SQL por la Management API, no por CLI) → **no sirve** para comparar; se verificó objeto por objeto | ⚠️ | query |
| Uso real del feature | seguidores en rondas de Juanjo | **1 watcher en toda la historia** (`RLS7844B`, prueba del 02-oct). **0 watchers** en las rondas de Juanjo | 🔴 señal | `round_watchers` |
| Env VAPID | Prod + Preview | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` en development, preview y production | ✅ | API Vercel v10/env (solo nombres) |
| `NEXT_PUBLIC_SITE_URL` | Prod + Preview | solo production | 🟢 | idem |
| Cancha Los Leones (`8f64cd3a…`) pares | 4 4 3 5 4 3 4 4 5 / 4 3 4 4 3 4 4 5 5 | idéntico, par 72 | ✅ | `course_holes` |
| CR/Slope Black/Blue/White | 75.1/142 · 73.3/136 · 71.6/129 | `negras` 75.1/142 · `azul` 73.3/136 · `blanco` 71.6/129 | ✅ | `course_tees` |
| Stroke index por hoyo | 11 7 15 1 13 17 3 9 5 / 14 18 6 2 16 4 8 10 12 | **17 5 14 1 11 15 4 7 10 / 12 18 13 2 16 3 6 8 9** — 14 de 18 distintos; `si_verificado=false` | 🟠 hoy (gross no usa SI) / 🔴 para cualquier ronda neta en Los Leones | `course_holes` |

Nota de esquema: el brief dice `tournaments.nombre`; en prod la columna es **`tournaments.name`**. Rondas libres
usan `course_name`. No se renombra nada.

## FASE 1 — Matriz de visibilidad (ronda libre admin_mode)

| Rol | Debería ver | Ve realmente | Evidencia |
|---|---|---|---|
| Creador / marcador (Juanjo) en `score-grupo` | anotar + puntos | anota y (con el PR) ve los pts gross; **no ve panel de notificaciones** (Navbar oculto en `/score`) ni recibe push propio | `Navbar.tsx:42`, `score-grupo/page.tsx` sin imports de push |
| Jugador cuyo score anota otro (invitado o con cuenta) | su tarjeta en vivo | abre `/ronda-libre/CÓDIGO` como espectador; si abre `/score` lo redirige al leaderboard ("El admin de grupo lleva tu score") | `useRondaScoreData.ts:89-96` |
| Seguidor logueado | tabla en vivo + push | tabla en vivo (realtime) + **Seguir** → push a todos sus dispositivos | `follow/route.ts:97-100` |
| Visitante anónimo | tabla en vivo + push | igual que el logueado; identidad = el dispositivo; iPhone sólo con la app instalada | migración `20260929_round_watchers_anon.sql` |

Flujo marcador único (punto c del brief): el push NO depende de `auth.uid()` del dueño de la tarjeta. Cada guardado
del marcador (para cualquiera de los 4) llama a `/api/push/round-update`, el servidor autoriza al marcador como
`adminUserId` (`round-snapshot.ts:154`), lee el estado desde la BD (no confía en el cliente) y envía a TODOS los
seguidores, sin excluir a nadie (`watchers.ts:153-156`). No hay trigger SQL de notificaciones: el envío es por API
con service role, así que la RLS de `round_watchers` (sólo `authenticated` y sólo lo propio) no interfiere.
Throttle: 1 envío inmediato + 1 agrupado cada 15 s por ronda (`round-notifications.ts:337-365`).

Realtime (punto e): canal `ronda-${codigo}` sobre `ronda_libre_jugadores`, **sin filtro** (🟢19), con
`removeChannel` en el unmount (`useRondaRealtime.ts:41-53`) y polling de 15 s si se desconecta
(`useRondaLibreLive.ts:155`).

Push (punto f): SW registrado globalmente (`PWAInstallBanner.tsx:45`); permisos en `ensurePushSubscription`
(`push-notifications.ts:116-130`); iOS < 16.4 o fuera de la PWA → no soportado (`push-notifications.ts:58-62`).

## FASE 2 — Motor Stableford Gross

- Modalidad: `rondas_libres.modo_juego ∈ {gross, neto}` + `formato_juego = 'stableford'`; la creación permite
  Stableford Gross (`SelectorFormato.tsx:101-147`) y el texto de ayuda promete "el handicap no entra en juego".
  El motor no lo respetaba (🔴1). Fix: `handicapQueJuega(modo, ch)` — gross → 0, igual que `calcularMatchPlay`.
- Tabla de puntos R&A (albatros 5 … doble bogey o peor 0): `src/golf/core/scoring.ts:21-36` ✅ (test albatros/eagle).
- Fixtures (unit + E2E): A 36 · B 18 · C 28 · D 40 · C con pickup en el 1 → 26 · índice 18 = sin índice ✅.
- Orden: puntos DESC (`leaderboard.ts:84`) ✅. Desempate: no existe en ronda libre (🟠10).
- Bug parTotal vs parJugado (-72): no aplica; vs par contra par jugado (`round-score.ts:62-69`), test "mitad de
  ronda" ✅.

## FASE 3 — Simulación (scripts/qa-leones/simulacion.mjs)

Contra el build local del branch (`next start`, mismo código que el Preview; el Preview tiene protección SSO sin
bypass de automatización y usa la misma base que prod). iPhone 13 (marcador, logueado) + Pixel 7 (seguidor anónimo).
Resultado final **44/44** (`scripts/qa-leones/resultado.json`): puntos del marcador en el 10 y el 18, BD y
leaderboard del seguidor en cada hoyo (0,7–3,3 s), offline en el 7, corrección en el 5, reload en el 11 (retoma en
el 12), 2º dispositivo, hoyos tocados del 18 en BD antes de cerrar, cierre `finalizada` con 18 hoyos × 4, totales
36/18/26/40 y orden D-A-C-B en la pantalla del seguidor, sin errores JS.

Fuera de alcance de la simulación (declarado): entrega real de Web Push a un teléfono (headless no puede
suscribirse a APNs/FCM) → prueba manual §4 paso 4; "cada jugador logueado ve su tarjeta" (los 4 QA son invitados,
como los compañeros de Juanjo hoy).

Corridas fallidas previas y su causa (todas resueltas): banner PWA tapando "Siguiente" (🟠4, fix), debounce
compartido (🔴3, fix), `networkidle` nunca llega con realtime abierto (script), regex "Finalizar" vs
"finalizar" (script), pico de latencia de Supabase (🟠14).

