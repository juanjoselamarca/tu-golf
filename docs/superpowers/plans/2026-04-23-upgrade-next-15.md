# Plan: Upgrade Next.js 14 → 15

**Fecha**: 2026-04-23
**Prioridad**: P0 (seguridad)
**Branch sugerida**: `upgrade/next-15`
**Estado**: Planificado — NO ejecutar sin aprobación explícita de Juanjo + QA humano

## Por qué es P0

Next.js 14.2.35 tiene **5 vulnerabilidades HIGH sin parche disponible para la línea 14**:

| CVE | Impacto |
|---|---|
| GHSA-9g9p-9gw9-jx7f | DoS vía Image Optimizer `remotePatterns` |
| GHSA-h25m-26qc-wcjf | HTTP request deserialization DoS en RSC |
| GHSA-ggv3-7p47-pfv8 | HTTP request smuggling en rewrites |
| GHSA-3x4c-7xq6-9pq8 | `next/image` cache exhaustion |
| GHSA-q4gf-8mx6-v5v3 | DoS con Server Components |

3 de esos 5 son DoS aplicables a producción. **Durante un torneo real con tráfico concurrente + un atacante básico = app caída**. Viola directiva CERO FALLOS (ADR-009).

## Opciones de upgrade

### Opción A — Next 15.x (preferido)

**Ventajas**:
- Menor breaking change que Next 16
- App Router estable y compatible
- Node 20 sigue soportado
- Parcha los 5 CVEs

**Desventajas**:
- Cambios en caching (Next 15 cambió defaults de fetch caching)
- `params` y `searchParams` ahora son async en Server Components
- Algunos APIs deprecados en 14 fueron removidos

### Opción B — Next 16.x (máxima seguridad)

**Ventajas**:
- Última versión, todos los fixes
- Cache Components estables

**Desventajas**:
- Breaking changes mayores
- Requiere Node 20+ obligatorio
- Más esfuerzo de migración

**Recomendación**: **Opción A** (Next 15.x). Reduce riesgo. Upgrade a 16 en sprint separado futuro.

## Plan de ejecución — Opción A

### Paso 1 — Preparación (antes de tocar código)

1. `git checkout -b upgrade/next-15` desde `main` actualizado
2. Tagear el commit base: `git tag pre-next15` (por si hay que revertir)
3. Correr `npx vitest run --coverage` en baseline para tener baseline de tests

### Paso 2 — Upgrade automatizado

```bash
# Usar codemod oficial
npx @next/codemod@latest upgrade latest-v15
```

El codemod:
- Actualiza `next` a última 15.x
- Actualiza `eslint-config-next`
- Aplica transformaciones automáticas a código deprecado

### Paso 3 — Fixes manuales esperados

Revisar manualmente (el codemod no cubre todo):

1. **Params async en Server Components**:
   ```tsx
   // Antes (Next 14)
   export default function Page({ params }: { params: { slug: string } }) { }
   // Después (Next 15)
   export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
     const { slug } = await params
   }
   ```
   Buscar: `src/app/**/page.tsx` con `params` o `searchParams`.

2. **Fetch caching default**:
   Next 15 cambió `fetch()` a `no-store` por default. Revisar llamadas que asumían cache.

3. **next.config.js**:
   Algunas opciones deprecadas. Revisar warnings en consola.

### Paso 4 — Verificación local (obligatorio antes de push)

```bash
npx tsc --noEmit                    # 0 errores
npm run test -- --run               # 5662/5662 pasando
npx vitest run --coverage           # Cobertura NO baja
npm run build                       # Build exitoso
npm run dev                         # Arranca sin warnings
```

### Paso 5 — QA manual (obligatorio — responsabilidad Juanjo)

Probar los flujos críticos:
1. Login + logout
2. Crear ronda libre (wizard completo)
3. Scorear 9 hoyos y verificar sync
4. Ver leaderboard espectador (otro device/tab)
5. Finalizar ronda → ver scorecard final
6. Perfil → historial → ver ronda nueva
7. Admin dashboard carga
8. tAIger chat responde

Si algún flujo se comporta diferente → investigar ANTES de merge.

### Paso 6 — Preview deployment

1. `git push origin upgrade/next-15` → Vercel genera preview URL
2. Correr los 8 flujos críticos contra preview (con datos de producción limitados)
3. Revisar Sentry del preview por errores nuevos
4. Lighthouse en preview vs producción actual — NO debe regresar

### Paso 7 — Merge

1. Crear PR con checklist de todos los pasos arriba
2. Juanjo review final
3. Merge a `main` (NO squash — preservar commits de migración)
4. Esperar deploy Vercel
5. Verificar producción con los 8 flujos
6. **Monitorear Sentry por 48h** antes de considerar cerrado

### Paso 8 — Post-upgrade

1. Actualizar `docs/ADRs/ADR-002-nextjs-app-router.md` con nueva versión
2. Cerrar items P0-2 en `docs/TECH_DEBT.md`
3. Actualizar `package.json` version bump
4. Entrada en `docs/SPRINT_LOG.md`

## Rollback plan

Si la producción falla post-merge:

1. **Opción instantánea**: Vercel promote al deploy anterior (ver `docs/RUNBOOKS/ops-deploy-rollback.md`)
2. **Opción git**: `git revert <merge-commit>` + push

El tag `pre-next15` permite `git checkout pre-next15` si es necesario.

## Tiempo estimado

- Codemod + fixes manuales: 2-4 horas
- QA manual: 1-2 horas (Juanjo)
- Preview + deploy: 30 min
- Monitoreo post-deploy: 48 h pasivas

**Total ventana de sprint**: 1 semana calendar (con QA compartido).

## Criterios de éxito

- ✅ `npm audit` muestra 0 HIGH relacionados a Next
- ✅ Todos los tests passing
- ✅ Cobertura NO baja
- ✅ 8 flujos QA manual OK
- ✅ 48 h sin Sentry issues nuevos
- ✅ Lighthouse no regresa

## Si NO se hace este upgrade

El proyecto queda expuesto a DoS en producción. En un torneo con 20-40 espectadores concurrentes + un jugador malicioso, la app puede caer. **No es opcional** — es cuándo, no si.

## Comandos de ayuda

```bash
# Ver qué cambió entre 14 y 15
npx @next/codemod@latest --help

# Ver migration guide oficial
# https://nextjs.org/docs/app/building-your-application/upgrading/version-15

# Si algo rompe el build pero no sabés qué
npm run build 2>&1 | tee build.log
# Buscar primer "error:" en build.log
```
