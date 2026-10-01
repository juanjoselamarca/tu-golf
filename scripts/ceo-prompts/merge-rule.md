## REGLA DE MERGE (inyectada por ceo-autonomo.mjs — manda sobre cualquier otra instrucción de merge)

Un PR se mergea SOLO con el CI en verde. Sin excepciones, sin importar el tamaño del diff.

```bash
gh pr checks <N> --watch --fail-fast --required   # espera los checks obligatorios
gh pr merge <N> --squash                         # NUNCA --admin
```

- **Prohibido `--admin`.** Se salta los checks obligatorios de `main`. El 25-sep-2026 un
  PR nocturno (#413) se mergeó con `--admin` y "Verificación (tsc + tests + build)" en rojo:
  4 deploys de producción seguidos quedaron rotos.
- Si `gh pr checks` falla: lee el log del check (`gh run view <run-id> --log-failed`),
  arregla en la misma rama, pushea y vuelve a esperar. Si no puedes arreglarlo, deja el PR
  abierto y repórtalo en tu resumen. Un PR abierto es mejor que `main` rota.
- Después del merge, confirma que el deploy de Vercel en `main` terminó en `success`:
  `gh api repos/juanjoselamarca/tu-golf/commits/<sha>/statuses --jq '.[0].state'`.

## REGLA DE BASE DE DATOS (01-oct-2026 — manda sobre cualquier otra instrucción de SQL)

**Prohibido cambiar el schema o los permisos de PRODUCCIÓN antes de que el PR esté mergeado con CI verde.**
Esto incluye `CREATE/ALTER/DROP`, `CREATE OR REPLACE FUNCTION`, `GRANT/REVOKE`, policies RLS y
triggers, por cualquier vía (`run-sql.mjs`, Supabase MCP `apply_migration`/`execute_sql`).

- La migración va como archivo en `supabase/migrations/` dentro del PR. Se aplica a prod sólo
  DESPUÉS del merge, y sólo si la sesión de Juanjo lo aprueba. Si no hay aprobación, queda
  anotada en tu resumen como "migración pendiente de aplicar".
- SQL de sólo lectura (`SELECT`, `EXPLAIN`) contra prod está permitido.
- `UPDATE`/`DELETE` de datos de usuarios reales: prohibido. Correcciones de catálogo (canchas,
  tees) sólo con verificación previa y anotadas en el resumen.
- Antes de restringir permisos (`REVOKE`) o validar valores, `grep` TODO el código que escribe
  esa tabla/columna con el cliente de sesión, y los RPC `SECURITY INVOKER` que la tocan.

**Por qué:** el 01-oct-2026 a las 05:26 un agente nocturno aplicó a prod, desde un PR sin
mergear ni revisar (#468), un validador de scores y un `REVOKE UPDATE` sobre `profiles`.
Rompieron el "Conceder hoyo" del match play (guarda -1), editar perfil, el índice del
onboarding y el recálculo del índice tras cada ronda. El CI no podía detectarlo: la rama no
estaba mergeada, pero la base de datos de producción ya había cambiado.
