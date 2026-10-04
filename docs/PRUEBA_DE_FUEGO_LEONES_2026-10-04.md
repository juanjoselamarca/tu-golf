# PRUEBA DE FUEGO — Stableford Gross, Los Leones, domingo 4-oct-2026

> Reporte en construcción (se commitea al cerrar cada fase). Branch `hotfix/torneo-leones-2026-10-04`.
> Inicio: 04-oct 00:22 (hora Chile).

VEREDICTO: _pendiente_

---

## FASE 0 — ¿Lo que creemos que está en prod está en prod?

**Hallazgo de contexto (cambia el foco de todo el resto):** Juanjo **no** juega sus "torneos" con la tabla
`tournaments`. Sus 6 rondas recientes son **rondas libres en modo administrador** (`rondas_libres.admin_mode=true`,
él anota a todos), la última `I3P381` el 02-oct en Los Leones (3 jugadores). En prod **no existe** ningún torneo
creado para el 04-oct en Los Leones. Toda la prueba se hace sobre el camino de **ronda libre admin**, que es el
que se va a usar hoy; `tournaments` queda como nota.

| Componente | Esperado | Real (prod) | Estado | Evidencia |
|---|---|---|---|---|
| Commit en prod | = `origin/main` | `39e1717a` (#503) = `origin/main` HEAD | ✅ | API Vercel v6/deployments, target=production, READY 01:50 UTC |
| Código de notificaciones | en main | en main: #449 (`7d4f0570`, marcador en vivo + seguir sin cuenta), #451 (`511c4e4a`) | ✅ | `git log origin/main` |
| Service worker `/sw.js` | = repo | idéntico a `public/sw.js` (solo difiere EOL); listeners `push`, `notificationclick`, `pushsubscriptionchange` | ✅ | `diff` contra `curl /sw.js` |
| Tabla `round_watchers` (+ `push_subscription_id`, anon) | migraciones 20260924 + 20260929 aplicadas | columnas `id,user_id,ronda_codigo,created_at,push_subscription_id`; 4 policies solo `authenticated` | ✅ | `information_schema.columns`, `pg_policies` |
| Tabla `push_subscriptions` | 006 + 20260929 | existe; 9 suscripciones (2 anónimas, 4 de Juanjo) | ✅ | query |
| Publication `supabase_realtime` | tablas de ronda libre | `rondas_libres`, `ronda_libre_jugadores` (nada de `tournaments`/`hole_scores`) | ✅ para ronda libre | `pg_publication_tables` |
| `schema_migrations` | refleja el repo | solo 7 filas (el proyecto aplica SQL por la Management API, no por CLI) → **no sirve** para comparar; se verificó objeto por objeto | ⚠️ | query |
| Uso real del feature | seguidores en rondas de Juanjo | **1 watcher en toda la historia** (`RLS7844B`, prueba del 02-oct). **0 watchers** en las rondas de Juanjo | 🔴 señal | `round_watchers` |
| Env VAPID | Prod + Preview | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` en development, preview y production | ✅ | API Vercel v10/env (solo nombres) |
| `NEXT_PUBLIC_SITE_URL` | Prod + Preview | solo production | 🟢 | idem |
| Cancha Los Leones (`8f64cd3a…`) pares | 4 4 3 5 4 3 4 4 5 / 4 3 4 4 3 4 4 5 5 | idéntico, par 72 | ✅ | `course_holes` |
| CR/Slope Black/Blue/White | 75.1/142 · 73.3/136 · 71.6/129 | `negras` 75.1/142 · `azul` 73.3/136 · `blanco` 71.6/129 | ✅ | `course_tees` |
| Stroke index por hoyo | 11 7 15 1 13 17 3 9 5 / 14 18 6 2 16 4 8 10 12 | **17 5 14 1 11 15 4 7 10 / 12 18 13 2 16 3 6 8 9** — 14 de 18 distintos; `si_verificado=false` | 🟠 hoy (gross no usa SI) / 🔴 para cualquier ronda neta en Los Leones | `course_holes` |

Nota de esquema: el brief dice `tournaments.nombre`; en prod la columna es **`tournaments.name`**. Rondas libres
usan `course_name`. No se renombra nada.
