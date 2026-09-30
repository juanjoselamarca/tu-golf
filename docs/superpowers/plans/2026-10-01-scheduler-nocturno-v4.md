# Scheduler nocturno v4 — "trabaja hasta que se acabe, después retoma"

**Estado:** plan final, pendiente de OK de Juanjo antes de implementar.
**Fecha:** 2026-09-30. **Autor:** Opus 5.5. **Crítica:** Fable 5.1 (veredicto CAMBIOS, todos los hallazgos incorporados abajo).
**Archivos:** `scripts/ceo-autonomo.mjs` (1255 LOC), `scripts/setup-ceo-task.bat`, `scripts/ceo-prompts/*`, `.github/workflows/` (1 guard nuevo).

---

## 1. El problema, con evidencia

- **Noche 29→30-sep:** los 4 agentes fallaron por el límite de 5 h en ~1 min, dos veces cada uno, a las 00:00 y de nuevo a las 05:00 (16 lanzamientos perdidos). El control de las 08:00 informó "4/4 corrieron". Se recuperó a mano a las 11:05, de día.
- **Semanal:** `seven_day` en 0.84 el 30-sep a las 13:20; se renueva el 1-oct a las 11:00. Una ronda de 4 agentes consume **5-8 % del semanal** (24-sep 0.81→0.86; 26-sep 0.56→0.64).

### Qué dice el CLI sobre el cupo (verificado en los logs, confirmado por Fable)
| Dato | Cuándo aparece |
|---|---|
| `five_hour` con `utilization` | solo desde **≥ 0.90** (bajo eso: `allowed` sin número) |
| `seven_day` con `utilization` | desde **~0.56** |
| `five_hour` en noches con el semanal en aviso | **no aparece** (solo llegan eventos `seven_day`) |
| `resetsAt` | siempre, en epoch (inmune al cambio de hora) |
| Falla por límite | `result` con `subtype:"success"`, `is_error:true`, texto "You've hit your limit · resets 10am" |
| Comando de uso/cupo en el CLI | **no existe** (`claude --help` 2.1.286). El probe es la única vía |

**Estimación declarada:** si el probe no trae número, el cupo de 5 h está "< 90 %" y el semanal "< ~55 %". Se informa así en Telegram, sin inventar decimales.

### Bugs del código actual
1. `checkAuth()` es async y se llama sin `await` (`:726`): el chequeo de sesión nunca bloqueó nada.
2. `agentsRanToday()` cuenta un error como "corrió" (`:996`): el control de las 08:00 y el catch-up no recuperan nada.
3. Reintento ciego a los 5 min ante cualquier error (`:964`).
4. Logs sobrescritos por agente y día: se perdió la evidencia de las 00:00 del 30-sep.
5. El resumen corrió 2 veces y un reintento corrió después del resumen.
6. `todayStr()` se recalcula en cada llamada: una noche que cruza de día parte su estado en dos archivos.
7. **El scheduler opera en el checkout de Juanjo:** `git pull origin main`, `git revert` + `git push origin main` directo, y resumen-ceo edita `docs/CEO_AUTONOMO_TRACKING.md` en la carpeta principal (es la `M` que aparece hoy en `git status`).
8. Worktrees bloqueados por OneDrive en cada corrida (00:07, 05:06, 11:35, 11:58 del 30-sep).
9. Ruido de Telegram: "message is not modified" en cada edición.

---

## 2. El diseño

