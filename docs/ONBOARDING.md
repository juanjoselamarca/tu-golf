# Onboarding — Golfers+

Ruta de lectura para un dev o CTO nuevo. **Tiempo total estimado: 45 min** y estás operativo.

---

## Paso 0 — Contexto del proyecto (3 min)

Golfers+ es una app de live scoring para torneos amateur de golf. Se usa en torneos reales en Chile. **El porcentaje aceptable de fallo es 0%** — un bug en cancha arruina reputación irrecuperable.

Stack: Next.js 14 · TypeScript · Tailwind · Supabase · Vercel.
Producción: https://golfersplus.vercel.app · Branch única: `main`.

## Paso 1 — Estado actual (5 min)

→ [docs/ESTADO_ACTUAL.md](ESTADO_ACTUAL.md)

Snapshot del último deploy: commit, páginas en producción, qué está activo. Si esto está desactualizado (>7 días), es la primera señal de que hay trabajo sin documentar.

## Paso 2 — Reglas del proyecto (10 min)

→ [CLAUDE.md](../CLAUDE.md) — la Biblia del repo

Leer completo. Cubre:
- **Directiva máxima:** cero tolerancia a fallos en cancha.
- **Verificación del repo:** antes de cualquier cambio, confirmar que estás en `juanjoselamarca/tu-golf`.
- **Archivos protegidos:** Navbar, layout, middleware, supabase.ts — no se tocan sin protocolo.
- **Convenciones de trabajo:** commits puros, staging cuidadoso, archivado por trimestre, testing funcional real.
- **Pre-push obligatorio:** `tsc` + `test` + `build` antes de pushear.

## Paso 3 — Arquitectura (10 min)

→ [docs/ARQUITECTURA.md](ARQUITECTURA.md)

Stack, schema BD completo (con los gotchas de naming en español), motor `src/golf/` (reglas de golf centralizadas), design system Garmin-inspired.

Si solo leés un archivo aparte de CLAUDE.md, que sea este.

## Paso 4 — Historia reciente (10 min)

→ [docs/SPRINT_LOG.md](SPRINT_LOG.md)

Leer las 3-5 entradas más recientes (están al inicio). Te dice qué se hizo la última semana, qué decisiones se tomaron y por qué.

Auditorías viejas y planes cerrados están en [docs/archive/](archive/).

## Paso 5 — Qué viene (5 min)

→ [docs/ROADMAP_COMPLETO.md](ROADMAP_COMPLETO.md) · [docs/SQL_PENDIENTE.md](SQL_PENDIENTE.md)

Roadmap activo + migraciones de BD sin aplicar. La fuente de verdad de sprints pre-lanzamiento también está en `docs/roadmap-camino-100.md`.

## Paso 6 — Setup técnico (2 min de lectura, 20 de ejecución)

→ [docs/PROMPT_SETUP_NUEVO_COMPUTADOR.md](PROMPT_SETUP_NUEVO_COMPUTADOR.md)

Variables de entorno, acceso a Supabase, cómo correr local, workaround de OneDrive con `.next`.

---

## Checklist de "estoy listo para trabajar"

- [ ] `git remote -v` muestra `github.com/juanjoselamarca/tu-golf.git`
- [ ] `git branch --show-current` muestra `main`
- [ ] `npm install` terminó sin errores
- [ ] `.env.local` tiene las variables necesarias (ver `PROMPT_SETUP_NUEVO_COMPUTADOR.md`)
- [ ] `npx tsc --noEmit` devuelve 0 errores
- [ ] `npm run test` pasa (~1000+ tests)
- [ ] `npm run build` compila
- [ ] Leíste CLAUDE.md completo
- [ ] Entendés por qué los commits son puros y qué archivos son protegidos

Si todo está ✅, ya sos parte del proyecto.

---

## Contacto

PM: Juan José Lamarca — juanjoselamarca@gmail.com
