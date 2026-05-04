---
description: Smoke test completo antes de un torneo real con jugadores. Protege la directiva CERO FALLOS.
---

# Pre-torneo — checklist obligatoria antes de cualquier evento real

**Cuándo correr:** entre 24h y 2h antes de un torneo o ronda real con jugadores reales en cancha.

**Por qué:** la directiva máxima de Golfers+ es CERO FALLOS en torneos. Si la app falla en cancha, el club no vuelve. Esta checklist es la última línea de defensa.

**Tiempo estimado:** 10-15 min (Claude lo ejecuta solo, reporta al final).

---

## 1. Producción está viva (2 min)

- [ ] HEAD a `https://golfersplus.vercel.app` → 200 OK
- [ ] `/api/admin/health-check` → todos los checks PASS o WARN aceptables
- [ ] Sentry: cero `error` o `fatal` en las últimas 6 horas
- [ ] Vercel deployments: el último build es exitoso (no rollback pendiente)
- [ ] Variables críticas presentes: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`

## 2. Base de datos sana (3 min)

- [ ] Connection a Supabase responde
- [ ] Sin rondas zombie: no hay `rounds.status = 'in_progress'` con `updated_at < hoy - 7 días`
- [ ] Si hay rondas zombie → cerrarlas o reportar a Juanjo si son del torneo activo
- [ ] Tablas críticas no llenas: `rounds`, `round_players`, `round_player_scores`, `tournaments`
- [ ] RLS activo en todas las tablas con datos de usuarios (verificar `pg_policies` count > 0 en cada una)

## 3. Smoke test del flujo completo (5 min)

Crear datos reales contra prod, ejecutar el flujo, limpiar al final.

- [ ] **Crear ronda libre** vía `/api/ronda-libre/crear` con 4 jugadores invitados
- [ ] **Cargar scores** de los primeros 3 hoyos vía `/api/ronda-libre/[codigo]/score` (uno por jugador, par/birdie/bogey)
- [ ] **Ver leaderboard** vía `/api/ronda-libre/[codigo]/leaderboard` → orden correcto, vsPar correcto, holesPlayed = 3
- [ ] **Finalizar ronda** vía `/api/ronda-libre/[codigo]/finalizar` → status pasa a `'closed'`
- [ ] **Cleanup**: DELETE de la ronda + jugadores + scores creados (NO dejar test data en prod)

Si cualquier paso falla → BLOQUEAR torneo y reportar a Juanjo con detalle.

## 4. APIs críticas responden (2 min)

GET a cada uno, validar 200 + JSON parseable:

- [ ] `/api/canchas` → lista de canchas FedeGolf
- [ ] `/api/leaderboard?codigo=XXXX` (con código real activo si lo hay)
- [ ] `/api/en-vivo`
- [ ] `/api/admin/health-check`
- [ ] `/api/taiger/context` (si el torneo usa coaching)

## 5. Performance bajo carga real (2 min)

- [ ] Lighthouse o time-to-interactive de la página de scoring (`/ronda-libre/[codigo]/score`) bajo 3G simulado < 5s
- [ ] El leaderboard refresca cada 15s sin acumular memory leaks ni WebSocket churn (revisar últimas regresiones de `useRondaRealtime`)
- [ ] Tamaño de bundle JS no creció >20% vs último torneo conocido

## 6. Plan de contingencia (1 min)

Confirmar que tenemos:

- [ ] Acceso al dashboard de Vercel para hacer rollback si hace falta (Juanjo)
- [ ] Acceso al dashboard de Supabase para ver logs en vivo (Juanjo)
- [ ] Número de teléfono del organizador del torneo (en `tournaments` o pedirlo a Juanjo)
- [ ] Procedimiento offline: scorecard de papel imprimible disponible (link en `docs/RUNBOOKS/scorecard-papel.md`, crear si no existe)

---

## Reportar al final

Formato del reporte que devuelve este comando:

```
PRE-TORNEO — [fecha/hora] — [nombre torneo si lo conoce]

PROD VIVO:        OK / FAIL — [detalle]
BD SANA:          OK / FAIL — [zombies / RLS / etc.]
FLUJO COMPLETO:   OK / FAIL — [paso que falló]
APIs:             X/X OK
PERFORMANCE:      OK / WARN / FAIL
CONTINGENCIA:     OK / FALTA [item]

=== TORNEO LISTO / BLOQUEADO ===

Cleanup de test data: OK / pendiente [round_id]
```

Si algo está en FAIL → BLOQUEADO. No se puede iniciar el torneo hasta resolver.
Si solo hay WARN → reportar a Juanjo y que él decida si seguir.

---

## Reglas de ejecución

1. **Cleanup obligatorio.** Toda ronda/jugador/score creado para test debe eliminarse antes de reportar. Reportar el cleanup explícitamente.

2. **No correr en producción si hay torneo en curso.** Si `rounds.status = 'in_progress'` con `updated_at` reciente (<3h), el smoke test puede crear ruido en el leaderboard real. Avisar y abortar.

3. **Escalar a Juanjo si:** cualquier check falla, hay rondas zombie del torneo activo, o falta env var crítica. NO intentar arreglar en caliente.

4. **Documentar el resultado.** Anexar al reporte un commit-style summary que pueda quedar en `docs/RUNBOOKS/pre-torneo-log.md` (crear si no existe, sumar entrada por cada ejecución).