### 2.1 Idea central: una cola persistente que avanza cuando hay cupo
- Hay un **archivo de estado de la noche** (`{NIGHT_ID}--night.json`, con `NIGHT_ID` fijado una sola vez al arrancar) con cada trabajo en uno de estos estados: `pending → running → ok | paused_limit | failed_real | timeout | stuck`.
- Si se acaba el cupo de 5 h, el trabajo queda en `paused_limit`, el scheduler **deja una tarea de Windows de un solo uso con `WakeToRun` para `resetsAt + 3 min`** y **termina el proceso**. A esa hora la tarea despierta el PC y el scheduler retoma la cola. No hay procesos durmiendo horas: sobrevive a suspensión, reinicios y cierres (hallazgo P0-1 de Fable).
- **Retomar = relanzar limpio con contexto**, no `--resume` de la sesión (a las 5 h el caché expiró y re-enviar 300k tokens cuesta más que partir de nuevo). El agente recibe un bloque "RETOMA": su rama (`git log`/`git diff` contra `origin/main`) y su `pendientes-*.md`. La rama y el worktree se conservan entre pausas.
- **Sin tope fijo de reintentos por límite** (pedido de Juanjo 30-sep: "que corra hasta que se acabe y después se retome"). El tope es el avance: si un trabajo se pausa **dos veces seguidas sin commits nuevos en su rama**, pasa a `stuck` y se deja.
- **Error real o timeout:** nunca se reintenta. Queda registrado y la cola sigue.

### 2.2 Semanal agotado: se retoma la noche siguiente
- Si el semanal se agota (evento `rejected` de `seven_day`, o supera el umbral del §2.3), la cola se congela: los trabajos a medio hacer quedan `paused_weekly` con su rama intacta.
- Telegram: "Semanal al X %, se renueva <fecha/hora>. Quedan N trabajos en pausa; se retoman la próxima noche."
- **La noche siguiente parte retomando lo pausado antes de empezar trabajo nuevo.** No se retoma de día al renovarse el semanal: el día es de Juanjo, salvo la cola de la mañana (§2.4).
- Ramas pausadas con más de 3 noches se descartan y se informa (evita acumular deuda muerta).

### 2.3 Preflight 00:00 (mide y decide)
`probeQuota()`: `claude -p ok --bare --model haiku --max-turns 1 --output-format stream-json --verbose` (`--bare` para no disparar hooks de sesión). Lee todos los `rate_limit_event`.

`decideStart()` (función pura, con tests):
| Lectura | Decisión |
|---|---|
| `seven_day` `rejected` o ≥ **techo del día** (ver abajo) | No correr. Telegram con la razón y la hora de renovación |
| `five_hour` `rejected` | Tarea de un solo uso para `resetsAt + 3 min` y salir |
| `five_hour` `allowed_warning` (≥ 0.90) | Esperar el reset (misma tarea de un solo uso) |
| `five_hour` `allowed` o sin dato | Partir. El manejo a mitad de noche (§2.1) cubre el resto |

**Techo semanal dinámico (decidido por Claude el 30-sep; Juanjo delegó la decisión).** Un umbral fijo es malo en ambos extremos: el lunes deja a Juanjo sin cupo para el resto de la semana, y la noche antes de la renovación desperdicia cupo que se pierde igual. El techo se calcula con cuánto le falta al semanal para renovarse:

```
reserva_juanjo = USO_DIARIO_JUANJO × días_hasta_reset     (USO_DIARIO_JUANJO inicial = 0.08)
techo          = clamp(1 − reserva_juanjo, 0.60, 0.97)
```

| Días al reset | Techo | Lectura |
|---|---|---|
| 6 | 0.60 | Inicio de semana: los agentes no pasan del 60 % |
| 3 | 0.76 | Mitad de semana |
| 1 | 0.92 | Última noche: casi todo lo que queda se usa (si no, se pierde) |
| < 0.5 | 0.97 | La renovación es esa misma mañana |

- **Se chequea antes de cada agente**, no solo a las 00:00: la cola se congela (`paused_weekly`) apenas el semanal cruza el techo.
- **Ronda 2** (`NIGHT_ROUNDS` automático): corre solo si `semanal_actual + 0.08 ≤ techo`. Nunca se lanza una ronda que no cabe.
- **Calibración automática:** cada lectura del probe (`seven_day`, hora) queda guardada en `.claude/ceo-logs/quota-history.jsonl`. A las 2 semanas, el scheduler calcula el uso diurno real de Juanjo (subida del semanal entre las 12:00 y las 00:00) y reemplaza el 0.08 inicial por ese valor medido (con un piso de 0.05). Mientras no haya datos, se usa 0.08, que es conservador (semana del 23-29 sep, la más alta medida).
- Mientras el semanal esté bajo ~55 % el CLI no entrega número: se asume "bajo el techo", lo que es cierto en todos los casos porque el techo mínimo es 0.60.

