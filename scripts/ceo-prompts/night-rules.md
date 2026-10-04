## REGLAS NOCTURNAS (inyectadas por ceo-autonomo.mjs — mandan sobre cualquier otra instrucción)

Corres sin supervisión. Cada regla tiene un candado mecánico detrás: el scheduler lee tu
sesión en vivo y **te detiene en el acto** si rompe una regla marcada con 🔒. Esas
detenciones llegan a Juanjo como alerta P0.

1. 🔒 **Nunca `--no-verify`** (`git commit` ni `git push`). El 30-sep (#459) un agente lo usó
   porque el pre-push fallaba por tests de integración que ya fallaban en `main`. Si el hook
   falla por algo que no es tuyo, pruébalo en un worktree limpio de `origin/main`, déjalo
   escrito en el PR y deja el PR ABIERTO sin mergear.

1b. 🏌️ **Evento en vivo = no se toca prod.** Antes de mergear, correr SQL o lanzar CI/smokes:
   `node --env-file=.env.local scripts/ci/evento-en-vivo.mjs`. Exit 3 = hay gente jugando → detente, deja el PR
   abierto y anótalo en el resumen. (Incidente 04-oct-2026: deploys + CI en plena ronda tumbaron la API.)
2. **Checks rojos = no se mergea.** Todos los checks del PR en verde, también los no
   obligatorios (el 01-oct, #460 se mergeó con 2 canarios en rojo). Si un check rojo ya fallaba
   en `main`, compruébalo y déjalo escrito en el PR, pero el PR queda ABIERTO:
   ```bash
   gh pr checks <N>
   gh run list --branch main --workflow "<archivo>.yml" -L 1 --json conclusion,url
   ```

3. 🔒 **Zona crítica = PR abierto, nunca merge.** Editar el guard (`.github/workflows/critical-zone-guard.yml` o la lista) te detiene en el acto. La lista está en
   `.github/critical-zone-paths.txt` (motor de golf, leaderboard, pagos, auth, archivos
   protegidos, migraciones). De noche no hay review de Fable: un PR que toca esos archivos se
   abre y se deja para la mañana. El label `fable-reviewed` lo pone solo Juanjo; ponerlo tú te
   detiene en el acto. No lances sub-agentes Fable de noche (consumen 2,5× cupo).
   **Code review de un PR >100 LOC fuera de zona crítica:** `node scripts/expediente-review.mjs
   --intencion "…"` y luego el agente `revisor-fable` lanzado con `model: "opus"` (Opus, no Fable)
   con la ruta del expediente. Segunda vuelta = revisor nuevo con `--desde <sha>`. Esto es lo único
   que cambia de noche respecto a CLAUDE.md (que de día usa Fable).

4. 🔒 **No puedes cambiar el schema ni los permisos de producción.** No tienes
   `SUPABASE_ACCESS_TOKEN`: `scripts/run-sql.mjs` pasa por un intermediario del scheduler que
   solo permite consultar (`SELECT`). Leer el `.env.local` de la carpeta principal del repo,
   llamar directo a la Management API o `supabase db push` te detiene en el acto. Las
   migraciones van como archivo en `supabase/migrations/` dentro del PR (zona crítica → PR abierto).
   **Datos:** sí tienes `SUPABASE_SERVICE_ROLE_KEY` (los tests E2E crean y borran sus propios
   datos de prueba). Con ella puedes escribir datos, así que la regla manda: `UPDATE`/`DELETE`
   sobre datos de usuarios reales está prohibido; solo datos de prueba que tú creaste y
   correcciones de catálogo verificadas y anotadas en tu resumen.

5. **Antes de abrir un PR, busca si ya existe uno** (claude-mem no corre en tu worktree, no
   recuerdas noches anteriores):
   ```bash
   gh pr list --state all --search "<tema o archivo>" --json number,title,state,createdAt --limit 20
   ```
   Si hay uno abierto sobre lo mismo (de cualquier noche o persona), comenta ahí en vez de abrir otro.

6. **No pises el trabajo de día.** Antes de tocar un archivo, revisa los PRs abiertos de
   Juanjo y Max:
   ```bash
   gh pr list --state open --json number,headRefName,files --jq '.[] | select(.headRefName|test("-(juanjo|max)")) | {number, headRefName, files: [.files[].path]}'
   ```
   Si tu cambio toca un archivo que está en uno de esos PRs, no lo toques: anótalo en tus
   pendientes. Nunca hagas push a una rama que no sea la tuya. Si al rebasear sobre `main` hay
   conflicto, no lo resuelvas a ciegas: deja el PR abierto y explícalo.

7. **Máximo 3 ciclos arreglo → push → checks por PR.** Al tercer rojo, deja el PR abierto,
   documenta la causa y pasa a lo siguiente. El scheduler cuenta tus `git push`.

8. **El cupo lo maneja el scheduler.** Si tu sesión se corta por límite, el scheduler la
   retoma cuando el cupo se renueve. Para que el retome funcione: haz commit de tu avance
   seguido (commits chicos) y mantén al día tu archivo de pendientes.
