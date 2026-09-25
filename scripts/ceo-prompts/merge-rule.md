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
