# Reporte overnight — 2026-05-05

**Trabajado por:** sesión paralela mientras corrían 2 agentes (Reset tAIger + Cerebro Prompt Review).
**Mi rol:** foundation + hardening sin tocar archivos del coach.

---

## Resumen en 3 líneas

1. **Reset tAIger se cerró completo en este mismo árbol** (commits `c9f9975`, `badb5b5`, `4719cf0`). Audit pre-merge limpio. Mergeable a main.
2. **Encontré bugs latentes en datos de canchas**: 1 cancha con metadata corrupta (Olivos), 1 tee con CR/slope swap (Marbella DAMAS dorado), 141 canchas con slope placeholder. Reportados, no corregidos (decisión humana).
3. **Foundation del Cerebro lista para enchufar**: 31 property-tests del handicap verde, migration 033 con CHECK constraints (no aplicada), spec del data model `coach_plans` + `plan_outcomes` + `coach_events`.

---

## Lo que produje (todo nuevo, cero conflicto con agentes)

| Archivo | Qué es |
|---|---|
| `docs/AUDIT_PRE_MERGE_RESET.md` | Auditoría del Reset 1+2 (pre-merge). Veredicto: mergeable. |
| `docs/CEREBRO_DATA_MODEL.md` | Spec completo del data model del cerebro (3 tablas, RLS, lifecycle, KPIs, riesgos). |
| `docs/OVERNIGHT_REPORT_2026-05-05.md` | Este doc. |
| `scripts/audit-handicap-calc.mjs` | Script de auditoría continua de inputs del cálculo de course handicap. |
| `reports/audit-handicap-2026-05-05T04-54-00-272Z.json` | Output del primer run (con los hallazgos detallados). |
| `src/golf/core/course-handicap.test.ts` | 31 property-based tests del motor de course handicap. Pasaron. |
| `supabase/migrations/033_harden_course_tees_ranges.sql` | Migration con CHECK constraints suaves de rango. **NO aplicada todavía** — requiere limpiar datos primero. |

---

## Estado del Reset (Agente 1)

✅ **Cerrado los 3 commits.** Working tree limpio en lo que respecta al coach.

```
4719cf0 feat(taiger): motor de elite — 100% de rondas, streaming real, cache
badb5b5 feat(taiger): sesion continua por usuario con markdown consistente
c9f9975 refactor(taiger): eliminar 3 cards y onboarding, consolidar a sesion unica
```

### Acciones pendientes para mañana (orden):

1. **Mergear `feat/taiger-reset` a `main`** después de correr suite completa: `npm run test && npm run build`. El audit pre-merge dice mergeable.
2. **Renombrar `017_taiger_primary_session.sql` → `031_taiger_primary_session.sql`** (colisión de número con `017_game_formats_and_course_data.sql` ya existente). Solo renombrar archivo local; la migración ya está aplicada en BD. Commit aparte: `chore(migrations): renombrar 017_taiger → 031`.
3. **Ejecutar `scripts/recalculate-all-patterns.ts`** (nota: el plan reset decía `.mjs`, el agente lo creó `.ts`) para re-procesar patrones de todos los usuarios sin el bug `.limit(50)`.
4. **Documentar en `SPRINT_LOG.md`** la sesión del Reset, incluyendo los 5 side-effects out-of-plan (Navbar, IdentidadTab, taiger-prompt, ronda-libre score, vitest config).

---

## Estado del Cerebro Prompt (Agente 2)

⏳ Trabajando en `docs/superpowers/plans/2026-05-05-cerebro-prompt-review.md` (untracked, su working file).

### Cuando cierre:

- Reconciliar el spec en `docs/CEREBRO_DATA_MODEL.md` con el plan v2 final. Si los campos de `metric`, `target_op` o el schema del tool `save_plan` difieren, ajustar uno u otro antes de aplicar migración.
- Crear migration `034_cerebro_foundation.sql` con las 3 tablas (no la cree todavía a propósito, espera al plan v2).

---

## Hallazgos en data de prod (audit-handicap-calc)

### 🔴 Bugs reales (acción humana requerida)

#### 1. Olivos Golf Club — metadata corrupta
- `course_id`: `98318206-7adc-4963-91bb-e1fc46a554f3`
- `tipo_recorrido='18h'` PERO `par_total=36` (debería ser 72 si es 18h, o tipo='9h' si es 9h).
- 4 tees con CR ~35 (correcto para 9h, incorrecto para 18h).
- **Decisión necesaria:** ¿es realmente 9h y la marca '18h' está mal, o es 18h y el par y los CRs están mal?
- Acción: investigar la cancha real (FedeGolf? google?), corregir o `tipo_recorrido='9h'` o todos los CRs * 2.

