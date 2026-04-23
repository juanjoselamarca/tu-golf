# Runbooks operacionales — Golfers+

Qué hacer cuando algo falla en producción. **Cada runbook es autocontenido** — no asume que leíste los demás.

> **Regla de oro**: durante un torneo real, la prioridad es RESTAURAR servicio, no entender la causa. Revert primero, post-mortem después.

## Índice

| Runbook | Cuándo usar |
|---|---|
| [incident-deploy-broken.md](incident-deploy-broken.md) | Deploy roto en producción — app no carga o páginas 500 |
| [incident-supabase-down.md](incident-supabase-down.md) | Supabase caído o con latencia alta durante un torneo |
| [incident-sentry-spike.md](incident-sentry-spike.md) | Sentry dispara spike de errores |
| [incident-bug-en-torneo.md](incident-bug-en-torneo.md) | Jugador reporta bug durante torneo real |
| [ops-deploy-rollback.md](ops-deploy-rollback.md) | Cómo revertir un deploy en Vercel en <5 min |
| [ops-health-check.md](ops-health-check.md) | Cómo correr el health check completo y leer resultados |

## Contactos de escalamiento

| Sistema | Dónde mirar primero | Contacto |
|---|---|---|
| App production | https://golfersplus.vercel.app | PM: juanjoselamarca@gmail.com |
| Deploys | https://vercel.com/dashboard | Juanjo (owner) |
| BD | https://supabase.com/dashboard/project/hoswfwhvcgqlqdmzpnce | Juanjo (owner) |
| Errores runtime | https://sentry.io (dashboard Golfers+) | Juanjo |
| Analytics | PostHog dashboard | Juanjo |
| GitHub | github.com/juanjoselamarca/tu-golf | Juanjo |

## Principios

1. **No diagnosticar bajo presión**: si hay torneo en curso y algo rompe, revert primero, diagnosticar después.
2. **Comunicar pronto**: si hay downtime >5 min y torneo activo, avisar por el canal que corresponda.
3. **Post-mortem obligatorio**: todo incidente P0 (afecta torneo) genera entrada en `docs/SPRINT_LOG.md` con causa raíz.
4. **Runbooks vivos**: si un runbook no funcionó, actualizarlo antes de cerrar el incidente.
