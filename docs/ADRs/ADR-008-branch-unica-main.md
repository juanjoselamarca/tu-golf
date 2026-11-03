# ADR-008 — Branch única `main` sin develop

**Estado**: Aceptado; enmendado el 02-nov-2026 (PR #724): prod se publica desde `production`
**Fecha**: 2026-03-17 (inicio del proyecto)

## Contexto

Modelos comunes de branching:
- **Git-flow**: `main` + `develop` + `feature/*` + `release/*` + `hotfix/*`. Complejo.
- **GitHub flow**: `main` + `feature/*` con PRs. Simple.
- **Trunk-based**: todos commitean a `main` directo (o con PRs cortas).

Para un equipo de 1-2 personas (Juanjo + Claude como CTO IA), Git-flow es overkill.

## Decisión

**Branch única `main`**. Cualquier cambio va a `main` via:
- Commit directo (para cambios de bajo riesgo: docs, pequeños fixes)
- Branch `feature/*` o `fix/*` con PR (para cambios de alto riesgo: refactors, features grandes, archivos protegidos)

**Vercel** publica producción desde la rama `production`, que avanza solo con `npm run promover` (fast-forward desde `main`, sin evento en vivo y con `main` en verde). Hasta el 02-nov-2026 publicaba `main` directo; se separó para que un torneo en juego no frene los merges. No hay staging separado.

**Preview deployments** de Vercel actúan como staging efímero por PR.

## Consecuencias

### Positivas
- **Simpleza**: no hay que sincronizar develop con main ni cherry-picks
- **Velocidad**: fix → commit → push → deploy en minutos
- **PRs opcionales**: para un equipo chico, la mayoría de cambios son directos

### Negativas
- **`production` es siempre producción**: un error promovido rompe producción hasta que se revierta y se promueva el revert
- **No hay staging persistente**: imposible testear integraciones con terceros en un entorno pre-prod estable
- **Vercel previews son per-PR**: si no hay PR, no hay preview

### Mitigaciones
- **Pre-push hook** obliga tsc + tests + build antes de cualquier push
- **Tests canario** detectan los patrones exactos que han roto producción
- **Archivos protegidos** (ver ADR-006) requieren protocolo extra
- **CI GitHub Actions** (agregado 2026-04-23) re-verifica todo

## Cuándo reconsiderar

- Si el equipo crece a 5+ personas: Git-flow o GitHub flow con branch protection hace sentido
- Si se introduce staging con un cliente especial (enterprise): necesitaremos `staging` separada
- Si un incidente demuestra que los tests canario no son suficientes

Por ahora: **mantener branch única**. Es proporcional al tamaño del equipo.

## Branch protection

GitHub branch protection en `main`: considerado pero no aplicado por simplicidad.
Razón: el pre-push hook + CI cumplen el rol de gate.

Si cambiamos a protection, la regla sugerida sería:
- Require PR review for direct pushes
- Require status checks (CI job `verify`)
- Require branches to be up to date
- No force pushes