#### 2. Marbella C.C. - Pacífico Sur - Andes Pro (DAMAS) tee dorado
- `tee_id`: `e170ef7b-f106-4380-ae3e-bc857bb740b4`
- `rating=107.0`, `slope=66`. CR 107 es absurdo en par 72; slope 66 está fuera de rango.
- Hipótesis: CR/slope intercambiados, o se metió un valor de yardaje en el campo CR.
- Acción: buscar valores reales (FedeGolf), UPDATE manual.

### 🟡 Warnings (no rompen pero preocupan)

- **141 canchas** con `courses.slope_rating=113` (placeholder universal FedeGolf). El cálculo NO usa este campo cuando el tee tiene su propio slope, pero si el lookup del tee falla, cae a este placeholder y produce HCP sesgado.
- **5 tees** con nombre no-canónico (residuos de migration 030: probablemente loops compuestos no listados en mi heurística — voy a revisar la migration 030 mañana para ver si la lista debería extenderse).
- **4 tees** con front/back ratings asimétricos (uno NULL, otro poblado) — bloquea cálculo correcto en rondas 9h.
- **2 rondas libres recientes (últimos 30d)** jugadas sobre datos cuestionables. Detalle en `reports/audit-handicap-2026-05-05T04-54-00-272Z.json`.
- **1 cancha FedeGolf sin tees válidos**: C.G. 7 Ríos.

### Falsos positivos del audit (no son bugs)

- Antofagasta - Autoclub (par 60, par-3 course): CR 58.3 es válido.
- Río Blanco DAMAS y VARONES (par 62, par-3 course): CRs 55.0 son válidos pero usan slope placeholder 113.

**Mejora del audit para mañana:** los rangos por defecto fueron muy estrictos para par-3 courses. Refinar la heurística en `scripts/audit-handicap-calc.mjs` para escalar el rango con `par_total` (e.g., `CR ∈ [par-10, par+5]`).

---

## Migration 033 — uso

```bash
node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/033_harden_course_tees_ranges.sql
```

⚠️ **Va a ABORTAR** mientras Marbella DAMAS dorado tenga rating=107 fuera del rango [50,85]. Eso es lo correcto: protege contra aplicar constraints sobre datos sucios.

**Orden recomendado:**
1. Limpiar Marbella DAMAS dorado (UPDATE manual con valores correctos).
2. Decidir y limpiar Olivos.
3. Re-ejecutar `scripts/audit-handicap-calc.mjs` para confirmar P0 = 0.
4. Aplicar migration 033.
5. Después de un mes operando con la migration aplicada, considerar migration 034 con `NOT NULL` en `rating` y `slope` para tees activos.

---

## Tests creados

`src/golf/core/course-handicap.test.ts` — 31 tests:
- 5 fórmula WHS (cancha estándar, difícil, 9h, par-60 ejecutiva, par-62 short)
- 3 fallback (null, slope=0, CR=0)
- 5 invariantes (entero, monotónico, signo, etc.)
- 2 property-based (sample exhaustivo de combinaciones, invariante slope-113)
- 4 regresiones (placeholder vs tee real, NaN protection, round() consistency, fórmula vs whsFormula)

Corren en <100ms. Bloquea regresiones futuras del motor de course handicap.

---

## Observación menor sobre protocolo Navbar

El Reset Commit 1 modificó `src/components/Navbar.tsx` (archivo PROTEGIDO según CLAUDE.md, incidente 25-mar). El cambio en sí es seguro (1 línea, sin async, sin `onAuthStateChange`), pero se commiteó junto con otros archivos en lugar de aislado como exige el protocolo.

**No bloqueante pero conviene flagearlo para próximas tareas:** los agentes siguen el plan literal y no ven el protocolo si no está prescrito en el plan. Sugerencia: agregar al `/pre-push` o pre-commit hook un check que detecte modificación de archivos protegidos no-aisladas.

---

## Tareas trackeadas (todas completadas)

```
✅ #1 Bloque 1: Audit pre-merge del Reset tAIger
✅ #2 Bloque 2: Script audit de course handicap
✅ #3 Bloque 3: Property-tests + migration constraints handicap
✅ #4 Bloque 4: Spec data model del Cerebro
```

---

## Próximos pasos para ti, Juanjo

**Crítico (esta semana):**
1. Decidir y arreglar Olivos Golf Club + Marbella DAMAS dorado.
2. Después de fix, aplicar migration 033 y verificar audit en verde.

**Una vez Cerebro v2 esté pulido:**
3. Reconciliar `docs/CEREBRO_DATA_MODEL.md` con plan v2 (campo a campo).
4. Crear `migration 034_cerebro_foundation.sql` con las 3 tablas.
5. Implementar tool `save_plan` y eliminar extractor regex.

**Mantenimiento:**
6. Agregar `node scripts/audit-handicap-calc.mjs` al `/pre-torneo` checklist — bloquear evento real si encuentra P0.
