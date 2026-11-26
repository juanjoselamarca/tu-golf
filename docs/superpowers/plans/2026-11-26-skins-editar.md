# «Editar» el Skins antes del primer golpe — plan de implementación

> **Para el agente:** ejecutar tarea por tarea, TDD, un commit por tarea (español, `Sesión de juanjoselamarca` +
> Co-Authored-By). Spec: `docs/specs/formato-skins.md` → «Editar antes del primer golpe» (manda sobre este plan).
> Worktree `.claude/worktrees/skins-editar`, rama `feat/skins-editar-juanjo`, base `feat/skins-congelado-juanjo` (#892).
> Archivo de estado: `.claude/estado/skins-editar.md` (crearlo y anotar cada avance).

**Objetivo:** el creador de un Skins de ronda libre puede, mientras no exista el primer golpe, cambiar índice o tee de
un jugador, sumar y sacar jugadores; lo congelado (golpes y hoyos) se regraba en el mismo paso, atómico.

**Arquitectura:** `PUT /api/ronda-libre/[codigo]/skins/jugadores` (sesión + creador + validación + contexto, igual que
crear) → con service_role llama a la RPC `editar_jugadores_skins` (una transacción, `FOR UPDATE` de la ronda, rechaza
con primer golpe, aplica el diff y graba `reglas_juego`). UI: botón «Editar» en la página de la ronda y en el scorer;
los dos abren la misma hoja con `TarjetaDeRival`.

**Stack:** Next.js 16 route handler, Supabase (PostgREST + plpgsql), React, vitest, pruebas SQL de `scripts/ci/pruebas-sql/`.

---

## Mapa de archivos

| Archivo | Rol |
|---|---|
| `supabase/migrations/20261126100000_skins_editar_jugadores.sql` (+ `rollback/`) | RPC `editar_jugadores_skins` |
| `scripts/ci/pruebas-sql/skins-editar.sql` | pruebas con roles reales (patrón de `skins-congelado.sql`) |
| `src/lib/data/ronda-libre-jugadores-filas.ts` | **extraído** de `create/route.ts`: arma las filas de `ronda_libre_jugadores` (un concepto, una fuente) |
| `src/lib/data/skins-editar.ts` (+ test) | arma el pedido de edición: valida, contexto, `congelarContextoSkins`, diff vs jugadores actuales |
| `src/app/api/ronda-libre/[codigo]/skins/jugadores/route.ts` (+ test) | ruta delgada: sesión, creador, llama a lib, mapea errores |
| `src/app/ronda-libre/[codigo]/components/skins/EditarSkins.tsx` (+ test) | botón «Editar» + hoja |
| `src/app/ronda-libre/[codigo]/components/skins/hooks/useEditarSkins.ts` (+ test) | estado de la hoja, guardar, errores |
| `src/app/ronda-libre/[codigo]/components/skins/SkinsEnVivo.tsx`, `score-grupo/page.tsx` | montar el botón (solo creador, sin primer golpe) |
| `src/app/api/ronda-libre/create/route.ts` | usar `ronda-libre-jugadores-filas.ts` (y `skins-editar` comparte el mismo validador) |

`create/route.ts` tiene 508 LOC con lógica en la ruta: regla «el que toca, ordena» → la extracción de la tarea 1
es obligatoria antes de reutilizar.

---

### Tarea 1: extraer las filas de jugadores de `create/route.ts`

- Mover el `body.jugadores.map(...)` que arma `playerRows` (route.ts ~382-405) a
  `filasDeJugadores({ jugadores, rondaId, creadorId, jugadorIds?, perfilesValidos, teesDeLaRonda })` en
  `src/lib/data/ronda-libre-jugadores-filas.ts`. Misma salida, byte a byte (incluido: `user_id` solo en la posición 0,
  `perfil_sugerido_id` solo si existe y es válido, `scores: {}`).
- Test unitario del módulo con los casos actuales (creador con user_id, rival con perfil, invitado, sin jugadorIds).
- `npx vitest run src/app/api/ronda-libre/create` debe seguir verde sin tocar sus tests.
- Commit: `refactor(ronda-libre): las filas de jugadores de una ronda nueva viven en src/lib/data`.

### Tarea 2: RPC `editar_jugadores_skins` (TDD con prueba SQL primero)

Firma: `editar_jugadores_skins(p_ronda_id uuid, p_jugadores jsonb, p_reglas_juego jsonb) RETURNS void`,
`SECURITY DEFINER`, `SET search_path = public`, EXECUTE solo `service_role` (REVOKE de PUBLIC, anon, authenticated).
`p_jugadores` = arreglo de filas completas `{id, nombre, user_id, perfil_sugerido_id, handicap, tees, is_guest,
telefono_invitado, nombre_invitado}` en el orden final.

Cuerpo:
1. `SELECT ... FROM rondas_libres WHERE id = p_ronda_id FOR UPDATE`; si no existe o `formato_juego <> 'skins'` →
   `RAISE ... ERRCODE 'P0002'`.
2. Si existe fila en `ronda_libre_primer_golpe` o `ronda_libre_tiene_golpes(p_ronda_id)` →
   `RAISE EXCEPTION 'SKINS_CONGELADO: el Skins ya empezó. Desde el primer golpe no se edita.' USING ERRCODE = 'P0003'`.
3. Validar que `p_reglas_juego->'jugadorIds'` sea exactamente la lista de ids de `p_jugadores`, en orden; si no, P0001.
4. `DELETE` de jugadores de la ronda cuyo id no viene; `UPDATE` de nombre/handicap/tees/perfil/invitado de los que
   vienen y existen (nunca `user_id` de un existente: el creador sigue siendo el de la posición original; un rival
   nunca recibe `user_id`, ver #581); `INSERT` de los nuevos con `scores '{}'` (rechazar `user_id` no nulo en un
   nuevo: P0001).
5. `UPDATE rondas_libres SET reglas_juego = p_reglas_juego WHERE id = p_ronda_id`.
Los triggers de #892 corren igual (no hay golpes → dejan pasar; congelado viene de service_role → pasa).

Prueba SQL `scripts/ci/pruebas-sql/skins-editar.sql` (copiar el arnés de `skins-congelado.sql`; corre en el check
`esquema`, con rollback, nunca prod). Casos mínimos:
- service_role sin golpes: cambia índice, tee, suma, saca → filas y `reglas_juego` quedan como se pidió.
- con primer golpe (por `upsert_ronda_libre_scores`) → P0003 y nada cambió.
- marca de primer golpe con tarjetas vaciadas → P0003.
- authenticated (creador) llamando la RPC → 42501.
- jugadorIds que no calzan → P0001 sin cambios; nuevo con user_id → P0001.
- ronda Timba → P0002.
- Discriminación: correr la prueba contra una versión de la RPC sin el paso 2 y anotar qué casos caen.
Correrla contra la base de pruebas como se hizo en #892 (ver `.claude/worktrees/skins-congelado/.claude/estado/skins-congelado.md`,
driver `postgres` en el scratchpad, `TEST_DB_PASSWORD`).

