# Spec — `import-hardening`

**Fecha:** 2026-06-03
**Autor:** Claude (CTO)
**Estado:** Diseño aprobado por Juanjo — pendiente de plan de implementación
**Prioridad:** P1 (un índice WHS mal calculado rompe confianza en el lanzamiento)

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
- Solo **107** guardan `slope_rating`/`course_rating`; solo **70** tienen `diferencial` calculado.
- **129 rondas sin `course_id`** (solo `course_name` de texto libre) → el coach las fragmenta.
- **64 rondas de 9 hoyos, 41 de ellas con `course_rating > 60`** (escala 18h pegada a una ronda de 9h) → veneno sistémico del índice.
- 1 ronda con diferencial imposible guardado (−10.14, `garmin_zip`, 18h, slope 117 — cuenta de Juanjo). El resto del daño viene del **recálculo en vivo con defaults**, no de valores guardados.

### Root causes confirmados en código (2026-06-03)

- **`src/golf/courses/matching.ts`** (`findBestCourseMatch`): score por overlap de palabras significativas + bonus por substring normalizado, `minScore=2`. Sin distancia de edición, sin señal geográfica, sin linkage canónico a FedeGolf. Cuando no matchea → `course_id` null y la ronda queda con texto libre.
- **`src/app/api/import/garmin-zip/route.ts`** (y pares de import): el CR/slope se toman del archivo importado (`sc.teeBoxRating`/`sc.teeBoxSlope`), **no** de `course_tees`. Aun cuando la cancha matchea, el tee no se resuelve contra el catálogo.
- **`src/golf/stats/cpi.ts`**: `DEFAULT_COURSE_RATING = 72`, `DEFAULT_SLOPE = 113`; `calcularDiferencial(gross, cr, slope) = ((gross - cr) * 113) / slope` sin conciencia de `holes_played`. Recalcula en vivo sobre las últimas 20 rondas usando defaults cuando falta CR/slope → una ronda de 9h con CR 72 da un diferencial absurdamente negativo.
- **`src/app/api/import/confirm/route.ts:200`**: `diferencial` se computa una sola vez al importar (solo si CR y slope están presentes) y se persiste; `mi-golf/tendencia.ts` y el coach lo leen. Malo-al-importar = malo para siempre salvo recálculo.

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
  - Score combina: token-set overlap (actual) + **distancia de edición (token-set ratio)** + **señal geográfica** (lat/lng del import, cuando exista) como desempate.
  - Devuelve `{ id, nombre, confidence }` con `confidence` numérico explícito, no un score opaco.
- **Tres zonas de confianza:**
  - **Alta** → linkea automático al canónico.
  - **Media** → linkea pero marca la ronda/cancha para revisión (`pending_review`).
  - **Baja** → recién ahí crea ficha nueva, marcada `pending_review` (no se ensucia el catálogo en silencio).
- **Selección por género:** ante un par DAMAS/VARONES, el matcher elige la fila según el género del jugador (ver [[feedback_canchas_damas_varones]] y [[feedback_tee_por_jugador]]).
- **Persistencia de identidad canónica (decisión de eng-review, inclinación: alias):** columna `canonical_course_id` en `courses` (ficha duplicada apunta a la buena). No destructivo, reversible, deja rastro. Alternativa descartada para esta ola: colapsar filas físicamente (irreversible).

### Pieza 2 — Tee / CR / slope correctos (raíz del índice corrupto)

- Identificada la cancha **y el tee** (color del archivo + género del jugador), el CR/slope se **resuelven desde `course_tees`** (fuente oficial FedeGolf), no desde el archivo importado.
- El valor del archivo queda como **fallback** solo cuando la cancha no está en el catálogo (extranjera/no federada).
- CR/slope se **denormalizan (snapshot) en la ronda** (`historical_rounds.course_rating`/`slope_rating`/`tee_color`), de modo que el índice histórico no cambie si el catálogo se corrige a futuro.
- Si no se puede resolver un tee con confianza → la ronda se marca y **no aporta CR/slope inventado** al índice.

### Pieza 3 — Índice WHS consciente de 9 vs 18 hoyos

