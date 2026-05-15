# Sistema de Inbox · Agente 5B (Consumer local) — Design

**Fecha:** 2026-05-15
**Estado:** aprobado, listo para writing-plans
**Predecesor:** Agente 5A (backend cloud) mergeado a main en commits `18c29f7` + `82c444f`
**Branch para implementación:** `feat/inbox-5b-consumer-claude`

---

## 1. WHY

Cierra el feedback loop "bug en cancha → CTO fixea" que arrancó con el 5A. Sin el 5B,
los reportes acumulan en BD pero nadie los procesa automáticamente — el sistema vale
50% de su potencial.

Habilitador directo del roadmap **CERO FALLOS**: cada reporte llegado al inbox debe
quedar resuelto antes de que el usuario reporte otra vez el mismo bug.

---

## 2. Modelo de interacción (UX validado con Juanjo)

### Flujo ideal del usuario (mínimos clicks)

1. Juanjo detecta bug en cancha → manda foto/texto al bot `@Golfers_App_Bot`. **(click 1)**
2. Abre Claude alguna vez después → ve bootstrap automático: *"hay N pendientes en inbox: [resumen 1 línea c/u]"*.
3. Escribe `/inbox`. **(click 2)**
4. Claude ejecuta TODO el procesamiento autónomo (clasifica, fixea, mergea, deployea).
5. Resumen final: *"✓ N cerrados (PRs #X #Y), M esperando decisión visual/producto"*.

Total: **2 clicks por batch en happy path**. Más clicks si hay ambigüedad de clasificación (paso 3), overflow >5 técnicos (paso 4), o empate visual sin ganador objetivo (paso 8.f).

### Matriz de autonomía (qué decide Claude solo, cuándo pregunta)

| Tipo de reporte | Acción Claude | Tu involvement |
|---|---|---|
| Bug técnico (trivial o complejo) | Triage + fix + merge + deploy autónomo | Aviso post-hecho |
| Bug visual con ganador objetivo claro | Pipeline diseño + implementa + deploy | Aviso post-hecho |
| Bug visual con empate técnico real | Pipeline diseño + presenta 2 variantes con preview | 1 click eligiendo |
| Decisión de producto pura | Triage + presenta opciones | Vos respondés |
| Idea / feature request | **NO esperado en este chat** — Juanjo confirmó que ideas van a chat dedicado separado | N/A |

---

## 3. Arquitectura técnica

### 3.1 Bootstrap (resumen al inicio de cada sesión)

**Hook `SessionStart`** en `.claude/settings.json`:

```jsonc
{
  "hooks": {
    "SessionStart": [{
      "command": "node --env-file=.env.local scripts/inbox-bootstrap.mjs",
      "timeoutMs": 2000
    }]
  }
}
```

**Script `scripts/inbox-bootstrap.mjs`**:
- SELECT `id, recibido_en, texto, caption, status` FROM `inbox_reports` WHERE `status` IN (`'nuevo'`, `'triaged'`) ORDER BY `recibido_en` LIMIT 20.
- Cache local: `.claude/inbox-pending.json` con TTL 5 min para evitar query por sesión.
- Si timeout (>2s) o error → output `(inbox check timed out)` y salir 0 (no bloquear sesión).
- Emite `system-reminder` con conteo + 1 línea por reporte (truncado 60 chars).

**Comportamiento si inbox vacío**: silencio total. Cero ruido en el 95% de sesiones que no tienen pendientes.

### 3.2 Slash command `/inbox`

**Archivo:** `.claude/commands/inbox.md`
**Formato:** prompt MUY estructurado con checklist obligatoria (no narrativo) para minimizar variabilidad LLM entre invocaciones.

**Recursos que usa (todos ya existen):**
- `scripts/run-sql.mjs` para queries
- `createAdminClient` de `@/lib/supabase` para signed URLs del bucket
- `scripts/setup-worktree.mjs` para worktrees aislados
- Tool `Task` para spawn de agentes paralelos (cuando aplica)
- Skills: `design-shotgun`, `frontend-design`, `design-review`, `browse`