Rollback en `supabase/migrations/rollback/`. `schema.sql`: tomarlo del artifact `schema-sql` del check `esquema`
(sin Docker local). Commit: `feat(sql): editar los jugadores de un Skins antes del primer golpe, en un solo paso`.

### Tarea 3: `src/lib/data/skins-editar.ts`

`prepararEdicionDelSkins(supabase, { ronda, jugadoresActuales, pedido, creadorId })` →
`{ ok: true; filas; reglas } | { ok: false; status: 400 | 409 | 503; error }`:
- Rechazo de dos decimales con `MENSAJE_HANDICAP_UN_DECIMAL` (igual que la ruta de crear, mismo texto con nombre).
- Reusar `skinsParaCrearRonda` con los datos de la ronda guardada (cancha, holes, hoyo_inicio, recorridos, tees,
  modo, `reglas_juego.config`) y `nuevoId` que devuelve el id existente de cada jugador que ya estaba y
  `crypto.randomUUID()` para los nuevos. Así la validación y el congelado son los mismos que al crear.
- La config del Skins (pozo, variantes) NO viene del cliente: se toma de `leerReglasSkins(ronda.reglas_juego).config`.
- Filas con `filasDeJugadores` (tarea 1). El creador (posición 0, `user_id`) no se puede sacar → 400.
Tests: el congelado resultante calza con `contextoDelSkinsGuardado` sobre la ronda editada (origen `'congelado'`);
cambiar un índice cambia el CH congelado; los ids existentes se conservan; el cliente no puede colar `config` ni
`congelado`; sacar al creador → 400.
Commit: `feat(skins): preparar la edición de jugadores con el mismo validador y congelado que crear`.

