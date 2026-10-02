# Sistema de Inbox — bot Telegram → CTO fixea

> Detalle movido desde `CLAUDE.md` el 02-oct-2026 (texto original, sin cambios). CLAUDE.md conserva la regla resumida y apunta acá.

App tiene canal directo de feedback: bot **`@Golfers_App_Bot`** recibe foto/texto, persiste en `inbox_reports` (Supabase) + bucket `inbox-photos`.

**Bootstrap**: al iniciar sesión, hook `SessionStart` corre `scripts/inbox-bootstrap.mjs` que emite un `system-reminder` con conteo + resumen 1-línea de pendientes. Silencioso si vacío. Cache local 5 min + timeout 2s.

**Procesamiento**: slash command `/inbox` ejecuta flujo completo (triage Haiku 4.5 → fix → tsc/build/lint → PR → checks verdes → merge (nunca `--admin`, regla en `scripts/ceo-prompts/merge-rule.md`) → deploy → smoke post-deploy). Autonomía total para bugs técnicos. Sólo consulta a Juanjo si: clasificación con confidence <0.85, empate visual sin ganador objetivo, decisión de producto pura.

**Pipeline visual obligatorio** (4 capas):
1. `DESIGN.md` constitution check.
2. `docs/design-benchmarks/<categoria>/` si existe.
3. `design-shotgun` (3-4 variantes) + evaluación objetiva (DESIGN.md, WCAG AA, consistency, mobile-first, premium).
4. `frontend-design` + crítica de Fable (checklist de la sección MODELOS → Pipeline de diseño) + `design-review` + decision log en `docs/design-decisions/`.

**Comandos**:
- `/inbox` — procesar todo lo pendiente.
- `/inbox reopen <uuid>` — reabrir reporte cerrado por error.

**Cap por corrida**: 5 fixes técnicos + 2 visuales. Más → user prioriza.

**Doc**:
- `docs/INBOX_ARCHITECTURE.md` — arquitectura completa.
- `docs/superpowers/specs/2026-05-15-inbox-5b-consumer-design.md` — spec del consumer.
