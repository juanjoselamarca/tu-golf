# Data fixes — 2026-05-05

Sesión multi-agente. Trigger: `scripts/audit-handicap-calc.mjs` (creado en sesión overnight) reportó 3 categorías P0 que bloqueaban la migration `033_harden_course_tees_ranges.sql`.

CTO: Claude Opus 4.7 (1M ctx).

---

## Resumen ejecutivo

| Bug | Status |
|---|---|
| Olivos Golf Club: `tipo_recorrido='18h'` con par 36 | ✅ corregido a `9h` + ratings escalados a 18h-equiv |
| Marbella DAMAS dorado: rating=107, slope=66 | ✅ swap aplicado (rating=66, slope=107) |
| C.G. 7 Ríos: par_total=0 | ✅ corregido a par_total=72 (cancha stub sin uso) |
| Sistémico: 9 canchas 9h con course_rating en escala 9h | ✅ escalados a 18h-equiv |
| Migration 033 aplicada | ✅ |

Re-run `audit-handicap-calc.mjs` post-fix: **0 P0 en `tees_out_of_range`** (era 1 categoría con 11 hallazgos antes). Quedan warnings conocidos (placeholder slope=113 en 141 canchas FedeGolf) y 1 P0 documentado (`C.G. 7 Ríos` sin tees válidos — pre-existente, fuera del scope de este sprint).

---

## Fix 1: Olivos Golf Club

**ID:** `98318206-7adc-4963-91bb-e1fc46a554f3`

**Diagnóstico:**
- En FedeGolf no aparece (Olivos Golf Club es de Argentina, no Chile).
- Búsqueda externa (we.golf) confirma: 27 holes (3 loops de 9: Blanca, Colorada, Azul). Cada loop par 36.
- Estado pre-fix:
  - `tipo_recorrido='18h'` ✗
  - `par_total=36` ✓ (compatible con 9h)
  - `course_rating=36.5`, `slope_rating=132` (escala 9h)
  - 4 tees con `rating=34-37`, `front_course_rating` poblado, `back_course_rating=NULL`
  - `course_holes`: 18 filas (par 36+36=72) — datos duplicados, posiblemente del seed.

**Hipótesis:** la fila representa UN loop de 9h. La marca `'18h'` y los 18 hoyos en `course_holes` son duplicados/error de carga manual.

**Fix aplicado:**

```sql
-- 1. Marcar como 9h
UPDATE courses SET tipo_recorrido='9h'
WHERE id='98318206-7adc-4963-91bb-e1fc46a554f3' AND tipo_recorrido='18h';

-- 2. Escalar course_rating a 18h-equivalent (convención WHS)
UPDATE courses SET course_rating = ROUND((course_rating * 2)::numeric, 1)
WHERE id='98318206-7adc-4963-91bb-e1fc46a554f3' AND course_rating < 50;

-- 3. Escalar rating de los 4 tees (se aplicó el fix sistémico de 9h, ver abajo)
```

**Estado post-fix:**
- `tipo_recorrido='9h'` ✓
- `par_total=36` ✓
- `course_rating=73.0`, `slope_rating=132` (18h-equiv)
- 4 tees con `rating=69.6-74.6` (18h-equiv) y `front_course_rating=34.8-37.3` (9h real)

**Lo que NO se hizo (deuda técnica):**
- No se borraron los 18 hoyos duplicados en `course_holes`. La estructura WHS permite que un loop 9h tenga 18 hoyos definidos si se juega "twice the loop" (dos veces el mismo loop). Borrar hoyos podría romper rondas históricas. Decisión conservadora: dejar como está, marcar como follow-up.

---

## Fix 2: Marbella DAMAS dorado

**ID:** `e170ef7b-f106-4380-ae3e-bc857bb740b4`
**Course:** Marbella C.C. - Pacifico Sur - Andes Pro (DAMAS), `9569be55-be99-4350-a795-d8de34aa52db`

