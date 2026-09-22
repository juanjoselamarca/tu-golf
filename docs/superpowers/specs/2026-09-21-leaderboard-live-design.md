# Leaderboard Live — Spec de diseño

**Fecha:** 2026-09-21
**Estado:** aprobado por PM
**Feature gate:** `leaderboard-live` (tier Pro)
**Alcance:** torneos + rondas libres

---

## Problema

El leaderboard actual renderiza una vez en el servidor y no se actualiza. Si otro jugador mete un birdie mientras estás mirando, no lo ves hasta que recargues la página. No hay notificaciones durante el juego. Los espectadores no tienen forma de seguir un torneo sin la app.

## Objetivo

Que durante un torneo o ronda libre:
1. El leaderboard se actualice solo en la pantalla del jugador/espectador
2. El jugador reciba notificaciones push con el estado del leaderboard cuando no tiene la app abierta
3. Cualquiera pueda seguir el torneo/ronda con un link compartible, sin instalar la app

## Usuarios

| Usuario | Contexto | Necesidad |
|---|---|---|
| Jugador en cancha | Sol, guante, 5 seg entre hoyos, batería limitada | Ver cómo va el torneo rápido, sin navegar |
| Espectador remoto | Familiar/amigo siguiendo desde casa/oficina | Seguir el torneo en tiempo real desde cualquier browser |
| Organizador | Manejando el evento | Compartir link del leaderboard live por WhatsApp |

## Solución: 3 capas

### Capa 1 — Realtime (app abierta)

**Tecnología:** Supabase Realtime (websocket) — incluido en free tier, 200 conexiones simultáneas, 2M mensajes/mes.

**Comportamiento:**
- Cuando el usuario tiene el leaderboard abierto (`/torneo/[slug]/en-vivo` o `/ronda-libre/[codigo]`), se suscribe a un channel de Supabase filtrado por torneo/ronda.
- Cada vez que un jugador ingresa un score (insert en `hole_scores`), el leaderboard se recalcula y actualiza en la pantalla de todos los suscriptores.
- Indicador visual "● En vivo" cuando la conexión está activa.
- Indicador "Reconectando..." si se pierde la conexión.
- Pull-to-refresh siempre disponible como fallback.
- Cuando el usuario vuelve a la app (tab switch, desbloqueo), sync inmediato via visibility-change event.
- **Updates NO interrumpen ingreso de score.** Si el jugador está ingresando su score, los updates de Realtime se acumulan en background y se aplican cuando vuelve a la vista del leaderboard. Nunca mover la pantalla ni borrar input del usuario.
- **Conectividad en canchas de golf:** las canchas tienen cobertura celular irregular. El ingreso de scores NUNCA se bloquea por falta de conexión. Scores se guardan en cola local y se sincronizan al recuperar señal. Indicador: "2 scores pendientes de sync".
- **"thru X" obligatorio:** al lado de cada score, mostrar cuántos hoyos jugó cada jugador. Un -3 thru 14 es muy diferente a un -3 thru 3. Esto no es decorativo — es la forma de interpretar el leaderboard en vivo correctamente.

**Fallback:** Si Realtime falla o no conecta, degradar a polling cada 30 segundos (comportamiento actual mejorado — hoy el polling no actualiza la UI).

**Filtros Supabase Realtime (AND filters, ago-2026):** suscribirse solo a `hole_scores` where `tournament_id = X` o `ronda_libre_id = X`. Reduce mensajes billables.

### Capa 2 — Push notifications (app cerrada)

**Tecnología:** Web Push via VAPID (ya implementado). Declarative Web Push (iOS 26+) como mejora progresiva.

**Trigger:** Reglas de frecuencia inteligente para evitar spam (20 jugadores × 18 hoyos = 90 push potenciales):
- **Torneos:** solo notificar en cambios de top 4 (cambio de líder, alguien entra/sale del top 4). Si no hay cambios, notificar máximo cada 3 hoyos completados por el grupo del usuario.
- **Rondas libres:** cada hoyo completado (son 4 jugadores, máximo 18 notificaciones).
- **Configurable por usuario:** "cada cambio de líder" / "cada 3 hoyos" / "solo resultado final". Default: cada cambio de líder.
- **Push final obligatorio:** cuando el último grupo completa el último hoyo, todos reciben resultados finales.

