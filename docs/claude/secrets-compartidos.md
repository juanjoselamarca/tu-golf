# SECRETS COMPARTIDOS — protocolo de rotación

> Detalle movido desde `CLAUDE.md` el 02-oct-2026 (texto original, sin cambios). CLAUDE.md conserva la regla resumida y apunta acá.

Algunos secrets viven en DOS lugares y deben estar sincronizados o producción rompe:

| Secret | Lugar 1 | Lugar 2 | Para qué |
|---|---|---|---|
| `E2E_CALLBACK_SECRET` | Vercel env (production+preview) | GitHub Actions Secrets | El workflow `e2e-trigger` lo envía como header; el endpoint `/api/admin/e2e/runs/[id]/callback` lo valida. |

**Regla:** estos secrets se rotan **únicamente** vía `scripts/rotate-e2e-callback-secret.mjs`. NO usar `vercel env add` con stdin (tiene un bug en Windows que guarda valor vacío silenciosamente).

```bash
node scripts/rotate-e2e-callback-secret.mjs
```

El script: genera valor nuevo, lo setea en Vercel via API REST + en GitHub via gh CLI, dispara redeploy, espera que Ready, hace probe al endpoint. Si algo falla aborta. Idempotente.

Si dos agentes paralelos editan secrets al mismo tiempo, hay carrera. Para evitarla: avisar en el chat antes de rotar, o coordinar con `gh workflow list --running` para no hacerlo durante un run en curso.