### Tarea 4: ruta `PUT /api/ronda-libre/[codigo]/skins/jugadores`

Delgada (sin lógica de negocio): `CODIGO_RONDA_VALIDO`; `getClaims` → 401; zod del body (jugadores con la misma
forma que en create); lee ronda + jugadores con el cliente de la sesión; si `user.id` no es el creador → 403;
`prepararEdicionDelSkins`; `createAdminClient().rpc('editar_jugadores_skins', ...)`. Errores: P0003 → 409 con
«El Skins ya empezó. Desde el primer golpe no se edita.»; P0002 → 404; otro → `captureError` + 503. Headers
`HEADERS_PRIVADO_NO_STORE`. Tests de ruta: 401, 403, 400 (dos decimales), 409 (RPC P0003), 503 (admin lanza),
200 con la RPC llamada con reglas que traen `congelado` y `jugadorIds` del servidor.
Commit: `feat(skins): API para editar los jugadores antes del primer golpe`.

### Tarea 5: UI — hook + hoja + botón

- `useEditarSkins`: carga jugadores actuales a estado editable (mismo tipo `RivalDelCreador`), agregar/quitar,
  `guardar()` con PUT; con 409 muestra el mensaje y cierra la hoja al tocar «Entendido»; con éxito cierra y pide
  refrescar el juego (mismo mecanismo que ya usa la página para recargar). Bloqueo de guardar mientras alguna tarjeta
  `bloquea` (onBloqueo de `TarjetaDeRival`).
- `EditarSkins.tsx`: botón secundario «Editar» (≥44 px, tokens de `DESIGN.md`, contraste AA en claro y oscuro) y
  hoja inferior con las tarjetas, «+ Sumar jugador», quitar con confirmación, pie con «Pozo: $X · N jugadores»
  (calcular con la función canónica del pozo del motor, `src/golf/formats/skins/`; no recalcular a mano) y
  «Guardar». Estados: cargando, guardando, error, ya empezó.
- Visible solo si el visor es el creador y no hay primer golpe. Exponer `skinsEmpezado` en lo que ya carga el juego
  (ruta `juego` o el estado que ya usa `SkinsEnVivo`) leyendo `ronda_libre_primer_golpe`/golpes; no una query nueva
  desde `src/app/`.
- Montar en `SkinsEnVivo.tsx` (sobre la tabla) y en `score-grupo/page.tsx` (sobre el hoyo de salida). Si
  `score-grupo/page.tsx` supera 600 LOC, aplicar «el que toca, ordena» antes.
- Tests de componente: no creador no ve el botón; con primer golpe no se ve; quitar pide confirmación; 409 muestra el
  mensaje; pie del pozo cambia al sumar.
Commit(s): `feat(skins): botón «Editar» y hoja para corregir jugadores antes del primer golpe`.

### Tarea 6: verificación y PR

1. `VITEST_MAX_WORKERS=4 npm run verify > .claude/verify-editar.log 2>&1` en PRIMER PLANO; `tail` del log.
2. Capturas a 390 px (Playwright, `reference_visual_review_playwright`) de: página de la ronda con botón, hoja abierta,
   hoja con error 409, scorer con botón; claro y oscuro.
3. Push; PR con base `feat/skins-congelado-juanjo`, labels `operador:juanjo`, título con «no mergear antes del dom 29-nov;
   va después de #892». Cuerpo: qué, cómo, pruebas, discriminación de la prueba SQL, aviso de migración
   (aplicar sin evento en vivo).
4. NO pedir revisión ni mergear: lo hace el hilo principal (`revisor-fable`, zona crítica + pantalla nueva).
