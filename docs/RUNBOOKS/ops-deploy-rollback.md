# Runbook — Rollback de deploy en Vercel en <5 min

**Severidad**: operacional.
**Objetivo**: documentar el procedimiento exacto para revertir un deploy roto sin perder tiempo buscando dónde hacer click.

## Cuándo hacer rollback

- Deploy nuevo rompió producción (500, pantalla blanca, flujo crítico no funciona)
- Hay torneo activo y el deploy introdujo un bug
- Sentry dispara spike masivo post-deploy

## Cuándo NO hacer rollback

- El bug es de datos (un torneo específico con dato malformado). Rollback no lo arregla.
- El bug es de Supabase. Ver `incident-supabase-down.md`.
- El bug existía hace días y recién se descubrió. Rollback no lo arregla — fix directo.

## Procedimiento (Vercel Dashboard)

### Opción A — Promover deploy anterior (INSTANTÁNEO, recomendado)

1. https://vercel.com/dashboard
2. Proyecto `golfersplus`
3. Pestaña **Deployments**
4. Filtro: `Production`
5. Localizar el deploy anterior al roto (status `Ready`, icono verde)
6. Click en `…` del deploy bueno → **Promote to Production**
7. Confirmar

Vercel cambia el alias de producción en **~10 segundos**. No hay rebuild.

### Opción B — Redeploy del commit anterior (tarda 2-3 min)

Solo si la Opción A no está disponible (deploy anterior fue eliminado):

1. Dashboard → Deployments → buscar el commit objetivo
2. Click `…` → **Redeploy**
3. Esperar el build

### Opción C — Revert en git + push (tarda 3-5 min + depende de CI)

Solo si las opciones A y B no están disponibles:

```bash
git revert <commit-roto> --no-edit
git push origin main
```

Esto dispara un nuevo deploy desde el commit revertido. Respeta el CI (tests deben pasar).

## Verificación post-rollback

```bash
curl -I https://golfersplus.vercel.app
curl -I https://golfersplus.vercel.app/dashboard
curl -I https://golfersplus.vercel.app/api/health
```

Los tres deben devolver 200 o redirect esperado.

## Qué NO hacer

- ❌ **Editar el commit con `git push --force`**: riesgo altísimo, puede corromper el historial en main.
- ❌ **Borrar el deploy roto de Vercel antes de rollback**: perdés la opción A.
- ❌ **Hacer rollback sin confirmar que el deploy roto es la causa**: puede ser Supabase o datos.

## Después del rollback

El deploy roto sigue en Vercel. Está marcado pero no activo. Investigar causa raíz sin presión. Seguir `incident-deploy-broken.md` desde el Paso 4.

## Permisos

Solo el owner del proyecto (Juanjo) puede promover deploys. Si necesitás que alguien más pueda hacerlo, agregarlo como team member en Vercel con rol `Developer` o superior.
