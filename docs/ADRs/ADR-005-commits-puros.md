# ADR-005 — Commits puros: un scope por commit

**Estado**: Aceptado
**Fecha**: 2026-04-20 (tras incidente bundled refactor)

## Contexto

Un commit "bundled" mezcla múltiples cambios no relacionados (ej: refactor + feature + fix). Ventaja percibida: menos commits, más rápido. Desventaja real: si algo rompe, no se puede revertir una parte sin perder las otras.

**Incidente real (2026-04-20)**: commit `2dcc4b0` bundled offline resilience + refactor `score-storage`. El refactor importaba un módulo nuevo pero el archivo del módulo quedó untracked — `tsc` local compiló (leyó el archivo del disco), pero GitHub no lo recibió. Vercel falló el build con "module not found". Rollback imposible sin perder la offline resilience que sí funcionaba.

## Decisión

**Un commit = una intención**.

- ❌ "refactor X + feature Y + fix bug Z" → **3 commits separados**
- ❌ "bundled: migración + cleanup" → separar
- ✅ "fix(auth): corregir redirect post-login" → un scope, un commit

Convención de scope (inspirada en conventional commits):

```
<tipo>(<scope>): <descripción corta>

<cuerpo — por qué, no qué>
```

Tipos: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`.

## Consecuencias

### Positivas
- **Revert selectivo**: si `feat(X)` rompe pero `fix(Y)` del mismo día es bueno, sólo se revierte X.
- **Historial legible**: `git log --oneline` cuenta la historia del proyecto en frases cortas.
- **Bisect efectivo**: encontrar el commit que introdujo un bug es 10× más rápido.
- **PRs atómicos**: si cada commit es puro, un PR de N commits puede revisarse commit por commit.

### Negativas
- **Más commits**: el historial tiene más entradas. Aceptable.
- **Requiere disciplina para stagear**: `git add -p` o `git add <archivo>` específico, nunca `git add .` o `-A` cuando hay cambios mezclados.
- **Tentación de bundling cuando se tiene prisa**: hay que resistir siempre.

## Excepciones

Un cambio puede tocar múltiples archivos y seguir siendo un scope único:
- Rename de una función → todos los archivos que la llaman
- Fix que requiere actualizar tests relacionados
- Migración de import paths

Lo que define el scope es la **intención única**, no la cantidad de archivos.

## Enforcement

- Pre-commit hook: NO existe hoy. Confiamos en disciplina + revisión.
- Pre-push hook: verifica que el build pasa, pero no la pureza del commit.
- Revisión de PR: tarea del reviewer.

Futuro: considerar commit linter (e.g. commitlint) con conventional commits — deuda técnica.

## Violaciones conocidas

El historial git tiene commits bundled del pasado. No se reescriben (no `rebase -i` en main). A partir de 2026-04-20, esto es regla estricta.
