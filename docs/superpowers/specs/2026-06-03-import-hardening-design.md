# Spec — `import-hardening`

**Fecha:** 2026-06-03
**Autor:** Claude (CTO)
**Estado:** Diseño aprobado por Juanjo + revisión crítica aplicada (2026-06-03) — pendiente de plan de implementación
**Prioridad:** P1 (un índice WHS mal calculado rompe confianza en el lanzamiento)

---

## 0. Hallazgos de la revisión crítica (2026-06-03)

Segunda pasada de verificación contra producción. Corrigió supuestos del primer borrador:

1. **El índice corrupto es blast-radius = 1 (Juanjo), no base-wide.** Las 71 rondas que alimentan algún índice WHS son **todas de un solo usuario** (`98c5cb7a` = Juanjo). Los otros 18 usuarios tienen 0 rondas con `diferencial`+`slope`+`course_rating` no-null → el RPC los excluye → no tienen índice computado de estos datos. La pregunta de alcance "¿tocar hándicaps de terceros?" es **moot**: no existen esos hándicaps. Lo realmente base-wide es el dedup de canchas, el backfill de `course_id` (mejoran el agrupado del coach) y la **prevención** (para que el índice de los otros 18 nazca bien cuando importen).
2. **El RPC `calcular_indice_golfers` ya es WHS-correcto — no se toca.** Lee `diferencial` guardado (no recalcula), filtra nulls, aplica mejores-8-de-20 × 0.96 con tabla WHS. La nota de memoria del 16-may sobre "037 no coincide con prod" está superada: la función en prod es una versión posterior (incluye `excluded_from_handicap` de 20260521) que delega el cálculo al `diferencial` ya guardado.
3. **La señal geográfica del matcher se elimina:** no hay columnas lat/lng en `courses` ni fuente de import que las provea de forma confiable. Era un supuesto inválido.
4. **Existe lógica de diferencial DUPLICADA:** `src/lib/indice-golfers.ts:12` (la canónica, con `holesPlayed` y WHS 9h correcto, usada por el import) y `src/golf/stats/cpi.ts:106` (un duplicado privado sin conciencia de hoyos y con defaults 72/113). La basura que muestra el coach viene del segundo.
5. **`scripts/fedegolf-sync.ts:142` hace `.insert` ciego** (sin upsert/onConflict) → fuente latente de fichas duplicadas si se re-corre el sync.
6. **Falta el cap de net-double-bogey (adjusted gross):** `calcularDiferencial` usa `totalGross` crudo. Un 58 en 9 hoyos da diferencial 35.61 sin capar. WHS exige capar cada hoyo a doble-bogey-neto. Afecta sobre todo el diferencial que muestra el coach (las rondas malas no entran al best-8, así que el impacto en el índice es marginal) — pero es correctness de golf y aplica a todos.

---

## 1. Problema

El pipeline de importación de rondas (`manual`, `screenshot`, `garmin_zip`, `csv`, `fit`, `golfcourseapi`, sync `fedegolf`) no resuelve de forma confiable dos cosas:

1. **Identidad de cancha** → se crean fichas duplicadas de la misma cancha física.
2. **Tee / CR / slope** → se guardan ratings equivocados o genéricos, que corrompen el diferencial y, por lo tanto, el índice WHS del jugador.

Un tercer bug, independiente pero relacionado, vive en el motor de índice: trata toda ronda como de 18 hoyos.

### Métricas reales en producción (verificadas 2026-06-03)

**Canchas (`courses`, 191 filas, 159 con tees):**
- Duplicados reales (misma cancha física, varias filas): **Rocas de Santo Domingo ×4, Brisas de Santo Domingo ×4, Marbella ×4** — mezcla de fuentes `manual` + `golfcourseapi`.
- Los pares **DAMAS/VARONES de FedeGolf NO son duplicados**: son el mismo recorrido físico con CR/slope distinto por género (by design, ver [[feedback_canchas_damas_varones]]). El barrido los excluye explícitamente.

