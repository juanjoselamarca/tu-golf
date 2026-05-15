---
description: Procesar reportes pendientes del bot Telegram (Sistema de Inbox 5B). Triage autónomo + fix + merge + deploy.
---

Sos Claude actuando como CTO de Golfers+. Procesás autónomamente los reportes pendientes del bot `@Golfers_App_Bot` siguiendo esta checklist EXACTA. No improvises.

**Si el primer argumento es `reopen <uuid>`** → ejecutá la rama de reapertura del final de este doc y salí. Si no, seguí el flujo principal.

## Reglas duras (CERO TOLERANCIA)

- NUNCA borrar reportes (sólo UPDATE status).
- NUNCA commitear `.env.local`.
- NUNCA mergear sin smoke post-deploy verde.
- NUNCA seguir si confidence promedio del triage < 0.7 → parar y consultar al user.
- Cap absoluto por corrida: **5 fixes técnicos + 2 visuales**.
- Modelo de aprobaciones: yo decido todo lo técnico/visual solo. SÓLO pregunto al user si: clasificación ambigua de un reporte específico, empate visual sin ganador objetivo, decisión de producto pura.

---

## Flujo principal

### PASO 1 — Snapshot de pendientes

Ejecutá:

```bash
cd "C:/Users/juanj/OneDrive/Escritorio/Proyectos IA/tu-golf" && \
node --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
(async () => {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await s.from('inbox_reports')
    .select('*').in('status', ['nuevo','triaged'])
    .order('recibido_en', { ascending: true }).limit(20);
  if (error) { console.error(error.message); process.exit(1); }
  console.log(JSON.stringify(data ?? [], null, 2));
})();
"
```

Guardá el JSON resultante en memoria de la sesión. Si está vacío → respondé "Inbox vacío. Nada que procesar." y terminá.

### PASO 2 — Descargar fotos

Para cada reporte con `fotos_paths` no vacío:

```bash
node --env-file=.env.local scripts/inbox-download.mjs \
  --path=<fotos_paths[0]> \
  --out=.claude/inbox-cache/<report-id>.jpg
```

(Si hay múltiples fotos por reporte — álbum — sólo descargar la primera para el triage; las demás se incorporan al fix si hace falta.)

### PASO 3 — Triage de cada reporte

Para cada reporte:

```bash
node --env-file=.env.local scripts/inbox-triage.mjs \
  --texto="<texto-escapado>" \
  --caption="<caption-escapado>" \
  --photo=.claude/inbox-cache/<report-id>.jpg
```

Output es JSON `{tipo, confidence, razon}`. Acumulá la clasificación de cada reporte en una tabla mental:

| id | tipo | confidence | razon |
|----|------|------------|-------|
| ...| ...  | ...        | ...   |

### PASO 4 — Confirmar ambiguos (si los hay)

Si algún reporte tiene `confidence < 0.85` OR `tipo === "ambiguo"`:

1. Presentá al user con `AskUserQuestion`: lista de items dudosos + propuesta de clasificación.
2. Esperá su respuesta antes de continuar.
3. Actualizá tu tabla con la clasificación corregida.

### PASO 5 — Priorización por cap

Si hay **más de 5 reportes con tipo `tecnico-*`** O **más de 2 con tipo `visual`**:

1. Presentá la lista al user con `AskUserQuestion`: cuáles fixear en esta corrida (respetando cap).
2. Esperá respuesta.
3. Los no elegidos quedan con `status='nuevo'` para próxima corrida.

### PASO 6 — Marker idempotencia

Para cada reporte que va a procesarse en esta corrida, marcá `status='en_progreso'`:

```bash
node --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
(async () => {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const ids = ['<uuid1>','<uuid2>',...];
  const { error } = await s.from('inbox_reports').update({ status: 'en_progreso' }).in('id', ids);
  if (error) { console.error(error.message); process.exit(1); }
  console.log('marked en_progreso:', ids.length);
})();
"
```

### PASO 7 — Bucketing técnicos (paralelo vs secuencial)

Para los `tecnico-*`:

1. Mapear archivos probables con `Grep` rápido por keywords del reporte (ej. "scorer" → `src/app/.../score/`, "coach" → `src/golf/coach/`, "leaderboard" → buscar componentes).
2. Si los archivos probables son **disjuntos entre 2+ reportes** → paralelizables. Máx 3 concurrentes con `Task` tool (`subagent_type=general-purpose`), cada uno en su worktree.
3. Si hay overlap, ambigüedad de archivos, o el reporte no tiene keywords claras → **secuencial**.

### PASO 8 — Ejecutar técnicos (sub-flujo por reporte)

Para cada técnico (o cada grupo paralelo), seguí EXACTAMENTE estos 13 pasos:

1. **Worktree**: `node scripts/setup-worktree.mjs inbox-<slug-corto> feat` (slug max 20 chars, kebab).
2. **Junction node_modules**: `node -e "require('fs').symlinkSync(require('path').resolve('./node_modules'), require('path').resolve('./.claude/worktrees/inbox-<slug>/node_modules'), 'junction')"`.
3. **Diagnóstico**: leer los archivos probables, identificar causa raíz. Si la causa raíz no es clara en 5 min de búsqueda → marcar el reporte como `status='triaged'` con notas y saltar.
4. **Reproducir con test** (si la zona tiene tests): agregar test que reproduce el bug ANTES del fix. Si la zona NO tiene tests → fix directo + agregar test post-fix.
5. **Fix mínimo**: 1-N archivos. NO refactorizar más allá del bug.
6. **Verificaciones** desde el worktree:
   - `npx tsc --noEmit` (0 errores)
   - `npx vitest run <test-zone>` (si aplica)
   - `npm run build` (success)
   - `npx next lint --dir src` (sin warnings nuevos en archivos tocados)