**Diagnóstico:**
- FedeGolf credentials no disponibles en .env.local (no `FEDEGOLF_RUT/PASSWORD`).
- GolfPass / web públicos: ratings de tees individuales DAMAS no listados.
- Sanity check vs hermanos DAMAS del mismo course (par 72, 18h):

| tee | yardaje | rating | slope |
|---|---|---|---|
| azul | 6254 | 71.2 | 130 |
| blanco | 5865 | 68.7 | 122 |
| rojo | NULL | 69.3 | 114 |
| **dorado** (pre-fix) | 5111 | 107.0 | 66 |

Dorado es el tee más corto (5111 yds) → CR debe ser el MÁS BAJO. rating=107 es absurdo (fuera de [50,85] sano WHS); slope=66 está dentro de [55,155] WHS pero típico de course rating de tee corto. Hipótesis: en algún UPSERT histórico se intercambiaron los campos.

**Fix aplicado (swap):**

```sql
UPDATE course_tees SET rating=66.0, slope=107
WHERE id='e170ef7b-f106-4380-ae3e-bc857bb740b4'
  AND rating=107.0 AND slope=66;
```

**Estado post-fix:** rating=66.0, slope=107.

**Sanity post-fix:**
- rating 66.0 < 68.7 (blanco) ✓ (dorado más fácil que blanco)
- slope 107 < 114 (rojo) ✓ (dorado más linear)
- Ambos valores caen dentro de los rangos de la migration 033 (rating ∈ [50,85], slope ∈ [55,155]).

**Disclaimer:** este fix es best-effort sin acceso a credenciales FedeGolf live. Si Juanjo verifica los valores oficiales y discrepan, ejecutar UPDATE manual con los reales.

---

## Fix sistémico: canchas 9h con course_rating en escala 9h

Mientras corregía Olivos descubrí que el problema es genérico: 9 canchas `tipo_recorrido='9h'` tenían `course_rating=36` (escala 9h sin escalar a 18h-equiv).

**Canchas afectadas:**
- Club de Golf Marbella (3 IDs duplicados, fuente=`golfcourseapi`)
- Club de Golf Rocas de Santo Domingo (3 IDs duplicados, fuente=`golfcourseapi`)
- Club de Golf Brisas de Santo Domingo (3 IDs duplicados, fuente=`manual`)

**Fix aplicado (`scripts/fix-all-9h-courses-18h-equiv.sql`):**

```sql
UPDATE courses SET course_rating = ROUND((course_rating * 2)::numeric, 1)
WHERE tipo_recorrido='9h' AND course_rating < 50 AND course_rating >= 25;

UPDATE course_tees ct SET rating = ROUND((ct.front_course_rating * 2)::numeric, 1)
FROM courses c WHERE c.id=ct.course_id
  AND c.tipo_recorrido='9h'
  AND ABS(ct.rating - ct.front_course_rating) < 0.05
  AND ct.rating < 50;
```

**Resultado:** 10 canchas 9h ahora con `course_rating=72.0` (estándar WHS). Tees actualizados igualmente.

**Deuda técnica detectada:** las canchas duplicadas (3 IDs por club) sugieren un bug en sync/seed que merece investigación aparte. NO se consolidó en este sprint para no expandir scope.

---

## Fix bonus: C.G. 7 Ríos par_total=0

Detectado durante la pre-check de la migration 033. Cancha stub sin tees ni rondas.

**Fix:** `UPDATE courses SET par_total=72 WHERE id='6a3ba422-d1ed-429c-914b-73583474344d'`. Default 18h, ajustar cuando complete sync.

---

## Migration 033 — aplicada

```bash
node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/033_harden_course_tees_ranges.sql
```

Resultado: `OK | tees_constraints=6 | courses_constraints=3` (9 CHECK constraints nuevos en total).

---

## Mejora del audit script

`scripts/audit-handicap-calc.mjs` — refinada heurística `tees_out_of_range`:

