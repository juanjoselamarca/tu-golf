# Spec — Dedup de canchas duplicadas (manual ↔ fedegolf)

**Fecha:** 2026-06-10
**Autor:** Claude (CTO)
**Estado:** Diseño aprobado por Juanjo (Opción A). Pendiente: writing-plans → eng-review → implementación.
**Relacionado:** [[project_indice_engine_fix]], [[project_cancha_duplicada_los_leones]], import-hardening (PRs #122/#131/#138), `src/golf/courses/matching.ts`, `src/golf/courses/tee-resolver.ts`.

---

## 1. Problema

El catálogo de canchas tiene fichas DUPLICADAS del mismo club físico: una versión **manual** (creada por imports tempranos / golfcourseapi) y una versión **fedegolf** (oficial, con ratings WHS por tee y género). Síntomas:

- El mismo club se muestra con nombres distintos en la UI ("Los Leones" / "Club de Golf Los Leones" / "C.G. Los Leones - Los Leones (VARONES)").
- Las rondas viejas viven en la ficha manual, cuyos ratings de tee difieren levemente de los oficiales fedegolf (ej. Los Leones azul-M: manual 73.7/137 vs oficial 73.3/136) → diferenciales 18h levemente incorrectos.
- Algunas fichas manuales no tienen tees (`course_tees` vacío) → sus rondas no resuelven CR/slope del catálogo.
- La columna `courses.canonical_course_id` existe (la creó import-hardening) pero está **vacía** → el matcher no puede redirigir duplicados.

**Impacto:** bajo en magnitud (el índice casi no se mueve — son correcciones finas) pero real en correctitud y en presentación. Es limpieza histórica; la prevención hacia adelante ya la cubre el matcher de import-hardening.

## 2. Alcance

**Universo:** solo las canchas EN USO (con rondas). De las ~193 canchas del catálogo, solo **13 tienen rondas**. De ésas, hay **3 clusters de duplicado real**:

| Cluster | Manual (en uso) | Fedegolf (oficial) |
|---|---|---|
| **Los Leones** | `8f64cd3a` — activa, 246 rondas / 16 usuarios, 4 tees | `b1b6ba60` VARONES (inactiva, 1 ronda) + `348ce623` DAMAS (activa, 0 rondas) |
| **La Dehesa** | `8fb8c2ce` — activa, 38 rondas / 10 usuarios, **0 tees** | `01a0ec3f` VARONES + `785378dc` DAMAS (con tees oficiales, 0 rondas) |
| **Lomas de La Dehesa** | `dff847e1` — activa, 13 rondas / 2 usuarios, 3 tees | `b4bca060` VARONES + `f076395b` DAMAS (con tees oficiales, 0 rondas) |

**Confirmado por Juanjo (golfista):** "La Dehesa" y "Lomas de La Dehesa" son **clubes DISTINTOS** (lo respaldan ratings muy distintos: azul 71.8/128 vs 72.6/145). Cada uno se fusiona SOLO con su propia ficha fedegolf, NUNCA entre sí.

**Fuera de alcance (follow-ups):**
- Poblar `canonical_course_id` para las ~180 canchas SIN rondas (limpieza masiva del catálogo). No urge: sin rondas, no afectan a ningún usuario.
- Fichas manuales sin tees que NO son duplicado de una fedegolf (ej. Los Inkas, Paico Alto con 0 tees) → problema de datos distinto (falta el rating), no dedup.

## 3. Decisión de diseño: Opción A (la ficha MANUAL gana)

Para los 3 clusters, **la ficha manual es la canónica**. Se le corrigen/completan los tees a los valores oficiales fedegolf, se apuntan las fichas fedegolf → manual vía `canonical_course_id`, y se desactivan las fedegolf.

### Por qué A y no "fedegolf gana + repointear rondas" (Opción B descartada)

| Criterio | A (manual gana + corregir tees) | B (fedegolf gana + repointear) |
|---|---|---|
| Rondas reales tocadas | **0** (no se mueve `course_id`) | 246+38+13 filas de 16 usuarios |
| Split de género | Resuelto: la ficha manual es mixta (genero_norm X) y ya tiene tees M y F → el resolver desambigua por género del usuario | Problema: fedegolf parte cada club en VARONES/DAMAS; las rondas no guardan género → habría que rutear cada una por el perfil |
| Wiring del resolver | **No necesita** — las rondas ya están en la ficha canónica; al corregir SUS tees, `recomputeRoundsFromCatalog` (course_id crudo) ya da el rating correcto | Requiere cablear el resolver a seguir `canonical_course_id`, o repointear |
| Nombre mostrado | Limpio ("Club de Golf Los Leones") | Feo ("C.G. Los Leones - Los Leones (VARONES)") salvo limpieza extra |
| Riesgo | Mínimo (corregir ~3 números de tee + flags) | Alto (cientos de filas de usuarios reales + ruteo de género) |

**A logra el mismo resultado final** (ratings oficiales, una ficha activa por club, imports nuevos consistentes) tocando muchísimo menos data real. El matcher ya honra `canonical_course_id` (devuelve la canónica si la ganadora la tiene), así que poner `fedegolf.canonical_course_id = manual` hace que los imports nuevos también caigan en la ficha manual. Consistente old + new.

### El wrinkle de género — resuelto sin esfuerzo

`resolveRatings(tees, color, holes, genero)` ya desambigua por la columna `course_tees.genero` (M/F). La ficha manual mixta tiene tees con `genero` M y F (ej. Los Leones: rojo=F, blanco/azul/negras=M). Por lo tanto el resolver elige el tee correcto por género del usuario **sin** que necesitemos las fichas split de fedegolf. Las fichas fedegolf VARONES/DAMAS solo se redirigen y desactivan.

## 4. Aplicación por cluster

### 4.1 Los Leones (`8f64cd3a` canónica)
Corregir tees de la manual a los oficiales fedegolf (`b1b6ba60` VARONES + `348ce623` DAMAS):
- azul-M: 73.7/137 → **73.3/136** (front-9 ya 37.2/132, correcto — no tocar)
- blanco-M: 71.8/130 → **71.6/129** (front 36.2/128, correcto)
- negras-M: 75.1/142 (agregar front 37.8/137, hoy null)
- rojo-F: 74.8/131 (verificar vs DAMAS oficial; si difiere, corregir)
- (dorado-M 68.3/121 existe en fedegolf y no en manual — opcional agregar; ningún usuario lo usó. Decisión: agregarlo por completitud.)
- `b1b6ba60` + `348ce623`: `canonical_course_id = 8f64cd3a`, `activa = false`.
- La 1 ronda suelta en `b1b6ba60`: repointar `course_id → 8f64cd3a`.

### 4.2 La Dehesa (`8fb8c2ce` canónica, hoy 0 tees)
La manual no tiene tees → sus 38 rondas no resuelven del catálogo. **Copiar los tees oficiales** desde la fedegolf VARONES (`01a0ec3f`) + DAMAS (`785378dc`) a la ficha manual (insertar filas en `course_tees` con `course_id = 8fb8c2ce`, género correcto por tee). Luego `canonical_course_id` + `activa=false` en las fedegolf.

### 4.3 Lomas de La Dehesa (`dff847e1` canónica, 3 tees)
Corregir/completar los 3 tees existentes a los oficiales fedegolf (`b4bca060` + `f076395b`) y agregar los faltantes. `canonical_course_id` + `activa=false` en las fedegolf.

### 4.4 Después de cada cluster
Re-correr `recomputeRoundsFromCatalog(supabase, userId, {dryRun:false, genero})` + RPC `calcular_indice_golfers` **para cada usuario afectado** del cluster → sus diferenciales 18h se actualizan a los ratings corregidos. Reusa el motor ya mergeado (PR #144) vía el endpoint admin `/api/admin/recompute-indice` o el script.

## 5. Barrido aparte: rondas duplicadas (NO es dedup de cancha)

Hallado al verificar el índice: la ronda del 03-may-2026 de Juanjo aparece 2 veces (mismo user + fecha + score 96 + 18h, distinto course_name string). Es un **duplicado de RONDA** (import doble), distinto del dedup de canchas.

Sweep: detectar rondas exacto-duplicadas por `(user_id, played_at, holes_played, total_gross, course_id-canónico)` y borrar las extra (conservar la más antigua por `created_at`). Dry-run + backup + listar cada borrado antes de aplicar. Hoy no afecta el índice (ambas fuera del best-8) pero un duplicado en el best-8 contaría doble. Se hace en su propio paso del plan, con su propio gate.

## 6. Edge cases y riesgos

- **Corregir tees mueve el índice de OTROS 16 usuarios**, no solo Juanjo. → El dry-run debe mostrar el delta de índice **por usuario** antes del apply. Esperado: deltas chicos (<0.3). Cualquier delta grande se investiga antes de aplicar.
- **Tees con front/back 9 (loops):** preservar `front_*` / `back_*` al corregir. La fórmula de 9h depende de ellos.
- **Género del tee:** al copiar/corregir, respetar `course_tees.genero` (M para VARONES, F para DAMAS). Un error acá rompe la desambiguación.
- **Idempotencia:** todo el script debe ser re-ejecutable (UPSERT por `(course_id, nombre, genero)`, flags seteados a valor absoluto, no toggles).
- **Fichas fedegolf con rondas:** solo `b1b6ba60` tiene 1 ronda. Repointar esa antes de desactivar. Verificar que NINGUNA otra fedegolf a desactivar tenga rondas (query de guardia).
- **Constraint de `canonical_course_id`:** verificar que no haya FK/constraint que impida apuntar fedegolf→manual (dirección "inversa" a la intención original). Si la hay, ajustar.
- **No fusionar clubes distintos:** La Dehesa ≠ Lomas (confirmado). El script opera por `course_id` explícito listado, NUNCA por matcheo de nombre difuso.

## 7. Protocolo de ejecución (CERO FALLOS)

Por cada cluster, en orden (Los Leones primero como plantilla):
1. **Dry-run** (read-only): mostrar tees actuales vs oficiales, qué cambia, y el **delta de índice por usuario afectado**.
2. **OK de Juanjo** sobre la tabla de impacto (gate de data real irreversible).
3. **Backup** de las filas a tocar (`courses`, `course_tees`, `historical_rounds` afectadas) a archivo JSON.
4. **Apply** (transacción): corregir/insertar tees + setear `canonical_course_id`/`activa` + repointar rondas sueltas.
5. **Recompute** + RPC por usuario afectado.
6. **Verificar:** mismo-club-mismo-nombre en la UI, diferenciales consistentes, índices sanos.
7. **code-reviewer** (motor matemático = doble revisión) → PR → deploy → smoke.

## 8. Testing

- **Unit:** función pura `planTeeCorrections(manualTees, fedegolfTees)` → devuelve el set de UPSERTs (corrige existentes, agrega faltantes, respeta género y front/back). Tests por cluster con datos reales.
- **Unit:** `findDuplicateRounds(rounds)` → agrupa por la clave de duplicado y devuelve las filas a borrar (conserva la más antigua).
- **Integración:** tras aplicar a un fixture, `recomputeRoundsFromCatalog` resuelve 100% de las rondas del cluster (0 unresolved) y los diferenciales mismo-score-mismo-tee son idénticos.
- **Canario:** el matcher, dado el nombre externo del club, devuelve la ficha canónica (manual) y nunca una fedegolf desactivada.

## 9. Rollback

Cada cluster tiene su backup JSON. Revertir = restaurar `courses`/`course_tees`/`historical_rounds` desde el backup + re-correr el RPC. Las fichas fedegolf desactivadas se reactivan. Como no se borran filas (salvo el sweep de rondas duplicadas, que tiene su propio backup), el rollback es directo.

## 10. Entregables

- Migración/script idempotente por cluster en `scripts/` o capa de datos en `src/lib/data/course-dedup.ts`.
- Funciones puras testeadas (`planTeeCorrections`, `findDuplicateRounds`).
- Dry-run script read-only con tabla de impacto por usuario.
- PR con code-reviewer, pre-push verde, deploy confirmado.