### 2.4 Sin corte a las 08:00
La cola corre hasta vaciarse, aunque sea a mediodía (R3). El resumen de Telegram sale cuando la cola termina o se congela, no a una hora fija.
Si no hay cupo para el resumen-ceo (que usa un LLM), el scheduler arma él mismo un resumen mínimo (`gh pr list` de la noche + estado de la cola), sin LLM.

### 2.5 Fuera de la carpeta de Juanjo y fuera de OneDrive
- Worktrees de noche en `C:\ceo-worktrees\{NIGHT_ID}-{agente}` (fuera de OneDrive, se acaban los bloqueos).
- **Cero comandos git en la carpeta principal**: solo `git fetch`. El resumen y el auto-revert corren en worktree propio, y el revert va por PR (no más push directo a `main`).
- resumen-ceo escribe solo en `.claude/ceo-logs/`, nunca en `docs/`.

### 2.6 Candados y procesos huérfanos
- `night.lock` global con PID verificado: nunca dos noches en paralelo (Task Scheduler, tarea de un solo uso y corrida manual pueden coincidir).
- Al salir el scheduler, `taskkill /T` a su árbol de procesos: ningún `claude` sigue trabajando sin nadie que lo registre.
- **Sesiones interactivas de noche (R8):** el preflight busca procesos `claude` que NO son del scheduler (por su línea de comandos) y avisa por Telegram. No los mata. Regla de trabajo aparte: Claude no deja `/loop` ni wake-ups activos al cerrar una sesión.

### 2.7 Control de las 08:00 y 12:00 (reemplaza al deadman)
Lee el estado y el PID. Si el scheduler está vivo o hay tarea de un solo uso programada → nada. Si murió con trabajo pendiente → lo relanza **una vez** (flag en el estado, protegido por el candado) y avisa. Reenvía los avisos de Telegram que no se entregaron (lista `notifications[]` en el estado; Telegram caído no se come la alerta del semanal). Respeta `PAUSE`.

### 2.8 Reglas para los agentes: con candado, no solo en papel
Archivo `scripts/ceo-prompts/night-rules.md`, inyectado como `merge-rule.md`. Cada riesgo con una defensa **mecánica**:

| Riesgo | Defensa mecánica | Texto en el prompt |
|---|---|---|
| `--no-verify` (#459) | El scheduler revisa el log de la sesión; si hubo `git push --no-verify`, comenta el PR como "tainted" y lo avisa | Prohibido; si el hook falla por algo que ya falla en main, PR abierto sin merge |
| Merge con checks rojos (#460) | Hacer **obligatorios** los checks que hoy son opcionales (branch protection): `gh pr merge` sin `--admin` falla solo | Comando exacto para probar que un rojo ya fallaba en main |
| Zona crítica sin Fable | Workflow nuevo `critical-zone-guard` (obligatorio): falla si el diff toca zona crítica sin label `fable-reviewed` | De noche la tabla de modelos no aplica: zona crítica = PR abierto para revisar en la mañana |
| PRs duplicados | — (verificable por el agente) | `gh pr list --state all --json title,files` últimos 14 días antes de abrir |
| Choque con trabajo de día | — | `gh pr list --state open --json headRefName,files` vs `git diff --name-only`: no tocar archivos con PR abierto de `*-juanjo`/`*-max` |
| Reintentos en bucle | El scheduler cuenta los `git push` por sesión y avisa sobre 3 | Máximo 3 ciclos arreglo→push→checks por PR |
| Semanal | Lo maneja el scheduler | No lanzar sub-agentes Fable de noche |

Los checks obligatorios y el guard aplican también a los PRs de día (Juanjo y Max) — ver §5.

### 2.9 Orden del código ("el que toca, ordena")
`ceo-autonomo.mjs` queda como entrada delgada. Se extraen a `scripts/ceo/`: `quota.mjs`, `failure.mjs`, `state.mjs`, `runner.mjs`, `telegram.mjs`. Cobertura y worktree quedan donde están, salvo los cambios de ruta. Log por intento: `{NIGHT_ID}-{agente}-a{n}.log`, nunca se sobrescribe.

### 2.10 Tareas programadas
- 23:30 TokenWarmup (igual)
- 00:00 `--night` (`RestartCount 0`, `WakeToRun`, `StartWhenAvailable` — cubre también el 00:00 saltado por el cambio de hora)
- 08:00 y 12:00 `--watchdog`
- Tareas de un solo uso `GolfersPlus-CEO-Resume-*` creadas por el propio scheduler y borradas al usarse
- Se eliminan: Round2, TokenWarmup-R2, DeadmanSwitch y la tarea suelta `GolfersPlus-CEO-Recupero-30sep`.

---

## 3. Pruebas de día (antes de la primera noche)

1. **Unit (vitest)** con fixtures de los logs reales: `decideStart` (todas las filas de §2.3, incluido "sin dato"), `classifyFailure` (forma real `subtype:"success"` + `is_error:true`), máquina de estados, regla `stuck`.
2. **CLI falso** (`CEO_CLAUDE_BIN` → script que reproduce streams grabados) + reloj inyectable (`CEO_NOW`):
   a. límite 5 h a mitad → estado `paused_limit`, tarea de un solo uso creada, proceso sale; al ejecutarla retoma con el bloque RETOMA
   b. dos pausas sin commits nuevos → `stuck`, no hay un tercer intento
   c. error real → cero reintentos, la cola sigue
   d. semanal sobre el techo dinámico en el preflight (con 6 y con 1 día al reset) → no corre, Telegram con la razón
   e. semanal agotado a mitad → `paused_weekly`; la "noche siguiente" simulada retoma primero lo pausado
   f. `five_hour` sin dato → parte; `allowed_warning` → espera
   g. dos `--night` a la vez → el segundo sale por el candado
   h. matar el proceso durante la pausa → el control lo relanza una vez, sin duplicar
   i. corrida manual `--now` mientras la noche está en pausa → bloqueada por el candado
   j. Telegram caído → el aviso queda pendiente y el control lo reenvía
   k. `PAUSE` presente → ni la noche ni el control hacen nada
3. **Suspensión real:** tarea de un solo uso a +5 min, poner el PC a dormir y confirmar que despierta y retoma.
4. **Una corrida real de día** de un solo agente con un prompt corto (spawn, logs, Telegram, worktree fuera de OneDrive).
5. **Review del diff:** lo escribe Opus y lo revisa Fable (infraestructura que mergea a prod de noche).

## 4. Rollback
- Inmediato, sin deploy: crear `.claude/ceo-locks/PAUSE` (la noche y el control lo respetan).
- Completo: `git revert` del PR + `scripts/setup-ceo-task.v3.bat` (se conserva el actual) + borrar las tareas `GolfersPlus-CEO-Resume-*`.
- Checks obligatorios y guard: se revierten con un solo `gh api` (comando en el PR).

## 5. Decisiones (cerradas el 30-sep)
1. **Techo semanal:** dinámico por días al reset (§2.3). Juanjo delegó la decisión a Claude.
2. **Checks obligatorios + guard de zona crítica para TODOS** (agentes, Juanjo y Max). Aprobado por Juanjo.
3. **Suspensión del PC con corriente desactivada + wake timers habilitados.** Aprobado; lo ejecuta Juanjo:
   ```
   powercfg /change standby-timeout-ac 0
   powercfg /change hibernate-timeout-ac 0
   powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
   powercfg /setactive SCHEME_CURRENT
   ```

## 6. Estimación
~1 día de implementación + medio día de pruebas de día. Primera noche real: la noche siguiente a las pruebas verdes.