### 3.3 Flujo dentro de `/inbox` (checklist obligatoria)

```
PASO 1: SNAPSHOT
  - SELECT * FROM inbox_reports WHERE status IN ('nuevo','triaged','en_progreso')
    ORDER BY recibido_en LIMIT 20
  - Para cada uno con foto: createSignedUrl(path, 3600) + descargar a .claude/inbox-cache/

PASO 2: TRIAGE (modelo barato — Haiku 4.5 vía Anthropic SDK)
  - Para cada reporte: leer texto + caption + ver foto (multimodal)
  - Clasificar: técnico-trivial | técnico-complejo | visual | producto | ambiguo
  - Calcular confidence (0-1) de la clasificación
  - Si confidence < 0.85 en cualquier item → marcarlo "needs-review"

PASO 3: CONFIRMACIÓN AMBIGUOS (solo si hay)
  - Presentar al user TODOS los needs-review juntos: "estos 2 no estoy seguro, ¿técnicos o visuales?"
  - 1 click del user resuelve la duda → continúa

PASO 4: PRIORIZACIÓN
  - Cap: máx 5 fixes técnicos en una corrida
  - Si hay >5 técnicos → presentar lista al user, vos elegís cuáles van en esta corrida

PASO 5: MARKER (idempotencia)
  - UPDATE status='en_progreso' en cada reporte que arranca esta corrida
  - Si Claude crashea, próxima invocación skip los 'en_progreso' (o los retoma si --resume)

PASO 6: BUCKETING TÉCNICOS (paralelo vs secuencial)
  - Para cada técnico: grep keywords del reporte contra src/ para mapear archivos probables
  - Si archivos disjuntos → paralelo (worktrees + Task tool con subagent_type=general-purpose)
  - Si overlap o no logro mapear → secuencial
  - Cap concurrencia: máx 3 agentes paralelos (evita colapso Claude Code)

PASO 7: EJECUTAR TÉCNICOS
  Para cada uno (o cada grupo paralelo):
    a. node scripts/setup-worktree.mjs inbox-<slug> feat
    b. Plan interno (sin presentar al user)
    c. fix → tests → tsc → build → lint → graphify
    d. commit + push
    e. gh pr create
    f. gh pr merge --squash --admin
    g. Esperar deploy production (poll Vercel API hasta READY)
    h. SMOKE POST-DEPLOY (mitigación crítica):
       - Si bug era en endpoint X → probe HTTP a endpoint X esperando 200
       - Si bug era en página Y → browse skill a /Y verificando ausencia de console.error
       - Si smoke falla → git revert + push + UPDATE status='error', notas='post-deploy smoke failed'
    i. UPDATE status='resuelto', rama_fix=<branch>, enlace_auditoria=<PR_URL>
    j. Cleanup worktree

PASO 8: EJECUTAR VISUALES (pipeline 4 capas)
  Para cada visual:
    a. Leer DESIGN.md (relevant sections para la categoría del bug)
    b. Consultar docs/design-benchmarks/<categoria>/ si existe
    c. Skill design-shotgun → 3-4 variantes
    d. Evaluación objetiva contra criterios:
       - Cumple DESIGN.md (paleta, tipo, spacing, touch targets ≥44px)
       - WCAG AA contraste (medible con axe-core o regla manual)
       - Consistency con componentes shared
       - Mobile-first
    e. Si UNA variante gana en todos los criterios → la elijo y avanzo solo
    f. Si 2+ empatadas → 1 click al user con preview de las 2 finalistas
    g. Skill frontend-design implementa la elegida
    h. Skill design-review automático (visual QA + fix iterativo)
    i. Pipeline técnico desde PASO 7.d (commit → PR → merge → deploy → smoke)
    j. Anotar en docs/design-decisions/<date>-<slug>.md: problema, variantes, elegida, razón
    k. UPDATE status='resuelto' + rama_fix + enlace_auditoria

PASO 9: PRESENTAR DECISIONES PENDIENTES (si las hay)
  - Productos sin clasificación clara → te presento con propuestas
  - Visuales que requirieron tu click pero vos no respondiste → idem
  - Vos respondés en próxima sesión, status='triaged' hasta entonces

PASO 10: RESUMEN FINAL
  - "✓ N técnicos cerrados: PRs #X, #Y, #Z"
  - "✓ M visuales cerrados: PRs #A, #B"
  - "⚠ K decisiones pendientes: [resumen]"
  - "❌ E con errores en deploy (auto-reverted): IDs [...]"
```