- `calcularDiferencial` (en `src/golf/stats/cpi.ts` / `src/lib/indice-golfers`) se vuelve **WHS-correcto por número de hoyos**:
  - Ronda de 18h: `(113/slope) × (AGS − CR)`.
  - Ronda de 9h: diferencial de 9 hoyos con CR/slope de 9 hoyos, normalizado a equivalente-18h según WHS, consistente con la decisión ya tomada del modelo híbrido 18h-equivalente ([[project_coach_hybrid_model_decision]]).
  - **El método exacto se cierra contra el WHS Manual 2024** en el plan-eng-review (ver [[reference_usga_pdfs_gratis]]); no se improvisa (ver [[feedback_golf_conceptos]]).
- **Se elimina el camino de defaults silenciosos** (`DEFAULT_COURSE_RATING = 72` / `DEFAULT_SLOPE = 113`): una ronda sin CR/slope confiable no entra al cálculo del índice — se marca, no se inventa.

### Barrido único de datos (base-wide, OK explícito de Juanjo 2026-06-03)

1. **Backup completo previo** (formato de `scripts/backups/los-leones-merge-*.json`), reversible.
2. **Dedup de fichas** (Rocas/Brisas/Marbella + cualquier otra que detecte el matcher nuevo): elegir canónica, repuntar rondas (`course_id`), desactivar duplicadas (`activa=false`). **No cambia hándicaps** (solo reagrupa).
3. **Re-derivar CR/slope/diferencial** de rondas corruptas desde `course_tees`, **root-cause por ronda**: clasificar cada caso (9h-con-CR-18h / tee equivocado / sin tee) y aplicar la regla correspondiente. Las irresolubles con confianza se **marcan, no se adivinan**.
4. **Reporte before/after del índice de cada usuario** (qué cambió y por qué), entregable a Juanjo. Reversible vía backup.

---

## 4. Fuera de alcance (YAGNI para el lanzamiento)

- Refactor completo del schema normalizado Club → Recorrido → Hoyo → Tee ([[reference_modelo_canchas]]). Correcto a futuro, es un proyecto aparte. Acá se resuelve identidad + integridad sobre el schema actual.
- Cambios de UI del import (más allá de exponer flags de `pending_review` si el plan lo requiere).

---

## 5. Archivos afectados (estimado, se confirma en el plan)

- `src/golf/courses/matching.ts` — matcher robusto (en lista "sucios" por dominio en `lib/`; ya migrado a `golf/`, verificar LOC).
- `src/app/api/import/confirm/route.ts` (368 LOC) — resolución de tee/CR/slope canónico.
- `src/app/api/import/garmin-zip/route.ts` y demás routes de import — resolución de tee.
- `src/golf/stats/cpi.ts` (223 LOC) — diferencial WHS 9h/18h, eliminar defaults silenciosos.
- `src/lib/indice-golfers` — `calcularDiferencial` canónico.
- Migración SQL — `canonical_course_id` en `courses` (+ índice).
- Scripts de barrido único + backup (en `scripts/`, backups gitignored).

> Regla "el que toca, ordena" ([[feedback_regla_el_que_toca_ordena]]): cualquier archivo afectado que esté en lista "sucios" (>600 LOC, `supabase.from` directo desde UI, `console.*`, dominio en `lib/`) se refactoriza al estándar **antes** del cambio. Confirmar LOC real de cada archivo en el plan.

## 6. Testing (CERO FALLOS)

- Unit: matcher contra los pares reales (Los Leones variantes, Rocas/Brisas/Marbella, DAMAS/VARONES no se colapsan, cancha extranjera sin match crea `pending_review`).
- Unit: `calcularDiferencial` 9h y 18h contra casos del WHS Manual.
- Tests canario: que el barrido no rompa flujos existentes (coach top_canchas, tendencia, CPI).
- Smoke real contra prod (`/pre-push`) + reporte before/after del índice.
- Code-reviewer pre-merge ([[feedback_code_reviewer_pre_merge]]).

## 7. Decisiones abiertas para el plan-eng-review

1. Persistencia de identidad canónica: `canonical_course_id` (inclinación) vs colapso de filas.
2. Método WHS exacto para 9h → 18h-equivalente (contra el Manual).
3. Umbrales numéricos de las zonas de confianza del matcher.
4. Si la señal geográfica está disponible en todas las fuentes o solo en algunas (condiciona su peso).
