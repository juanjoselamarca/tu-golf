# Audit pre-merge Reset tAIger — 2026-05-05

**Reviewer:** Claude (sesión paralela mientras Agente 1 ejecuta Reset)
**Branch:** `feat/taiger-reset`
**Scope auditado:** Reset Commits 1 (`3f6036d`) y 2 (`c71c48d`). Commit 3 (motor de élite) en curso al momento del audit.

## Veredicto

✅ **Mergeable.** Cero refs huérfanas a símbolos borrados en código activo. Todos los side-effects out-of-plan son necesarios y correctos.

---

## 1. Búsqueda de refs muertas a símbolos borrados

| Símbolo | Ocurrencias en `src/` activo | Estado |
|---|---|---|
| `analyze-round` | 5 (todas en `src/__tests__/audit/F8-taiger-coach.test.ts`, ya actualizadas) | ✅ Limpio |
| `SESSION_STARTERS` | 0 fuera de `prompts.ts` legado | ✅ Limpio |
| `TAIGER_FREE_MONTHLY_LIMIT` | 0 | ✅ Limpio |
| `WHATSAPP_TAIGER_PREMIUM_URL` | 0 | ✅ Limpio |
| `/coach/onboarding` | 0 | ✅ Limpio |
| `/coach/sesion/nueva` | 1 en `coach/page.tsx:125` (alias intencional `${primarySessionId ?? 'nueva'}`) + 2 en `F7-auth-onboarding.test.ts` (réplica de lógica `nextStep`) | ✅ Funciona como alias post-Commit 2 |

**Nota F7:** la función `computeNextStep` del test es réplica histórica de lógica que **ya no vive en `dashboard/page.tsx`** (verificado: `src/app/dashboard/page.tsx` no menciona `coach`). El test sigue válido porque la URL `/coach/sesion/nueva` se maneja como caso especial en `[id]/page.tsx:184` (redirige al UUID real). Recomendación opcional: cuando se cierre el sprint, eliminar `computeNextStep` del test si nadie la usa.

---

## 2. Side-effects out-of-plan (archivos modificados que el plan no listó)

| Archivo | Cambio | Justificación | Riesgo |
|---|---|---|---|
| `src/components/Navbar.tsx` | `pathname === '/coach/sesion/nueva/chat'` → `pathname.startsWith('/coach/sesion/')` | Ahora todo chat vive en `/coach/sesion/[id]`, la regla original ya no aplica. Sin async, sin onAuthStateChange. | 🟡 Bajo — viola protocolo "commit aislado" pero patrones prohibidos NO violados |
| `src/components/mi-golf/IdentidadTab.tsx` | href `/coach/sesion/nueva` → `/coach` | URL de destino válida, el dashboard del coach ya tiene CTA único | ✅ Correcto |
| `src/lib/taiger-prompt.ts` | re-export shim renombra `SESSION_STARTERS` → `TAIGER_SESSION_STARTER` | Alineado con prompts.ts post-reset | ✅ Correcto |
| `src/app/ronda-libre/[codigo]/score/page.tsx` | Elimina banner de "tAIger+ analizando" + fetch a `/api/taiger/analyze-round` | Endpoint borrado, banner debe morir | ✅ Correcto |
| `vitest.config.ts` | Excluye `**/.claude/worktrees/**` del test runner | Defensa contra los worktrees zombis del 22-23 abril que confunden vitest | ✅ Buena medida |

⚠️ **Observación protocolo PROTECCIÓN ANTI-CAÍDA**: El cambio de `Navbar.tsx` se commiteó junto con otros archivos (no aislado como exige `CLAUDE.md`). El cambio en sí es seguro (sin async, sin `onAuthStateChange` modificado, una línea), pero el protocolo de aislamiento se saltó. Sugerencia para Agente 1: en futuras tareas que toquen archivos protegidos, mantener commit aislado aún cuando el cambio sea trivial. **No es bloqueante para mergear.**

---

## 3. Estado de tests

