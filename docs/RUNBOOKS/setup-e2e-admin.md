# Setup — Panel E2E desde Admin

Guía para conectar `/admin/e2e` con GitHub Actions. Es **una sola vez**.

## ¿Qué estamos conectando?

- **Página admin** (`/admin/e2e`) tiene un botón "Probar ahora".
- Al apretarlo, Vercel llama a la API de GitHub para disparar un workflow.
- GitHub corre los tests Playwright (~3-5 min) y al terminar avisa de vuelta a Vercel con los resultados.
- Resultados se guardan en la tabla `e2e_runs` de Supabase.

Para que esto funcione necesitamos **3 secretos**:

| Secreto | ¿Dónde se guarda? | ¿Para qué? |
|---|---|---|
| `GITHUB_PAT` | Vercel env vars | Vercel se autentica contra GitHub |
| `E2E_CALLBACK_SECRET` | Vercel + GitHub | GitHub se autentica de vuelta contra Vercel |
| `E2E_USER_EMAIL` + `E2E_USER_PASSWORD` | GitHub Actions secrets | Login del usuario de prueba |

---

## Paso 1 — Generar el GITHUB_PAT

1. Ir a <https://github.com/settings/personal-access-tokens/new>.
2. Token name: `tu-golf · admin e2e trigger`.
3. Expiration: `90 days` (renovable; ponete recordatorio).
4. Repository access: **Only select repositories** → `juanjoselamarca/tu-golf`.
5. Permissions → Repository permissions:
   - `Actions`: **Read and write** ← clave para disparar workflow_dispatch.
6. Generate token. **Copialo, no se muestra de nuevo.**

---

## Paso 2 — Generar el E2E_CALLBACK_SECRET

Es un string random largo. En tu terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copiá la salida (algo como `a1b2c3...`).

---

## Paso 3 — Configurar Vercel

1. Ir a <https://vercel.com/juanjoselamarca/tu-golf/settings/environment-variables>.
2. Agregar 2 env vars (Production + Preview):
   - `GITHUB_PAT` = el token del Paso 1
   - `E2E_CALLBACK_SECRET` = el string del Paso 2
3. Hacer redeploy (cualquier push o el botón "Redeploy" del dashboard).

---

## Paso 4 — Configurar GitHub Actions

1. Ir a <https://github.com/juanjoselamarca/tu-golf/settings/secrets/actions>.
2. Agregar 3 secrets:
   - `E2E_CALLBACK_SECRET` = **el mismo string del Paso 2** (deben coincidir).
   - `E2E_USER_EMAIL` = email del usuario de prueba (ej: `e2e@golfersplus.test`).
   - `E2E_USER_PASSWORD` = password del usuario de prueba.

> **Sobre el usuario de prueba:** ya existe en producción, configurado en `scripts/setup-e2e-user.mjs`. Si todavía no lo creaste, corré ese script una vez.

---

## Paso 5 — Probar

1. Entrá a <https://golfersplus.vercel.app/admin/e2e>.
2. Apretá "Probar ahora".
3. Después de ~10 segundos, debería aparecer una corrida con status "Corriendo".
4. A los ~5 minutos, status pasa a "Pasó" o "Falló" con el detalle.
5. Si nunca cambia de "En cola", ver troubleshooting abajo.

---

## Troubleshooting

### "GITHUB_PAT no configurado"
→ Falta el env var en Vercel. Volver al Paso 3.

### "GitHub no aceptó el dispatch"
→ El PAT no tiene scope `Actions: Read and write`, o el workflow no existe en `main` todavía. Verificar que `.github/workflows/e2e-trigger.yml` esté en la rama target.

### Status queda en "En cola" indefinidamente
→ El workflow corrió pero no pudo llamar de vuelta a Vercel. Causas:
- `E2E_CALLBACK_SECRET` no matchea entre Vercel y GitHub.
- El callback URL apunta a un dominio bloqueado. Por defecto usa `https://golfersplus.vercel.app`. Si tu dominio cambió, settear var `E2E_CALLBACK_URL` en GitHub Actions vars.

### Status "Error" con mensaje "Workflow crasheó antes de generar payload"
→ Ver el log del workflow en `https://github.com/juanjoselamarca/tu-golf/actions`. Causas típicas: Playwright no pudo descargar Chromium (timeout de red), o las credenciales del usuario E2E expiraron.

### Tests fallan siempre con "Cannot find module..."
→ El workflow corre `npm ci` pero alguna dep nueva no está en `package-lock.json`. Hacer commit del lockfile actualizado.

---

## Costo

GitHub Actions: gratis hasta 2000 min/mes en repos privados. Cada corrida E2E es ~5 min → 400 corridas/mes posibles. Más que suficiente.

Vercel: el endpoint trigger es una invocación serverless (~200ms). Despreciable.

Supabase: 1 row + ~50KB JSON por corrida. Despreciable.

---

## Limpieza (cuando ya no se use)

1. Revocar el PAT en GitHub.
2. Borrar env vars en Vercel.
3. Borrar secrets en GitHub Actions.
4. (Opcional) Borrar tabla `e2e_runs`: `DROP TABLE public.e2e_runs;`
5. Borrar archivos: `src/app/admin/e2e/`, `src/app/api/admin/e2e/`, `.github/workflows/e2e-trigger.yml`.
