# Protocolo Cerebro V3 — vigente desde 2026-05-26

> Detalle movido desde `CLAUDE.md` el 02-oct-2026 (texto original, sin cambios). CLAUDE.md conserva la regla resumida y apunta acá.
>
> **02-oct-2026 (modelos v2):** la revisión pre-merge es `revisor-fable` con expediente (`node scripts/expediente-review.mjs`, ver `docs/claude/modelos.md` → Reglas 1-4). Donde este texto dice `superpowers:code-reviewer` o `model: "fable"`, léase eso.

Proyecto activo de rediseño del coach tAIger+ desde el cerebro v2 actual hacia un organismo cognitivo (cerebro v3) que aprende como humano. Roadmap de 7 olas en ~4.5 meses con feature flag por usuario para rollback seguro.

### Fuentes de verdad
- **Spec maestro (constitución):** `docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md`. Si hay duda arquitectónica, esto manda.
- **Estado vivo del proyecto:** `docs/cerebro-v3-estado.md`. Leer al iniciar CUALQUIER sesión que toque cerebro v3.
- **Plan de la ola activa:** `docs/superpowers/plans/<fecha>-cerebro-v3-ola-N.md` cuando hay una en curso.

### Las 10 reglas operativas (no negociables)

1. **Cerebro v2 sigue vivo en prod** hasta que cada ola del v3 esté validada. Todo v3 vive en `src/golf/coach/v3/` con feature flag `cerebro_v3_enabled` por usuario.
2. **Un solo worktree activo por vez** dentro de cerebro v3. Paralelización solo entre cerebro v3 y trabajo ortogonal (inbox, bugs P0).
3. **Inbox y bugs P0 siempre ganan.** Se pausa la ola y se atiende. CERO FALLOS manda.
4. **Cada ola termina con demo en vivo a Juanjo** antes de mergear. Sin OK no merge aunque tests pasen.
5. **Cada PR >100 LOC pasa por `superpowers:code-reviewer` agent** (regla 25-may). Sin OK del reviewer no merge.
6. **Cada ola pasa `/pre-push` completo** (tsc + tests + build + health + smoke) antes del merge.
7. **Documentación al cierre** de cada ola: SPRINT_LOG, REORDENAMIENTO_TRACKING, `update-docs.js`, actualizar `docs/cerebro-v3-estado.md`.
8. **Reporte semanal corto** al inicio de cada lunes.
9. **Si me trabo, aviso.** Técnico lo resuelvo solo, producto lo consulto.
10. **Cada ola se mide contra el banco de pruebas** (5 perfiles sintéticos + Juanjo + 30+ casos canario) antes de mergear.

### Protocolo de INICIO de sesión

```
1. git status + git branch + git remote -v
2. git pull origin main
3. git worktree list
4. Leer docs/cerebro-v3-estado.md (si no existe, crear desde Apéndice D del spec)
5. Leer spec maestro
6. Si hay ola in_progress: leer plan + git log del worktree
7. Reportar: "Sesión retomada. Estamos en ola X, paso Y de Z.
   Último commit: <hash> <mensaje>. Próxima tarea: <descripción>.
   Procedo salvo que digas pausa o cambio."
8. Si Juanjo no responde en 30s → procedo (autonomía CTO).
```

### Protocolo de CIERRE de sesión

```
1. git status — nada sin commitear (commit o stash explícito)
2. Actualizar docs/cerebro-v3-estado.md (última tarea, próxima, decisiones, bloqueos)
3. Actualizar el plan de la ola activa (marcar [x] / [ ] nuevas)
4. Si hubo decisión arquitectónica → actualizar spec maestro + memoria
5. Skill `checkpoint` (gstack) — snapshot del estado
6. Reportar: "Sesión cerrada. Hice X. Próxima sesión arranca con Y."
```

### Las 6 piezas del cerebro v3 (visión)
1. Catálogo de patrones expansivo (no fijo en 7)
2. Patrones multivariables (estadística + ML)
3. El cerebro decide qué preguntas se hace en cada ronda
4. Loop de auto-mejora sobre lo que ya existe
5. Nutrición externa total: PGA + libros + papers + reglas, 100% gratis
6. Organismo cognitivo, no calculadora

### Descartado explícitamente (no entra en ningún roadmap previsto)
- Voice I/O y Vision multimodal (decisión PM 2026-05-26)