- `src/__tests__/audit/F8-taiger-coach.test.ts`: actualizado en Commit 1.
- `src/__tests__/audit/F7-auth-onboarding.test.ts`: NO modificado, sigue válido (URL alias funciona).
- `src/golf/coach/session.test.ts` (nuevo): agregado en Commit 2 con 2 tests para `getOrCreateActiveSession`.
- `src/lib/constants.test.ts`: actualizado para reflejar borrado de constants.

**Pendiente verificar al cierre de Commit 3:** suite completa post-`limit(50)` removal. El motor pasará de procesar ≤50 a procesar todas las rondas → expectativas de tests sobre `total_rounds` y `confidence` pueden cambiar.

---

## 4. Deuda técnica que el Reset NO arregla (intencional, ya documentada)

Ninguna sorpresa nueva. Lo que el plan declaró out-of-scope sigue out-of-scope:
- Extractor de recomendaciones regex frágil en `chat/route.ts:300-400` → migración a tool `save_plan` queda para Cerebro v2.
- Rate-limit in-memory → migración a KV/Upstash, no urge.
- Botón "exportar plan" / share / recordatorios proactivos → post-validación.
- Tabla `cpi_score` poblada vía tool → orgánico en chat por ahora.

El doc del Cerebro v2 (Agente 2) debe heredar estas deudas explícitamente.

---

## 5. Bloqueadores P0

**Ninguno operativo.** Reset 1+2 mergeable hoy. Reset 3 en curso, audit posterior pendiente cuando cierre.

### 5.1 Deuda detectada — colisión de número de migración

El plan del Reset (línea 351) prescribe crear `supabase/migrations/017_taiger_primary_session.sql`. Pero `017_game_formats_and_course_data.sql` ya existe desde commit `a933f34`. Resultado: dos migraciones con mismo prefijo `017_`.

**Estado:**
- Ambas migraciones se aplican (Supabase ordena por nombre completo: `017_game_*` antes que `017_taiger_*`).
- Funcionalmente correcto, pero rompe la convención secuencial de los nombres.

**Impacto:** medio — confunde a futuro al leer la historia ("¿cuál fue primero?") y el siguiente desarrollador puede asumir que `017` es uno solo.

**Recomendación:**
- Renombrar localmente `017_taiger_primary_session.sql` → `031_taiger_primary_session.sql` (031 es el siguiente número libre tras `030_normalize_course_tees_nombres.sql`).
- **NO** re-ejecutar la migración (ya está aplicada en BD por el agente vía `Task 6.2`). El rename es solo del archivo local.
- Hacerlo en commit separado tras cerrar Commit 3 del Reset, con mensaje `chore(migrations): renombrar 017_taiger → 031 para evitar colisión de numeración`.
- Actualizar referencias en el plan Reset si aún es necesario para histórico.

**Quien lo arregla:** Juanjo / Claude post-merge. Agente 1 sigue el plan literal y no lo va a detectar solo.

---

## 6. Recomendaciones para el handoff Reset → Cerebro

1. **Antes de mergear `feat/taiger-reset` a `main`**: correr `npm run test`, `npm run build`, smoke manual en `/coach` con `/pre-push`.
2. **Después del merge**: ejecutar `node --env-file=.env.local scripts/recalculate-all-patterns.mjs` para re-procesar patrones de todos los usuarios sin el bug `.limit(50)`. Esto cambia confidence de patrones existentes — no es regresión, es corrección.
3. **Antes de arrancar Cerebro v2**: confirmar con Agente 2 que el spec final incluye:
   - Anchor explícito al reset (no rehacer sesión continua / streaming / cache)
   - 7 patrones (no 3)
   - Formato 5-puntos solo en plan-assignment
   - Tablas `coach_plans`, `plan_outcomes`, `coach_events` como nuevas (no tocar `taiger_sessions`)
4. **Documentar en `SPRINT_LOG.md`** la sesión del Reset al cerrar Commit 3, mencionando explícitamente los 5 side-effects out-of-plan.