### 3.4 Manejo de errores y edge cases

| Escenario | Comportamiento |
|---|---|
| Fix rompe tests | NO mergeo. `status='en_progreso'`, `notas='tests fallaron: [stack]'`. Te aviso. |
| Build falla | NO mergeo. Idem anterior. |
| Post-deploy smoke falla | `git revert` + `git push` + `status='error'`. Te aviso con resumen del fail. |
| Crash a mitad de procesamiento | Reportes en `'en_progreso'` quedan así. Próxima `/inbox` los skip por default, o los retoma con `/inbox --resume`. |
| Reporte ambiguo (clasificación <85%) | `status='triaged'`, te pregunto solo el item ambiguo. |
| Empate técnico en visual | Presento 2 variantes con preview, 1 click tuyo. |
| Reporte ignorado >7 días | Aviso especial en bootstrap: *"reporte #X esperando decisión hace 8 días"*. |
| Worktree con conflict en main | `git pull origin main` antes de fixear. Si conflict no trivial → secuencial con resolución del LLM. |
| Telegram file_id expirado | No aplica: el 5A ya descarga al recibir el mensaje, archivos viven en bucket Supabase. |

### 3.5 Sub-comando auxiliar `/inbox reopen <id>`

Para cuando yo cerré un reporte erróneamente. El mismo `inbox.md` detecta el primer argumento: si es `reopen <uuid>` ejecuta la rama de reapertura en vez del flujo principal:

```sql
UPDATE inbox_reports
SET status='nuevo',
    rama_fix=NULL,
    enlace_auditoria=NULL,
    procesado_en=NULL,
    notas=COALESCE(notas,'') || ' [reopened by user '||now()::date||']'
WHERE id=$1;
```

Después responde *"✓ reabierto, aparecerá en próximo bootstrap"*.

---

## 4. Sistema de Guardrails de Diseño (4 capas)

### Capa 1 — DESIGN.md como Constitution
Antes de cualquier decisión visual, leo `DESIGN.md` (ya existe, 12 secciones, 202 líneas). Si la decisión viola el doc → abro PR a `DESIGN.md` primero con propuesta, vos OK de 1 click, después implemento.

### Capa 2 — Benchmarks visuales locales
Crear `docs/design-benchmarks/` con screenshots categorizados por feature:
- `scorer/` (Garmin Golf, Arccos, GolfShot, 18Birdies)
- `leaderboard/` (Augusta, PGA Tour live, ESPN)
- `profile/` (MyScorecard, Strava, Garmin Connect)
- `coach/` (Whoop, Apple Health, Garmin Coach)
- `widget-pga/` (PGA Tour app, ESPN scoreboard widgets)

Captura inicial con skill `browse` (anti-bot stealth). ~10 min one-shot. Actualizable.

### Capa 3 — Pipeline forzado para visuales
Definido en §3.3 PASO 8. Sin atajos: cualquier bug visual pasa por las 4 capas obligatorias.

### Capa 4 — Decision log que aprende de sí mismo
`docs/design-decisions/<date>-<slug>.md` por cada cambio visual significativo:
- Problema (1 línea)
- Variantes consideradas (links a renders)
- Elegida + razón objetiva
- Si empate → qué decidió Juanjo y por qué

Cada vez que enfrente problema similar, consulto este corpus primero.

