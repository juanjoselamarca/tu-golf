# Incidente — caída en pleno torneo Los Leones, 04-oct-2026

> Diagnóstico con evidencia (logs de Supabase edge / PostgREST / Postgres / Realtime / Auth, runs de GitHub
> Actions, deploys de Vercel). Horas en **Chile (UTC-3)**. Ronda afectada: `B4F5Y2` (Stableford gross,
> modo administrador, salida del 11).

## Resumen en una frase

Una base de datos demasiado chica (Supabase Free: 0,5 GB de RAM, viviendo en swap) estaba además cargada por
nuestros propios tests automáticos contra producción; a las 09:59 un reinicio rutinario de Realtime forzó a
PostgREST a recargar su catálogo, la recarga no alcanzó a terminar por la carga, y la API quedó degradada
~25 min. La app del marcador, al no poder validar la sesión, **no se recuperó sola** hasta las 11:01.

## Línea de tiempo comprobada

| Hora | Hecho | Evidencia |
|---|---|---|
| 09:19 | Última renovación de sesión de Juanjo OK | auth_logs `token_revoked`+`login` 12:19 UTC |
| 09:40 → 09:58 | PostgREST ya mata peticiones por timeout ("Thread killed by timeout manager") | postgrest_logs |
| 09:44 → 10:01 | **4 tandas de CI contra prod en 17 min** (PR de #505 ×2, push de #505, smoke manual), ~400-800 peticiones/5 min, con 5xx intencionales y altas/bajas de usuarios de prueba | GitHub runs; edge_logs por origen (GitHub Actions/Querétaro, previews Vercel) |
| 09:54 | Deploy de #505 a prod (uno de **5 deploys durante el torneo**) | API Vercel |
| 09:59:15 | Realtime chequea la base: **5,2 s** (base lenta) → reinicializa el tenant → **"Creating partitions for realtime.messages" (DDL)** | realtime_logs |
| 09:59:19-21 | La DDL gatilla **4 recargas de schema cache** en PostgREST; PostgREST reconecta | postgrest_logs |
| 09:59:33 | **Recarga falla por statement timeout (57014)**; reintenta | postgrest_logs, postgres_logs |
| 09:59:40-56 | Guardados del marcador tardan **20 s**; último guardado 09:59:56 | edge_logs (móvil CL) |
| 10:00 → 10:20 | API: mediana **7 s → 80 s**, p95 hasta 156 s; 5xx; `/auth/v1/user` 50/350 en 5xx; pool de conexiones agotado (Realtime: "connection not available… 12000ms") | edge_logs, realtime_logs |
| 10:02 / 10:04 | Otra recarga falla; la siguiente carga en **25,8 s** | postgrest_logs |
| 10:06 → 10:23 | CI de otro PR (#506) sigue golpeando prod; 4 workflows fallan por timeout | GitHub runs |
| ~10:19 | Tocaba renovar la sesión de Juanjo (cada 1 h): **no llegó / falló** | auth_logs (hueco 12:19→14:01 UTC) |
| ~10:25 | API vuelve a la normalidad | edge_logs |
| 10:25 → 11:01 | **El teléfono de Juanjo no hace NINGUNA petición** (61 min sin guardados) | edge_logs |
| 11:01:32 | Sesión renovada; entran 8 guardados de golpe (respaldo local) → **no se perdió ningún golpe** | edge_logs, `ronda_libre_jugadores` (18/18) |
| 15:05 | Se repite el patrón (test semanal de login + CI) → monitor reinicia Supabase (~5 min fuera) | incidentes/2026-10-04T18-10-31 |

## Causas comprobadas

1. **Infraestructura insuficiente (condición de fondo).** Prod corre en Supabase **Free / Nano**: 426 MB de RAM;
   en 3 h casi ociosas leyó **2,6 GB desde swap** (684.142 páginas) → cualquier carga extra la deja al límite.
   Es la misma familia que la caída del 02-oct (4 h) y los reinicios del 03-oct.
2. **Los tests automáticos usan la base de PRODUCCIÓN** (5 workflows por PR y por push, smokes manuales, test
   semanal de login): en la ventana fueron la mayor parte del tráfico. Ese domingo hubo 5 merges/deploys de
   sesiones autónomas **durante el torneo**. Sin congelamiento en eventos en vivo.
3. **Gatillo:** cada vez que Realtime reinicializa (varias veces por hora) crea particiones = DDL → PostgREST
   recarga su catálogo (5-25 recargas/hora todo el día; 0,3-2 s con la base sana, **15-26 s o falla** con carga).
4. **La app no tolera la falla** (tres mecanismos, verificados en código y reproducidos en Playwright):
   - `score-grupo/hooks/useRondaGrupoData.ts:71-72` ignoraba el error de `auth.getUser()` y, sin usuario,
     **mandaba al login** (con Auth en 5xx = sesión "inexistente").
   - `fetchRondaLibreParaScorer` devolvía `null` ante CUALQUIER error (timeout, 5xx) y los dos scorers lo
     leían como "la ronda no existe" → **mandaban al dashboard**.
   - "Siguiente →" hacía `await saveAllScores()` (3 reintentos) antes de avanzar → con respuestas de 20-80 s
     **el botón quedaba congelado minutos**. Y ningún guardado fallido se reintentaba solo.
   → el marcador quedó fuera 36 min más que el servidor.

## Corrección (PR "scorer resistente a caídas")

Una falla pasajera del servidor nunca más saca al marcador de su ronda: identidad desde la sesión del teléfono
(`sesionDelScorer`), "no existe" ≠ "sin conexión" (`fetchRondaLibreParaScorer` con plazo de 10 s), copia local
del scorer para abrir/recargar sin servidor, "Siguiente" no espera a la red, guardados con plazo de 12 s y
sincronización automática cada 15 s + al volver la red, aviso visible, y "Finalizar" sin red no cierra a
medias. Simulación de la caída en Playwright (`scripts/qa-leones/simulacion-caida.mjs`): 11/11 — "Siguiente"
en ~40 ms con el servidor colgado, recarga en plena caída abre en el hoyo correcto, nunca sale de la ronda,
y al volver el servidor los hoyos se sincronizan solos en 4 s.
5. **Detección ciega a degradaciones:** el monitor exige 2 chequeos seguidos sin respuesta en 15 s; con la
   mediana en 7-80 s pero respuestas intermitentes, no disparó. Y su remedio (reiniciar) cuesta 5 min de caída.

**No comprobado (no se afirma):** si hubo OOM a las 09:59 — el contador del kernel se reseteó con el reinicio
de las 15:15. Sin incidente reportado por Supabase el 03/04-oct.

Hallazgo aparte: el PR #504 (Stableford gross) **no se mergeó** → los puntos que mostró la app hoy fueron netos.