**Antes:** rango fijo `[60, 80]` para rating, demasiado estricto para par-3 ejecutivas y demasiado laxo para detectar inversiones cuando par_total es atípico.

**Después:** par-aware, con concepto `par_eff` que escala 9h a 18h-equiv:
- `par_eff = par_total * 2` si `tipo_recorrido='9h'`, else `par_total`
- `rating ∈ [par_eff - 8, par_eff + 8]` (clamp `[50, 85]` absoluto)
- slope universal WHS `[55, 155]`

Falsos positivos eliminados:
- Antofagasta - Autoclub (par 60): rating 58.3 ∈ [52,68] ✓
- Río Blanco DAMAS/VARONES (par 62): rating 55 ∈ [54,70] ✓
- Hacienda Chicureo DAMAS (par 72): rating 78.6 ∈ [64,80] ✓
- Hurlingham (par 70): rating 75.3 ∈ [62,78] ✓

Bugs reales sigue detectando:
- Marbella DAMAS dorado pre-swap (rating 107) — fuera del ceiling absoluto.
- Cualquier rating <50 sin escalar a 18h-equiv (canchas 9h sucias).
- Cualquier slope fuera de [55,155].

---

## Próximos pasos sugeridos (no en este sprint)

1. ~~Resolver `C.G. 7 Ríos`~~ → ✅ resuelto en sesión PM (ver "Sesión PM" abajo).
2. Investigar duplicados de courses (Marbella, Rocas, Brisas tienen 3 IDs cada una). Probable bug del sync de `golfcourseapi`.
3. Hardening migration 034: agregar `NOT NULL` en `course_tees.rating` y `slope` para tees activos (después de un mes de operación con migration 033).
4. Borrar 18 hoyos de Olivos (mantener solo front 9) — solo si no rompe rondas históricas.
5. Investigar 5 tees con nombres no-canónicos (residuos migration 030) → parcialmente analizado, deuda estructural documentada en "Sesión PM".
6. ~~Investigar 4 tees con front/back ratings asimétricos~~ → ✅ resuelto en sesión PM.

---

## Sesión PM (12:30–13:00) — limpieza pendientes

CTO: Claude Opus 4.7 (1M ctx). Trigger: opción "limpieza canchas pendientes" del backlog 05-may.

### Resumen ejecutivo

| Fix | Acción | Status |
|---|---|---|
| C.G. 7 Ríos padre (id `6a3ba422-…`) | `activa=false`, `datos_verificados=false` | ✅ |
| Olivos: 4 tees con `back_*=NULL` | `back_* := front_*` (convención WHS 9h jugado 18h) | ✅ |
| 5 tees no-canónicos (Hurlingham + Nordelta) | postergado — deuda estructural | ⚠️ documentado |
| Audit script `fedegolf_courses_without_valid_tees` no filtraba por `activa` | filtro agregado | ✅ |

Re-run `audit-handicap-calc.mjs` post-fix: **0 P0 (era 1)**. Warnings restantes son conocidos.

### Fix 1: C.G. 7 Ríos padre desactivada

**Diagnóstico:** Hay 3 canchas para el club FedeGolf id=51:
- `6a3ba422-…` "C.G. 7 Rios" (padre): 0 tees, 0 rondas, 0 torneos, slope=113 placeholder, course_rating=NULL.
- `15eaf708-…` "C.G. 7 Rios - C.G. 7 Rios (DAMAS)": 1 tee, válida.
- `29caa4d6-…` "C.G. 7 Rios - C.G. 7 Rios (VARONES)": 3 tees, válida.

La padre es un stub que el sync FedeGolf creó antes de descubrir los géneros. Las DAMAS/VARONES son las productivas. No se borra para no romper futuros syncs (que la recrearían), pero se desactiva para sacarla de la UI.

**Fix aplicado** (`scripts/fix-canchas-pendientes.sql`):