**Formato de la notificación (base — formato A aprobado):**

```
TÍTULO: Club Santiago · En vivo

CUERPO:
1° Lamarca · -3 · H14 · GWI 68%
2° González · -1 · H15 · GWI 22%
3° Silva · E · H13 · GWI 8%
4° Torres · +2 · H12 · GWI 2%
```

**Reglas de formato:**
- Máximo 4 jugadores (en ronda libre son exactamente los jugadores del grupo)
- En torneos con más de 4 jugadores: top 4 del leaderboard
- Simetría en el formato: cada línea sigue la estructura `N° Apellido · score · hoyo · GWI N%`
- Score vs par con signo: -3, +2, E (even)
- Hoyo actual: H14 = está en el hoyo 14
- GWI: solo mostrar cuando `holesPlayed >= 6`. Antes de eso mostrar "—" (con menos de 6 hoyos no hay significancia estadística)
- **Formato torneo:** "Club Santiago · En vivo" + top 4 con posiciones
- **Formato ronda libre:** "Ronda libre · Hoyo 14" + los 4 jugadores con score sin ranking explícito (tono casual entre amigos que se ven la cara)

**Plataforma-específico:**

| Capacidad | iOS PWA | Android PWA |
|---|---|---|
| Texto plano | Sí | Sí |
| Colores en texto | No | No |
| Imágenes en notificación | No | Sí (Big Picture) — evaluar server-rendered leaderboard image |
| Botones de acción | No | Sí — "Ver torneo" + "Silenciar" |
| Notificación expandible | No | Sí — expandir para ver más jugadores |
| Sonido custom | No | Sí |
| Badge en ícono | Sí | Sí |

**Para Android:** aprovechar las capacidades extra:
- Botones de acción: "Ver torneo" (abre leaderboard) + "Silenciar" (para notificaciones del torneo)
- Notificación expandible: swipe down muestra top 8 en vez de top 4
- Evaluar: imagen server-rendered del leaderboard como Big Picture notification

**Para iOS:** texto plano con el formato A. El tap abre el leaderboard live en la app.

**Agrupación:** Todas las notificaciones de un mismo torneo se agrupan (thread-id = torneo/ronda ID). La última reemplaza las anteriores — no acumular notificaciones por ronda.

**Fin del torneo/ronda:**
- Último grupo completa último hoyo → push final "Resultados finales" con top 4 definitivo
- Canal Realtime se cierra automáticamente
- Link compartible pasa a mostrar "Finalizado" con resultados estáticos
- Badge se resetea

**Opt-in:** El usuario debe aceptar notificaciones. Preferencias ya existen en `notification_preferences` con campos: `leader_changes`, `round_updates`, `round_finished`.

### Capa 3 — Link compartible (sin app)

**URL:** `golfersplus.vercel.app/torneo/[slug]/en-vivo` (ya existe) o `golfersplus.vercel.app/ronda-libre/[codigo]` (ya existe)

**Comportamiento actual:** Renderiza server-side, no se actualiza.

**Comportamiento nuevo:**
- Página pública (no requiere login para ver — sí para scorear)
- Auto-refresh cada 30 segundos via polling (Realtime requiere autenticación Supabase, polling no). Esto mantiene las conexiones Realtime solo para jugadores autenticados (~40 conexiones) en vez de espectadores (~100+) que podrían agotar el free tier de 200.
- Indicador: "Actualizado hace X segundos"
- Diseño premium responsive (ya existe, solo necesita el auto-refresh)
- Open Graph meta tags **genéricas** (sin scores — WhatsApp cachea la preview y quedaría congelada):
  - Título: "Torneo Club Santiago · En vivo"
  - Descripción: "20 jugadores · Sigue el leaderboard en tiempo real"
  - Imagen: imagen genérica del torneo o del club (no scores que se desactualizan)

**Privacidad:**
- El organizador decide si el leaderboard es público o privado al crear el torneo
- Si es privado: el link requiere un código de acceso de 4 dígitos
- Rondas libres: el creador de la ronda decide si es compartible o solo para participantes
- Default torneos: público. Default rondas libres: solo participantes.