**Rondas (`historical_rounds`, 414 filas, 19 usuarios):**
- Solo **107** guardan `slope_rating`/`course_rating`; solo **70-71** tienen `diferencial` calculado.
- **129 rondas sin `course_id`** (solo `course_name` de texto libre) → el coach las fragmenta.
- **Rondas que alimentan el índice persistido (filtro del RPC): 71, TODAS de Juanjo** (`98c5cb7a`). Rango de diferencial −10.14 a 35.61. De esas, 8 son de 9h.
- **Root-cause confirmado de los outliers de Juanjo:**
  - 1 ronda `garmin_zip` 18h con diferencial **−10.14** (imposible: ~10 golpes bajo el CR). CR/holes mal del archivo Garmin. Como el índice toma los *mejores* 8, esta entra en el best-8 y **baja artificialmente su índice a falso-scratch**.
  - 1 ronda de 9h (58 golpes) con diferencial **35.61** por falta de cap net-double-bogey. No afecta el índice (no entra al best-8) pero ensucia el display.
  - Las demás 9h de Los Leones (gross 38-43, CR 18h 73.3/75.1) guardan diferenciales razonables (1-10) → el import **ya** convierte 9h→18h-equivalente vía `indice-golfers.ts`. No están corruptas.
- El daño "sistémico" temido era menor: el RPC filtra las rondas sin `diferencial`/slope/CR, así que las 129 sin `course_id` **no envenenan** el índice. El veneno del display viene del recálculo en vivo con defaults en `cpi.ts`.

### Root causes confirmados en código (2026-06-03)

- **`src/golf/courses/matching.ts`** (`findBestCourseMatch`): score por overlap de palabras significativas + bonus por substring normalizado, `minScore=2`. Sin distancia de edición, sin linkage canónico a FedeGolf. Cuando no matchea → `course_id` null y la ronda queda con texto libre. No resuelve a través de un canónico (devuelve cualquiera de las filas duplicadas).
- **`scripts/fedegolf-sync.ts:142`**: `.insert(courseRow)` ciego, sin `upsert`/`onConflict` → re-correr el sync crea filas duplicadas. Fuente latente de dups además del manual/golfcourseapi.
- **`src/app/api/import/garmin-zip/route.ts`** (y pares de import): el CR/slope se toman del archivo importado (`sc.teeBoxRating`/`sc.teeBoxSlope`), **no** de `course_tees`. Aun cuando la cancha matchea, el tee no se resuelve contra el catálogo. CR/slope genéricos o equivocados (origen del −10.14).
- **Diferencial duplicado:**
  - `src/lib/indice-golfers.ts:12` — **canónico, correcto**: `calcularDiferencial(gross, cr, slope, holesPlayed?, nineHoleRatings?)` con WHS 9h (`cr9 = nineHoleRatings?.cr9h ?? cr/2`, `sd9 × 2`). Usado por el import.
  - `src/golf/stats/cpi.ts:106` — **duplicado roto**: `calcularDiferencial(gross, cr, slope)` privado, sin `holesPlayed`, con `DEFAULT_COURSE_RATING = 72` / `DEFAULT_SLOPE = 113`. Recalcula en vivo (últimas 20) con defaults → una 9h con CR 72 da diferencial absurdo. Es lo que muestra basura en el coach.
  - **Ambos usan `totalGross` crudo, sin cap de net-double-bogey** (adjusted gross). Infla diferenciales de rondas con hoyos catastróficos.
- **`src/app/api/import/confirm/route.ts:200`**: `diferencial` se computa una vez al importar (solo si CR y slope presentes, vía la función canónica) y se persiste; el RPC de índice, `mi-golf/tendencia.ts` y el coach lo leen. Malo-al-importar = malo hasta recálculo.
- **`calcular_indice_golfers` (RPC SQL, prod):** **correcto, no se toca.** Agrega `diferencial` guardado: mejores-8-de-20 × 0.96, exige `diferencial`/`slope`/`CR` no-null + `excluded_from_handicap = FALSE`. La calidad del índice depende 100% de que el `diferencial` guardado sea correcto.

---

## 2. Objetivo

Que **toda ronda importada, de cualquier fuente, entre con (a) la cancha canónica correcta y (b) el CR/slope del tee real jugado**, y que el índice WHS se calcule de forma correcta para 9 y 18 hoyos. Más un **barrido único** que deje el histórico de los 19 usuarios consistente antes del lanzamiento.

Criterio de éxito (CERO FALLOS):
- 0 fichas de cancha duplicadas activas para canchas federadas chilenas.
- 0 rondas que entren al cálculo de índice con CR/slope inventado por default.
- Índice WHS de cada usuario verificable contra sus rondas reales, sin diferenciales imposibles.
- Prevención: una importación nueva del mismo flujo (Garmin/manual/foto) no vuelve a crear el duplicado ni el rating equivocado.

---

## 3. Diseño

### Pieza 1 — Identidad de cancha (matar duplicados en el origen)

**Decisión:** FedeGolf es el **catálogo canónico**. Toda cancha importada intenta linkear a una ficha FedeGolf antes de crear una nueva.

