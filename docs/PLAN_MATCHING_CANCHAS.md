# Plan — Matching de canchas + auto-ingesta blindada

Origen: pedido Juanjo (2026-06-30) "auto-registrar canchas desconocidas desde la importación".
Hallazgo: la auto-creación YA existe (`resolve_and_link_course`, `fuente='user_added'`) y está
cableada a todos los paths de import (foto/CSV/Garmin-nueva vía `importRound`), pero:
- **0 canchas `user_added` en toda la historia de prod** (nunca disparó un create real).
- **129 rondas huérfanas** (course_id NULL con nombre); ~99 reales (30 son "smoke course" de test).
- 42 de ellas = "Las Brisas de Santo Domingo" de un usuario, con pares, garmin_zip, 25-mar (pre-migración).
  La cancha **SÍ existe** en catálogo (FedeGolf) — es fallo de MATCHING, no falta auto-crear.

## Causa raíz del matching (RPC `resolve_and_link_course`, similarity pg_trgm ≥0.8)

Entrada `Club de Golf Las Brisas de Santo Domingo ~ Norte-Este`
vs catálogo `C.G. Las Brisas De Santo Domingo - Este - Norte (VARONES)`:

1. **Normalización asimétrica (BUG):** el RPC saca `(damas|varones)` sólo del nombre de entrada,
   NO del catálogo → el `(VARONES)` queda y baja la similitud de TODAS las canchas con género.
2. `C.G.` vs `Club de Golf` — abreviatura no expandida.
3. `~`, `.`, `-` — puntuación/separadores no normalizados.
4. **Género ambiguo:** tras normalizar, entrada empata igual a VARONES y DAMAS → elige arbitrario →
   CR/slope equivocado. El RPC no recibe género del usuario. Gap arquitectónico.
5. **Orden de loop:** `Norte-Este` (ronda) vs `Este - Norte` (catálogo), invertido. Ambigüedad real.
6. **Dos matchers** para la misma pregunta: RPC (pg_trgm) + TS (`matchScore` palabras). Viola
   "un concepto, una fuente".

## Decisiones de arquitectura

- **A. Normalización canónica única** en `src/golf/courses/course-name.ts` (nuevo): expande
  abreviaturas (`C.G.`/`CG`→`club golf`), quita puntuación y separadores, quita marcadores de género,
  colapsa espacios. Exporta `normalizeCourseName()` y `courseGenderMarker()`.
- **B. Aplicar la normalización a AMBOS lados** de la comparación (arregla bug #1 para todo el catálogo).
- **C. El RPC recibe `p_genero`** para desambiguar VARONES/DAMAS cuando el resto del nombre empata.
- **D. Matching de loop insensible al orden de tokens**, pero marcado para revisión manual en backfill.
- **E. Un solo matcher canónico:** el TS `findBestCourseMatch` usa la misma normalización que el RPC;
  idealmente el RPC llama lógica equivalente. Meta: paridad de resultados RPC↔TS (canario).

## Fases

### P0-1 — Matcher (este worktree, TDD)
- [ ] `course-name.ts` con `normalizeCourseName()` + tests (casos reales Brisas, C.G., género, `~`).
- [ ] RPC v2: normalización simétrica a ambos lados + `p_genero` para desambiguar. Migración nueva.
- [ ] `findBestCourseMatch` usa `normalizeCourseName`. Elimina divergencia con el RPC.
- [ ] Canario: import "Club de Golf Las Brisas de Santo Domingo ~ Norte-Este" + género M → matchea
      la ficha VARONES correcta (no crea user_added, no elige DAMAS).

### P0-2 — Backfill 42 huérfanas Brisas
- [ ] Script: por cada ronda huérfana con nombre Brisas, resolver course_id por género del perfil
      (profiles.genero), re-derivar CR/slope del catálogo (`resolveTeeRatingsForCourse`),
      recomputar diferencial. Loops con orden invertido → log para revisión.
- [ ] Verificar índice del usuario antes/después.

### P0-3 — Integridad pares "Norte-Este (DAMAS)"
- [ ] Verificar contra fuente FedeGolf que los pares de esa fila son de Norte-Sur (bug conocido 27-jun).
- [ ] Corregir course_holes de la fila afectada.

### P1 — Tier + verificación (auto-creación blindada)
- [ ] `user_added` nace con `datos_verificados=false`; aislada del índice/leaderboard de otros usuarios
      hasta validación.
- [ ] Dedup contra catálogo ANTES de insertar (usa el matcher mejorado): si hay match ≥ umbral,
      vincula en vez de crear.
- [ ] Cola de revisión admin para promover user_added → verificada.
- [ ] Canario CI: desconocida-con-pares → crea user_added no-verificada; conocida → matchea, no duplica.

## Notas
- Archivos protegidos NO se tocan.
- El RPC es write-path crítico: migración nueva, no editar la vieja. Idempotente.
- `matching.ts` es <600 LOC y ya en `src/golf/` → no gatilla "el que toca, ordena" por tamaño.
