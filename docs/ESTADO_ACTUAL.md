# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-06-11 | Commit: `30b38b7`

## Último deploy

- **Commit:** `30b38b7` — feat(dedup): script barrido de rondas duplicadas (dry-run + apply con backup)
- **Fecha:** 2026-06-10
- **Branch:** fix/dedup-canchas-claude (1220 commits total)
- **URL:** https://golfersplus.vercel.app

## Páginas en producción (52 páginas)

- `/admin/analytics`
- `/admin/cerebro/fuentes`
- `/admin/cerebro/pesos`
- `/admin/e2e`
- `/admin/finanzas`
- `/admin/golf-ops`
- `/admin`
- `/admin/sistema`
- `/admin/sistema/taiger/dashboard`
- `/admin/sistema/taiger/live`
- `/admin/sistema/taiger`
- `/admin/sistema/taiger/playground`
- `/admin/sistema/taiger/[userId]`
- `/admin/usuarios`
- `/admin/usuarios/[id]`
- `/auth/auth-code-error`
- `/coach`
- `/coach/progreso`
- `/coach/sesion/[id]`
- `/dashboard`
- `/demo`
- `/demo/taiger`
- `/en-vivo`
- `/importar`
- `/indices`
- `/leaderboard`
- `/login`
- `/organizador/nuevo`
- `/organizador/[slug]/editar`
- `/organizador/[slug]/jugadores`
- `/organizador/[slug]/salida`
- `/organizador/[slug]/scoring`
- `/perfil/historial`
- `/perfil/historial/[id]`
- `/perfil`
- `/perfil/stats`
- `/privacidad`
- `/ranking`
- `/recuperar`
- `/reembolsos`
- `/register`
- `/ronda-libre/nueva`
- `/ronda-libre/[codigo]`
- `/ronda-libre/[codigo]/score`
- `/ronda-libre/[codigo]/score-grupo`
- `/tarjeta/[id]`
- `/terminos`
- `/torneo/[slug]/en-vivo`
- `/torneo/[slug]`
- `/torneo/[slug]/score`
- `/torneo/[slug]/tv`
- `/torneo/[slug]/unirse`

## Documentación del proyecto

| Archivo | Contenido |
|---------|-----------|
| [SPRINT_LOG.md](./SPRINT_LOG.md) | Historial de sprints |
| [ROADMAP_COMPLETO.md](./ROADMAP_COMPLETO.md) | Sprints 9C→14 |
| [ARQUITECTURA.md](./ARQUITECTURA.md) | Schema BD + stack |
| [TAIGER_SYSTEM_PROMPT.md](./TAIGER_SYSTEM_PROMPT.md) | Coach IA |
| [GWI_MODELO.md](./GWI_MODELO.md) | Probabilidades de ganar |
| [SQL_PENDIENTE.md](./SQL_PENDIENTE.md) | SQL a ejecutar |

## Sprint Log reciente

# SPRINT LOG — TU GOLF

> Agregar nueva entrada AL INICIO después de cada sprint

---

## 2026-06-10 · Dedup de canchas duplicadas (manual ↔ fedegolf) — APLICADO EN PROD

Cierre del último pendiente del frente del índice (post PR #144): unificación de las
3 canchas duplicadas EN USO. Diseño v2 blindado tras eng-review adversarial
(spec `2026-06-10-dedup-canchas-design.md` §11-§13). Decisión: la ficha **manual
mixta es la canónica** (ya tiene tees M y F en una sola ficha); se le corrigen los
tees a los valores oficiales fedegolf, las fichas fedegolf V/D se redirigen vía
`canonical_course_id` y se desactivan. Tocó 0 rondas reales por mover course_id
(salvo 1 ronda suelta repointada).

- **Lógica pura testeada** (`src/golf/courses/course-dedup.ts`): `planTeeCorrections`
  (UNA corrección por color canónico — la BD tiene `UNIQUE(course_id,nombre)` sin
  género, así que un color = un tee), `findDuplicateRounds`, `buildIndexWindows`
  (réplica de la ventana del RPC para estimar índice antes/después).
- **Capa de datos idempotente** (`src/lib/data/course-dedup.ts`): decide UPDATE/INSERT
  por estado real de la BD (no por el plan), throw en todo error de escritura.
- **Matcher** (`matching.ts`): C3 — devuelve la canónica aunque no esté en el
  candidate-set; C2 — `historial/stats` ahora trae `canonical_course_id`.
- **Migración** `20260610_uq_course_tees_identity.sql` (índice único de identidad).

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
