# Flujo de Finalización de Ronda Libre

**Última actualización:** 2026-04-14  
**Archivos fuente:**
- `src/app/ronda-libre/[codigo]/score/page.tsx` — modo individual
- `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` — modo admin/grupo

---

## Resumen

Cuando un jugador presiona "Finalizar ronda", la app:
1. Guarda sus scores en `ronda_libre_jugadores`
2. Inserta la ronda en `historical_rounds` (solo modo individual)
3. Actualiza `rondas_libres.estado = 'finalizada'` si todos completaron
4. Muestra un modal de celebración o redirige al leaderboard

---

## Modo Individual (`score/page.tsx`)

### Trigger del botón

El botón "Finalizar ronda" aparece a partir del hoyo 9 (como opción secundaria) y en el último hoyo (botón primario). Usa un sistema de confirmación en dos pasos:

1. **Primer tap:** `setConfirmFinalize(true)` — el botón cambia a "¿Finalizar ronda?"
2. **Segundo tap:** ejecuta `finalizeRound()`

### Secuencia en `finalizeRound()`

```
1. saveScores(activeJugadorId, scores)       → ronda_libre_jugadores (UPDATE scores)
2. trackEvent(..., 'ronda_completada')       → analytics (PostHog/Supabase)
3. historical_rounds.insert(...)             → historial del jugador autenticado
4. supabase.rpc('calcular_indice_golfers')   → recalcula Índice Golfers+ (async, no-blocking)
5. profiles.update({ nivel, nivel_updated_at, nivel_expires_at })   → nivel del jugador
6. fetch('/api/taiger/patterns')             → detección de patrones (background, non-blocking)
7. rondas_libres re-fetch (estado fresco)
   → si allDone: UPDATE rondas_libres SET estado='finalizada' WHERE estado='en_curso'
   → push notification via sendPushViaServer
8. setRoundDone(true)                        → muestra modal de celebración
9. fetch('/api/taiger/analyze-round')        → análisis tAIger+ (background)
```

### Race condition guard

Antes de marcar la ronda como finalizada, se verifica el estado fresco de la BD:
- Si `estado === 'finalizada'`: otro jugador ya finalizó → `setRoundDone(true)` sin duplicar el UPDATE
- El UPDATE usa `.eq('estado', 'en_curso')` como condición adicional (operación atómica)

---

## Modo Admin/Grupo (`score-grupo/page.tsx`)

El admin ve todos los jugadores y scorecard grupal. La lógica es más directa:

```
1. Guardar scores de TODOS los jugadores simultáneamente
   → Promise.all([ronda_libre_jugadores.update(scores)]) para cada jugador
2. rondas_libres.update({ estado: 'finalizada' })   → actualización directa
3. router.push(`/ronda-libre/${codigo}?finished=true`)   → redirige al leaderboard
```

En este modo NO se escribe en `historical_rounds` — solo el jugador autenticado en modo individual puede registrar su propia ronda en el historial.

---

## Tablas de BD actualizadas

| Tabla | Operación | Cuándo |
|-------|-----------|--------|
| `ronda_libre_jugadores` | UPDATE `scores` | Siempre al finalizar |
| `historical_rounds` | INSERT nueva fila | Solo modo individual, jugador autenticado |
| `rondas_libres` | UPDATE `estado = 'finalizada'` | Cuando todos los jugadores completaron todos los hoyos |
| `profiles` | UPDATE `nivel`, `nivel_updated_at`, `nivel_expires_at` | Solo modo individual, async |

---

## ¿Cuándo aparece en `historical_rounds`?

La ronda se inserta en `historical_rounds` **inmediatamente** cuando el jugador autenticado presiona Finalizar en modo individual (`score/page.tsx`). Datos insertados:

```typescript
{
  user_id,
  course_name,
  course_id,
  played_at,          // fecha de la ronda o fecha actual
  total_gross,        // suma de todos los golpes
  scores,             // array de (number | null) en orden hoyo 1..N
  holes_played,       // 9 o 18
  tee_color,
  privacy: 'private',
  slope_rating,       // desde course_tees (tee específico) o courses (fallback)
  course_rating,
  diferencial,        // calculado con calcularDiferencial()
}
```

El `diferencial` (handicap diferencial del R&A) se calcula con `slope_rating` y `course_rating`. Si la cancha no tiene estos datos, `diferencial` queda `null`.

Después del INSERT, se dispara `calcular_indice_golfers` (RPC Supabase) para recalcular el Índice Golfers+ del jugador con las rondas recientes.

---

## Feedback visual al usuario

### Modo individual

**Modal de celebración a pantalla completa** con:
- Confetti animado (30 partículas)
- Trofeo animado
- Score total en grande, color según vs par (verde/dorado/rojo)
- Contador de birdies y eagles (usando scores netos si el modo es neto)
- Mini análisis automático: fortaleza por tipo de hoyo (par 3/4/5), comparación ida vs vuelta
- Mini scorecard con colores Garmin Golf
- CTAs según contexto:
  - **Multi-jugador:** "Ver leaderboard en vivo" (primario) + "Compartir mi score"
  - **Solo:** "Compartir resultado" (primario)
  - Siempre: "Analizar con tAIger+" + "Editar scores" (cierra modal sin redirigir)

### Modo admin/grupo

Redirección directa a `/ronda-libre/{codigo}?finished=true` (leaderboard/detalle de ronda).

---

## Validaciones de seguridad antes de guardar

En modo individual, antes de cada guardado automático (al cambiar de hoyo), se verifica que la ronda siga activa:

```typescript
const { data: rondaCheck } = await supabase
  .from('rondas_libres').select('estado').eq('codigo', codigo).single()
if (rondaCheck.estado === 'finalizada') {
  // El admin cerró la ronda — scores en dispositivo están seguros
  // Mostrar warning toast y redirigir a vista read-only
}
```

---

## No hay endpoint de API dedicado

La finalización ocurre completamente en el cliente (Supabase JS SDK directo). No existe un endpoint `POST /api/rondas/finalizar`. Toda la lógica vive en los dos page components.
