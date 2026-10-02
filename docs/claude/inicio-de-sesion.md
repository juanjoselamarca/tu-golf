# VERIFICACIÓN OBLIGATORIA AL INICIAR CADA SESIÓN

> Detalle movido desde `CLAUDE.md` el 02-oct-2026 (texto original, sin cambios). CLAUDE.md conserva la regla resumida y apunta acá.

Antes de cualquier acción, ejecutar en orden:

1. `git remote -v` → DEBE ser `origin https://github.com/juanjoselamarca/tu-golf.git`. Si es otra URL, DETENER y avisar.
2. `git branch --show-current` → idealmente `main`. Si es feature/chore branch, AVISAR a Juanjo (puede ser continuación de sesión previa) y NO commitear nada nuevo sin confirmar la rama.
3. `git pull origin main`.
4. `git worktree list` → contar worktrees activos. Si hay más de 1, asumir paralelización: otros agentes pueden estar editando archivos en branches compartidas.

Confirmar con: `✅ Repositorio verificado: github.com/juanjoselamarca/tu-golf — N worktrees activos`

### Regla derivada — worktree propio para CADA sesión con commits nuevos

Si la sesión va a producir commits:

- **Crear worktree dedicado** con `node scripts/setup-worktree.mjs <slug> [chore|feat|fix]`. El script copia `.env.local`, crea branch `<prefix>/<slug>-claude` desde `origin/main`, y deja todo listo en `.claude/worktrees/<slug>/`.
- **NUNCA editar archivos en una rama compartida con otro agente activo.** Choque inevitable — el agente paralelo te va a mover el commit o vas a tener que stashear cambios ajenos.
- **Excepción aceptable:** cambio mínimo documental y `git worktree list` muestra 1 solo worktree. Entonces se puede trabajar directo en main + feature branch existente.

Incidente real (12-may-2026): commit de defaults en CLAUDE.md fue movido silenciosamente por un agente paralelo a una rama nueva, y el push falló por `.env.local` faltante en el worktree paralelo. Detalle en `docs/CONVENCIONES_TRABAJO.md` §11.

**Por qué verificar repo y no carpeta:** el proyecto puede vivir en cualquier carpeta. El repo GitHub es la identidad permanente.

**Si el usuario pega un `health-issue-*.md`:** es un reporte de Health Check con problemas no resueltos automáticamente. Diagnosticar y arreglar CADA problema antes de cualquier otra cosa. Prioridad máxima.
