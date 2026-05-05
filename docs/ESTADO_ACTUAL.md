# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-05-05 | Commit: `a65ab6d`

## Último deploy

- **Commit:** `a65ab6d` — docs(cerebro-v2): FASE 0 audit + 20-trap regression set
- **Fecha:** 2026-05-05
- **Branch:** feat/cerebro-v2 (784 commits total)
- **URL:** https://golfersplus.vercel.app

## Páginas en producción (42 páginas)

- `/admin/analytics`
- `/admin/finanzas`
- `/admin/golf-ops`
- `/admin`
- `/admin/sistema`
- `/admin/usuarios`
- `/admin/usuarios/[id]`
- `/auth/auth-code-error`
- `/coach`
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

## Sesión 05 May 2026 (PM 12:30–13:00) — Limpieza canchas pendientes

### Contexto
Cierre del backlog del sprint multi-agente AM (`docs/DATA_FIXES_2026-05-05.md`). 3 categorías
pendientes detectadas por `audit-handicap-calc.mjs`: C.G. 7 Ríos sin tees, 4 tees Olivos
con `back_*=NULL`, 5 tees con nombres no-canónicos.

### Cambios

1. **C.G. 7 Ríos padre (`6a3ba422-…`) desactivada**
   - Stub FedeGolf sin tees ni rondas. Las DAMAS/VARONES son las productivas.
   - `activa=false`, `datos_verificados=false`. No se borra para no romper sync.

2. **Olivos: 4 tees con `back_* := front_*`**
   - Convención WHS para 9h jugado 18h (mismo loop dos veces).
   - Tees azul/blanco/dorado/rojo ahora simétricos.

3. **Tees no-canónicos: refactor estructural pospuesto**
   - 2 Hurlingham (sufijo género en nombre) + 3 Nordelta (`green`, `gris`).

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
