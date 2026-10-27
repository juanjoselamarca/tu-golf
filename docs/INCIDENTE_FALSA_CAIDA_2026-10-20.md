# Incidente 20-oct-2026 — "Caída de 310 minutos" que nunca ocurrió

**Resumen:** el monitor del PC (`scripts/monitor/uptime.mjs --local`, Task Scheduler cada 5 min) avisó por Telegram a las
17:16Z una caída "desde las 09:11 Chile" (12:11Z) y a las 17:20Z "volvió (~310 min)". **Prod sirvió todo el día.** El
monitor estuvo ciego 13 horas porque el PC estaba saturado, y su máquina de estados sumó dos fallas que no eran
"seguidas". Reportado por Juanjo en el inbox: "Revisar qué causó la caída y por qué se demoró tanto en volver".

## Qué pasó (UTC)

| Hora | Hecho | Fuente |
|---|---|---|
| 04:07 → 17:07 | Task Scheduler mató el monitor al límite de 2 min **141 veces** (evento 329). Últimas corridas sanas 05:16–05:40. | log `Microsoft-Windows-TaskScheduler/Operational` |
| 12:10:01 | Corrida que recién llegó a chequear a las 12:11:28: node tardó **87 s** en arrancar; la web dio timeout (15 s) → `fails=1`. | `state.json` + log |
| 12:15 → 17:07 | Ninguna corrida terminó. | log del Scheduler |
| 12:52 y 17:45 | El respaldo de GitHub (`uptime.yml`) vio prod **OK** las dos veces (cron estrangulado a ~cada 5 h). | GitHub Actions |
| 17:15:01 | Corrida termina en 103 s; web timeout; db 200 en 3,7 s; auth 200 en 3,9 s → `fails=2` → **alerta "CAÍDA desde 12:11"**. | `ultimo-chequeo.json` |
| 17:20 | Corrida OK en 81 s → "volvió, ~310 min". | `state.json` |
| 17:16 → 17:30 | Diagnóstico automático (Opus, cupo semanal al 92 %) hizo 3 lecturas en 13 min y murió por timeout sin informe. | `sesion.jsonl` |

Evidencia del diagnóstico: Supabase sana (0 errores 5xx), Vercel sirviendo tráfico normal en esa hora, `gh` con
`ETIMEDOUT` desde el propio PC. Sin eventos Kernel-Power ni Resource-Exhaustion: fue saturación de CPU/IO por el
pipeline nocturno del CEO + agentes en paralelo (misma familia que `reference_oom_procesos_acumulados`), no un corte.

## Causa raíz (dos defectos del monitor, no de prod)

1. **Fallas "seguidas" sin mirar el reloj.** `nextState` acumulaba `fails` sin importar cuánto tiempo pasó desde el
   chequeo anterior. Una falla de las 12:11Z más otra de las 17:16Z (5 h después) contaron como "2 seguidas" y
   `downSince` quedó en la primera: de ahí los "310 min".
2. **Un PC saturado no distingue "prod no responde" de "yo no respondo".** Con node tardando 87–103 s en arrancar, un
   timeout de 15 s a Vercel es ruido del PC, no evidencia de caída (la base respondía, lenta, desde el mismo PC).

## Fix (PR `fix/inbox-monitor-pc-lento-claude`)

- `STALE_CHECK_MS` (15 min = 3 intervalos): si el chequeo anterior es más viejo, la falla previa no cuenta y esta es la
  primera. Una caída ya avisada no se olvida por esto: sale solo con un OK. `lastCheck` se guarda en ms (el ISO
  anterior se sigue entendiendo).
- `chequeoConfiable`: si `process.uptime()` al chequear supera `ARRANQUE_LENTO_S` (30 s) y el chequeo falló, la corrida
  no cuenta (ni estado ni alerta; queda en el log como "CHEQUEO NO CONFIABLE"). Un OK cuenta siempre.
- `ultimo-chequeo.json` ahora trae `arranque_node_s` para que el diagnóstico automático vea si el PC estaba saturado.
- Tests: `scripts/monitor/uptime.test.mjs` (reproduce la secuencia 12:11Z → 17:16Z y el guard del PC lento).

## Lo que NO arregla este PR (pendiente)

- **El PC se satura de noche** y deja ciego al monitor por horas: el respaldo real es `uptime.yml`, pero GitHub lo
  estrangula a ~cada 5 h (`reference_github_actions_cron_estrangulado`). Mientras el PC esté saturado, una caída real
  de prod puede tardar horas en detectarse. Opciones: watchdog externo (UptimeRobot/Better Stack gratis), o bajar la
  carga nocturna (plan `project_modo_ahorro_hasta_15oct`, nocturnos v5).
- El diagnóstico automático no debería lanzarse si el chequeo vino de un PC saturado (ahora no se lanza porque el
  chequeo no cuenta; queda por decidir si en ese caso conviene un aviso corto "monitor ciego").