---

## 5. Mitigaciones críticas (las 6 del análisis crítico)

1. **Confidence threshold 85%** para clasificación → menos fixes wrong.
2. **Smoke test post-deploy + auto-revert** → no quedan bugs live silenciosos.
3. **Prompt MUY estructurado en checklist** → menos variabilidad LLM.
4. **Cap 5 fixes/corrida + Haiku 4.5 para triage** → costo acotado (~$15-30/día max).
5. **Timeout 2s + cache local en bootstrap** → no bloquea inicio de sesión.
6. **Comando `/inbox reopen <id>`** → recuperación de mis errores de cierre.

Adicionales:
- Marker `status='en_progreso'` para idempotencia.
- Aviso "decisiones pendientes >7 días" en bootstrap.
- Cleanup automático de worktrees post-merge.

---

## 6. Modelo de costos

- **Triage por reporte**: ~3-5k tokens con Haiku 4.5. Costo ~$0.001 c/u.
- **Fix técnico simple**: ~20-30k tokens con Opus 4.7. Costo ~$1-2 USD.
- **Fix técnico complejo**: ~50-100k tokens. Costo ~$3-7 USD.
- **Visual con pipeline completo (shotgun + frontend-design + design-review)**: ~80-150k tokens. Costo ~$5-10 USD.

**Estimación diaria** (5 bugs realistas mixtos): ~$15-25 USD/día. Sostenible para feedback loop crítico.

---

## 7. Out of scope (versión inicial)

- Auto-rollback dinámico basado en thresholds de Sentry/PostHog (revert manual por ahora).
- Multi-usuario / multi-bot (sólo Juanjo escribe al bot).
- Web UI para triage (slash command suficiente).
- Notificaciones push de cierre al usuario via Telegram (queda en el roadmap si lo necesitamos).
- Ideas y feature requests → chat dedicado separado, no en este sistema.
- Auto-asignación a otros agentes paralelos del proyecto (5B procesa él mismo).
- Triage automático de prioridad/severidad (P0/P1/P2) — Claude lo asigna pero sin escalation paths.

---

## 8. Archivos a crear/modificar

**Nuevos:**
- `scripts/inbox-bootstrap.mjs` — query + cache + emit summary
- `.claude/commands/inbox.md` — prompt operativo del slash command
- `docs/design-benchmarks/README.md` + screenshots (capturados con `browse`)
- `docs/design-decisions/_template.md` — template para decisión visual

**Modificados:**
- `.claude/settings.json` — agregar hook `SessionStart`
- `.gitignore` — agregar `.claude/inbox-cache/`, `.claude/inbox-pending.json`
- `CLAUDE.md` — sección breve sobre `/inbox` (rol y trigger)

**No tocados:** Backend 5A intacto. El 5B sólo consume, no muta el contrato.

---

## 9. Criterios de "Definition of Done"

El 5B se considera completo cuando:

1. `/inbox` ejecutable en sesión Claude Code, leyendo de prod.
2. Bootstrap automático funciona sin bloquear sesiones (verificado con 5+ sesiones).
3. Smoke test E2E: mandás 1 bug técnico fake + 1 bug visual fake al bot, `/inbox` cierra ambos con PR mergeado.
4. Decision log se crea automáticamente.
5. Benchmarks visuales capturados para ≥3 categorías relevantes.
6. Aborto graceful en escenarios de fallo (tests rompen, deploy rompe).
7. Costo real de 1 batch realista ≤ estimación de §6 (medido con Anthropic console).

---

## 10. Open questions (ninguna bloqueante)

- ¿Modelo Haiku 4.5 acepta inputs multimodal (foto) en triage? **Asunción:** sí, validar al implementar. Fallback: usar Opus para triage también, ajustar cap de costos.
- ¿Cuántos benchmarks visuales capturamos en la primera corrida? **Decisión técnica del CTO al implementar.** Default: 4-5 categorías con 3-4 screenshots c/u.
