# Convenciones de trabajo — Golfers+

Estas reglas valen para cualquier dev/CTO que entre al proyecto. No son preferencias personales: son invariantes que protegen la calidad y la continuidad. Cada una incluye el porqué (incidente real o riesgo) para que se pueda juzgar edge cases.

> Resumen ejecutivo en `CLAUDE.md`. Detalle aquí.

---

## 1. Commits puros — un scope por commit

Un commit = una intención. Nunca mezclar `refactor` con `feature` ni con `fix`. Si un cambio requiere las dos cosas, hacer dos commits separados.

**Por qué:** si algo rompe, querés poder revertir un solo scope sin perder el resto. Además, el historial se vuelve legible como narrativa.

**Ejemplo real (violación):** commit `2dcc4b0` bundled offline resilience + refactor `score-storage`. Causó deploy fail en Vercel porque el import del nuevo módulo llegó a main antes que el archivo. Ver `docs/SPRINT_LOG.md`.

## 2. Staging cuidadoso — `git diff` antes de `git add`

Siempre inspeccionar el diff antes de stagear. Nunca `git add .` ni `git add -A` si hay WIP ajeno en el tree (Juanjo trabaja en paralelo y puede tener módulos untracked que aún no compilan).

**Por qué:** `tsc` local puede pasar con un módulo untracked que referencia otro también untracked. Al pushear solo uno, la build de Vercel falla con módulo faltante. Incidente real el 2026-04-20.

## 3. WIP > 48h — branch o delete

Cambios sin comitear que llevan más de 48h en el tree deben:
- moverse a una branch (`git stash` o `git switch -c wip/nombre`), o
- descartarse si ya no son relevantes.

**Por qué:** WIP viejo en el tree se convierte en deuda silenciosa. Nadie se anima a tocar `src/app/foo/page.tsx` si tiene modificaciones de hace 3 semanas de origen desconocido.

## 4. Archivo de docs por trimestre

Docs one-off (auditorías, informes, planes de período cerrado) se mueven a `docs/archive/YYYY-QN/` con `git mv` para preservar historial. Criterio completo en [docs/archive/README.md](archive/README.md).

**Por qué:** `docs/` raíz debe contener solo docs vivos. Un nuevo dev que entra no tiene que adivinar qué es estado actual y qué es arqueología.

## 5. SPRINT_LOG — nueva entrada AL INICIO

Cada sprint agrega entrada arriba del archivo, nunca abajo. Formato consistente: `## Sesión DD Mes AAAA — Título`, con subsecciones Problema / Solución / Archivos tocados / Verificación / Commits.

**Por qué:** el lector que abre SPRINT_LOG quiere ver lo último primero.

## 6. Español LatAm neutro para strings de usuario

Usar `tú`, nunca `vos`. Spanglish golf OK (bogey, birdie, handicap). Los strings que ve el jugador en cancha deben ser naturales en Chile, México, Argentina y España sin sonar forzados.

**Por qué:** clubes chilenos son el lanzamiento inicial, pero la base de usuarios es regional.

## 7. Conceptos de golf — verificar, nunca asumir

Antes de implementar cualquier lógica de golf (handicap, stableford, match play, countback, WHS), validar contra reglas reales (USGA, R&A, Chile Golf). Nunca asumir que "suena lógico".

**Por qué:** error real previo confundiendo `handicap` con `índice`. Los jugadores notan un cálculo mal hecho en segundos y no vuelven. Motor centralizado en `src/golf/` justamente para que haya una sola fuente verificada.

## 8. Testing funcional con datos reales

Para cambios que tocan BD: no basta con `curl` validando status 200. Hacer INSERTs reales contra la BD de staging/dev y verificar que `CHECK constraints` y `RLS` se respetan.

**Por qué:** `curl` no detecta constraints violations. Incidente real en inscripción de jugadores donde el endpoint respondía 200 pero la fila nunca llegaba por constraint.

## 9. Pensar a futuro en cada decisión

Toda decisión técnica se evalúa por escalabilidad. No hay "arreglo rápido que después mejoramos" — el después nunca llega. Si no hay tiempo para hacerlo bien, no se hace.

**Por qué:** Golfers+ se usa en torneos reales. Un parche temporal que se rompe durante un campeonato es irreparable reputacionalmente.

## 10. Coordinación entre sesiones paralelas

El repo puede tener múltiples agentes/sesiones trabajando al mismo tiempo (Juanjo + Claude en una terminal, Claude en otra, hooks automáticos, etc). Disciplina mínima obligatoria:

- **`git fetch origin main` al arrancar cualquier tarea no trivial.** No asumas que tu `main` local refleja lo que está en GitHub.
- **Re-fetch antes de commitear.** Si pasaron >15 min desde el fetch anterior o si el commit toca más de un archivo, repetir.
- **Antes de "arreglar" algo observado (test rojo, bug reportado):** correr `git log -20 --oneline` y buscar si alguien ya lo tocó en los últimos commits. Si el mensaje reciente menciona el archivo o el síntoma, investigar ANTES de modificar — probablemente ya esté resuelto o en curso.
- **Si pre-push bloquea por tests de código ajeno:** NO usar `--no-verify`. Fetch + pull --rebase primero. Si aún falla, reportar al usuario antes de tomar acción correctiva sobre código que no escribiste.

**Por qué:** el 2026-04-21 dos sesiones paralelas trabajaron sobre `main` simultáneamente — una regenerando docs, otra agregando tests de cobertura. No hubo colisión por suerte. Si hubieran tocado el mismo archivo, habría habido trabajo perdido o conflicto de merge. Esta regla protege contra la próxima vez que la suerte no alcance.

## 11. Worktree propio para cada sesión con commits

Cuando vas a producir commits en una sesión, crear worktree dedicado desde `origin/main`:

```bash
node scripts/setup-worktree.mjs <slug> [chore|feat|fix]
```

El script:
- crea `.claude/worktrees/<slug>/` desde `origin/main`,
- crea branch `<prefix>/<slug>-claude`,
- **copia `.env.local`** (sin esto, `npm run build` del pre-push hook falla por VAPID),
- imprime los próximos pasos.

**Reglas operacionales:**

- **NUNCA editar archivos en una rama compartida con otro agente activo.** Si `git worktree list` muestra >1 worktree, hay paralelización: crea el tuyo.
- **Excepción:** cambio mínimo documental (un párrafo en `docs/`) y 1 solo worktree activo → podés editar directo.
- **Al cerrar la sesión:** si el branch ya se mergeo a main, `git worktree remove <path>` + `git branch -D <branch>` para no acumular ramas viejas.

**Por qué:** el 2026-05-12 una sesión modificó `CLAUDE.md` directamente en `chore/graphify-setup`, que estaba siendo trabajada por un agente paralelo en su worktree. El agente paralelo: (a) commiteó encima del trabajo de la primera sesión, (b) movió silenciosamente el commit de la primera sesión a una rama nueva, y (c) el push falló además porque el worktree paralelo no tenía `.env.local` propio. Resultado: ~20 min de fricción y 2 ramas para mergear donde debía haber 1. Esta regla + el script previenen ambas causas.