```sql
UPDATE courses SET activa=false, datos_verificados=false
WHERE id='6a3ba422-d1ed-429c-914b-73583474344d'
  AND (SELECT COUNT(*) FROM course_tees
       WHERE course_id='6a3ba422-d1ed-429c-914b-73583474344d') = 0;
```

### Fix 3: Olivos — back_* = front_*

**Diagnóstico:** El fix sistémico AM dejó los 4 tees de Olivos con `back_course_rating=NULL`, `back_slope_rating=NULL`. La cancha es `tipo_recorrido='9h'` jugada como 18h (mismo loop dos veces). Por convención WHS, en este caso `back rating = front rating`. Dejar back=NULL puede romper joins futuros que asuman ambos campos.

**Fix aplicado:**

```sql
UPDATE course_tees
SET back_course_rating = front_course_rating,
    back_slope_rating  = front_slope_rating,
    back_bogey_rating  = front_bogey_rating
WHERE course_id = '98318206-7adc-4963-91bb-e1fc46a554f3'
  AND back_course_rating IS NULL
  AND front_course_rating IS NOT NULL;
```

**Estado post-fix:** 4 tees (azul/blanco/dorado/rojo) con `simetrico=true`.

### Fix 2 (postergado): tees no-canónicos requieren refactor estructural

Los 5 tees detectados se dividen en dos sub-categorías que NO se pudieron resolver con un rename simple:

**Hurlingham Club (`7176d747-…`)** — 2 tees:
- `amarillo - damas` (gen=F, slope 129, rating 75.3)
- `rojo - caballeros` (gen=M, slope 110, rating 65.9)

Diagnóstico: el course mezcla `genero='M'` y `genero='F'` (5 tees: azul-M, dorado-M, rojo-F, amarillo-damas-F, rojo-caballeros-M). Esto **viola el modelo de canchas** (DAMAS y VARONES deben ser courses distintos con sufijos en `course.nombre`). El UNIQUE `(course_id, nombre)` impide renombrar `amarillo - damas` → `dorado` porque ya existe `dorado` (M).

Fix correcto = sprint propio:
1. Crear `Hurlingham Club (DAMAS)` y `Hurlingham Club (VARONES)` como nuevos courses.
2. Migrar tees `genero='F'` al course DAMAS y `genero='M'` al VARONES.
3. Migrar rondas históricas según género del jugador.
4. Renombrar tees a canónicos (sin colisión, ya separados).
5. Borrar / inactivar el course `Hurlingham Club` original.

**Nordelta Golf Club (`580204bb-…`)** — 3 tees:
- `green` (gen=M, slope 128, rating 69.1)
- `green - damas` (gen=F, slope 130, rating 74.9)
- `gris` (gen=M, slope 140, rating 74.2)

Diagnóstico: nombres reales del club argentino, no son residuos. Requieren **decisión de producto**: extender el set canónico (`negras, azul, blanco, rojo, dorado, verde, gris`) vs mapear arbitrariamente (riesgo de confundir usuarios). Cualquier mapeo automático es un parche.

**Decisión CTO:** ambos casos quedan documentados como follow-up. No se aplica fix parche. El audit warning `tees_nombre_non_canonical=5` queda como deuda visible.

### Fix bonus: audit script bug

`scripts/audit-handicap-calc.mjs` — el check P0 `fedegolf_courses_without_valid_tees` no filtraba por `activa=true`. Una cancha inactiva no genera rondas, no debería disparar P0. Agregado filtro `AND c.activa = true`.

### Próximos pasos (post-PM)

1. Sprint dedicado: split de Hurlingham en courses DAMAS/VARONES + migración de rondas + renombrar tees (estimado: 1 sesión con tests).
2. Decisión de producto: ¿extender set canónico de tees con `verde`/`gris` para clubes argentinos? Si sí, agregar a la lista de la migration 030 y normalizar Nordelta.
3. Aplicar el mismo split DAMAS/VARONES al course duplicado de Marbella/Rocas/Brisas (relacionado con item #2 de "próximos pasos AM").
