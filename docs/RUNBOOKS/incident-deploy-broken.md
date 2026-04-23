# Runbook — Deploy roto en producción

**Severidad**: P0 si hay torneo activo, P1 si no.
**Objetivo**: restaurar servicio en <5 min. Diagnóstico viene después.

## Síntomas

- https://golfersplus.vercel.app devuelve 500 o pantalla en blanco
- Páginas clave (landing, dashboard, wizard) no cargan
- Usuarios reportan "no abre"
- Sentry dispara spike de errores tras un deploy reciente

## Paso 1 — Confirmar alcance (30 segundos)

```bash
# Desde tu máquina:
curl -I https://golfersplus.vercel.app
curl -I https://golfersplus.vercel.app/dashboard
curl -I https://golfersplus.vercel.app/api/health
```

Si los tres dan 500 o timeout → **deploy roto, ir a Paso 2**.
Si solo `/dashboard` falla → problema de ruta específica, ver `incident-bug-en-torneo.md`.

## Paso 2 — Revert en Vercel (2 min)

1. Abrir https://vercel.com/dashboard
2. Entrar al proyecto `golfersplus`
3. Pestaña **Deployments**
4. Encontrar el último deploy anterior marcado "Ready" (verde)
5. Click en los `…` del deploy → **Promote to Production**
6. Confirmar

Esto es instantáneo — Vercel sirve el build anterior. NO rebuild, NO cambio de commit en GitHub.

## Paso 3 — Verificar restauración (1 min)

```bash
curl -I https://golfersplus.vercel.app
# Debería devolver 200
```

Probar en navegador: landing → login → dashboard.

## Paso 4 — Diagnóstico (offline)

Una vez restaurado, el último deploy roto sigue en Vercel marcado. Investigar:

1. Ver logs del deploy roto (Vercel → Deployments → click deploy → Logs)
2. Buscar stack trace en Sentry
3. Reproducir local: `git checkout <commit-roto>` + `npm run build`

Comit-probables-culpables (por orden histórico):
- Cambios en `src/middleware.ts` sin testear auth flow
- Cambios en `src/components/Navbar.tsx` con patrones async prohibidos
- Cambios en `src/app/layout.tsx`
- Imports faltantes (módulo untracked que no llegó al commit)
- Variables de entorno cambiadas sin actualizar Vercel

Ver CLAUDE.md sección "PROTECCION ANTI-CAIDA" para los patrones exactos que causaron caídas previas.

## Paso 5 — Fix definitivo

1. Crear branch `fix/deploy-<fecha>`
2. Reproducir el bug
3. Escribir test canario si aún no existe
4. Fix
5. `npm run test && npx tsc --noEmit && npm run build` local
6. PR con reviewer obligatorio (Juanjo)
7. Merge a main — esto dispara nuevo deploy
8. Verificar producción

## Paso 6 — Post-mortem

Si el deploy roto estuvo >10 min o afectó torneo activo:
1. Entrada en `docs/SPRINT_LOG.md` con causa raíz
2. Actualizar CLAUDE.md si es un patrón nuevo
3. Agregar test canario si aplica
4. Actualizar este runbook si algún paso no funcionó

## Anti-patrones

- ❌ Revertir por `git revert` + push: tarda 5+ min en rebuildear. Vercel promote es instantáneo.
- ❌ Empujar "fix rápido" sin tests: probablemente rompa otra cosa.
- ❌ Hacer el diagnóstico completo antes de revertir: el usuario no espera.
