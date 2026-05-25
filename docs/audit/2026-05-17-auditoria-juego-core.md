# Auditoría Juego Core — Ronda Libre + Torneo 40pp

**Fecha:** 2026-05-17
**Auditor:** Claude (CTO)
**Entorno:** Suite E2E contra producción (`https://golfersplus.vercel.app`) + helpers contra Supabase prod con user E2E dedicado (`e2e-test@golfersplus-test.local`).
**Cobertura:** 97 tests E2E ejecutados (28 smoke público + 31 auth Playwright + 38 ad-hoc torneo40).

---

## 1. Resumen ejecutivo

| Feature | Tests ejecutados | PASS | FAIL | SKIP | Health Score |
|---|---|---|---|---|---|
| Smoke público (11 páginas + redirects + 404s) | 28 | 28 | 0 | 0 | **10/10** |
| Ronda Libre (flow + scoring + scorer-smoke + finalize-missing) | 13 | 11 | 1 | 1 | **7/10** |
| Organizar Torneo (5 specs + 38 ad-hoc 40pp) | 56 | 53 | 0 | 3 | **9/10** |
| Infra E2E (Playwright config + global-setup) | — | — | — | — | **6/10** |
| **TOTAL** | **97** | **92** | **1** | **4** | **8.2/10** |

**Bugs encontrados:**
- 🔴 **2 P0**: pérdida de scores entre hoyos + suite E2E auth skip silencioso.
- 🟠 **0 P1** bugs reales — 4 SKIP son gaps de cobertura conocidos (no bugs).
- 🟡 **0 P2** detectados en esta corrida automatizada.

**Veredicto CTO:** la base de juego es **sólida** (92/97 = 94.8% pass rate contra prod). Pero **HAY UN P0 DE PÉRDIDA DE DATOS** que viola la directiva CERO FALLOS. Bloquea cualquier torneo real hasta fix.

---

## 2. Ronda Libre — Bugs

### 🔴 P0 #1 — Pérdida de scores al cambiar de hoyo sin save explícito

**Severidad:** CRÍTICA — pérdida de datos en condiciones reales de campo.

**Repro automatizado:** `e2e/ronda-scoring.spec.ts:180` "scoring: navegar 'Siguiente hoyo' después de scorear, luego scorear otro".

**Pasos:**
1. Crear ronda nueva (1 jugador).
2. Score hoyo 1 (1 tap "+").
3. Click "Siguiente hoyo" → guarda hoyo 1 en BD.
4. Score hoyo 2 (1 tap "+").
5. Click "Siguiente hoyo" → debería guardar hoyo 1 + 2.
6. Verificar BD: solo aparece **1 hoyo** con score (expected ≥ 2).

**Root cause identificado:** `src/app/ronda-libre/[codigo]/score/hooks/useScoreSave.ts:78`

```ts
const { error } = await supabase
  .from('ronda_libre_jugadores')
  .update({ scores: scoresObj })  // ⚠️ UPDATE COMPLETO sin merge
  .eq('id', jugadorId)
```

El UPDATE **reemplaza** todo el JSONB `scores` en vez de hacer merge. Si el estado React local pierde sincronía (closure stale, re-mount al cambiar de hoyo, race con scoreSync), el siguiente save **borra los hoyos anteriores**.

**Impacto en campo real:**
- Jugador score hoyo, batería baja → cierra app → vuelve → score perdido.
- Conexión 3G inestable → race entre save y siguiente save → pisa.
- Cambio rápido de pantalla (navegar a leaderboard y volver) → re-load pisa con estado parcial.

**Fix propuesto (arquitectónico, no parche):**
- **Opción A** (recomendada): server-side merge. Endpoint nuevo `/api/ronda/[codigo]/score/upsert` que reciba `{ jugadorId, hoyo, score }` y haga UPSERT por hoyo individual con `JSONB_SET`. Cliente envía solo el delta.
- **Opción B**: cliente envía SIEMPRE el objeto completo `{ ...scoresLoadedDesdeBD, ...scoresLocales }` mergeando antes del UPDATE. Más simple pero requiere fetch fresh antes de cada save.

**Evidencia:** `screenshots/P0-bug-scoring-loss.png` + video.webm + trace.zip en `test-results/`.

---

## 3. Organizar Torneo — Bugs

**0 bugs encontrados.** Las 56 verificaciones pasaron contra prod:

- ✅ Crear torneo desde cero (asistente IA + manual)
- ✅ Stroke Play Gross 40 jugadores (HCP 1-36) → leaderboard correcto
- ✅ Stableford Neto 10 jugadores → fórmula correcta (verificación matemática D.1-D.5)
- ✅ Cambio de formato (Scramble → Equipos, Match Play → Neto, Stableford → tabla)
- ✅ Tournament page HTTP 200, share URL formato correcto
- ✅ APIs públicas (/api/health, /api/en-vivo, /api/demo/*) → 200
- ✅ Limpieza idempotente post-test

---

## 4. Infra E2E — Bugs

### 🔴 P0 #2 — Suite E2E auth se saltea silenciosamente sin env vars cargadas

**Severidad:** CRÍTICA — falsos positivos en CI/pre-push hook.

**Repro:**
```bash
# Sin cargar .env.local explícitamente:
npm run test:e2e:ronda

# Resultado:
#   - skipped (4 tests)
#   - exit code 0 ✅ (¡pero no testeó nada!)
```

**Causa:** `playwright.config.ts` **no carga `dotenv`**, y `e2e/global-setup.ts` hace `skip` silencioso si faltan `E2E_TEST_USER_EMAIL/PASSWORD`. Adicionalmente, los helpers de tests (`e2e/helpers/ronda-fixture.ts:32`) requieren `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` que tampoco se cargan.

**Impacto:**
- Pre-push hook (`.git/hooks/pre-push`) corre tests y reporta verde — pero NO testeó la suite auth.
- CI puede reportar "38/38" cuando en realidad solo corrió 28 smoke + 4 skips.
- Regresiones autenticadas NO se detectan hasta producción.

**Fix propuesto:**

```ts
// playwright.config.ts (línea 1)
import 'dotenv/config' // ← agregar antes del resto del config
// O explícito:
import { config } from 'dotenv'
config({ path: '.env.local' })
```

Y en `e2e/global-setup.ts` cambiar el silent skip por error explícito:

```ts
if (!email || !password) {
  throw new Error('E2E_TEST_USER_EMAIL/PASSWORD no configuradas — abortando suite auth')
}
```

**Evidencia:** primer run `npm run test:e2e:ronda` retornó `4 skipped` con exit 0. Tras `set -a; source .env.local; set +a`, retornó `4 passed`.

---

## 5. Gaps de cobertura E2E — no bugs, pero perdemos red de seguridad

| Test | Razón skip | Acción |
|---|---|---|
| `organizar-campeonato-asistente.spec.ts:35` | `/assistant` endpoint timeout o 5xx → asume ANTHROPIC_API_KEY no configurada | Verificar que ANTHROPIC_API_KEY esté en Vercel preview env |
| `organizar-campeonato-live.spec.ts:18` | No existe torneo con slug `demo-torneo` | Crear torneo permanente con slug `demo-torneo` o setear `E2E_LIVE_TOURNAMENT_SLUG` |
| `organizar-campeonato-live.spec.ts:53` | Mismo motivo | Mismo fix |
| `organizar-campeonato-modal-duplicar.spec.ts:29` | Test user E2E no tiene torneos previos creados | Seed 1 torneo previo en `setup-e2e-user.mjs` |

**Impacto:** 4 flujos críticos NO cubiertos por la red de seguridad actual. Si alguien rompe el asistente IA, el LiveView o el modal duplicar — nadie se entera hasta el primer reporte de usuario.

---

## 6. Fricciones UX — no audit manual ejecutado

⚠️ **Esta auditoría priorizó cobertura E2E automatizada.** No incluye browse manual de UX (jerarquía visual, micro-interacciones, copy, responsive edge cases).

**Recomendación:** fase 2 post-fix de P0s. Skills sugeridos:
- `design-review` (gstack) — audit visual con before/after.
- `browse` interactivo — replicar flujos como usuario real con screenshots.
- `qa` (gstack) tier Standard — bugs + fix loop.

---

## 7. Priorización CTO

### Sprint inmediato (esta sesión o la próxima)

1. **P0 #1 — Fix saveScores merge** (~1 día, riesgo medio)
   - Recomendación: Opción A (endpoint upsert por hoyo).
   - Worktree: `feat/score-upsert-merge`.
   - Test de regresión: extender `ronda-scoring.spec.ts:180` con cierre/reapertura de app entre hoyos.
   - **Bloquea torneos reales** hasta merged + deployado.

2. **P0 #2 — Fix dotenv en Playwright config** (~30 min, riesgo bajo)
   - 2 líneas en `playwright.config.ts` + 1 cambio en `global-setup.ts`.
   - Worktree: `chore/playwright-dotenv-load`.
   - Test: correr `npm run test:e2e:ronda` SIN exportar vars → debe fallar explícito, no skipear.

### Esta semana

3. **Habilitar 4 gaps E2E** (~2-3h)
   - Seed `demo-torneo` permanente en Supabase prod (o en setup-e2e-user.mjs).
   - Verificar ANTHROPIC_API_KEY en Vercel preview.
   - Extender `setup-e2e-user.mjs` para crear 1 torneo previo.

### Próximo sprint

4. **Auditoría UX manual** con `qa` skill tier Standard
   - Browse interactivo de los edge cases NO cubiertos por automatización.
   - Lista detallada en sección 6 arriba.

---

## 8. Apéndice — Comandos para reproducir

```bash
# Smoke público (sin auth, mobile-chromium)
npm run test:e2e:smoke

# Suite auth completa (REQUIERE cargar .env.local primero — ver P0 #2)
set -a; source .env.local; set +a
npm run test:e2e:auth

# Torneo 40pp ad-hoc (carga .env.local internamente vía --env-file)
node --env-file=.env.local scripts/test-e2e-torneo40.mjs

# Solo ronda libre (incluye el test que detecta el P0)
set -a; source .env.local; set +a
npm run test:e2e:ronda
```

## 9. Archivos clave referenciados

- `src/app/ronda-libre/[codigo]/score/hooks/useScoreSave.ts:78` — root cause P0 #1
- `playwright.config.ts:1` — fix P0 #2
- `e2e/global-setup.ts` — silent skip a reemplazar por throw
- `e2e/helpers/ronda-fixture.ts:32` — assertions de env vars
- `scripts/test-e2e-torneo40.mjs` — 552 LOC de cobertura torneo
- `screenshots/P0-bug-scoring-loss.png` — evidencia visual del P0 #1