- **Matcher robusto** (`src/golf/courses/matching.ts`):
  - Normalización: acentos, mayúsculas, prefijos (`C.G.`, `C.C.`, `Club de Golf`), sufijos de género (`(DAMAS)`/`(VARONES)`).
  - Score combina: token-set overlap (actual) + **distancia de edición (token-set ratio)**. Sin señal geográfica (no hay datos lat/lng en `courses`).
  - **Preferir filas FedeGolf como destino del match** (catálogo canónico). Ante empate, gana la fila `fuente = 'fedegolf'`.
  - Devuelve `{ id, nombre, confidence }` con `confidence` numérico explícito, no un score opaco.
  - **Resuelve a través de `canonical_course_id`:** si la fila matcheada apunta a una canónica, devuelve la canónica (nunca una duplicada desactivada).
- **Tres zonas de confianza:**
  - **Alta** → linkea automático al canónico.
  - **Media** → linkea pero marca la ronda/cancha para revisión (`pending_review`).
  - **Baja** → recién ahí crea ficha nueva, marcada `pending_review` (no se ensucia el catálogo en silencio).
- **Selección por género:** ante un par DAMAS/VARONES, el matcher elige la fila según el género del jugador (ver [[feedback_canchas_damas_varones]] y [[feedback_tee_por_jugador]]).
- **Persistencia de identidad canónica (decisión de eng-review, inclinación: alias):** columna `canonical_course_id` en `courses` (ficha duplicada apunta a la buena). No destructivo, reversible, deja rastro. Alternativa descartada para esta ola: colapsar filas físicamente (irreversible).
- **Piso duro a nivel DB:** índice único parcial en `courses` (sobre nombre normalizado + género + `fuente`, solo `activa = true`) para que crear un duplicado sea **imposible**, no solo improbable. Y hacer **idempotente** el `.insert` de `fedegolf-sync.ts` (upsert sobre la llave natural FedeGolf). El umbral exacto del índice y la llave se cierran en eng-review.

### Pieza 2 — Tee / CR / slope correctos (raíz del índice corrupto)

- Identificada la cancha **y el tee** (color del archivo + género del jugador), el CR/slope se **resuelven desde `course_tees`** (fuente oficial FedeGolf), no desde el archivo importado.
- El valor del archivo queda como **fallback** solo cuando la cancha no está en el catálogo (extranjera/no federada).
- CR/slope se **denormalizan (snapshot) en la ronda** (`historical_rounds.course_rating`/`slope_rating`/`tee_color`), de modo que el índice histórico no cambie si el catálogo se corrige a futuro.
- Si no se puede resolver un tee con confianza → la ronda se marca y **no aporta CR/slope inventado** al índice.
- **Ratings reales de 9 hoyos:** cuando `course_tees` tenga CR/slope de 9h, se usan en vez del approximation `cr/2` que hoy aplica el fallback de `indice-golfers.ts`. Si solo hay rating de 18h, se mantiene el fallback documentado.

### Pieza 3 — Una sola fuente de verdad del diferencial (sin tocar el RPC)

El RPC `calcular_indice_golfers` ya es WHS-correcto como agregador y **no se modifica**. El trabajo es que el `diferencial` que lee sea siempre correcto, y que el display use la misma función:

- **Deduplicar `calcularDiferencial`:** eliminar el duplicado privado de `src/golf/stats/cpi.ts:106` y hacer que `cpi.ts` use el canónico de `src/lib/indice-golfers.ts` (con `holesPlayed`, sin defaults 72/113). Una sola implementación, un solo comportamiento.
- **Cap de net-double-bogey (adjusted gross):** la función canónica pasa a computar sobre el *adjusted gross score* (cada hoyo capado a doble-bogey-neto), no sobre `totalGross` crudo. Es requisito WHS y arregla los diferenciales inflados (el 35.61). Requiere `par_per_hole` + golpes de hándicap del hoyo — se confirma disponibilidad en eng-review.
- **Eliminar defaults silenciosos** en el path de display: una ronda sin CR/slope confiable no se computa con 72/113 — se omite o se marca, no se inventa.
- **9h → 18h-equivalente** ya está implementado en la canónica; el método se valida contra el **WHS Manual 2024** (ver [[reference_usga_pdfs_gratis]]) y se alinea con [[project_coach_hybrid_model_decision]]. No se improvisa ([[feedback_golf_conceptos]]).

### Barrido único de datos

Dos alcances distintos (la revisión los separó):