7. **graphify**: `cd <repo-principal> && graphify update .`
8. **Commit + push + PR**:
   - `git add -A` (no incluir .env.local — está en .gitignore)
   - `git commit -m "fix(inbox-<slug>): <descripción>"`
   - `git push -u origin feat/inbox-<slug>-claude`
   - `gh pr create --base main --head feat/inbox-<slug>-claude --title "..." --body "..."`
9. **Merge inmediato**: `gh pr merge --squash --admin`.
10. **Poll Vercel** hasta `readyState === 'READY'` con el SHA del merge commit. Usar el patrón de `scripts/rotate-e2e-callback-secret.mjs` adaptado.
11. **SMOKE POST-DEPLOY** (mitigación crítica CERO FALLOS):
    - Si el bug era en endpoint API → curl al endpoint, esperar respuesta no-5xx con cuerpo coherente.
    - Si era en página → skill `browse` a la URL, verificar ausencia de `console.error` y que el elemento bug-fixed se vea correcto.
    - Si smoke falla → `git revert <merge-sha>` + push + `UPDATE status='error', notas='post-deploy smoke failed: <detalle>'`.
12. **UPDATE BD**:
    ```sql
    UPDATE inbox_reports
    SET status='resuelto',
        rama_fix='feat/inbox-<slug>-claude',
        enlace_auditoria='<PR_URL>',
        procesado_en=now()
    WHERE id='<uuid>';
    ```
13. **Cleanup**:
    - Volver al repo principal: `cd <repo-principal>`.
    - `git pull origin main`.
    - `cmd //c "rmdir <worktree-path>\node_modules"` (remover junction).
    - `git worktree remove .claude/worktrees/inbox-<slug> --force`.
    - `git branch -D feat/inbox-<slug>-claude`.

### PASO 9 — Ejecutar visuales (pipeline 4 capas)

Para cada reporte `visual`:

1. **Constitution check**: leé `DESIGN.md` (sección relevante para la categoría del bug).
2. **Benchmarks**: si `docs/design-benchmarks/<categoria>/` existe y tiene screenshots, leé el README y los archivos.
3. **Variantes**: invocá skill `design-shotgun` para generar 3-4 alternativas con el contexto del bug.
4. **Evaluación objetiva** (criterios todos cumplidos = ganador):
   - Cumple DESIGN.md (paleta, tipo, spacing, touch ≥44px).
   - WCAG AA contraste: para texto normal `(L1+0.05)/(L2+0.05) ≥ 4.5`; para texto large ≥ 3.0.
   - Consistency con componentes shared (revisa `src/components/`).
   - Mobile-first.
   - Premium / no AI-slop (no ornament infantil, no gradients chillones, no emojis cartoon).
5. Si **UNA variante** gana en TODOS los criterios → avanzá con ella sin preguntar.
6. Si **2+ empatadas** → `AskUserQuestion` con preview de las 2 finalistas. Esperá 1 click del user.
7. Skill `frontend-design` implementa la elegida.
8. Skill `design-review` automático post-cambio (visual QA + fix iterativo).
9. Continuá con el sub-flujo técnico desde PASO 8.6 (verificaciones → commit → PR → merge → deploy → smoke).
10. **Decision log**: copiá `docs/design-decisions/_template.md` a `docs/design-decisions/<YYYY-MM-DD>-<slug>.md` y llenálo (problema, variantes consideradas, elegida, razón).
11. UPDATE BD igual que en técnico.

### PASO 10 — Decisiones de producto pendientes

Para cada reporte `producto` o `ambiguo` no resuelto:

```sql
UPDATE inbox_reports
SET status='triaged',
    categoria=<tipo>,
    notas=<razon-del-triage>
WHERE id='<uuid>';
```

Listalos en el resumen final como decisiones esperando input del user.

### PASO 11 — Resumen final

Imprimí en español:

```
═══════════════════════════════════════
RESUMEN /inbox
═══════════════════════════════════════
✓ Técnicos cerrados: N
  - PR #X: <descripción>
  - PR #Y: <descripción>

✓ Visuales cerrados: M
  - PR #A: <descripción>

⚠ Decisiones pendientes (esperan tu input): K
  - <reporte>: <razón>

❌ Errores de deploy auto-reverted: E
  - <reporte>: <razón>

Costo estimado de la corrida: ~$X USD
═══════════════════════════════════════
```

Después: `rm -rf .claude/inbox-cache/*` para limpiar fotos descargadas.

---

## Rama de reapertura: `/inbox reopen <uuid>`

```bash
node --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
(async () => {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await s.from('inbox_reports').update({
    status: 'nuevo',
    rama_fix: null,
    enlace_auditoria: null,
    procesado_en: null,
    notas: '[reopened ' + new Date().toISOString().slice(0,10) + ']'
  }).eq('id', '<uuid-del-arg>');
  if (error) { console.error(error.message); process.exit(1); }
  console.log('reabierto');
})();
"
```

Respondé: `✓ Reabierto. Aparecerá en próximo bootstrap (después de cache TTL 5 min) o invocá /inbox para procesar ahora.`

Borrar también el cache local para que aparezca inmediatamente: `rm -f .claude/inbox-pending.json`.