**Cómo se comparte:** Botón "Compartir leaderboard" en la vista del organizador → copia el link o abre share sheet del OS.

## Restricciones técnicas (verificadas)

- PWA no puede usar Live Activities (iOS), Dynamic Island, ni Home Screen widgets — son APIs nativas exclusivas
- iOS PWA: push notifications solo con texto plano, sin imágenes ni botones de acción
- Android PWA: push notifications con texto + imagen + botones de acción + expandible
- Supabase Realtime free tier: 200 conexiones simultáneas, 2M mensajes/mes
- Web Push requiere que la PWA esté "instalada" en Home Screen (iOS)
- Declarative Web Push (iOS 26) mejora estabilidad de suscripciones

## Dependencias existentes

| Componente | Estado | Qué falta |
|---|---|---|
| Push infrastructure (VAPID, sw.js, /api/push/*) | Implementado | Conectar a eventos de scoring |
| notification_preferences | Implementado | Ya tiene campos relevantes |
| Leaderboard UI (torneo/en-vivo) | Implementado | Conectar a Realtime + auto-refresh |
| Leaderboard UI (ronda libre) | Implementado | Conectar a Realtime + auto-refresh |
| Supabase Realtime | Disponible (free tier) | No usado — implementar channels |
| Feature gate leaderboard-live | Implementado (Pro tier) | Ya gateado |
| OG meta tags | Parcial | Falta por ruta dinámica |

## Arquitectura de datos

```
Evento: jugador ingresa score (hole_scores INSERT/UPDATE)
  │
  ├─► Supabase Realtime broadcast en channel `tournament:{id}` o `ronda:{codigo}`
  │     └─► Todos los clientes suscritos recalculan leaderboard en frontend
  │
  └─► Trigger server-side (edge function o DB trigger)
        ├─► Recalcular leaderboard + GWI
        ├─► Push notification a suscriptores (formato A, top 4)
        └─► Actualizar cache del leaderboard para polling
```

## Fases de implementación

### Fase 1 — Realtime (leaderboard que se actualiza solo)
- Implementar Supabase Realtime channel por torneo/ronda
- Conectar `use-live-scores.ts` para que actualice la UI real (hoy no lo hace)
- Indicador "● En vivo" / "Reconectando..."
- Pull-to-refresh
- Visibility-change sync
- Fallback a polling 30s

### Fase 2 — Push notifications
- Conectar pipeline de scoring a `/api/push/send`
- Formato A: top 4 con separadores ·
- Agrupación por torneo/ronda (thread-id)
- Android: botones de acción + expandible
- Opt-in flow con preferencias existentes
- Reemplazar notificación anterior (no acumular)

### Fase 3 — Link compartible mejorado
- Auto-refresh 30s en la página pública
- Indicador "Actualizado hace X segundos"
- Botón "Compartir leaderboard"
- OG meta tags dinámicas por torneo/ronda
- Evaluar OG image server-rendered

## Lo que NO incluye este spec

- Live Activities / Dynamic Island (imposible como PWA)
- Home Screen widgets (imposible como PWA)
- Imagen server-rendered en push iOS (imposible en iOS PWA)
- Strokes Gained analytics (feature separada, ver Theory Golf competitor analysis)
- Gamificación / rewards (modelo de negocio distinto, ver GolfN analysis)

## Benchmarks competitivos

| App | Cómo lo hacen | Golfers+ equivalente |
|---|---|---|
| Golf Genius | Live Activities en Lock Screen (nativo iOS) | Push notification formato A + leaderboard Realtime |
| V-Par | Link web compartible, auto-refresh | Link compartible con polling 30s (idéntico) |
| Hole19 | LivePlay con link compartible | Link compartible + Realtime (superior) |
| The Grint | Cloud sync por hoyo + notificación simple | Realtime + push formato A (superior) |
| PGA Tour | Live Activities + video streaming | Push formato A (diferente liga, no comparable) |

## Costo total

| Componente | Costo |
|---|---|
| Supabase Realtime | $0 (free tier) |
| Web Push (VAPID) | $0 |
| Desarrollo | Tiempo de sesiones |
| **Total** | **$0 extra** |