**A. Dedup de canchas + backfill de `course_id` — base-wide (afecta a todos):**
1. **Backup completo previo** (formato `scripts/backups/los-leones-merge-*.json`), reversible.
2. **Dedup de fichas** (Rocas/Brisas/Marbella + lo que detecte el matcher nuevo): elegir canónica, repuntar rondas (`course_id`), marcar duplicadas con `canonical_course_id` + `activa=false`. **No cambia hándicaps** (solo reagrupa el coach/stats).
3. **Backfill de `course_id`** en las 129 rondas con texto libre que ahora matcheen con confianza alta.

**B. Re-derivar diferencial corrupto — blast-radius = 1 (Juanjo):**
4. Es el único usuario con rondas que alimentan un índice. Re-derivar CR/slope/diferencial de sus rondas corruptas desde `course_tees`, **root-cause por ronda** (la −10.14 garmin, el 35.61 sin capar). Las irresolubles con confianza se **marcan / excluyen** (`excluded_from_handicap`), no se adivinan.
5. **Reporte before/after del índice de Juanjo** (qué cambió y por qué). Reversible vía backup. Re-correr el RPC tras el fix.

> Nota: el OK base-wide de Juanjo (2026-06-03) sigue vigente pero su parte "tocar hándicaps de terceros" no aplica — no existen. El barrido B es solo sobre su propia cuenta.

---

## 4. Fuera de alcance (YAGNI para el lanzamiento)

- Refactor completo del schema normalizado Club → Recorrido → Hoyo → Tee ([[reference_modelo_canchas]]). Correcto a futuro, es un proyecto aparte. Acá se resuelve identidad + integridad sobre el schema actual.
- Cambios de UI del import (más allá de exponer flags de `pending_review` si el plan lo requiere).

---

## 5. Archivos afectados (estimado, se confirma en el plan)

- `src/golf/courses/matching.ts` — matcher robusto + resolución vía `canonical_course_id` + preferir FedeGolf.
- `scripts/fedegolf-sync.ts` — `.insert` → upsert idempotente.
- `src/app/api/import/confirm/route.ts` (368 LOC) — resolución de tee/CR/slope canónico.
- `src/app/api/import/garmin-zip/route.ts` y demás routes de import — resolución de tee desde `course_tees`.
- `src/golf/stats/cpi.ts` (223 LOC) — **eliminar el `calcularDiferencial` duplicado**, usar el de `indice-golfers.ts`; sin defaults silenciosos.
- `src/lib/indice-golfers.ts` — `calcularDiferencial` canónico: sumar cap de net-double-bogey (adjusted gross).
- Migración SQL — `canonical_course_id` + índice único parcial en `courses`. **El RPC `calcular_indice_golfers` NO se toca.**
- Scripts de barrido único + backup (en `scripts/`, backups gitignored).

> Regla "el que toca, ordena" ([[feedback_regla_el_que_toca_ordena]]): cualquier archivo afectado que esté en lista "sucios" (>600 LOC, `supabase.from` directo desde UI, `console.*`, dominio en `lib/`) se refactoriza al estándar **antes** del cambio. Confirmar LOC real de cada archivo en el plan.

## 6. Testing (CERO FALLOS)

- Unit: matcher contra los pares reales (Los Leones variantes, Rocas/Brisas/Marbella, DAMAS/VARONES no se colapsan, cancha extranjera sin match crea `pending_review`, resolución vía `canonical_course_id`).
- Unit: `calcularDiferencial` 9h y 18h contra casos del WHS Manual, **incluido el cap de net-double-bogey** (un hoyo catastrófico no infla el diferencial; caso del 58 en 9h).
- Unit/migración: el índice único parcial rechaza un duplicado pero acepta el par DAMAS/VARONES.
- Tests canario: que el barrido no rompa flujos existentes (coach top_canchas, tendencia, CPI).
- Smoke real contra prod (`/pre-push`) + reporte before/after del índice.
- Code-reviewer pre-merge ([[feedback_code_reviewer_pre_merge]]).

## 7. Decisiones abiertas para el plan-eng-review

1. Persistencia de identidad canónica: `canonical_course_id` (inclinación) vs colapso de filas.
2. Llave natural + forma del índice único parcial en `courses` (nombre normalizado + género + fuente) sin romper los pares DAMAS/VARONES legítimos.
3. Método WHS exacto para 9h → 18h-equivalente (contra el Manual 2024).
4. **Cap de net-double-bogey:** ¿están disponibles `par_per_hole` + golpes de hándicap por hoyo en todas las fuentes de import para computar el adjusted gross? Si no, fallback documentado.
5. Umbrales numéricos de las zonas de confianza del matcher.
6. Idempotencia exacta de `fedegolf-sync.ts` (upsert sobre qué llave).
